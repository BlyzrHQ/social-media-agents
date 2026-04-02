import { describe, it, expect } from "vitest";
import { scaffoldProject } from "../generators/project.js";
import { generateConvexFiles } from "../generators/convex.js";
import { generatePaperclipFiles } from "../generators/paperclip.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function makeTestConfig() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sma-test-"));
  const projectDir = path.join(tmpDir, "test-project");
  return {
    brand: {
      name: "TestBrand",
      description: "A test brand for unit tests",
      contentTypes: ["product_photos", "tips"],
      projectDir,
    },
    keys: {
      openaiApiKey: "sk-test-key",
      googleAiKey: "AIzaTestKey",
      igUserId: "12345",
      igAccessToken: "EAAtest",
    },
    prompts: {
      ideasSystemPrompt: "You are the Ideas Agent for TestBrand.",
      ratingSystemPrompt: "You are the Rating Agent for TestBrand.",
      contentBuilderSystemPrompt: "You are the Content Builder for TestBrand.",
      scoringCriteria: ["Relevance (25)", "Engagement (25)", "Visual (25)", "Fit (25)"],
      defaultHashtags: ["#test", "#brand"],
      initialTemplates: [
        {
          name: "test_template",
          displayName: "Test Template",
          description: "A test template",
          promptTemplate: "Photo of {MAIN_SUBJECT}",
          captionTemplate: "{CONCEPT}\n{HASHTAGS}",
          imagePrompts: ["Prompt 1 {MAIN_SUBJECT}", "Prompt 2 {MAIN_SUBJECT}"],
          defaultHashtags: ["#test"],
        },
      ],
    },
    hasShopify: false,
  };
}

describe("scaffoldProject", () => {
  it("creates all required files and directories", () => {
    const config = makeTestConfig();
    scaffoldProject(config);

    const dir = config.brand.projectDir;
    expect(fs.existsSync(path.join(dir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/runner.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/cli.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/agents/ideas.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/agents/rating.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/agents/content-builder.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/agents/posting.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/agents/template-generator.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/services/convex.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/services/embeddings.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/services/image.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/services/instagram.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/trigger/pipeline.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "trigger.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".github/workflows/deploy.yml"))).toBe(true);

    // Should NOT have shopify service
    expect(fs.existsSync(path.join(dir, "src/services/shopify.ts"))).toBe(false);

    // Clean up
    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });

  it("includes shopify service when hasShopify is true", () => {
    const config = makeTestConfig();
    config.hasShopify = true;
    config.keys.shopifyStore = "test.myshopify.com";
    config.keys.shopifyAccessToken = "shpat_test";
    scaffoldProject(config);

    expect(
      fs.existsSync(path.join(config.brand.projectDir, "src/services/shopify.ts"))
    ).toBe(true);

    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });

  it("generates valid package.json", () => {
    const config = makeTestConfig();
    scaffoldProject(config);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(config.brand.projectDir, "package.json"), "utf8")
    );
    expect(pkg.name).toBe("test-project");
    expect(pkg.dependencies.openai).toBeDefined();
    expect(pkg.dependencies.commander).toBeDefined();

    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });

  it("writes API keys to .env", () => {
    const config = makeTestConfig();
    scaffoldProject(config);

    const env = fs.readFileSync(
      path.join(config.brand.projectDir, ".env"),
      "utf8"
    );
    expect(env).toContain("OPENAI_API_KEY=sk-test-key");
    expect(env).toContain("GOOGLE_AI_KEY=AIzaTestKey");
    expect(env).toContain("IG_USER_ID=12345");

    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });
});

describe("generateConvexFiles", () => {
  it("creates all Convex schema and function files", () => {
    const config = makeTestConfig();
    fs.mkdirSync(config.brand.projectDir, { recursive: true });
    generateConvexFiles(config);

    const convexDir = path.join(config.brand.projectDir, "convex");
    expect(fs.existsSync(path.join(convexDir, "schema.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "ideas.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "templates.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "queue.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "postedContent.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "events.ts"))).toBe(true);
    expect(fs.existsSync(path.join(convexDir, "seed.ts"))).toBe(true);

    // Seed should contain our template
    const seed = fs.readFileSync(path.join(convexDir, "seed.ts"), "utf8");
    expect(seed).toContain("test_template");

    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });
});

describe("generatePaperclipFiles", () => {
  it("creates all Paperclip configuration files", () => {
    const config = makeTestConfig();
    fs.mkdirSync(config.brand.projectDir, { recursive: true });
    generatePaperclipFiles(config);

    const ppDir = path.join(config.brand.projectDir, "paperclip");
    expect(fs.existsSync(path.join(ppDir, "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(ppDir, "ceo-AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ppDir, "cmo-AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ppDir, "template-designer-AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ppDir, "TRIGGER.md"))).toBe(true);

    // CEO should mention brand name
    const ceo = fs.readFileSync(path.join(ppDir, "ceo-AGENTS.md"), "utf8");
    expect(ceo).toContain("TestBrand");

    // CMO should mention brand description
    const cmo = fs.readFileSync(path.join(ppDir, "cmo-AGENTS.md"), "utf8");
    expect(cmo).toContain("TestBrand");

    fs.rmSync(config.brand.projectDir, { recursive: true, force: true });
  });
});
