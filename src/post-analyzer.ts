import OpenAI from "openai";
import type { TemplateDefinition } from "./types.js";

interface PostSearchResult {
  title: string;
  url: string;
  description: string;
  imageUrl?: string;
}

export async function findTopPosts(
  brandName: string,
  industry: string,
  openaiApiKey: string
): Promise<TemplateDefinition[]> {
  // Step 1: Search for top Instagram posts in their niche using Jina Search
  const queries = [
    `${brandName} Instagram best posts`,
    `top ${industry} Instagram posts high engagement`,
    `best ${industry} content Instagram examples`,
  ];

  const imageUrls: string[] = [];

  for (const query of queries) {
    if (imageUrls.length >= 3) break;

    try {
      const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/json",
          "X-Return-Format": "markdown",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const text = await res.text();

      // Extract image URLs from markdown
      const imgMatches = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+\.(jpg|jpeg|png|webp)[^\s)]*)\)/gi);
      if (imgMatches) {
        for (const match of imgMatches) {
          const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
          if (urlMatch && imageUrls.length < 3) {
            imageUrls.push(urlMatch[1]);
          }
        }
      }

      // Also try plain URL extraction for images
      const plainUrls = text.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp)[^\s"'<>]*/gi);
      if (plainUrls) {
        for (const url of plainUrls) {
          if (imageUrls.length < 3 && !imageUrls.includes(url)) {
            imageUrls.push(url);
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (imageUrls.length === 0) {
    return [];
  }

  // Step 2: Analyze each image with GPT-4o vision and create templates
  const client = new OpenAI({ apiKey: openaiApiKey });
  const templates: TemplateDefinition[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this social media post image and create a reusable content template for the brand "${brandName}" in the ${industry} industry.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "name": "snake_case_name describing the visual style (e.g. warm_overhead_flat_lay)",
  "displayName": "Human Readable Name",
  "description": "What makes this template style effective for engagement",
  "promptTemplate": "Detailed image generation prompt capturing this visual style, using {MAIN_SUBJECT} and {THEME} as placeholders",
  "captionTemplate": "Instagram caption template matching this content style, using {CONCEPT} and {HASHTAGS} as placeholders",
  "imagePrompts": [
    "Complete prompt variation 1 with {MAIN_SUBJECT} placeholder",
    "Complete prompt variation 2 with {MAIN_SUBJECT} placeholder",
    "Complete prompt variation 3 with {MAIN_SUBJECT} placeholder"
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
      }
    } catch {
      // Skip failed images (broken URLs, rate limits, etc.)
      continue;
    }
  }

  return templates;
}
