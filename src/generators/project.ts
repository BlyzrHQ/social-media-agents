import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../types.js";
import {
  generateRunner,
  generateConfig,
  generateCli,
  generateServices,
} from "./runtime.js";
import {
  generateIdeasAgent,
  generateRatingAgent,
  generateContentBuilderAgent,
  generatePostingAgent,
  generateTemplateGeneratorAgent,
} from "./agents.js";

export function scaffoldProject(config: ProjectConfig): void {
  const dir = path.resolve(config.brand.projectDir);

  // Create directory structure
  const dirs = [
    "",
    "src",
    "src/agents",
    "src/services",
    "src/trigger",
    "src/tests",
    ".github/workflows",
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // package.json
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: path.basename(config.brand.projectDir),
        version: "1.0.0",
        description: `${config.brand.name} Social Media Pipeline`,
        type: "module",
        scripts: {
          build: "tsc",
          start: "node dist/cli.js",
          dev: "tsx src/cli.ts",
          test: "vitest run",
        },
        dependencies: {
          commander: "^13.1.0",
          dotenv: "^16.4.7",
          openai: "^4.85.0",
          "@trigger.dev/sdk": "4.4.3",
        },
        devDependencies: {
          "@trigger.dev/build": "4.4.3",
          "@types/node": "^22.13.0",
          tsx: "^4.19.0",
          typescript: "^5.7.0",
          vitest: "^3.0.0",
        },
      },
      null,
      2
    )
  );

  // tsconfig.json
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "Node16",
          moduleResolution: "Node16",
          outDir: "dist",
          rootDir: ".",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          declaration: true,
          sourceMap: true,
        },
        include: ["src/**/*", "trigger.config.ts"],
        exclude: ["node_modules", "dist", "**/*.test.ts"],
      },
      null,
      2
    )
  );

  // .env
  const envLines = [
    `OPENAI_API_KEY=${config.keys.openaiApiKey}`,
    `GOOGLE_AI_KEY=${config.keys.googleAiKey}`,
    `CONVEX_URL=`,
    `CONVEX_AUTH_TOKEN=`,
    `IG_USER_ID=${config.keys.igUserId}`,
    `IG_ACCESS_TOKEN=${config.keys.igAccessToken}`,
  ];
  if (config.hasShopify) {
    envLines.push(`SHOPIFY_STORE=${config.keys.shopifyStore || ""}`);
    envLines.push(`SHOPIFY_ACCESS_TOKEN=${config.keys.shopifyAccessToken || ""}`);
  }
  fs.writeFileSync(path.join(dir, ".env"), envLines.join("\n") + "\n");

  // .env.example
  const exampleLines = envLines.map((l) => {
    const key = l.split("=")[0];
    return `${key}=`;
  });
  fs.writeFileSync(path.join(dir, ".env.example"), exampleLines.join("\n") + "\n");

  // .gitignore
  fs.writeFileSync(
    path.join(dir, ".gitignore"),
    "node_modules/\ndist/\n.env\n*.log\n.trigger\n"
  );

  // Core runtime files
  fs.writeFileSync(path.join(dir, "src/runner.ts"), generateRunner());
  fs.writeFileSync(path.join(dir, "src/config.ts"), generateConfig(config));
  fs.writeFileSync(path.join(dir, "src/cli.ts"), generateCli(config));

  // Service files
  const services = generateServices();
  fs.writeFileSync(path.join(dir, "src/services/convex.ts"), services.convex);
  fs.writeFileSync(path.join(dir, "src/services/embeddings.ts"), services.embeddings);
  fs.writeFileSync(path.join(dir, "src/services/image.ts"), services.image);
  fs.writeFileSync(path.join(dir, "src/services/instagram.ts"), services.instagram);
  if (config.hasShopify) {
    fs.writeFileSync(path.join(dir, "src/services/shopify.ts"), services.shopify);
  }

  // Agent files
  fs.writeFileSync(
    path.join(dir, "src/agents/ideas.ts"),
    generateIdeasAgent(config.prompts, config.hasShopify)
  );
  fs.writeFileSync(
    path.join(dir, "src/agents/rating.ts"),
    generateRatingAgent(config.prompts)
  );
  fs.writeFileSync(
    path.join(dir, "src/agents/content-builder.ts"),
    generateContentBuilderAgent(config.prompts)
  );
  fs.writeFileSync(
    path.join(dir, "src/agents/posting.ts"),
    generatePostingAgent()
  );
  fs.writeFileSync(
    path.join(dir, "src/agents/template-generator.ts"),
    generateTemplateGeneratorAgent()
  );

  // Trigger.dev config
  fs.writeFileSync(
    path.join(dir, "trigger.config.ts"),
    `import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "TRIGGER_PROJECT_ID",
  runtime: "node",
  logLevel: "log",
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2, randomize: true },
  },
  dirs: ["./src/trigger"],
});
`
  );

  // Trigger.dev task file
  fs.writeFileSync(
    path.join(dir, "src/trigger/pipeline.ts"),
    `import { task, logger } from "@trigger.dev/sdk/v3";
import { runIdeasAgent } from "../agents/ideas.js";
import { runRatingAgent } from "../agents/rating.js";
import { runContentBuilderAgent } from "../agents/content-builder.js";
import { runPostingAgent } from "../agents/posting.js";
import { runTemplateGeneratorAgent } from "../agents/template-generator.js";

export const ideasTask = task({
  id: "ideas", maxDuration: 120,
  run: async () => { const r = await runIdeasAgent(); if (!r.success) throw new Error(r.output); return r; },
});

export const ratingTask = task({
  id: "rating", maxDuration: 120,
  run: async () => { const r = await runRatingAgent(); if (!r.success) throw new Error(r.output); return r; },
});

export const contentBuilderTask = task({
  id: "content-builder", maxDuration: 600,
  run: async () => { const r = await runContentBuilderAgent(); if (!r.success) throw new Error(r.output); return r; },
});

export const postingTask = task({
  id: "posting", maxDuration: 120,
  run: async () => { const r = await runPostingAgent(); if (!r.success) throw new Error(r.output); return r; },
});

export const templateGeneratorTask = task({
  id: "template-generator", maxDuration: 120,
  run: async (payload: { imageUrl: string }) => {
    const r = await runTemplateGeneratorAgent(payload.imageUrl);
    if (!r.success) throw new Error(r.output); return r;
  },
});

export const pipelineTask = task({
  id: "pipeline", maxDuration: 900,
  run: async () => {
    logger.info("Starting full pipeline");
    const ideas = await ideasTask.triggerAndWait();
    if (!ideas.ok) throw new Error("Ideas failed");
    const rating = await ratingTask.triggerAndWait();
    if (!rating.ok) throw new Error("Rating failed");
    const content = await contentBuilderTask.triggerAndWait();
    if (!content.ok) throw new Error("Content failed");
    const posting = await postingTask.triggerAndWait();
    if (!posting.ok) throw new Error("Posting failed");
    return { ideas: ideas.output, rating: rating.output, content: content.output, posting: posting.output };
  },
});
`
  );

  // GitHub Actions
  fs.writeFileSync(
    path.join(dir, ".github/workflows/deploy.yml"),
    `name: Deploy to Trigger.dev

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20.x"
      - run: npm install
      - run: npx trigger.dev@latest deploy
        env:
          TRIGGER_ACCESS_TOKEN: \${{ secrets.TRIGGER_ACCESS_TOKEN }}
`
  );
}
