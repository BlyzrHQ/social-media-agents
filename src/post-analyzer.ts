import OpenAI from "openai";
import type { TemplateDefinition } from "./types.js";

export async function findTopPosts(
  brandName: string,
  industry: string,
  openaiApiKey: string,
  serperApiKey?: string
): Promise<TemplateDefinition[]> {
  if (!serperApiKey) return [];

  // Step 1: Search for top Instagram posts in the niche using Serper
  console.log(`  Searching for top ${industry} Instagram posts...`);
  const queries = [
    `site:instagram.com top ${industry} posts high engagement`,
    `site:instagram.com best ${industry} content ${new Date().getFullYear()}`,
  ];

  const imageUrls: string[] = [];

  for (const query of queries) {
    if (imageUrls.length >= 5) break;

    try {
      const res = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: {
          "X-API-KEY": serperApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 10 }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as { images?: { imageUrl: string; title: string; link: string }[] };
      if (data.images) {
        for (const img of data.images) {
          if (
            imageUrls.length < 5 &&
            img.imageUrl &&
            !imageUrls.includes(img.imageUrl) &&
            (img.imageUrl.endsWith(".jpg") ||
              img.imageUrl.endsWith(".jpeg") ||
              img.imageUrl.endsWith(".png") ||
              img.imageUrl.endsWith(".webp") ||
              img.imageUrl.includes("instagram") ||
              img.imageUrl.includes("cdninstagram") ||
              img.imageUrl.includes("scontent"))
          ) {
            imageUrls.push(img.imageUrl);
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (imageUrls.length === 0) {
    console.log("  No top posts found via image search.");
    return [];
  }

  console.log(`  Found ${imageUrls.length} candidate images. Analyzing with GPT-4o...`);

  // Step 2: Analyze top 3 images with GPT-4o vision and create templates
  const client = new OpenAI({ apiKey: openaiApiKey });
  const templates: TemplateDefinition[] = [];

  for (let i = 0; i < Math.min(imageUrls.length, 3); i++) {
    try {
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this top-performing Instagram post and create a reusable content template for the brand "${brandName}" in the ${industry} industry.

This is a high-engagement post from the ${industry} niche. Study what makes it visually effective — composition, colors, styling, mood — and create a template others can use to produce similar content.

Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "snake_case_name (e.g. warm_overhead_spread, minimal_product_hero)",
  "displayName": "Human Readable Name",
  "description": "What makes this style effective for engagement",
  "promptTemplate": "Detailed image generation prompt capturing this exact visual style, using {MAIN_SUBJECT} and {THEME} as placeholders",
  "captionTemplate": "Instagram caption template in this content's tone, using {CONCEPT} and {HASHTAGS}",
  "imagePrompts": [
    "Prompt variation 1 with {MAIN_SUBJECT}",
    "Prompt variation 2 with {MAIN_SUBJECT}",
    "Prompt variation 3 with {MAIN_SUBJECT}"
  ],
  "defaultHashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrls[i], detail: "high" },
              },
            ],
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const content = res.choices[0].message.content;
      if (!content) continue;

      const template = JSON.parse(content) as TemplateDefinition;
      if (template.name && template.promptTemplate) {
        templates.push(template);
        console.log(`  Template ${i + 1}: ${template.displayName}`);
      }
    } catch {
      continue;
    }
  }

  return templates;
}
