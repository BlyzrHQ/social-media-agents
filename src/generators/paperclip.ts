import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../types.js";

export function generatePaperclipFiles(config: ProjectConfig): void {
  const dir = path.resolve(config.brand.projectDir, "paperclip");
  fs.mkdirSync(dir, { recursive: true });

  // docker-compose.yml
  fs.writeFileSync(
    path.join(dir, "docker-compose.yml"),
    `services:
  paperclip:
    image: ghcr.io/paperclipai/paperclip:latest
    build:
      context: .
      dockerfile_inline: |
        FROM ghcr.io/paperclipai/paperclip:latest
    ports:
      - "3100:3100"
    environment:
      HOST: "0.0.0.0"
      PAPERCLIP_HOME: "/paperclip"
      OPENAI_API_KEY: "${config.keys.openaiApiKey}"
      BETTER_AUTH_SECRET: "social-agents-${Date.now()}"
      PAPERCLIP_DEPLOYMENT_MODE: "authenticated"
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private"
      PAPERCLIP_PUBLIC_URL: "http://localhost:3100"
    volumes:
      - ./data:/paperclip
`
  );

  // CEO AGENTS.md
  fs.writeFileSync(
    path.join(dir, "ceo-AGENTS.md"),
    `# CEO Agent Instructions

You are the CEO of ${config.brand.name}. You do NOT execute tasks yourself — you delegate to your team.

## Your Team

| Agent | Role | Responsibility |
|-------|------|---------------|
| CMO | Marketing | Runs the content pipeline via Trigger.dev |
| Template Designer | Design | Analyzes images and creates content templates |

## How to Delegate

When you receive a marketing-related task:
1. Create a subtask and assign it to CMO
2. Monitor their progress
3. Report results to the board

## Decision Making

Before delegating, check pipeline health (CMO knows how). Consider:
- Too many pending ideas? Skip generation, run rating
- Queue full? Skip content builder
- Low on ideas? Generate more

## Memory and Learning

After every run, write what you learned to $AGENT_HOME/memory/.
- Notes: $AGENT_HOME/memory/notes/ (daily observations)
- Knowledge: $AGENT_HOME/memory/knowledge/ (persistent facts)
`
  );

  // CMO AGENTS.md
  fs.writeFileSync(
    path.join(dir, "cmo-AGENTS.md"),
    `# CMO Agent Instructions

You are the Chief Marketing Officer for ${config.brand.name}. ${config.brand.description}

You own the marketing content pipeline end-to-end.

## How You Work

You operate an automated pipeline on Trigger.dev by calling its REST API. Read TRIGGER.md for the exact commands.

## Daily Routine

1. Check pipeline health first (see TRIGGER.md)
2. Apply decision rules
3. Trigger the appropriate task(s)
4. Monitor until completion
5. Report results with numbers and recommendations

## Decision Rules

| Condition | Action |
|-----------|--------|
| Pending ideas > 20 | Skip ideas, run rating |
| Pending ideas < 5 | Run ideas |
| Approved unprocessed > 10 | Run content builder |
| Queued content > 10 | Skip content, run posting |
| Everything balanced | Report status, no action |

## Reporting Format

Pipeline Status:
- Pending ideas: [number]
- Approved (unprocessed): [number]
- Queued content: [number]

Action Taken: [what and why]
Result: [COMPLETED/FAILED]
Recommendation: [next run suggestion]

## Memory and Learning

After every run, write what you learned to $AGENT_HOME/memory/.
- Notes: pipeline health, what triggered, results, failures
- Knowledge: failure patterns, optimal cadence, timing insights
`
  );

  // Template Designer AGENTS.md
  fs.writeFileSync(
    path.join(dir, "template-designer-AGENTS.md"),
    `# Template Designer Agent Instructions

You are the Template Designer for ${config.brand.name}. You analyze reference images and create reusable content templates.

## How You Work

Trigger the template-generator task on Trigger.dev, passing an image URL. Read TRIGGER.md for the command.

## When You Receive a Task

1. Extract the image URL from the task
2. Trigger the template-generator task
3. Monitor until completion
4. Report the new template name and details

## Reporting Format

Template Created:
- Name: [snake_case_name]
- Display Name: [human readable]
- Prompts: [number] variations
- Status: active
`
  );

  // TRIGGER.md (shared by CMO and Template Designer)
  fs.writeFileSync(
    path.join(dir, "TRIGGER.md"),
    `# Trigger.dev Pipeline

## Environment
- TRIGGER_SECRET_KEY is in your environment — use $TRIGGER_SECRET_KEY in curl commands

## Trigger a Task

\`\`\`bash
curl -s -X POST "https://api.trigger.dev/api/v1/tasks/TASK_ID_HERE/trigger" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \\
  -d '{"payload":{}}'
\`\`\`

## Available Tasks

| Task ID | What it does |
|---------|-------------|
| pipeline | Runs all agents sequentially |
| ideas | Generates content ideas |
| rating | Scores and approves/rejects ideas |
| content-builder | Generates images and captions |
| posting | Posts to Instagram |
| template-generator | Analyzes image, creates template (pass {"payload":{"imageUrl":"URL"}}) |

## Check Run Status

\`\`\`bash
curl -s "https://api.trigger.dev/api/v3/runs/RUN_ID" \\
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY"
\`\`\`

## Reporting

Always report: pipeline health numbers, decision made, run ID, final status, recommendations.
`
  );
}
