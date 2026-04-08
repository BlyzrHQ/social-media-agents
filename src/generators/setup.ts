export function generateTriggerSync(): string {
  return `import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const RUNTIME_KEYS = [
  "OPENAI_API_KEY",
  "GOOGLE_AI_KEY",
  "CONVEX_URL",
  "CONVEX_AUTH_TOKEN",
  "IG_USER_ID",
  "IG_ACCESS_TOKEN",
  "SHOPIFY_STORE",
  "SHOPIFY_ACCESS_TOKEN",
];

export function getTriggerProjectRef(): string {
  const configPath = path.join(process.cwd(), "trigger.config.ts");
  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/project:\\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not find Trigger project ref in trigger.config.ts. Run \`npx trigger.dev@latest init\` first.");
  }
  const projectRef = match[1];
  if (!projectRef || projectRef === "TRIGGER_PROJECT_ID") {
    throw new Error("Trigger project ref is still the placeholder. Run \`npx trigger.dev@latest init\` first.");
  }
  return projectRef;
}

export function getTriggerTaskIds(): string[] {
  const pipelinePath = path.join(process.cwd(), "src", "trigger", "pipeline.ts");
  const content = fs.readFileSync(pipelinePath, "utf8");
  return [...new Set(Array.from(content.matchAll(/id:\\s*"([^"]+)"/g)).map((match) => match[1]))];
}

export function collectTriggerRuntimeEnv(): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const key of RUNTIME_KEYS) {
    const value = process.env[key];
    if (value?.trim()) variables[key] = value.trim();
  }
  return variables;
}

export async function syncTriggerEnv(environment = "dev"): Promise<void> {
  const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;
  if (!triggerSecretKey) {
    throw new Error("TRIGGER_SECRET_KEY is missing. Run \`npm run config\` and add it first.");
  }

  const projectRef = getTriggerProjectRef();
  const variables = collectTriggerRuntimeEnv();
  if (Object.keys(variables).length === 0) {
    throw new Error("No environment variables found to sync to Trigger.dev.");
  }

  const res = await fetch(
    \`https://api.trigger.dev/api/v1/projects/\${projectRef}/envvars/\${environment}/import\`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${triggerSecretKey}\`,
      },
      body: JSON.stringify({ variables, override: true }),
    }
  );

  if (!res.ok) {
    throw new Error(\`Trigger.dev env sync failed: \${res.status} \${await res.text()}\`);
  }

  const toolsPath = path.join(process.cwd(), "paperclip", "trigger-tools.json");
  fs.mkdirSync(path.dirname(toolsPath), { recursive: true });
  fs.writeFileSync(
    toolsPath,
    JSON.stringify(
      {
        syncedAt: new Date().toISOString(),
        projectRef,
        environment,
        taskIds: getTriggerTaskIds(),
        syncedVariables: Object.keys(variables),
      },
      null,
      2
    ) + "\\n"
  );

  console.log(\`Synced \${Object.keys(variables).length} env vars to Trigger.dev (\${environment}).\`);
  console.log(\`Task IDs: \${getTriggerTaskIds().join(", ")}\`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const environment = process.argv[2] || "dev";
  syncTriggerEnv(environment).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
`;
}

export function generatePaperclipTriggerSync(): string {
  return `import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { pathToFileURL } from "url";
import { getTriggerProjectRef, getTriggerTaskIds } from "./trigger-sync.js";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

function renderTriggerMetadata(projectRef: string, environment: string, taskIds: string[]): string {
  return [
    "## Trigger.dev Sync Metadata",
    "",
    \`- Project ref: \${projectRef}\`,
    \`- Environment: \${environment}\`,
    "- Trigger secret: available inside the Paperclip container as $TRIGGER_SECRET_KEY after sync + restart",
    "- Trigger API base: https://api.trigger.dev/api/v1/tasks/<TASK_ID>/trigger",
    "",
    "### Synced Task IDs",
    ...taskIds.map((taskId) => \`- \${taskId}\`),
    "",
  ].join("\\n");
}

function updateTriggerDoc(environment: string): { projectRef: string; taskIds: string[]; triggerDoc: string } {
  const projectRef = getTriggerProjectRef();
  const taskIds = getTriggerTaskIds();
  const triggerMdPath = path.join(process.cwd(), "paperclip", "TRIGGER.md");
  const original = fs.readFileSync(triggerMdPath, "utf8");
  const cleaned = original.replace(/\\n## Trigger\\.dev Sync Metadata[\\s\\S]*$/m, "").trimEnd();
  const triggerDoc = \`\${cleaned}\\n\\n\${renderTriggerMetadata(projectRef, environment, taskIds)}\`;
  fs.writeFileSync(triggerMdPath, triggerDoc + "\\n");
  return { projectRef, taskIds, triggerDoc };
}

export function syncPaperclipTrigger(environment = "dev"): void {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error("TRIGGER_SECRET_KEY is missing. Run \`npm run config\` first.");
  }

  const { projectRef, taskIds, triggerDoc } = updateTriggerDoc(environment);
  const paperclipDir = path.join(process.cwd(), "paperclip");
  const toolsPath = path.join(paperclipDir, "trigger-tools.json");
  const toolsPayload = {
    syncedAt: new Date().toISOString(),
    projectRef,
    environment,
    taskIds,
    triggerApiBase: "https://api.trigger.dev/api/v1/tasks/<TASK_ID>/trigger",
  };
  fs.writeFileSync(toolsPath, JSON.stringify(toolsPayload, null, 2) + "\\n");

  const companiesDir = path.join(paperclipDir, "data", "instances", "default", "companies");
  if (fs.existsSync(companiesDir)) {
    const companyDirs = fs.readdirSync(companiesDir);
    for (const companyId of companyDirs) {
      const companyPath = path.join(companiesDir, companyId);
      const agentsDir = path.join(companyPath, "agents");
      if (fs.existsSync(agentsDir)) {
        for (const agentId of fs.readdirSync(agentsDir)) {
          const instructionsDir = path.join(agentsDir, agentId, "instructions");
          if (fs.existsSync(instructionsDir)) {
            fs.writeFileSync(path.join(instructionsDir, "TRIGGER.md"), triggerDoc + "\\n");
            fs.writeFileSync(path.join(instructionsDir, "TRIGGER_TOOLS.json"), JSON.stringify(toolsPayload, null, 2) + "\\n");
          }
        }
      }

      const sharedDir = path.join(companyPath, "shared-instructions");
      if (fs.existsSync(sharedDir)) {
        fs.writeFileSync(path.join(sharedDir, "TRIGGER.md"), triggerDoc + "\\n");
        fs.writeFileSync(path.join(sharedDir, "TRIGGER_TOOLS.json"), JSON.stringify(toolsPayload, null, 2) + "\\n");
      }
    }
  }

  try {
    execSync("docker compose up -d --force-recreate", { cwd: paperclipDir, stdio: "inherit", timeout: 300_000 });
    console.log("Paperclip restarted so the synced Trigger secret and env vars are available to agents.");
  } catch {
    console.log("Paperclip is not running yet. Start it with \`cd paperclip && docker compose up -d\` after syncing Trigger.");
  }

  console.log(\`Paperclip synced with Trigger.dev task IDs: \${taskIds.join(", ")}\`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const environment = process.argv[2] || "dev";
  try {
    syncPaperclipTrigger(environment);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
`;
}
