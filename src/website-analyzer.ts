import OpenAI from "openai";

export interface WebsiteAnalysis {
  brandName: string;
  description: string;
  contentTypes: string[];
  industry: string;
}

const VALID_CONTENT_TYPES = [
  "product_photos",
  "recipes",
  "tips",
  "lifestyle",
  "comparisons",
  "behind_scenes",
];

const EXTRACTION_PROMPT = `You are analyzing a website to extract brand information for a social media content pipeline.

Based on the website content below, extract:
- brandName: The company/brand name
- description: A 1-2 sentence description of what the brand does
- contentTypes: Array of relevant content types from this list ONLY: ${VALID_CONTENT_TYPES.join(", ")}
- industry: One word describing the industry (e.g., "food", "fashion", "tech", "fitness")

Return ONLY valid JSON with these exact keys. No markdown, no code fences.

WEBSITE CONTENT:
{CONTENT}`;

export async function analyzeWebsite(
  url: string,
  openaiApiKey: string
): Promise<WebsiteAnalysis> {
  // Normalize URL
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

  // Scrape via Jina Reader (free, returns clean markdown)
  const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;
  let content: string;

  try {
    const res = await fetch(jinaUrl, {
      headers: { "X-Return-Format": "markdown" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Jina Reader failed: ${res.status}`);
    }
    content = await res.text();
  } catch (err) {
    throw new Error(
      `Could not fetch website: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Truncate to avoid token overflow (keep first ~10k chars)
  if (content.length > 10_000) {
    content = content.substring(0, 10_000);
  }

  // Extract brand info with GPT-4o-mini (cheap, fast)
  const client = new OpenAI({ apiKey: openaiApiKey });
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: EXTRACTION_PROMPT.replace("{CONTENT}", content),
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = res.choices[0].message.content;
  if (!text) throw new Error("GPT-4o-mini returned empty response");

  const parsed = JSON.parse(text) as WebsiteAnalysis;

  // Validate + filter content types
  if (!parsed.brandName) throw new Error("Missing brandName");
  if (!parsed.description) throw new Error("Missing description");
  parsed.contentTypes = (parsed.contentTypes || []).filter((t) =>
    VALID_CONTENT_TYPES.includes(t)
  );
  if (parsed.contentTypes.length === 0) {
    parsed.contentTypes = ["product_photos", "tips"];
  }

  return parsed;
}
