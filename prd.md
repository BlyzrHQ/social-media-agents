# PRD: social-media-agents — Open Source Social Media Content Pipeline Generator

## Problem Statement

Building an automated social media content pipeline requires stitching together multiple AI services (LLMs, image generation, social APIs), setting up task orchestration, configuring agent management, and writing custom agent logic — all before generating a single post. This takes days of development work and deep knowledge of multiple platforms (OpenAI, Trigger.dev, Paperclip, Convex, Instagram API). There is no turnkey solution that scaffolds a complete, production-ready social media agent pipeline customized to a specific brand.

## Solution

A CLI tool (`npx social-media-agents`) that interactively asks the user about their brand, collects API keys, and generates a complete, customized social media content pipeline — including AI agents for idea generation, content rating, image creation, and Instagram posting. The pipeline runs on Trigger.dev for reliable task execution and Paperclip for agent orchestration, with Convex as the database. The entire setup is automated: Convex project creation, Paperclip Docker deployment, Trigger.dev configuration, and GitHub Actions CI/CD — all from a single command.

## User Stories

1. As a brand owner, I want to run one command to create my entire social media pipeline, so that I don't spend days wiring together AI services manually.
2. As a brand owner, I want to describe my brand in plain English, so that the pipeline generates content that matches my brand voice and style.
3. As a brand owner, I want the CLI to ask me for all required API keys upfront, so that I know exactly what I need before starting.
4. As a brand owner, I want the CLI to warn me when it will use my OpenAI key (for generating custom prompts), so that I'm aware of the token cost.
5. As a brand owner, I want a working pipeline immediately after setup, so that I can generate my first content ideas within minutes.
6. As a developer, I want the generated project to be standard TypeScript with clear structure, so that I can modify and extend it.
7. As a developer, I want each agent to be a separate file with its own system prompt and tools, so that I can customize individual agents without affecting others.
8. As a developer, I want the OpenAI tool-calling runner to be a shared module, so that adding a new agent requires only defining a system prompt and tools.
9. As a brand owner, I want GPT-4o to generate custom scoring criteria for my niche, so that the rating agent evaluates ideas based on what matters for my specific brand.
10. As a brand owner, I want GPT-4o to generate custom hashtags relevant to my industry, so that posts reach the right audience.
11. As a brand owner, I want the ideas agent to generate content ideas specific to my brand and industry, so that content feels authentic and on-brand.
12. As a brand owner, I want the content builder to generate images that match my brand aesthetic, so that my Instagram feed looks cohesive.
13. As a brand owner, I want semantic deduplication on ideas, so that the pipeline never generates duplicate content.
14. As a brand owner, I want the rating agent to score ideas on customized criteria, so that only quality content makes it to production.
15. As a brand owner, I want the content builder to evaluate generated images for quality before queuing them, so that low-quality images never get posted.
16. As a brand owner, I want the posting agent to automatically post to Instagram, so that I don't have to manually upload content.
17. As a brand owner, I want a pipeline health check command, so that I can see how many ideas are pending, approved, and queued at any time.
18. As a brand owner, I want to run individual agents or the full pipeline, so that I have control over what runs and when.
19. As a developer, I want the Convex schema and functions to be auto-generated and deployed, so that the database is ready without manual setup.
20. As a developer, I want Trigger.dev tasks to be auto-registered, so that the pipeline is deployable immediately.
21. As a developer, I want GitHub Actions CI/CD to be pre-configured, so that pushing to main auto-deploys to Trigger.dev.
22. As a brand owner, I want Paperclip to be set up automatically via Docker, so that I have agent orchestration without manual configuration.
23. As a brand owner, I want a CEO agent that makes smart decisions about what to run, so that the pipeline adapts to current content levels.
24. As a brand owner, I want a CMO agent that executes marketing tasks, so that the CEO can delegate and the pipeline runs autonomously.
25. As a brand owner, I want a Template Designer agent that analyzes reference images and creates reusable templates, so that I can expand my content styles over time.
26. As a brand owner, I want Paperclip agents to have memory, so that they learn from past runs and make better decisions over time.
27. As a developer, I want to optionally connect a Shopify store, so that the ideas agent can create product-specific content.
28. As a developer, I want all secrets stored in environment variables, so that no credentials are hardcoded.
29. As a developer, I want a .env.example documenting all required variables, so that new team members can configure quickly.
30. As a brand owner, I want the daily routine to check pipeline health before deciding what to run, so that it doesn't waste resources generating ideas when there are already too many.
31. As a developer, I want the project to be self-contained in one directory, so that it can be deployed to any environment.
32. As a developer, I want unit tests for the core modules, so that I can refactor with confidence.
33. As a brand owner, I want clean exit codes from each agent, so that the orchestrator knows if something failed.
34. As a brand owner, I want structured logs to stdout, so that I can see what happened during each run.
35. As a developer, I want the adapters (database, image, social, shop) to be separate modules with clean interfaces, so that I can swap providers later.

## Implementation Decisions

### Architecture

The generated project follows a layered architecture:

- **CLI Layer** — the `social-media-agents` npm package. Prompts user, generates project, runs setup.
- **Runtime Layer** — the generated TypeScript project. Contains agents, services, CLI, and Trigger.dev tasks.
- **Orchestration Layer** — Paperclip running in Docker. CEO, CMO, and Template Designer agents.
- **Execution Layer** — Trigger.dev cloud. Runs tasks with retries, checkpointing, versioning.
- **Data Layer** — Convex. Stores ideas, content queue, posted content, templates, events.

### CLI Flow

The CLI (`npx social-media-agents`) follows this sequence:

1. Collect brand info (name, description, content types)
2. Collect API keys (OpenAI, Gemini, Instagram, optionally Shopify)
3. Warn user about GPT-4o token usage for prompt generation, proceed on confirmation
4. Use GPT-4o to generate customized system prompts, scoring criteria, hashtags, and caption styles based on brand description
5. Scaffold the project directory with all generated files
6. Run `npm install`
7. Create Convex project, deploy schema and functions
8. Create Trigger.dev project configuration
9. Generate GitHub Actions workflow files
10. Pull Paperclip Docker image, run container, onboard, create CEO/CMO/Template Designer agents
11. Copy generated AGENTS.md and TRIGGER.md to Paperclip agent directories
12. Run a test: `npx tsx src/cli.ts status` to verify everything works
13. Print summary with next steps

### Brand Customization via GPT-4o

When the user provides their brand name and description, the CLI sends a single GPT-4o request to generate:

- Ideas agent system prompt (customized for their industry/niche)
- Rating agent scoring criteria (4 dimensions relevant to their brand)
- Content builder caption style and hashtag preferences
- Default hashtags (20-30 relevant to their niche)
- 3-4 initial template definitions (promptTemplate, captionTemplate, imagePrompts)

This is a one-time cost of ~$0.05-0.10 in tokens.

### Modules

1. **CLI Entry Point** — orchestrates the entire setup flow. Handles prompts, validation, progress display.

2. **Prompt Collector** — interactive prompts using a library like `inquirer` or `@clack/prompts`. Validates API keys by making test calls. Returns a typed config object.

3. **Agent Generator** — takes brand config, calls GPT-4o to generate customized agent files. Outputs TypeScript files with system prompts and tool definitions.

4. **Service Generator** — generates service adapter files based on user choices (Convex, Gemini, Instagram, optionally Shopify).

5. **Trigger Generator** — generates Trigger.dev task definitions and config file.

6. **Paperclip Generator** — generates AGENTS.md files for CEO, CMO, and Template Designer. Generates docker-compose.yml and TRIGGER.md.

7. **CI Generator** — generates GitHub Actions workflow for auto-deploy to Trigger.dev.

8. **Convex Setup** — creates Convex project via CLI, writes schema and function files, deploys.

9. **Paperclip Setup** — pulls Docker image, starts container, runs onboard, creates agents, copies instruction files, authenticates Claude Code.

10. **Trigger Setup** — initializes Trigger.dev in the generated project.

11. **Runner (runtime)** — generic OpenAI tool-calling loop. Takes system prompt + tool definitions, runs the agent loop, returns structured result. Copied into every generated project.

12. **Config (runtime)** — environment variable loader with validation. Fails fast on missing required vars.

### Database Schema (Convex)

Same schema as the Blyzr project — ideas, contentQueue, postedContent, templates, events, settings, workflowLogs. Generated from a template and deployed automatically.

### Paperclip Agent Structure

Three agents auto-created:

- **CEO** — receives tasks, checks pipeline health, delegates to CMO. Has memory/learning enabled.
- **CMO** — executes marketing tasks by triggering Trigger.dev API. Has memory/learning enabled. Reports to CEO.
- **Template Designer** — analyzes images, creates templates via Trigger.dev task. Reports to CMO.

### Adapter Interfaces

Each adapter follows a simple interface so providers can be swapped later:

- **Database adapter** — `query(path, args)`, `mutation(path, args)`, `action(path, args)`
- **Image adapter** — `generateImage(prompt): Promise<string>` (returns URL)
- **Social adapter** — `post(imageUrl, caption): Promise<{postId, postUrl}>`
- **Shop adapter** — `fetchProducts(limit): Promise<Product[]>`

### Trigger.dev Tasks

Six tasks auto-registered:

- `pipeline` — chains all agents sequentially
- `ideas` — generates content ideas
- `rating` — scores and approves/rejects ideas
- `content-builder` — generates images and captions
- `posting` — posts to Instagram
- `template-generator` — analyzes images and creates templates

## Testing Decisions

### What makes a good test

Tests should verify external behavior through public interfaces, not implementation details. Mock external HTTP calls at the boundary. Tests should be deterministic and fast.

### Modules to test

1. **Runner** — test the OpenAI tool-calling loop with mocked responses. Verify it dispatches tools correctly, handles errors, respects max iterations.
2. **Prompt Collector** — test input validation (API key format, required fields, URL format).
3. **Agent Generator** — test that GPT-4o output is parsed correctly and produces valid TypeScript. Mock GPT-4o responses.
4. **Database adapter (Convex)** — test HTTP wrapper with mocked responses. Verify correct URL construction, auth headers, error handling.
5. **Embeddings** — test cosine similarity math with known vectors (no mocks needed).

### Test framework

Vitest — fast, TypeScript-native, good mocking support. Same as the Blyzr project.

## Out of Scope

- **TikTok posting** — Instagram only for v1. TikTok requires developer app approval and video content.
- **Video/Reels content** — single images only for v1.
- **Carousel posts** — single images only for v1.
- **Multiple image providers** — Gemini only for v1. DALL-E and Flux can be added later via the adapter interface.
- **Multiple database providers** — Convex only for v1. Supabase/Firebase can be added later.
- **Cloud Paperclip hosting** — local Docker only for v1.
- **Engagement analytics** — posting and recording only. No engagement tracking or optimization.
- **Content calendar UI** — CLI and Paperclip dashboard only. No custom web UI.
- **Multi-language support** — English only for v1.
- **Team collaboration features** — single user setup. Paperclip handles multi-user via invite links.

## Further Notes

- The project is MIT licensed and will live at `BlyzrHQ/social-media-agents`.
- The CLI should be published to npm as `social-media-agents`.
- The generated project is fully standalone — the CLI is only needed for initial scaffolding. After that, the user owns and modifies the code directly.
- The runner module is the same proven code from the Blyzr marketing pipeline, battle-tested with real production data.
- The architecture doc from the Blyzr project should be adapted as a template for the generated project's documentation.
- Paperclip's known logger memory leak (issue #1825) should be documented in the generated project's README as a known limitation with the daily restart workaround.
- The CLI should check for Docker availability before attempting Paperclip setup and provide clear instructions if Docker is not installed.
