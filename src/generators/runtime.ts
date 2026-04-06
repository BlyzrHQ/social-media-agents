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

  return `import "dotenv/config";

export interface Config {
  openaiApiKey: string;
  googleAiKey: string | undefined;
  igUserId: string | undefined;
  igAccessToken: string | undefined;
${shopifyFields}
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) { console.error(\`Missing required environment variable: \${name}\`); process.exit(1); }
  return value;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  _config = {
    openaiApiKey: required("OPENAI_API_KEY"),
    googleAiKey: process.env.GOOGLE_AI_KEY || undefined,
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

program.parse();
`;
}

export function generateServices(): {
  convex: string;
  embeddings: string;
  image: string;
  instagram: string;
  shopify: string;
  database: string;
} {
  return {
    database: `import Database from "better-sqlite3";
import * as path from "path";
import * as crypto from "crypto";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "pipeline.db");
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const fs = require("fs");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS ideas (
      _id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      concept TEXT NOT NULL,
      type TEXT DEFAULT 'single_image',
      template TEXT DEFAULT '',
      platforms TEXT DEFAULT '["ig"]',
      status TEXT DEFAULT 'new',
      score REAL,
      scoreReason TEXT,
      contentCreated INTEGER DEFAULT 0,
      embedding TEXT,
      createdAt INTEGER DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS contentQueue (
      _id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      ideaId TEXT,
      platform TEXT DEFAULT 'ig',
      contentType TEXT DEFAULT 'single',
      caption TEXT NOT NULL,
      hashtags TEXT DEFAULT '[]',
      imageUrls TEXT DEFAULT '[]',
      imagePrompts TEXT DEFAULT '[]',
      scheduledFor INTEGER,
      status TEXT DEFAULT 'queued',
      createdAt INTEGER DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS postedContent (
      _id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      contentQueueId TEXT,
      platform TEXT DEFAULT 'ig',
      postId TEXT,
      postUrl TEXT,
      postedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS templates (
      _id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT UNIQUE NOT NULL,
      displayName TEXT NOT NULL,
      type TEXT DEFAULT 'single_image',
      description TEXT DEFAULT '',
      promptTemplate TEXT DEFAULT '',
      captionTemplate TEXT DEFAULT '',
      defaultHashtags TEXT DEFAULT '[]',
      imagePrompts TEXT DEFAULT '[]',
      isActive INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS events (
      _id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      description TEXT,
      startDate INTEGER,
      endDate INTEGER,
      contentThemes TEXT DEFAULT '[]',
      hashtags TEXT DEFAULT '[]',
      visualStyle TEXT,
      isActive INTEGER DEFAULT 1
    );
  \`);
}

function parseJson(val: string | null | undefined): any {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

function rowToObj(row: any): any {
  if (!row) return null;
  const obj = { ...row };
  for (const key of ['platforms','hashtags','imageUrls','imagePrompts','defaultHashtags','contentThemes','embedding']) {
    if (key in obj && typeof obj[key] === 'string') obj[key] = parseJson(obj[key]);
  }
  if ('contentCreated' in obj) obj.contentCreated = !!obj.contentCreated;
  if ('isActive' in obj) obj.isActive = !!obj.isActive;
  return obj;
}

// Same interface as Convex — agents don't need to change
export async function convexQuery<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const db = getDb();
  switch (path) {
    case 'ideas:getPending':
      return db.prepare('SELECT * FROM ideas WHERE status IN (?, ?)').all('new', 'needs_review').map(rowToObj) as T;
    case 'ideas:getRecent':
      return db.prepare('SELECT * FROM ideas ORDER BY createdAt DESC LIMIT ?').all(args.limit || 200).map(rowToObj) as T;
    case 'ideas:getUnprocessed': {
      const rows = db.prepare('SELECT * FROM ideas WHERE status = ? AND contentCreated = 0').all('approved').map(rowToObj);
      return rows.slice(0, (args.limit as number) || 5) as T;
    }
    case 'ideas:getById':
      return rowToObj(db.prepare('SELECT * FROM ideas WHERE _id = ?').get(args.id)) as T;
    case 'templates:getByName':
      return rowToObj(db.prepare('SELECT * FROM templates WHERE name = ?').get(args.name)) as T;
    case 'templates:listActive':
      return db.prepare('SELECT * FROM templates WHERE isActive = 1').all().map(rowToObj) as T;
    case 'events:getActive':
      return db.prepare('SELECT * FROM events WHERE isActive = 1').all().map(rowToObj) as T;
    case 'contentQueue:getQueued':
      return db.prepare('SELECT * FROM contentQueue WHERE status = ?').all('queued').map(rowToObj) as T;
    case 'contentQueue:getNextToPost': {
      const now = Date.now();
      const row = db.prepare('SELECT * FROM contentQueue WHERE status = ? AND scheduledFor <= ? ORDER BY scheduledFor ASC LIMIT 1').get('queued', now);
      return rowToObj(row) as T;
    }
    default:
      throw new Error(\`Unknown query path: \${path}\`);
  }
}

export async function convexMutation<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const db = getDb();
  const id = crypto.randomBytes(16).toString('hex');
  switch (path) {
    case 'ideas:create': {
      db.prepare('INSERT INTO ideas (_id, concept, type, template, platforms, embedding, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, args.concept, args.type || 'single_image', args.template || '',
        JSON.stringify(args.platforms || ['ig']),
        args.embedding ? JSON.stringify(args.embedding) : null,
        Date.now()
      );
      return id as T;
    }
    case 'ideas:updateStatus':
      db.prepare('UPDATE ideas SET status = ?, score = ?, scoreReason = ? WHERE _id = ?').run(args.status, args.score || null, args.scoreReason || null, args.id);
      return undefined as T;
    case 'ideas:markContentCreated':
      db.prepare('UPDATE ideas SET contentCreated = 1 WHERE _id = ?').run(args.id);
      return undefined as T;
    case 'queue:add': {
      db.prepare('INSERT INTO contentQueue (_id, ideaId, platform, caption, imageUrls, imagePrompts, scheduledFor, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, args.ideaId || null, args.platform || 'ig', args.caption,
        JSON.stringify([args.imageUrl || '']),
        JSON.stringify([args.imagePrompt || '']),
        new Date(args.scheduledFor as string).getTime(),
        'queued', Date.now()
      );
      return id as T;
    }
    case 'contentQueue:markPosted':
      db.prepare('UPDATE contentQueue SET status = ? WHERE _id = ?').run('posted', args.id);
      return undefined as T;
    case 'contentQueue:markFailed':
      db.prepare('UPDATE contentQueue SET status = ? WHERE _id = ?').run('failed', args.id);
      return undefined as T;
    case 'postedContent:record': {
      db.prepare('INSERT INTO postedContent (_id, contentQueueId, platform, postId, postUrl, postedAt) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, args.contentQueueId, args.platform, args.postId, args.postUrl || null,
        new Date(args.postedAt as string).getTime()
      );
      return id as T;
    }
    case 'templates:create': {
      db.prepare('INSERT INTO templates (_id, name, displayName, type, description, promptTemplate, captionTemplate, defaultHashtags, imagePrompts, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, args.name, args.displayName, args.type || 'single_image', args.description || '',
        args.promptTemplate || '', args.captionTemplate || '',
        JSON.stringify(args.defaultHashtags || []),
        JSON.stringify(args.imagePrompts || []),
        args.isActive !== false ? 1 : 0
      );
      return id as T;
    }
    default:
      throw new Error(\`Unknown mutation path: \${path}\`);
  }
}

export async function convexAction<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  if (path === 'files:uploadBase64Image') {
    // Save image locally and return a file:// URL
    const fs = require('fs');
    const imgDir = path.join(process.cwd(), 'data', 'images');
    fs.mkdirSync(imgDir, { recursive: true });
    const filename = crypto.randomBytes(8).toString('hex') + '.jpg';
    const filepath = path.join(imgDir, filename);
    fs.writeFileSync(filepath, Buffer.from(args.base64Data as string, 'base64'));
    return { url: 'file://' + filepath } as T;
  }
  throw new Error(\`Unknown action path: \${path}\`);
}

export function seedTemplates(templates: Array<{name: string; displayName: string; description: string; promptTemplate: string; captionTemplate: string; imagePrompts: string[]; defaultHashtags: string[]}>) {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO templates (_id, name, displayName, type, description, promptTemplate, captionTemplate, defaultHashtags, imagePrompts, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
  for (const t of templates) {
    insert.run(crypto.randomBytes(16).toString('hex'), t.name, t.displayName, 'single_image', t.description, t.promptTemplate, t.captionTemplate, JSON.stringify(t.defaultHashtags), JSON.stringify(t.imagePrompts));
  }
}
`,
    convex: `// Legacy Convex adapter — kept for users who want cloud database
import { getConfig } from "../config.js";

export async function convexQuery<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const config = getConfig() as any;
  if (!config.convexUrl) { throw new Error("CONVEX_URL not set. Using SQLite by default — import from ./database.js instead."); }
  const res = await fetch(\`\${config.convexUrl}/api/query\`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: config.convexAuthToken }, body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex query \${path} failed: \${res.status}\`);
  return (await res.json()).value as T;
}

export async function convexMutation<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const config = getConfig() as any;
  if (!config.convexUrl) { throw new Error("CONVEX_URL not set. Using SQLite by default — import from ./database.js instead."); }
  const res = await fetch(\`\${config.convexUrl}/api/mutation\`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: config.convexAuthToken }, body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex mutation \${path} failed: \${res.status}\`);
  return (await res.json()).value as T;
}

export async function convexAction<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const config = getConfig() as any;
  if (!config.convexUrl) { throw new Error("CONVEX_URL not set."); }
  const res = await fetch(\`\${config.convexUrl}/api/action\`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: config.convexAuthToken }, body: JSON.stringify({ path, args }) });
  if (!res.ok) throw new Error(\`Convex action \${path} failed: \${res.status}\`);
  return (await res.json()).value as T;
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
