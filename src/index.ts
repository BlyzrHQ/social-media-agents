#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { execSync } from "child_process";
import * as path from "path";
import { collectBrandInfo, askForWebsite, analyzeWebsiteUrl, collectApiKeys, confirmGptUsage } from "./prompts.js";
import { generateCustomPrompts } from "./generators/agents.js";
import { findTopPosts } from "./post-analyzer.js";
import { scaffoldProject } from "./generators/project.js";
import { generatePaperclipFiles } from "./generators/paperclip.js";
import type { ProjectConfig } from "./types.js";

async function main() {
  console.log();
  p.intro(pc.bgCyan(pc.black(" social-media-agents ")));
  console.log();
  p.note(
    "This CLI will scaffold a complete AI-powered social media\n" +
      "content pipeline customized to your brand.\n\n" +
      "You will need:\n" +
      `  ${pc.cyan("OpenAI API key")} — for content generation\n` +
      `  ${pc.cyan("Google AI key")} — for image generation (Gemini)\n` +
      `  ${pc.cyan("Instagram credentials")} — for posting\n` +
      `  ${pc.cyan("Docker")} — for Paperclip agent orchestration`,
    "Welcome"
  );

  // Step 1: Ask for website URL (if user has one)
  const websiteUrl = await askForWebsite();

  // Step 2: Collect API keys (OpenAI needed for website analysis + prompt gen)
  const keysResult = await collectApiKeys();
  const { hasShopify, ...keys } = keysResult;

  // Step 3: Analyze website now that we have the OpenAI key
  const websitePrefill = websiteUrl
    ? await analyzeWebsiteUrl(websiteUrl, keys.openaiApiKey)
    : null;

  // Step 4: Collect brand info (pre-filled if website analysis worked)
  const s1 = p.spinner();
  const brand = await collectBrandInfo(websitePrefill);

  // Step 5: Confirm GPT-4o usage for prompt generation
  await confirmGptUsage();

  // Step 6: Search for top posts and analyze them for templates
  const s1a = p.spinner();
  s1a.start("Searching for top posts in your niche...");
  let topPostTemplates: import("./types.js").TemplateDefinition[] = [];
  try {
    topPostTemplates = await findTopPosts(
      brand.name,
      websitePrefill?.industry || brand.contentTypes[0] || "lifestyle",
      keys.openaiApiKey
    );
    if (topPostTemplates.length > 0) {
      s1a.stop(`Found ${topPostTemplates.length} high-engagement post styles!`);
      p.note(
        topPostTemplates
          .map((t, i) => `${pc.cyan(`${i + 1}.`)} ${t.displayName}\n   ${t.description}`)
          .join("\n\n"),
        "Templates from top posts"
      );
    } else {
      s1a.stop("No top posts found — will generate templates from brand description.");
    }
  } catch {
    s1a.stop("Post search skipped.");
    topPostTemplates = [];
  }

  // Step 7: Generate custom prompts (merge with top post templates)
  s1.start("Generating custom prompts for your brand with GPT-4o...");
  let prompts;
  try {
    prompts = await generateCustomPrompts(brand, keys.openaiApiKey, websitePrefill?.rawContent);

    // Merge top post templates with generated ones (top posts take priority)
    if (topPostTemplates && topPostTemplates.length > 0) {
      const existingNames = new Set(prompts.initialTemplates.map((t) => t.name));
      for (const template of topPostTemplates) {
        if (!existingNames.has(template.name)) {
          prompts.initialTemplates.push(template);
        }
      }
    }

    s1.stop(`Custom prompts generated! (${prompts.initialTemplates.length} templates total)`);
  } catch (err) {
    s1.stop("Failed to generate prompts");
    p.cancel(
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const config: ProjectConfig = { brand, keys, prompts, hasShopify };

  // Step 5: Scaffold project
  const s2 = p.spinner();
  s2.start("Scaffolding project...");
  try {
    scaffoldProject(config);
    s2.stop("Project scaffolded!");
  } catch (err) {
    s2.stop("Failed to scaffold project");
    p.cancel(
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  // Step 6: Generate Paperclip files
  const s4 = p.spinner();
  s4.start("Generating Paperclip agent configurations...");
  try {
    generatePaperclipFiles(config);
    s4.stop("Paperclip configs generated!");
  } catch (err) {
    s4.stop("Failed to generate Paperclip files");
    console.error(err);
  }

  // Step 8: Install dependencies
  const s5 = p.spinner();
  s5.start("Installing dependencies...");
  try {
    execSync("npm install", {
      cwd: path.resolve(brand.projectDir),
      stdio: "pipe",
      timeout: 120_000,
    });
    s5.stop("Dependencies installed!");
  } catch (err) {
    s5.stop("Failed to install dependencies");
    console.log("Run 'npm install' manually in your project directory.");
  }

  const projectDir = path.resolve(brand.projectDir);

  // Step 9: Deploy Convex
  const s6 = p.spinner();
  s6.start("Deploying Convex database...");
  let convexDeployed = false;
  try {
    // Check if convex CLI is available
    execSync("npx convex --version", { cwd: projectDir, stdio: "pipe", timeout: 15_000 });

    // Get team slug from convex whoami
    let teamSlug = "";
    try {
      const whoami = execSync("npx convex whoami", { cwd: projectDir, stdio: "pipe", timeout: 15_000, encoding: "utf8" });
      const teamMatch = whoami.match(/team[:\s]+(\S+)/i) || whoami.match(/(\S+)\s+team/i);
      if (teamMatch) teamSlug = teamMatch[1];
    } catch { /* will try without team */ }

    // Create project name from brand
    const convexProject = brand.projectDir.replace(/[^a-z0-9-]/g, "-").substring(0, 30);

    // Deploy with non-interactive flags
    const teamFlag = teamSlug ? `--team ${teamSlug}` : "";
    execSync(
      `npx convex dev --configure new --project ${convexProject} ${teamFlag} --once`,
      { cwd: projectDir, stdio: "inherit", timeout: 60_000 }
    );

    // Read Convex URL from .env.local
    const fs2 = await import("fs");
    const envLocalPath = path.join(projectDir, ".env.local");
    if (fs2.existsSync(envLocalPath)) {
      const envLocal = fs2.readFileSync(envLocalPath, "utf8");
      const urlMatch = envLocal.match(/CONVEX_URL=(.*)/);
      if (urlMatch) {
        // Update .env with the Convex URL
        let envContent = fs2.readFileSync(path.join(projectDir, ".env"), "utf8");
        envContent = envContent.replace(/CONVEX_URL=.*/, `CONVEX_URL=${urlMatch[1].trim()}`);
        fs2.writeFileSync(path.join(projectDir, ".env"), envContent);
        convexDeployed = true;
      }
    }
    s6.stop(convexDeployed ? "Convex deployed!" : "Convex initialized — run 'npx convex dev' to deploy.");
  } catch (err) {
    s6.stop("Convex setup needs manual login.");
    console.log("  Run: cd " + brand.projectDir + " && npx convex login && npx convex dev");
  }

  // Step 10: Seed templates
  if (convexDeployed) {
    const s7 = p.spinner();
    s7.start("Seeding templates...");
    try {
      execSync("npx convex run seed:seedTemplates", { cwd: projectDir, stdio: "pipe", timeout: 30_000 });
      s7.stop(`Seeded ${config.prompts.initialTemplates.length} templates!`);
    } catch {
      s7.stop("Template seeding skipped — run 'npx convex run seed:seedTemplates' manually.");
    }
  }

  // Step 11: Set up Trigger.dev
  const s8 = p.spinner();
  s8.start("Setting up Trigger.dev...");
  let triggerDeployed = false;
  try {
    // Get team slug for project naming
    let teamSlug = "";
    try {
      const whoami = execSync("npx convex whoami", { cwd: projectDir, stdio: "pipe", timeout: 10_000, encoding: "utf8" });
      const teamMatch = whoami.match(/team[:\s]+(\S+)/i);
      if (teamMatch) teamSlug = teamMatch[1];
    } catch { /* ignore */ }

    // Check if trigger CLI works (user must be logged in already)
    execSync("npx trigger.dev@latest --version", { cwd: projectDir, stdio: "pipe", timeout: 15_000 });

    // Init with existing config override
    const triggerProject = brand.projectDir.replace(/[^a-z0-9-]/g, "-").substring(0, 30);
    try {
      execSync(
        `npx trigger.dev@latest init --override-config`,
        { cwd: projectDir, stdio: "inherit", timeout: 60_000 }
      );
    } catch { /* init may fail interactively but still create config */ }

    // Check if project ID was set
    const fs2 = await import("fs");
    const triggerConfig = fs2.readFileSync(path.join(projectDir, "trigger.config.ts"), "utf8");
    const projectIdMatch = triggerConfig.match(/project:\s*"(proj_[^"]+)"/);

    if (projectIdMatch && projectIdMatch[1] !== "TRIGGER_PROJECT_ID") {
      // Deploy
      try {
        execSync(
          `npx trigger.dev@latest deploy`,
          { cwd: projectDir, stdio: "inherit", timeout: 120_000 }
        );
        triggerDeployed = true;
      } catch { /* deploy may need PAT */ }

      // Sync env vars if we have a secret key
      if (keys.triggerSecretKey) {
        try {
          execSync("npx tsx src/setup/trigger-sync.ts prod", { cwd: projectDir, stdio: "inherit", timeout: 30_000 });
        } catch { /* sync optional */ }
      }
    }

    s8.stop(triggerDeployed ? "Trigger.dev deployed with 6 tasks!" : "Trigger.dev initialized — run 'npx trigger.dev@latest init' to select project.");
  } catch {
    s8.stop("Trigger.dev setup skipped — run 'npx trigger.dev@latest init' manually.");
  }

  // Done!
  const remainingSteps: string[] = [];
  if (!convexDeployed) {
    remainingSteps.push(`${pc.cyan("•")} Deploy Convex: cd ${brand.projectDir} && npx convex login && npx convex dev`);
  }
  if (!triggerDeployed) {
    remainingSteps.push(`${pc.cyan("•")} Set up Trigger.dev: cd ${brand.projectDir} && npx trigger.dev@latest init`);
  }

  p.note(
    `${pc.green("Your project is ready!")}\n\n` +
      (remainingSteps.length > 0
        ? `Remaining setup:\n${remainingSteps.join("\n")}\n\n`
        : "") +
      `Run the pipeline:\n` +
      `  cd ${brand.projectDir} && npx tsx src/cli.ts run pipeline\n\n` +
      `Agent reference files (copy into any LLM orchestrator):\n` +
      `  ${brand.projectDir}/agent/AGENT.md    — agent instructions\n` +
      `  ${brand.projectDir}/agent/TRIGGER.md  — task commands\n` +
      `  ${brand.projectDir}/agent/SECRETS.md  — env var reference\n\n` +
      `Project: ${projectDir}`,
    "Next Steps"
  );

  p.outro(pc.green("Happy creating!"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
