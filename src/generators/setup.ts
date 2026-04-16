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

