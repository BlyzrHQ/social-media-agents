import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../types.js";

export function generatePaperclipFiles(config: ProjectConfig): void {
  const dir = path.resolve(config.brand.projectDir, "agent");
  fs.mkdirSync(dir, { recursive: true });

  // AGENT.md — single marketing agent that handles everything
  fs.writeFileSync(
    path.join(dir, "AGENT.md"),
    `# ${config.brand.name} Marketing Agent

You are the Marketing Agent for ${config.brand.name}. ${config.brand.description}

${config.brand.websiteUrl ? `## Brand Website\n${config.brand.websiteUrl}\n\nAlways reference this website for current products, categories, promotions, and brand voice when generating ideas.\n` : ""}
You own the entire social media content pipeline — from idea generation to posting. You make decisions, execute tasks, and report results.

## What You Do

1. **Generate ideas** — create content ideas based on ACTUAL products from the website
2. **Rate ideas** — score and filter ideas for quality
3. **Build content** — generate images and captions for approved ideas
4. **Post content** — publish to Instagram
5. **Create templates** — analyze reference images and create reusable content templates
6. **Monitor health** — check pipeline status and make smart decisions

## How to Run Tasks

Read TRIGGER.md for the exact commands. The pipeline runs via CLI or Trigger.dev API.

### Quick Reference

\`\`\`bash
# Check what needs to be done first
npx tsx src/cli.ts status

# Run individual stages
npx tsx src/cli.ts run ideas      # Generate 10 content ideas (~30s)
npx tsx src/cli.ts run rating     # Score and approve/reject ideas (~20s)
npx tsx src/cli.ts run content    # Generate images + captions (~5min)
npx tsx src/cli.ts run posting    # Post to Instagram (~15s)

# Run full pipeline
npx tsx src/cli.ts run pipeline   # All 4 stages sequentially (~6-8min)
\`\`\`

## Decision Rules

Before running anything, check the pipeline status. Then decide:

| Condition | Action |
|-----------|--------|
| Pending ideas (new) > 20 | Skip ideas generation. Run rating instead. |
| Pending ideas (new) < 5 | Run ideas to generate more. |
| Approved unprocessed ideas > 10 | Run content builder. |
| Approved unprocessed ideas = 0 | Skip content builder. Nothing to process. |
| Queued content > 10 | Skip content builder. Run posting if posts are due. |
| Queued content = 0 and approved ideas exist | Run content builder. |
| Everything balanced | Report status. No action needed. |

## Template Creation

When asked to create a new template from a reference image:
1. The template-generator task analyzes the image with GPT-4o vision
2. It extracts visual style, composition, colors, and mood
3. Creates a reusable template with prompt variations
4. Saves it to the database

Via CLI:
\`\`\`bash
npx tsx src/cli.ts run template-generator --image IMAGE_URL
\`\`\`

Via Trigger.dev API (if set up):
\`\`\`bash
curl -s -X POST "https://api.trigger.dev/api/v1/tasks/template-generator/trigger" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \\
  -d '{"payload":{"imageUrl":"IMAGE_URL_HERE"}}'
\`\`\`

## Reporting Format

After any action, always report:

\`\`\`
Pipeline Status:
- Pending ideas: [number]
- Approved (unprocessed): [number]
- Queued content: [number]

Action Taken: [what you did and why]
Result: [success/failure + duration]
Recommendation: [what should happen next]
\`\`\`

## Memory

After every run, remember:
- Pipeline health numbers
- What you triggered and the results
- Any failures or unexpected behavior
- Patterns you notice (e.g., "content builder slower on Tuesdays")
- Optimal cadence (how often to run each stage)

## What You Do NOT Do

- Do not modify the pipeline code
- Do not create content manually — use the pipeline
- Do not post to Instagram directly — use the posting agent
- Do not skip the health check — always check status first
`
  );

  // TRIGGER.md — how to run tasks (CLI + API)
  fs.writeFileSync(
    path.join(dir, "TRIGGER.md"),
    `# ${config.brand.name} — Task Reference

## Local CLI (works immediately)

\`\`\`bash
# Check pipeline health
npx tsx src/cli.ts status

# Run individual tasks
npx tsx src/cli.ts run ideas          # Generate 10 content ideas
npx tsx src/cli.ts run rating         # Score and approve/reject ideas
npx tsx src/cli.ts run content        # Generate images + captions
npx tsx src/cli.ts run posting        # Post to Instagram
npx tsx src/cli.ts run pipeline       # Run all 4 sequentially

# Configure API keys
npx tsx src/cli.ts config
\`\`\`

## Trigger.dev API (cloud execution — optional)

If Trigger.dev is set up, tasks can be triggered remotely:

\`\`\`bash
curl -s -X POST "https://api.trigger.dev/api/v1/tasks/TASK_ID/trigger" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer TRIGGER_SECRET_KEY" \\
  -d '{"payload":{}}'
\`\`\`

### Available Task IDs

| Task ID | What it does | Duration |
|---------|-------------|----------|
| pipeline | Runs all 4 agents sequentially | ~6-8 min |
| ideas | Generates 10 content ideas using GPT-4o | ~30s |
| rating | Scores and approves/rejects pending ideas | ~20s |
| content-builder | Generates images + captions for approved ideas | ~5 min |
| posting | Posts next queued content to Instagram | ~15s |
| template-generator | Analyzes image and creates template (pass {"payload":{"imageUrl":"URL"}}) | ~30s |

### Check Run Status

\`\`\`bash
curl -s "https://api.trigger.dev/api/v3/runs/RUN_ID" \\
  -H "Authorization: Bearer TRIGGER_SECRET_KEY"
\`\`\`

Status values: QUEUED, EXECUTING, COMPLETED, FAILED

## Setup Instructions

### 1. Convex (Database)
\`\`\`bash
npm run convex:dev          # Start Convex (leave terminal open)
npm run convex:seed         # Seed initial templates
\`\`\`

### 2. Trigger.dev (optional)
\`\`\`bash
npx trigger.dev@latest init       # Create project
npx trigger.dev@latest dev        # Start dev server
npm run config                    # Add TRIGGER_SECRET_KEY
npm run trigger:sync-env          # Push env vars to Trigger.dev
\`\`\`

### 3. Update API keys anytime
\`\`\`bash
npx tsx src/cli.ts config
\`\`\`
`
  );

  // SECRETS.md — what env vars are needed and where they go
  fs.writeFileSync(
    path.join(dir, "SECRETS.md"),
    `# ${config.brand.name} — Secrets Reference

## Required Environment Variables

These go in your project's \`.env\` file and/or your agent orchestrator's environment.

### Required
| Key | Description | Where to get it |
|-----|-------------|-----------------|
| OPENAI_API_KEY | GPT-4o for ideas, rating, image evaluation | https://platform.openai.com/api-keys |

### Optional (add as you set up each service)
| Key | Description | Where to get it |
|-----|-------------|-----------------|
| GOOGLE_AI_KEY | Gemini 3 Pro for image generation | https://aistudio.google.com/apikey |
| CONVEX_URL | Database URL | Auto-set by \`npm run convex:dev\` in .env.local |
| CONVEX_AUTH_TOKEN | Database auth (if required) | Convex dashboard |
| TRIGGER_SECRET_KEY | Trigger.dev cloud execution | Trigger.dev project dashboard → API Keys |
| IG_USER_ID | Instagram page/user ID | Meta Business Settings |
| IG_ACCESS_TOKEN | Instagram posting token | Meta Graph API Explorer |
| SHOPIFY_STORE | Shopify store domain | e.g., mystore.myshopify.com |
| SHOPIFY_ACCESS_TOKEN | Shopify Admin API token | Shopify app settings |

## Current Values

These were set during project creation:

\`\`\`
OPENAI_API_KEY=${config.keys.openaiApiKey ? config.keys.openaiApiKey.substring(0, 15) + "..." : "NOT SET"}
GOOGLE_AI_KEY=${config.keys.googleAiKey ? config.keys.googleAiKey.substring(0, 10) + "..." : "NOT SET"}
CONVEX_URL=${config.keys.convexUrl || "Run npm run convex:dev to set"}
TRIGGER_SECRET_KEY=${config.keys.triggerSecretKey || "Run npx trigger.dev init then npm run config"}
IG_USER_ID=${config.keys.igUserId || "NOT SET"}
IG_ACCESS_TOKEN=${config.keys.igAccessToken ? "SET" : "NOT SET"}
\`\`\`

## Where to Put Secrets

### For local CLI execution
Add to \`.env\` in the project root. Run \`npx tsx src/cli.ts config\` to update.

### For Trigger.dev (cloud execution)
Run \`npm run trigger:sync-env\` to push env vars from .env to Trigger.dev.
Or add manually in Trigger.dev dashboard → Project → Environment Variables.

### For Paperclip / any agent orchestrator
Add as environment variables in the agent's configuration:
- TRIGGER_SECRET_KEY (so the agent can trigger tasks via API)
- OPENAI_API_KEY (if the agent needs to call GPT-4o directly)

### For other LLM orchestrators (Claude Code, Codex, custom)
The agent just needs to be able to run bash commands in the project directory.
All secrets are read from \`.env\` automatically.
`
  );
}
