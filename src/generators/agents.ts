import OpenAI from "openai";
import type { BrandConfig, GeneratedPrompts, TemplateDefinition } from "../types.js";

const GENERATION_PROMPT = `You are helping set up an automated social media content pipeline for a brand. Based on the brand info and website content below, generate HIGHLY SPECIFIC AI agent prompts that reflect this exact brand.

BRAND NAME: {BRAND_NAME}
BRAND DESCRIPTION: {BRAND_DESCRIPTION}
CONTENT TYPES: {CONTENT_TYPES}

{WEBSITE_SECTION}

Generate a JSON response with EXACTLY this structure:
{
  "ideasSystemPrompt": "A system prompt for the Ideas Agent that generates content ideas specific to this brand. Include the brand name, niche, and content style. The agent has a save_idea tool. Tell it to generate 10 ideas per run using templates: educational_comparison, cinematic_stack, editorial_grid, recipe_infographic. Type must be single_image, platforms must be [ig].",

  "ratingSystemPrompt": "A system prompt for the Rating Agent that scores content ideas 0-100 for this specific brand. Include 4 scoring dimensions (25 pts each) customized to their niche. The agent has tools: get_pending_ideas, approve_idea (score>=70), reject_idea (score<50), flag_for_review (50-69).",

  "contentBuilderSystemPrompt": "A system prompt for the Content Builder that creates Instagram posts. It has tools: generate_image, evaluate_image, save_to_queue. Tell it to use the IMAGE PROMPT from context verbatim, evaluate quality (retry once if score<7), then save to queue.",

  "scoringCriteria": ["Criterion 1 (25 pts): description", "Criterion 2 (25 pts): description", "Criterion 3 (25 pts): description", "Criterion 4 (25 pts): description"],

  "defaultHashtags": ["#hashtag1", "#hashtag2", "...20-30 hashtags relevant to this brand's niche"],

  "initialTemplates": [
    {
      "name": "snake_case_style_name",
      "displayName": "Human Readable Style Name",
      "description": "What this template style is for and why it works for engagement",
      "promptTemplate": "A COMPREHENSIVE creative brief for image generation. See TEMPLATE PROMPT RULES below.",
      "captionTemplate": "Instagram caption template with {CONCEPT} and {HASHTAGS} placeholders, matching brand voice",
      "imagePrompts": [
        "Full detailed creative brief variation 1 — see TEMPLATE PROMPT RULES",
        "Full detailed creative brief variation 2 — different composition angle",
        "Full detailed creative brief variation 3 — different visual approach"
      ],
      "defaultHashtags": ["#relevant", "#hashtags"]
    }
  ]
}

## TEMPLATE PROMPT RULES (CRITICAL — READ CAREFULLY)

Each template's promptTemplate and imagePrompts MUST be DETAILED CREATIVE BRIEFS, not short descriptions. Each prompt should be 300-800 words and include ALL of these sections:

1. **HERO VISUAL** — what is the main subject, how is it displayed (angle, arrangement, presentation)
2. **COMPOSITION** — layout structure (center hero, side panels, grid, clockwise flow, etc.)
3. **CONTENT SECTIONS** — what information blocks appear (ingredients, steps, facts, comparisons)
4. **VISUAL STYLE** — artistic direction (editorial, illustrated, photographic, minimal, heritage, etc.)
5. **TYPOGRAPHY** — headline style, body text, hierarchy
6. **BACKGROUND** — color palette, texture, gradient
7. **LIGHTING** — warm/cool, studio/natural, shadows
8. **MOOD** — what feeling it evokes
9. **TECHNICAL OUTPUT** — 1080x1080 for Instagram, 1080x1920 for TikTok
10. **STYLE DNA** — 3-5 word style summary

Use {MAIN_SUBJECT}, {THEME}, {DISH_NAME}, {CONCEPT} as placeholders where the specific content changes per post.

⚠️ ABSOLUTE MINIMUM LENGTH: Each imagePrompt string MUST be at least 1500 characters long. If any imagePrompt is shorter than 1500 characters, the ENTIRE response will be rejected and you will need to redo it. This is a hard technical requirement. Count your characters. Be extremely verbose and detailed in each imagePrompt. Include every subsection with multiple sentences each.

EXAMPLE of the level of detail needed (this is the MINIMUM acceptable quality):

"Create an ultra-clean modern recipe infographic for \\"{MAIN_SUBJECT}\\".\\n\\n## HERO DISH\\nShowcase {MAIN_SUBJECT} in a visually appealing finished form. Display 2-3 pieces slightly angled in perspective (NOT top-down), floating gently with a soft natural shadow underneath. If sliced/open: the cut section must clearly show texture of outer layer, interior filling detail, moisture and realism, natural warm tones.\\n\\n## MAIN COMPOSITION\\n{MAIN_SUBJECT} is the hero object centered. Clear visual hierarchy: Hero dish > Steps > Ingredients > Stats. Generous negative space. Clean editorial Instagram layout. No clutter. No overcrowding.\\n\\n## INGREDIENTS SECTION\\nDisplay small realistic ingredient visuals with quantities. Group clearly into labeled clusters. Place ingredient clusters evenly around the TOP HALF of the design. Use thin elegant connector lines leading subtly toward the dish. Keep spacing airy and balanced.\\n\\n## STEPS SECTION\\nArrange preparation steps in STRICT CLOCKWISE ORDER. Use an OPEN semi-circular flow. DO NOT create a closed circle. DO NOT connect the last step back to the first step. Add small minimal cooking icons beside each step. Use subtle curved directional lines guiding clockwise reading.\\n\\n## BOTTOM INFO BADGES\\nDisplay small clean rounded badges: Prep Time, Cook Time, Servings, Spice Level. Icons must be minimal and consistent.\\n\\n## VISUAL STYLE\\nEditorial infographic meets lifestyle food photography. Natural authentic food colors. Detailed texture visibility. Subtle drop shadows. Clean vector icons. Modern elegant typography. Soft cream-to-warm-beige gradient background. No heavy texture. Airy spacing.\\n\\n## LIGHTING\\nSoft natural studio lighting. Warm tone (not orange). Gentle highlights on crisp areas. Realistic depth and dimension. Balanced contrast.\\n\\n## TECHNICAL OUTPUT\\n1080x1080. Ultra-crisp. Instagram-ready.\\n\\n## STYLE DNA\\nMinimal editorial, clean layout, soft lifestyle realism, Instagram-first design."

Generate 3-4 templates with DIFFERENT visual styles:
- One modern editorial infographic style (clean, minimal, Instagram grid)
- One heritage/illustrated poster style (hand-drawn, cultural, vintage feel)
- One cinematic food photography style (dramatic lighting, close-up, moody)
- One educational comparison style (side-by-side, facts, clean layout)

CRITICAL RULES FOR QUALITY:
- Every prompt MUST mention the brand name and its specific products/services
- System prompts must describe exactly what this brand sells, its tone, its audience
- Templates must reflect the brand's actual visual style and content themes
- Hashtags must include brand-specific tags, not just generic ones
- Scoring criteria must be tailored to what matters for THIS brand, not generic marketing
- If website content is provided, use specific product names, categories, and language from the site
- IMAGE PROMPTS MUST BE DETAILED CREATIVE BRIEFS (300-800 words each), NOT short descriptions

IMPORTANT: Return ONLY valid JSON, no markdown, no code fences.`;

export async function generateCustomPrompts(
  brand: BrandConfig,
  openaiApiKey: string,
  websiteContent?: string
): Promise<GeneratedPrompts> {
  const client = new OpenAI({ apiKey: openaiApiKey });

  const websiteSection = websiteContent
    ? `WEBSITE CONTENT (use this to understand the brand deeply — extract product names, categories, tone, target audience, and style):\n\n${websiteContent.substring(0, 8000)}`
    : "No website content available. Generate based on brand name and description only.";

  const prompt = GENERATION_PROMPT.replace("{BRAND_NAME}", brand.name)
    .replace("{BRAND_DESCRIPTION}", brand.description)
    .replace("{CONTENT_TYPES}", brand.contentTypes.join(", "))
    .replace("{WEBSITE_SECTION}", websiteSection);

  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You generate detailed JSON responses. Every imagePrompt string in your output MUST be at least 1500 characters. Be extremely verbose and descriptive. Include multiple paragraphs of detail for each section (HERO, COMPOSITION, CONTENT, STYLE, TYPOGRAPHY, BACKGROUND, LIGHTING, MOOD, OUTPUT)." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 16000,
    response_format: { type: "json_object" },
  });

  const content = res.choices[0].message.content;
  if (!content) throw new Error("GPT-4o returned empty response");

  const parsed = JSON.parse(content) as GeneratedPrompts;

  // Validate required fields
  if (!parsed.ideasSystemPrompt) throw new Error("Missing ideasSystemPrompt");
  if (!parsed.ratingSystemPrompt) throw new Error("Missing ratingSystemPrompt");
  if (!parsed.contentBuilderSystemPrompt)
    throw new Error("Missing contentBuilderSystemPrompt");
  if (!parsed.scoringCriteria?.length)
    throw new Error("Missing scoringCriteria");
  if (!parsed.defaultHashtags?.length)
    throw new Error("Missing defaultHashtags");
  if (!parsed.initialTemplates?.length)
    throw new Error("Missing initialTemplates");

  return parsed;
}

export function generateIdeasAgent(
  prompts: GeneratedPrompts,
  hasShopify: boolean
): string {
  return `import { runAgent, type ToolDefinition, type AgentResult } from "../runner.js";
import { convexQuery, convexMutation } from "../services/convex.js";
${hasShopify ? 'import { fetchProducts } from "../services/shopify.js";' : ""}
import { embed, cosineSimilarity } from "../services/embeddings.js";

const SIM_THRESHOLD = 0.88;

const SYSTEM_PROMPT = ${JSON.stringify(prompts.ideasSystemPrompt)};

export async function runIdeasAgent(): Promise<AgentResult> {
  const [recentIdeas, events${hasShopify ? ", allProducts" : ""}] = await Promise.all([
    convexQuery<any[]>("ideas:getRecent", { limit: 200 }),
    convexQuery<any[]>("events:getActive"),
    ${hasShopify ? "fetchProducts()," : ""}
  ]);

  ${hasShopify ? `const shuffled = [...allProducts].sort(() => 0.5 - Math.random());
  const products = shuffled.slice(0, 2);` : ""}

  const recentConcepts = recentIdeas.map((i) => i.concept).filter(Boolean).slice(0, 30);

  let eventSection = "No active events right now. Generate general content ideas.";
  const events_list = events as any[];
  if (events_list.length > 0) {
    eventSection = events_list.map((e: any) => {
      const parts = [\`- **\${e.name}**\`];
      if (e.theme) parts.push(\`Theme: \${e.theme}\`);
      if (e.hashtags?.length) parts.push(\`Hashtags: \${e.hashtags.join(", ")}\`);
      return parts.join(" | ");
    }).join("\\n");
  }

  ${hasShopify ? `const hasCatalogue = products.length > 0;
  const generalCount = hasCatalogue ? 8 : 10;
  const catalogueCount = hasCatalogue ? 2 : 0;
  const catalogueSection = hasCatalogue
    ? products.map((p: any) => \`- **\${p.title}**\${p.productType ? \` (\${p.productType})\` : ""}\`).join("\\n")
    : "No catalogue products available.";` : `const generalCount = 10;`}

  let dedupSection = "";
  if (recentConcepts.length > 0) {
    dedupSection = \`\\n\\n## AVOID DUPLICATES\\n\${recentConcepts.map((c: string, i: number) => \`\${i + 1}. \${c}\`).join("\\n")}\\n\\nYour new ideas must be DIFFERENT from all of the above.\`;
  }

  const userMessage = \`GENERATE_IDEAS\${dedupSection}\\n\\n## ACTIVE EVENTS\\n\${eventSection}${hasShopify ? `\\n\\n## IDEA SPLIT\\n- **\${generalCount} General Ideas**\\n- **\${catalogueCount} Catalogue Ideas**\\n\\n\${hasCatalogue ? \`## PRODUCT CATALOGUE\\n\${catalogueSection}\` : ""}` : ""}\`;

  const saveIdeaTool: ToolDefinition = {
    name: "save_idea",
    description: "Save a content idea. Call with concept, type, template, and platforms.",
    parameters: {
      type: "object",
      properties: {
        concept: { type: "string", description: "The content idea description" },
        type: { type: "string", enum: ["single_image"] },
        template: { type: "string", enum: ["educational_comparison", "cinematic_stack", "editorial_grid", "recipe_infographic"] },
        platforms: { type: "array", items: { type: "string" } },
      },
      required: ["concept", "type", "template", "platforms"],
    },
    handler: async (args) => {
      const concept = String(args.concept || "").trim();
      if (!concept) return JSON.stringify({ saved: false, error: "Concept missing" });

      const embedding = await embed(concept);
      let maxSim = 0;
      let duplicateOf: string | null = null;
      for (const idea of recentIdeas) {
        if (!idea.embedding?.length) continue;
        const sim = cosineSimilarity(embedding, idea.embedding);
        if (sim > maxSim) { maxSim = sim; duplicateOf = idea._id; }
        if (sim >= SIM_THRESHOLD) break;
      }
      if (maxSim >= SIM_THRESHOLD) {
        return JSON.stringify({ saved: false, skipped: true, reason: "semantic_duplicate", similarity: maxSim, duplicateOf });
      }

      const id = await convexMutation<string>("ideas:create", {
        concept, type: args.type || "single_image",
        template: String(args.template || "").trim(),
        platforms: args.platforms || ["ig"], embedding,
      });
      recentIdeas.push({ _id: id, concept, embedding, status: "new" });
      return JSON.stringify({ saved: true, id });
    },
  };

  return runAgent({
    name: "IDEAS",
    systemPrompt: SYSTEM_PROMPT,
    tools: [saveIdeaTool],
    userMessage,
    temperature: 0.85,
    maxIterations: 30,
  });
}
`;
}

export function generateRatingAgent(prompts: GeneratedPrompts): string {
  return `import { runAgent, type ToolDefinition, type AgentResult } from "../runner.js";
import { convexQuery, convexMutation } from "../services/convex.js";

const SYSTEM_PROMPT = ${JSON.stringify(prompts.ratingSystemPrompt)};

export async function runRatingAgent(): Promise<AgentResult> {
  const getPendingTool: ToolDefinition = {
    name: "get_pending_ideas",
    description: "Fetch all content ideas with status 'new' from the database.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const allIdeas = await convexQuery<Record<string, unknown>[]>("ideas:getPending");
      const newIdeas = allIdeas.filter((idea) => idea.status === "new").map(({ embedding, ...rest }) => rest);
      return JSON.stringify({ count: newIdeas.length, ideas: newIdeas });
    },
  };

  const approveTool: ToolDefinition = {
    name: "approve_idea",
    description: "Approve a content idea that scored >= 70.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }, score: { type: "number" }, reason: { type: "string" },
      },
      required: ["id", "score", "reason"],
    },
    handler: async (args) => {
      await convexMutation("ideas:updateStatus", { id: args.id, status: "approved", score: Number(args.score) || 0, scoreReason: String(args.reason || "") });
      return JSON.stringify({ approved: true, id: args.id, score: args.score });
    },
  };

  const rejectTool: ToolDefinition = {
    name: "reject_idea",
    description: "Reject a content idea that scored < 50.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }, score: { type: "number" }, reason: { type: "string" },
      },
      required: ["id", "score", "reason"],
    },
    handler: async (args) => {
      await convexMutation("ideas:updateStatus", { id: args.id, status: "rejected", score: Number(args.score) || 0, scoreReason: String(args.reason || "") });
      return JSON.stringify({ rejected: true, id: args.id, score: args.score });
    },
  };

  const flagTool: ToolDefinition = {
    name: "flag_for_review",
    description: "Flag a content idea for human review (score 50-69).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }, score: { type: "number" }, reason: { type: "string" },
      },
      required: ["id", "score", "reason"],
    },
    handler: async (args) => {
      await convexMutation("ideas:updateStatus", { id: args.id, status: "needs_review", score: Number(args.score) || 0, scoreReason: String(args.reason || "") });
      return JSON.stringify({ flagged: true, id: args.id, score: args.score });
    },
  };

  return runAgent({
    name: "RATING",
    systemPrompt: SYSTEM_PROMPT,
    tools: [getPendingTool, approveTool, rejectTool, flagTool],
    userMessage: "RATE_IDEAS",
    temperature: 0.3,
    maxIterations: 40,
  });
}
`;
}

export function generateContentBuilderAgent(prompts: GeneratedPrompts): string {
  return `import { runAgent, type ToolDefinition, type AgentResult } from "../runner.js";
import { convexQuery, convexMutation } from "../services/convex.js";
import { generateImage } from "../services/image.js";
import OpenAI from "openai";
import { getConfig } from "../config.js";

const SYSTEM_PROMPT = ${JSON.stringify(prompts.contentBuilderSystemPrompt)};

export async function runContentBuilderAgent(): Promise<AgentResult> {
  const [ideas, events] = await Promise.all([
    convexQuery<any[]>("ideas:getUnprocessed", { limit: 5 }),
    convexQuery<any[]>("events:getActive"),
  ]);

  if (ideas.length === 0) {
    console.log("[CONTENT] No unprocessed ideas available");
    return { success: true, output: "No unprocessed ideas to process.", toolCalls: [] };
  }

  const results: string[] = [];

  for (const idea of ideas) {
    const templateName = (idea.template || "").trim();
    const template = await convexQuery<any>("templates:getByName", { name: templateName });

    const imagePrompt = template?.imagePrompts?.[0] || template?.promptTemplate || "";
    const captionTemplate = template?.captionTemplate || "";
    const hashtags = (template?.defaultHashtags || []).join(" ");

    const context = \`IDEA: \${idea.concept}\\nTEMPLATE: \${templateName}\\nIDEA_ID: \${idea._id}\\n\\nIMAGE PROMPT (USE VERBATIM):\\n\${imagePrompt}\\n\\nCAPTION TEMPLATE:\\n\${captionTemplate}\\n\\nHASHTAGS:\\n\${hashtags}\\n\\nACTIVE EVENTS:\\n\${events.map((e: any) => e.name).join(", ") || "None"}\`;

    const generateImageTool: ToolDefinition = {
      name: "generate_image",
      description: "Generate a marketing image. Pass the image prompt verbatim.",
      parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
      handler: async (args) => {
        const imageUrl = await generateImage(String(args.prompt));
        return JSON.stringify({ success: true, imageUrl });
      },
    };

    const evaluateImageTool: ToolDefinition = {
      name: "evaluate_image",
      description: "Evaluate image quality. Returns score (1-10) and pass (true/false).",
      parameters: { type: "object", properties: { imageUrl: { type: "string" } }, required: ["imageUrl"] },
      handler: async (args) => {
        const client = new OpenAI({ apiKey: getConfig().openaiApiKey });
        const res = await client.responses.create({
          model: "gpt-4o",
          input: [{ role: "user", content: [
            { type: "input_text", text: "Evaluate this marketing image. Score 1-10. Output: SCORE=N; PASS=true/false; ISSUES=\\"description\\"" },
            { type: "input_image", image_url: String(args.imageUrl), detail: "auto" },
          ]}],
        });
        let text = "";
        for (const output of res.output) {
          if (output.type === "message" && output.content) {
            for (const part of output.content) { if (part.type === "output_text") text = part.text; }
          }
        }
        const scoreMatch = text.match(/SCORE\\s*=\\s*(\\d+)/i);
        const passMatch = text.match(/PASS\\s*=\\s*(true|false)/i);
        const issuesMatch = text.match(/ISSUES\\s*=\\s*"(.*)"/i);
        return JSON.stringify({
          success: true,
          score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
          pass: passMatch ? passMatch[1].toLowerCase() === "true" : false,
          issues: issuesMatch ? issuesMatch[1] : text.slice(0, 100),
        });
      },
    };

    const saveToQueueTool: ToolDefinition = {
      name: "save_to_queue",
      description: "Save content to the posting queue.",
      parameters: {
        type: "object",
        properties: {
          caption: { type: "string" }, imageUrl: { type: "string" },
          imagePrompt: { type: "string" }, scheduledFor: { type: "string" },
          platform: { type: "string", enum: ["ig"] }, ideaId: { type: "string" },
        },
        required: ["caption", "imageUrl", "ideaId"],
      },
      handler: async (args) => {
        const ideaId = String(args.ideaId);
        const existing = await convexQuery<any>("ideas:getById", { id: ideaId });
        if (existing?.contentCreated) return JSON.stringify({ saved: false, skipped: true, reason: "Already processed" });
        await convexMutation("queue:add", {
          caption: String(args.caption), imageUrl: String(args.imageUrl),
          imagePrompt: String(args.imagePrompt || ""),
          scheduledFor: String(args.scheduledFor) || new Date(Date.now() + 86400000).toISOString(),
          platform: String(args.platform || "ig"), ideaId,
        });
        await convexMutation("ideas:markContentCreated", { id: ideaId });
        return JSON.stringify({ saved: true });
      },
    };

    const result = await runAgent({
      name: \`CONTENT[\${templateName}]\`,
      systemPrompt: SYSTEM_PROMPT,
      tools: [generateImageTool, evaluateImageTool, saveToQueueTool],
      userMessage: context, temperature: 0.7, maxIterations: 10,
    });
    results.push(\`Idea "\${idea.concept.substring(0, 40)}...": \${result.success ? "OK" : "FAILED"}\`);
  }

  return { success: true, output: results.join("\\n"), toolCalls: [] };
}
`;
}

export function generatePostingAgent(): string {
  return `import { runAgent, type ToolDefinition, type AgentResult } from "../runner.js";
import { convexQuery, convexMutation } from "../services/convex.js";
import { createMediaContainer, publishMedia, getPermalink } from "../services/instagram.js";

const SYSTEM_PROMPT = \`You are the Posting Agent. Post content to Instagram.

Tools: post_to_meta, record_post, mark_posted, mark_failed

Workflow:
1. Review next content to post
2. Call post_to_meta with caption and imageUrl
3. If successful, call record_post then mark_posted
4. If failed, call mark_failed
Be autonomous.\`;

export async function runPostingAgent(): Promise<AgentResult> {
  const [nextItem, queuedItems] = await Promise.all([
    convexQuery<any>("contentQueue:getNextToPost"),
    convexQuery<any[]>("contentQueue:getQueued"),
  ]);

  if (!nextItem) {
    console.log("[POSTING] No content ready to post");
    return { success: true, output: "No content ready to post.", toolCalls: [] };
  }

  const userMessage = \`NEXT CONTENT:\\n\${JSON.stringify(nextItem, null, 2)}\\n\\nTOTAL QUEUED: \${queuedItems.length} items.\\nProceed autonomously.\`;

  const postToMetaTool: ToolDefinition = {
    name: "post_to_meta", description: "Post to Instagram.",
    parameters: { type: "object", properties: { caption: { type: "string" }, imageUrl: { type: "string" } }, required: ["caption", "imageUrl"] },
    handler: async (args) => {
      const mediaId = await createMediaContainer(String(args.imageUrl), String(args.caption));
      const postId = await publishMedia(mediaId);
      const postUrl = await getPermalink(postId);
      return JSON.stringify({ success: true, platform: "ig", postId, postUrl });
    },
  };

  const recordPostTool: ToolDefinition = {
    name: "record_post", description: "Record posted content in database.",
    parameters: { type: "object", properties: { contentQueueId: { type: "string" }, platform: { type: "string" }, postId: { type: "string" }, postUrl: { type: "string" } }, required: ["contentQueueId", "platform", "postId"] },
    handler: async (args) => {
      await convexMutation("postedContent:record", { contentQueueId: String(args.contentQueueId), platform: String(args.platform), postId: String(args.postId), postUrl: String(args.postUrl || ""), postedAt: new Date().toISOString() });
      return JSON.stringify({ success: true });
    },
  };

  const markPostedTool: ToolDefinition = {
    name: "mark_posted", description: "Mark content as posted.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await convexMutation("contentQueue:markPosted", { id: String(args.id) });
      return JSON.stringify({ success: true });
    },
  };

  const markFailedTool: ToolDefinition = {
    name: "mark_failed", description: "Mark content as failed.",
    parameters: { type: "object", properties: { id: { type: "string" }, error: { type: "string" } }, required: ["id", "error"] },
    handler: async (args) => {
      await convexMutation("contentQueue:markFailed", { id: String(args.id), error: String(args.error) });
      return JSON.stringify({ success: true });
    },
  };

  return runAgent({
    name: "POSTING", systemPrompt: SYSTEM_PROMPT,
    tools: [postToMetaTool, recordPostTool, markPostedTool, markFailedTool],
    userMessage, temperature: 0.3, maxIterations: 10,
  });
}
`;
}

export function generateTemplateGeneratorAgent(): string {
  return `import { runAgent, type ToolDefinition, type AgentResult } from "../runner.js";
import { convexQuery, convexMutation } from "../services/convex.js";
import OpenAI from "openai";
import { getConfig } from "../config.js";

const SYSTEM_PROMPT = \`You are a Template Designer. Analyze reference images and create reusable content templates.

Tools:
1. analyze_image - Study the reference image in extreme detail
2. list_templates - Check existing templates
3. save_template - Save new template

CRITICAL: Each imagePrompt you create must be a DETAILED CREATIVE BRIEF (300-800 words) covering:
1. HERO VISUAL - main subject, angle, arrangement, presentation
2. COMPOSITION - layout structure, content blocks, visual flow
3. CONTENT SECTIONS - what info blocks appear and where
4. VISUAL STYLE - artistic direction (editorial, illustrated, photographic, etc.)
5. TYPOGRAPHY - headline style, body text, hierarchy
6. BACKGROUND - color palette, texture, gradient
7. LIGHTING - warm/cool, studio/natural, shadows
8. MOOD - what feeling it evokes
9. TECHNICAL OUTPUT - 1080x1080 for Instagram, 1080x1920 for TikTok
10. STYLE DNA - 3-5 word style summary

Use {MAIN_SUBJECT} and {THEME} as placeholders. Generate 3 prompt variations with different compositions.
Do NOT write short generic prompts like "photo of food". Write full creative briefs.\`;

export async function runTemplateGeneratorAgent(imageUrl: string): Promise<AgentResult> {
  const analyzeImageTool: ToolDefinition = {
    name: "analyze_image", description: "Analyze a reference image for visual style.",
    parameters: { type: "object", properties: { imageUrl: { type: "string" } }, required: ["imageUrl"] },
    handler: async (args) => {
      const client = new OpenAI({ apiKey: getConfig().openaiApiKey });
      const res = await client.responses.create({
        model: "gpt-4o",
        input: [{ role: "user", content: [
          { type: "input_text", text: "Analyze this image for creating a content template. Describe layout, style, colors, typography, lighting, mood, and Instagram suitability." },
          { type: "input_image", image_url: String(args.imageUrl), detail: "high" },
        ]}],
      });
      let text = "";
      for (const output of res.output) { if (output.type === "message" && output.content) { for (const part of output.content) { if (part.type === "output_text") text = part.text; } } }
      return JSON.stringify({ success: true, analysis: text });
    },
  };

  const listTemplatesTool: ToolDefinition = {
    name: "list_templates", description: "List existing templates.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const templates = await convexQuery<any[]>("templates:listActive");
      return JSON.stringify({ count: templates.length, templates: templates.map((t: any) => ({ name: t.name, displayName: t.displayName, description: t.description })) });
    },
  };

  const saveTemplateTool: ToolDefinition = {
    name: "save_template", description: "Save a new template.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" }, displayName: { type: "string" }, type: { type: "string", enum: ["single_image", "carousel"] },
        description: { type: "string" }, promptTemplate: { type: "string" }, captionTemplate: { type: "string" },
        imagePrompts: { type: "array", items: { type: "string" } }, defaultHashtags: { type: "array", items: { type: "string" } },
      },
      required: ["name", "displayName", "type", "description", "promptTemplate", "captionTemplate", "imagePrompts", "defaultHashtags"],
    },
    handler: async (args) => {
      const existing = await convexQuery<any>("templates:getByName", { name: String(args.name) });
      if (existing) return JSON.stringify({ saved: false, error: "Template already exists" });
      const id = await convexMutation("templates:create", {
        name: String(args.name), displayName: String(args.displayName), type: String(args.type) as any,
        description: String(args.description), promptTemplate: String(args.promptTemplate),
        captionTemplate: String(args.captionTemplate), imagePrompts: args.imagePrompts as string[],
        defaultHashtags: args.defaultHashtags as string[], isActive: true,
      });
      return JSON.stringify({ saved: true, id, name: args.name });
    },
  };

  return runAgent({
    name: "TEMPLATE_GENERATOR", systemPrompt: SYSTEM_PROMPT,
    tools: [analyzeImageTool, listTemplatesTool, saveTemplateTool],
    userMessage: \`Analyze this image and create a new template: \${imageUrl}\`,
    temperature: 0.7, maxIterations: 10,
  });
}
`;
}
