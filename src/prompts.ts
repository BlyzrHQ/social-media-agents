import * as p from "@clack/prompts";
import pc from "picocolors";
import type { BrandConfig, ApiKeys } from "./types.js";
import { analyzeWebsite, type WebsiteAnalysis } from "./website-analyzer.js";

export async function askForWebsite(): Promise<string | null> {
  const hasWebsite = await p.confirm({
    message: "Do you have a website? (we'll auto-fill your brand info)",
    initialValue: true,
  });

  if (p.isCancel(hasWebsite) || !hasWebsite) return null;

  const url = await p.text({
    message: "What's your website URL?",
    placeholder: "https://yourbrand.com",
    validate: (v) => (v.length < 4 ? "Please enter a valid URL" : undefined),
  });

  if (p.isCancel(url)) return null;
  return url as string;
}

export async function analyzeWebsiteUrl(
  url: string,
  openaiApiKey: string
): Promise<WebsiteAnalysis | null> {
  const s = p.spinner();
  s.start("Analyzing your website...");
  try {
    const analysis = await analyzeWebsite(url, openaiApiKey);
    s.stop("Website analyzed!");

    p.note(
      `${pc.cyan("Brand:")} ${analysis.brandName}\n` +
        `${pc.cyan("Description:")} ${analysis.description}\n` +
        `${pc.cyan("Industry:")} ${analysis.industry}\n` +
        `${pc.cyan("Content types:")} ${analysis.contentTypes.join(", ")}`,
      "Found"
    );

    const useAnalysis = await p.confirm({
      message: "Use this info?",
      initialValue: true,
    });

    if (p.isCancel(useAnalysis) || !useAnalysis) return null;
    return analysis;
  } catch (err) {
    s.stop("Could not analyze website");
    p.note(
      `Error: ${err instanceof Error ? err.message : String(err)}\nWe'll ask you for the info manually.`,
      "Website analysis failed"
    );
    return null;
  }
}

export async function collectBrandInfo(prefill?: WebsiteAnalysis | null): Promise<BrandConfig> {
  const brand = await p.group(
    {
      name: () =>
        p.text({
          message: "What is your brand name?",
          placeholder: "e.g., FreshBites",
          initialValue: prefill?.brandName,
          validate: (v) => (v.length < 1 ? "Brand name is required" : undefined),
        }),
      description: () =>
        p.text({
          message: "Describe your brand in 1-2 sentences",
          placeholder:
            "e.g., Organic meal kits delivered weekly to health-conscious families",
          initialValue: prefill?.description,
          validate: (v) =>
            v.length < 10
              ? "Please provide a more detailed description"
              : undefined,
        }),
      contentTypes: () =>
        p.multiselect({
          message: "What kind of content do you want to create?",
          options: [
            { value: "product_photos", label: "Product Photography" },
            { value: "recipes", label: "Recipes & Cooking" },
            { value: "tips", label: "Tips & Education" },
            { value: "lifestyle", label: "Lifestyle & Culture" },
            { value: "comparisons", label: "Comparisons & Infographics" },
            { value: "behind_scenes", label: "Behind the Scenes" },
          ],
          initialValues: prefill?.contentTypes,
          required: true,
        }),
      projectDir: () =>
        p.text({
          message: "Project directory name?",
          placeholder: "my-social-pipeline",
          validate: (v) =>
            /^[a-z0-9-]+$/.test(v)
              ? undefined
              : "Use lowercase letters, numbers, and hyphens only",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    }
  );

  return brand as BrandConfig;
}

export async function collectApiKeys(): Promise<ApiKeys & { hasShopify: boolean }> {
  p.note(
    "API keys and service credentials:\n" +
      `${pc.cyan("OpenAI")} — GPT-4o for content generation and rating (required)\n` +
      `${pc.cyan("Google AI")} — (optional) Gemini 3 Pro for image generation\n` +
      `${pc.cyan("Convex")} — (optional now) database — set up later with npm run convex:dev\n` +
      `${pc.cyan("Trigger.dev")} — (optional now) cloud execution — set up later with npx trigger.dev init\n` +
      `${pc.cyan("Instagram")} — (optional) Graph API for posting\n` +
      `${pc.cyan("Shopify")} — (optional) for product-based content\n\n` +
      `Leave optional fields blank and add them later with: npm run config`,
    "API Keys"
  );

  const keys = await p.group(
    {
      openaiApiKey: () =>
        p.text({
          message: "OpenAI API Key",
          placeholder: "sk-proj-...",
          validate: (v) =>
            v.startsWith("sk-") ? undefined : "OpenAI key should start with sk-",
        }),
      googleAiKey: () =>
        p.text({
          message: "Google AI Key (for Gemini — leave empty to add later)",
          placeholder: "AIza... (optional)",
          validate: (v) =>
            v.length === 0 || v.startsWith("AIza")
              ? undefined
              : "Leave empty or enter a key starting with AIza",
        }),
      convexUrl: () =>
        p.text({
          message: "Convex URL (leave empty — npm run convex:dev sets this automatically)",
          placeholder: "https://xxx.convex.cloud (optional)",
          validate: () => undefined,
        }),
      convexAuthToken: () =>
        p.text({
          message: "Convex Auth Token (leave empty if not using auth)",
          placeholder: "optional",
          validate: () => undefined,
        }),
      triggerSecretKey: () =>
        p.text({
          message: "Trigger.dev Secret Key (leave empty — we'll set up Trigger.dev for you)",
          placeholder: "tr_dev_... or tr_prod_... (optional)",
          validate: () => undefined,
        }),
      hasInstagram: () =>
        p.confirm({
          message: "Do you want to connect Instagram for posting?",
          initialValue: false,
        }),
      hasTiktok: () =>
        p.confirm({
          message: "Do you want to connect TikTok for posting?",
          initialValue: false,
        }),
      hasShopify: () =>
        p.confirm({
          message: "Do you have a Shopify store to connect?",
          initialValue: false,
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    }
  );

  let igUserId: string | undefined;
  let igAccessToken: string | undefined;

  if (keys.hasInstagram) {
    const ig = await p.group(
      {
        userId: () =>
          p.text({
            message: "Instagram User/Page ID",
            placeholder: "e.g., 17841449043762185",
            validate: (v) =>
              v.length > 5 ? undefined : "Please enter a valid Instagram ID",
          }),
        token: () =>
          p.text({
            message: "Instagram Access Token",
            placeholder: "EAA...",
            validate: (v) =>
              v.length > 10 ? undefined : "Please enter a valid access token",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      }
    );
    igUserId = ig.userId;
    igAccessToken = ig.token;
  }

  let tiktokAccessToken: string | undefined;
  let tiktokOpenId: string | undefined;

  if (keys.hasTiktok) {
    const tt = await p.group(
      {
        token: () =>
          p.text({
            message: "TikTok Access Token",
            placeholder: "act.xxx... (from TikTok Developer Portal)",
            validate: (v) =>
              v.length > 10 ? undefined : "Please enter a valid TikTok access token",
          }),
        openId: () =>
          p.text({
            message: "TikTok Open ID (user identifier)",
            placeholder: "optional — leave empty if unknown",
            validate: () => undefined,
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      }
    );
    tiktokAccessToken = tt.token;
    tiktokOpenId = tt.openId || undefined;
  }

  let shopifyStore: string | undefined;
  let shopifyAccessToken: string | undefined;

  if (keys.hasShopify) {
    const shopify = await p.group(
      {
        store: () =>
          p.text({
            message: "Shopify store domain",
            placeholder: "mystore.myshopify.com",
            validate: (v) =>
              v.includes(".myshopify.com")
                ? undefined
                : "Should be yourstore.myshopify.com",
          }),
        token: () =>
          p.text({
            message: "Shopify Access Token",
            placeholder: "shpat_...",
            validate: (v) =>
              v.startsWith("shpat_")
                ? undefined
                : "Shopify token should start with shpat_",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      }
    );
    shopifyStore = shopify.store;
    shopifyAccessToken = shopify.token;
  }

  return {
    openaiApiKey: keys.openaiApiKey as string,
    googleAiKey: (keys.googleAiKey as string) || undefined,
    convexUrl: (keys.convexUrl as string) || undefined,
    convexAuthToken: (keys.convexAuthToken as string) || undefined,
    triggerSecretKey: (keys.triggerSecretKey as string) || undefined,
    igUserId,
    igAccessToken,
    tiktokAccessToken,
    tiktokOpenId,
    shopifyStore,
    shopifyAccessToken,
    hasShopify: keys.hasShopify as boolean,
  };
}

export async function confirmGptUsage(): Promise<boolean> {
  const proceed = await p.confirm({
    message:
      "We will use your OpenAI key to generate custom prompts for your brand (~$0.05-0.10). Continue?",
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return proceed as boolean;
}
