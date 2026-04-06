#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { execSync } from "child_process";
import * as path from "path";
import { collectBrandInfo, askForWebsite, analyzeWebsiteUrl, collectApiKeys, confirmGptUsage } from "./prompts.js";
import { generateCustomPrompts } from "./generators/agents.js";
import { findTopPosts } from "./post-analyzer.js";
import { scaffoldProject } from "./generators/project.js";
import { generateConvexFiles } from "./generators/convex.js";
import { generatePaperclipFiles } from "./generators/paperclip.js";
import { setupPaperclip } from "./setup/paperclip.js";
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
    prompts = await generateCustomPrompts(brand, keys.openaiApiKey);

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

  // Step 6: Generate Convex files
  const s3 = p.spinner();
  s3.start("Generating Convex database schema...");
  try {
    generateConvexFiles(config);
    s3.stop("Convex schema generated!");
  } catch (err) {
    s3.stop("Failed to generate Convex files");
    console.error(err);
  }

  // Step 7: Generate Paperclip files
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

  // Step 9: Set up Paperclip
  const setupPaperclipNow = await p.confirm({
    message: "Set up Paperclip agent orchestration now? (requires Docker)",
    initialValue: true,
  });

  if (!p.isCancel(setupPaperclipNow) && setupPaperclipNow) {
    const s6 = p.spinner();
    s6.start("Setting up Paperclip...");
    try {
      setupPaperclip(config);
      s6.stop("Paperclip is running!");
    } catch (err) {
      s6.stop(`Paperclip setup failed: ${err instanceof Error ? err.message : String(err)}`);
      console.log("You can set it up later by running:");
      console.log(`  cd ${brand.projectDir}/paperclip && docker compose up -d`);
    }
  }

  // Done!
  const projectPath = path.resolve(brand.projectDir);
  p.note(
    `${pc.green("Your project is ready!")} Here's what to do next:\n\n` +
      `${pc.cyan("1.")} Set up Convex:\n` +
      `   cd ${brand.projectDir} && npx convex login && npx convex deploy\n\n` +
      `${pc.cyan("2.")} Update .env with your Convex URL and auth token\n\n` +
      `${pc.cyan("3.")} Seed initial templates:\n` +
      `   npx convex run seed:seedTemplates\n\n` +
      `${pc.cyan("4.")} Run the pipeline:\n` +
      `   npx tsx src/cli.ts run pipeline\n\n` +
      `${pc.cyan("5.")} Check pipeline health:\n` +
      `   npx tsx src/cli.ts status\n\n` +
      `${pc.cyan("6.")} Set up Trigger.dev (for cloud execution):\n` +
      `   npx trigger.dev@latest init\n` +
      `   npx trigger.dev@latest dev\n\n` +
      `${pc.cyan("7.")} Paperclip dashboard:\n` +
      `   http://localhost:3100\n\n` +
      `Project: ${projectPath}`,
    "Next Steps"
  );

  p.outro(pc.green("Happy creating!"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
