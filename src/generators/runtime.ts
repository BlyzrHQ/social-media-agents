import type { ProjectConfig } from "../types.js";

export function generateRunner(): string {
  return `import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionMessageToolCall } from "openai/resources/chat/completions.js";
import { getConfig } from "./config.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  userMessage: string;
  temperature?: number;
  maxIterations?: number;
  model?: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[];
}

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const { name, systemPrompt, tools, userMessage, temperature = 0.3, maxIterations = 20, model = "gpt-4o" } = config;
  const client = new OpenAI({ apiKey: getConfig().openaiApiKey });

  const openaiTools: ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const toolHandlers = new Map(tools.map((t) => [t.name, t.handler]));
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  const toolCallLog: AgentResult["toolCalls"] = [];

  for (let i = 0; i < maxIterations; i++) {
    console.log(\`[\${name}] Iteration \${i + 1}/\${maxIterations}\`);
    const response = await client.chat.completions.create({
      model, messages, tools: openaiTools.length > 0 ? openaiTools : undefined, temperature,
    });
    const choice = response.choices[0];
    if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
      console.log(\`[\${name}] Completed after \${i + 1} iterations\`);
      return { success: true, output: choice.message.content || "", toolCalls: toolCallLog };
    }
    messages.push(choice.message);
    for (const toolCall of choice.message.tool_calls) {
      const result = await executeToolCall(name, toolCall, toolHandlers);
      toolCallLog.push({ name: toolCall.function.name, args: JSON.parse(toolCall.function.arguments || "{}"), result });
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }
  }
  console.error(\`[\${name}] Hit max iterations (\${maxIterations})\`);
  return { success: false, output: \`Agent hit max iterations (\${maxIterations})\`, toolCalls: toolCallLog };
}

async function executeToolCall(agentName: string, toolCall: ChatCompletionMessageToolCall, handlers: Map<string, (args: Record<string, unknown>) => Promise<string>>): Promise<string> {
  const { name, arguments: rawArgs } = toolCall.function;
  const handler = handlers.get(name);
  if (!handler) return JSON.stringify({ error: \`Unknown tool: \${name}\` });
  let args: Record<string, unknown>;
  try { args = JSON.parse(rawArgs || "{}"); } catch { return JSON.stringify({ error: "Invalid JSON arguments" }); }
  console.log(\`[\${agentName}] Calling tool: \${name}\`);
  try { return await handler(args); } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(\`[\${agentName}] Tool \${name} failed: \${message}\`);
    return JSON.stringify({ error: message });
  }
}
`;
}

export function generateConfig(config: ProjectConfig): string {
  const shopifyFields = config.hasShopify
    ? `  shopifyStore: string;\n  shopifyAccessToken: string;`
    : "";
  const shopifyRequired = config.hasShopify
    ? `    shopifyStore: required("SHOPIFY_STORE"),\n    shopifyAccessToken: required("SHOPIFY_ACCESS_TOKEN"),`
    : "";

  return `import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export interface Config {
  openaiApiKey: string;
  googleAiKey: string | undefined;
  convexUrl: string;
  convexAuthToken: string | undefined;
  igUserId: string | undefined;
  igAccessToken: string | undefined;
${shopifyFields}
}

function required(name: string, helpText?: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(\`Missing required environment variable: \${name}\`);
    if (helpText) console.error(helpText);
    process.exit(1);
  }
  return value;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  _config = {
    openaiApiKey: required("OPENAI_API_KEY"),
    googleAiKey: process.env.GOOGLE_AI_KEY || undefined,
    convexUrl: required("CONVEX_URL", "Run \`npm run convex:dev\` first. Convex writes this to .env.local automatically."),
    convexAuthToken: process.env.CONVEX_AUTH_TOKEN?.trim() || undefined,
    igUserId: process.env.IG_USER_ID || undefined,
    igAccessToken: process.env.IG_ACCESS_TOKEN || undefined,
${shopifyRequired}
  };
  return _config;
}
`;
}

export function generateCli(config: ProjectConfig): string {
  return `#!/usr/bin/env node
import { Command } from "commander";
import { runIdeasAgent } from "./agents/ideas.js";
import { runRatingAgent } from "./agents/rating.js";
import { runContentBuilderAgent } from "./agents/content-builder.js";
import { runPostingAgent } from "./agents/posting.js";
import { convexQuery } from "./services/convex.js";
import { syncTriggerEnv } from "./setup/trigger-sync.js";
import type { AgentResult } from "./runner.js";

const program = new Command();
program.name("${config.brand.name.toLowerCase().replace(/\s+/g, "-")}").description("${config.brand.name} Social Media Pipeline").version("1.0.0");

const runCmd = program.command("run").description("Run agents");

runCmd.command("pipeline").description("Run all agents sequentially").action(async () => {
  const agents: { name: string; fn: () => Promise<AgentResult> }[] = [
    { name: "Ideas", fn: runIdeasAgent },
    { name: "Rating", fn: runRatingAgent },
    { name: "Content Builder", fn: runContentBuilderAgent },
    { name: "Posting", fn: runPostingAgent },
  ];
  for (const agent of agents) {
    console.log(\`\\n\${"=".repeat(50)}\\nStarting \${agent.name} Agent...\\n\${"=".repeat(50)}\`);
    const result = await agent.fn();
    if (!result.success) { console.error(\`\${agent.name} Agent failed: \${result.output}\`); process.exit(1); }
    console.log(\`\${agent.name} Agent completed.\`);
  }
  console.log("\\nPipeline completed successfully.");
  process.exit(0);
});

runCmd.command("ideas").description("Run Ideas Agent").action(async () => { const r = await runIdeasAgent(); console.log(r.output); process.exit(r.success ? 0 : 1); });
runCmd.command("rating").description("Run Rating Agent").action(async () => { const r = await runRatingAgent(); console.log(r.output); process.exit(r.success ? 0 : 1); });
runCmd.command("content").description("Run Content Builder").action(async () => { const r = await runContentBuilderAgent(); console.log(r.output); process.exit(r.success ? 0 : 1); });
runCmd.command("posting").description("Run Posting Agent").action(async () => { const r = await runPostingAgent(); console.log(r.output); process.exit(r.success ? 0 : 1); });

program.command("status").description("Check pipeline health").action(async () => {
  const [pending, approved, queued] = await Promise.all([
    convexQuery<any[]>("ideas:getPending"),
    convexQuery<any[]>("ideas:getUnprocessed", { limit: 100 }),
    convexQuery<any[]>("contentQueue:getQueued"),
  ]);
  const newCount = pending.filter((i: any) => i.status === "new").length;
  console.log("Pipeline Status:");
  console.log(\`  Pending ideas (new):       \${newCount}\`);
  console.log(\`  Approved (unprocessed):     \${approved.length}\`);
  console.log(\`  Queued content:             \${queued.length}\`);
  process.exit(0);
});

program.command("config").description("Add or update API keys").action(async () => {
  const fs = await import("fs");
  const path = await import("path");
  const readline = await import("readline");

  const envPath = path.join(process.cwd(), ".env");
  let envContent = "";
  try { envContent = fs.readFileSync(envPath, "utf8"); } catch { /* new file */ }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  const keys = [
    { key: "OPENAI_API_KEY", label: "OpenAI API Key", required: true },
    { key: "GOOGLE_AI_KEY", label: "Google AI Key (Gemini)", required: false },
    { key: "CONVEX_URL", label: "Convex URL", required: false },
    { key: "CONVEX_AUTH_TOKEN", label: "Convex Auth Token", required: false },
    { key: "TRIGGER_SECRET_KEY", label: "Trigger.dev Secret Key", required: false },
    { key: "IG_USER_ID", label: "Instagram User ID", required: false },
    { key: "IG_ACCESS_TOKEN", label: "Instagram Access Token", required: false },
    { key: "SHOPIFY_STORE", label: "Shopify Store Domain", required: false },
    { key: "SHOPIFY_ACCESS_TOKEN", label: "Shopify Access Token", required: false },
  ];

  console.log("Configure API keys (press Enter to keep current value):\\n");

  for (const { key, label, required: req } of keys) {
    const current = envContent.match(new RegExp(\`\${key}=(.*)\`))?.[1] || "";
    const hint = current ? \` [current: \${current.substring(0, 20)}...]\` : req ? " (required)" : " (optional)";
    const value = await ask(\`\${label}\${hint}: \`);
    if (value) {
      if (envContent.includes(\`\${key}=\`)) {
        envContent = envContent.replace(new RegExp(\`\${key}=.*\`), \`\${key}=\${value}\`);
      } else {
        envContent += \`\\n\${key}=\${value}\`;
      }
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + "\\n");
  console.log("\\n.env updated!");
  console.log("Tip: \`npm run convex:dev\` writes CONVEX_URL into .env.local automatically, and this project reads .env.local too.");

  if ((envContent.match(/TRIGGER_SECRET_KEY=(.*)/)?.[1] || "").trim()) {
    try {
      console.log("\\nSyncing Trigger.dev environment variables...");
      await syncTriggerEnv("dev");
    } catch (error) {
      console.log(\`Trigger sync skipped: \${error instanceof Error ? error.message : String(error)}\`);
      console.log("Run \`npm run trigger:sync-env\` after Trigger.dev init finishes.");
    }
  } else {
    console.log("Add TRIGGER_SECRET_KEY later, then run \`npm run trigger:sync-env\`.");
  }

  console.log("\\nDone!");
  rl.close();
  process.exit(0);
});

program.parse();
`;
}

export function generateServices(): {
  convex: string;
  embeddings: string;
  image: string;
  instagram: string;
  shopify: string;
} {
  return {
    convex: `import { getConfig } from "../config.js";

function convexHeaders(): Record<string, string> {
  const { convexAuthToken } = getConfig();
  return convexAuthToken
    ? { "Content-Type": "application/json", Authorization: convexAuthToken }
    : { "Content-Type": "application/json" };
}

export async function convexQuery<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const { convexUrl } = getConfig();
  const res = await fetch(\`\${convexUrl}/api/query\`, { method: "POST", headers: convexHeaders(), body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex query \${path} failed: \${res.status} \${await res.text()}\`);
  const data = await res.json();
  return data.value as T;
}

export async function convexMutation<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const { convexUrl } = getConfig();
  const res = await fetch(\`\${convexUrl}/api/mutation\`, { method: "POST", headers: convexHeaders(), body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex mutation \${path} failed: \${res.status} \${await res.text()}\`);
  const data = await res.json();
  return data.value as T;
}

export async function convexAction<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const { convexUrl } = getConfig();
  const res = await fetch(\`\${convexUrl}/api/action\`, { method: "POST", headers: convexHeaders(), body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex action \${path} failed: \${res.status} \${await res.text()}\`);
  const data = await res.json();
  return data.value as T;
}
`,
    embeddings: `import OpenAI from "openai";
import { getConfig } from "../config.js";

let _client: OpenAI | null = null;
function getClient(): OpenAI { if (!_client) _client = new OpenAI({ apiKey: getConfig().openaiApiKey }); return _client; }

export async function embed(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({ model: "text-embedding-3-small", input: text });
  return res.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
`,
    image: `import { getConfig } from "../config.js";
import { convexAction } from "./convex.js";

export async function generateImage(prompt: string): Promise<string> {
  const { googleAiKey } = getConfig();
  if (!googleAiKey) throw new Error("GOOGLE_AI_KEY not set. Add it to .env to enable image generation.");
  const res = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=\${googleAiKey}\`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(\`Gemini image gen failed: \${res.status}\`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData?.data) throw new Error("No image in Gemini response");
  const { data: b64Data, mimeType } = imagePart.inlineData;
  const uploadResult = await convexAction<{ url: string }>("files:uploadBase64Image", { base64Data: b64Data, mimeType: mimeType || "image/jpeg" });
  if (!uploadResult?.url) throw new Error("Convex image upload failed");
  return uploadResult.url;
}
`,
    instagram: `import { getConfig } from "../config.js";
const BASE = "https://graph.facebook.com/v19.0";

function igAuth() {
  const { igUserId, igAccessToken } = getConfig();
  if (!igUserId || !igAccessToken) throw new Error("Instagram credentials not set. Add IG_USER_ID and IG_ACCESS_TOKEN to .env.");
  return { igUserId, igAccessToken };
}

export async function createMediaContainer(imageUrl: string, caption: string): Promise<string> {
  const { igUserId, igAccessToken } = igAuth();
  const params = new URLSearchParams({ image_url: imageUrl, caption, access_token: igAccessToken });
  const res = await fetch(\`\${BASE}/\${igUserId}/media?\${params}\`, { method: "POST" });
  if (!res.ok) throw new Error(\`IG media create failed: \${res.status}\`);
  const data = await res.json();
  if (!data.id) throw new Error("No media container ID returned");
  return data.id;
}

export async function publishMedia(creationId: string): Promise<string> {
  const { igUserId, igAccessToken } = igAuth();
  const params = new URLSearchParams({ creation_id: creationId, access_token: igAccessToken });
  const res = await fetch(\`\${BASE}/\${igUserId}/media_publish?\${params}\`, { method: "POST" });
  if (!res.ok) throw new Error(\`IG publish failed: \${res.status}\`);
  const data = await res.json();
  if (!data.id) throw new Error("No post ID returned");
  return data.id;
}

export async function getPermalink(postId: string): Promise<string | null> {
  const { igAccessToken } = getConfig();
  if (!igAccessToken) return null;
  try {
    const res = await fetch(\`\${BASE}/\${postId}?fields=permalink&access_token=\${igAccessToken}\`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.permalink || null;
  } catch { return null; }
}
`,
    shopify: `import { getConfig } from "../config.js";

export interface ShopifyProduct { title: string; productType: string; handle: string; tags: string[]; }

export async function fetchProducts(limit = 400): Promise<ShopifyProduct[]> {
  const { shopifyStore, shopifyAccessToken } = getConfig() as any;
  if (!shopifyStore || !shopifyAccessToken) return [];
  const query = \`{ products(first: \${limit}) { edges { node { title productType handle tags } } } }\`;
  const res = await fetch(\`https://\${shopifyStore}/admin/api/2024-01/graphql.json\`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": shopifyAccessToken },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(\`Shopify fetch failed: \${res.status}\`);
  const data = await res.json();
  return (data?.data?.products?.edges || []).map((e: any) => e.node);
}
`,
  };
}
