# social-media-agents

Scaffold a complete AI-powered social media content pipeline in minutes. One command generates a full TypeScript project with AI agents for idea generation, content rating, image creation, and Instagram posting — customized to your brand.

## What You Get

```
Your Brand Pipeline
├── Ideas Agent        — GPT-4o generates content ideas tailored to your brand
├── Rating Agent       — Scores and filters ideas based on your niche
├── Content Builder    — Gemini 3 Pro generates images, GPT-4o evaluates quality
├── Posting Agent      — Posts to Instagram via Graph API
├── Template Designer  — Analyze images to create reusable content templates
├── Trigger.dev        — Cloud task execution with retries and auto-deploy
├── Paperclip          — AI agent orchestration (CEO + CMO + Template Designer)
└── GitHub Actions     — CI/CD auto-deploy on push
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for Paperclip agent orchestration)
- [OpenAI API key](https://platform.openai.com/api-keys)
- [Google AI key](https://aistudio.google.com/apikey) (for Gemini image generation)
- [Instagram Graph API](https://developers.facebook.com/) credentials

## Quick Start

```bash
npx social-media-agents
```

The CLI will walk you through:

1. **Brand info** — name, description, content types
2. **API keys** — OpenAI, Google AI, Instagram, optionally Shopify
3. **Custom prompts** — GPT-4o generates agent prompts tailored to your brand (~$0.05)
4. **Project scaffold** — creates all files, installs dependencies
5. **Paperclip setup** — starts Docker container with CEO, CMO, and Template Designer agents

## After Setup

### 1. Set up Convex (database)

```bash
cd your-project
npx convex login
npx convex deploy
```

Update `.env` with the Convex URL and auth token from the deploy output.

### 2. Seed initial templates

```bash
npx convex run seed:seedTemplates
```

### 3. Run the pipeline

```bash
# Run all agents sequentially
npx tsx src/cli.ts run pipeline

# Or run individual agents
npx tsx src/cli.ts run ideas
npx tsx src/cli.ts run rating
npx tsx src/cli.ts run content
npx tsx src/cli.ts run posting

# Check pipeline health
npx tsx src/cli.ts status
```

### 4. Set up Trigger.dev (cloud execution)

```bash
npx trigger.dev@latest init
npx trigger.dev@latest dev
```

Push to GitHub and tasks auto-deploy via GitHub Actions.

### 5. Access Paperclip (agent orchestration)

Open http://localhost:3100 in your browser.

Paperclip gives you:
- **CEO Agent** — makes strategic decisions, delegates to CMO
- **CMO Agent** — triggers the pipeline, monitors results, reports back
- **Template Designer** — analyzes images and creates new content templates

## Project Structure

```
your-project/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── config.ts                 # Environment variable loader
│   ├── runner.ts                 # OpenAI tool-calling agent loop
│   ├── agents/
│   │   ├── ideas.ts              # Content idea generation
│   │   ├── rating.ts             # Idea scoring and filtering
│   │   ├── content-builder.ts    # Image generation + captions
│   │   ├── posting.ts            # Instagram posting
│   │   └── template-generator.ts # Image analysis → new templates
│   ├── services/
│   │   ├── convex.ts             # Database client
│   │   ├── embeddings.ts         # Semantic deduplication
│   │   ├── image.ts              # Gemini image generation
│   │   ├── instagram.ts          # Instagram Graph API
│   │   └── shopify.ts            # Product catalogue (optional)
│   └── trigger/
│       └── pipeline.ts           # Trigger.dev task definitions
├── convex/
│   ├── schema.ts                 # Database schema
│   ├── ideas.ts                  # Idea queries/mutations
│   ├── templates.ts              # Template management
│   ├── queue.ts                  # Content queue
│   ├── postedContent.ts          # Posted content tracking
│   ├── events.ts                 # Events/themes
│   └── seed.ts                   # Initial template data
├── paperclip/
│   ├── docker-compose.yml        # Paperclip container
│   ├── ceo-AGENTS.md             # CEO agent instructions
│   ├── cmo-AGENTS.md             # CMO agent instructions
│   ├── template-designer-AGENTS.md
│   └── TRIGGER.md                # Trigger.dev API reference
├── .github/workflows/
│   └── deploy.yml                # Auto-deploy to Trigger.dev
├── trigger.config.ts
├── .env                          # Your API keys (git-ignored)
└── .env.example                  # Template for required keys
```

## How It Works

```
                    ┌─────────────┐
                    │  Paperclip  │
                    │  (Docker)   │
                    │             │
                    │  CEO ──► CMO│
                    └──────┬──────┘
                           │ triggers via API
                           ▼
                    ┌─────────────┐
                    │ Trigger.dev │
                    │  (Cloud)    │
                    │             │
                    │  Ideas      │
                    │  Rating     │
                    │  Content    │
                    │  Posting    │
                    └──────┬──────┘
                           │ calls
                           ▼
              ┌────────────────────────┐
              │   External Services    │
              │                        │
              │  OpenAI   Gemini       │
              │  Convex   Instagram    │
              │  Shopify (optional)    │
              └────────────────────────┘
```

1. **Paperclip CEO** wakes up, checks pipeline health, decides what to run
2. **CEO delegates** to CMO with specific instructions
3. **CMO triggers** Trigger.dev tasks via REST API
4. **Trigger.dev** runs agents in the cloud with retries
5. **Agents** call OpenAI, Gemini, Instagram, and store results in Convex
6. **CMO reports** results back to CEO
7. **You check** the Paperclip dashboard whenever you want

## Configuration

All configuration is in `.env`:

```
OPENAI_API_KEY=          # GPT-4o for idea generation, rating, image evaluation
GOOGLE_AI_KEY=           # Gemini 3 Pro for image generation
CONVEX_URL=              # Your Convex deployment URL
CONVEX_AUTH_TOKEN=       # Convex authentication token
IG_USER_ID=              # Instagram user/page ID
IG_ACCESS_TOKEN=         # Instagram page access token
SHOPIFY_STORE=           # (optional) yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=    # (optional) Shopify Admin API token
```

## Customization

### Add a new agent

1. Create `src/agents/my-agent.ts` with a system prompt and tools
2. Register it in `src/trigger/pipeline.ts`
3. Push to GitHub — auto-deploys

### Add a new template

Give the Template Designer an image:

```
Assign task to Template Designer:
"Analyze this image and create a template: https://example.com/my-image.jpg"
```

Or use the CLI:

```bash
npx tsx src/cli.ts run template-generator --image https://example.com/my-image.jpg
```

### Change scoring criteria

Edit the `SYSTEM_PROMPT` in `src/agents/rating.ts` to adjust how ideas are scored.

### Change content style

Edit the `SYSTEM_PROMPT` in `src/agents/content-builder.ts` to change caption style, hashtag preferences, or image evaluation criteria.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Orchestration | Paperclip | Agent management, delegation, visibility |
| Execution | Trigger.dev | Reliable task running, retries, cron |
| AI | OpenAI GPT-4o | Idea generation, rating, evaluation |
| Images | Google Gemini 3 Pro | Marketing image generation |
| Database | Convex | Ideas, queue, posts, templates |
| Social | Instagram Graph API | Content posting |
| Products | Shopify GraphQL | Product catalogue (optional) |
| CI/CD | GitHub Actions | Auto-deploy on push |

## Known Limitations

- **Instagram only** — TikTok and Facebook support planned for future versions
- **Single images only** — carousel and Reels support planned
- **Paperclip logger** — has a known memory leak at scale (GitHub issue #1825). Restart the container daily if running many agents. See [Paperclip docs](https://github.com/paperclipai/paperclip) for details.

## Cost Estimates

| Service | Cost per pipeline run | Monthly (3 runs/day) |
|---------|----------------------|---------------------|
| OpenAI (GPT-4o) | ~$0.30 | ~$27 |
| Gemini (images) | ~$0.05 | ~$4.50 |
| Trigger.dev | ~$0.05 | ~$4.50 |
| Convex | Free tier | $0 |
| Paperclip | Self-hosted | $0 |
| **Total** | **~$0.40/run** | **~$36/mo** |

## License

MIT — use it however you want.

## Contributing

PRs welcome. Please open an issue first to discuss what you'd like to change.

## Credits

Built by [BlyzrHQ](https://github.com/BlyzrHQ). Powered by [OpenAI](https://openai.com), [Trigger.dev](https://trigger.dev), [Paperclip](https://github.com/paperclipai/paperclip), and [Convex](https://convex.dev).
