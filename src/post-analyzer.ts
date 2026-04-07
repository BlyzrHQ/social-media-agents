import OpenAI from "openai";
import type { TemplateDefinition } from "./types.js";

const DEFAULT_SERPER_KEY = "e562b4083e63d09481b8ae727d93ed4811783c6c";

export async function findTopPosts(
  brandName: string,
  industry: string,
  openaiApiKey: string,
  serperApiKey?: string
): Promise<TemplateDefinition[]> {
  const key = serperApiKey || DEFAULT_SERPER_KEY;

  // Step 1: Search for top Instagram posts in the niche using Serper
  console.log(`  Searching for top ${industry} Instagram posts...`);
  const queries = [
    `best ${industry} instagram posts high engagement`,
    `top ${industry} food photography social media`,
    `${industry} content ideas inspiration instagram ${new Date().getFullYear()}`,
  ];

  const imageUrls: string[] = [];

  for (const query of queries) {
    if (imageUrls.length >= 5) break;

    try {
      const res = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
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
            imageUrls.length < 8 &&
            img.imageUrl &&
            !imageUrls.includes(img.imageUrl) &&
            img.imageUrl.startsWith("http")
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

  // Verify image URLs are accessible before sending to GPT-4o
  const validUrls: string[] = [];
  for (const url of imageUrls) {
    try {
      const check = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
      if (check.ok) validUrls.push(url);
    } catch { /* skip inaccessible */ }
  }

  if (validUrls.length === 0) {
    // Fallback: try broader search without site:instagram.com
    try {
      const fallbackRes = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `best ${industry} social media content photography`, num: 10 }),
        signal: AbortSignal.timeout(15_000),
      });
      if (fallbackRes.ok) {
        const fallbackData = (await fallbackRes.json()) as { images?: { imageUrl: string }[] };
        if (fallbackData.images) {
          for (const img of fallbackData.images) {
            if (validUrls.length >= 5) break;
            try {
              const check = await fetch(img.imageUrl, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
              if (check.ok) validUrls.push(img.imageUrl);
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip fallback */ }
  }

  if (validUrls.length === 0) {
    console.log("  No accessible images found.");
    return [];
  }

  console.log(`  Found ${validUrls.length} accessible images. Analyzing with GPT-4o...`);
  const imageUrlsToUse = validUrls;

  // Step 2: Analyze top 3 images with GPT-4o vision and create templates
  const client = new OpenAI({ apiKey: openaiApiKey });
  const templates: TemplateDefinition[] = [];

  for (let i = 0; i < Math.min(imageUrlsToUse.length, 3); i++) {
    try {
      // Download image and convert to base64 data URI
      const imgRes = await fetch(imageUrlsToUse[i], {
        signal: AbortSignal.timeout(10_000),
        headers: { "Accept": "image/jpeg,image/png,image/webp,image/*" },
      });
      if (!imgRes.ok) { console.log(`  Image ${i + 1}: download failed (${imgRes.status})`); continue; }
      const contentType = imgRes.headers.get("content-type") || "";
      // Skip non-image responses (HTML pages, SVGs, etc.)
      if (!contentType.startsWith("image/") || contentType.includes("svg")) {
        console.log(`  Image ${i + 1}: not a valid image (${contentType})`);
        continue;
      }
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      // GPT-4o supports: image/jpeg, image/png, image/gif, image/webp
      const mimeType = contentType.includes("png") ? "image/png"
        : contentType.includes("webp") ? "image/webp"
        : contentType.includes("gif") ? "image/gif"
        : "image/jpeg";
      const b64 = `data:${mimeType};base64,${imgBuffer.toString("base64")}`;

      const res = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this top-performing social media post and create a reusable content template for the brand "${brandName}" in the ${industry} industry.

Study what makes it visually effective — composition, colors, styling, mood — and create a template others can use to produce similar content.

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
                image_url: { url: b64, detail: "high" },
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
    } catch (err) {
      console.log(`  Image ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  return templates;
}
