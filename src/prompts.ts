import * as p from "@clack/prompts";
import pc from "picocolors";
import type { BrandConfig, ApiKeys } from "./types.js";

export async function collectBrandInfo(): Promise<BrandConfig> {
  const brand = await p.group(
    {
      name: () =>
        p.text({
          message: "What is your brand name?",
          placeholder: "e.g., FreshBites",
          validate: (v) => (v.length < 1 ? "Brand name is required" : undefined),
        }),
      description: () =>
        p.text({
          message: "Describe your brand in 1-2 sentences",
          placeholder:
            "e.g., Organic meal kits delivered weekly to health-conscious families",
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
    "You will need API keys from the following services:\n" +
      `${pc.cyan("OpenAI")} — GPT-4o for content generation and rating\n` +
      `${pc.cyan("Google AI")} — Gemini 3 Pro for image generation\n` +
      `${pc.cyan("Instagram")} — Graph API for posting\n` +
      `${pc.cyan("Shopify")} — (optional) for product-based content`,
    "Required API Keys"
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
          message: "Google AI Key (for Gemini)",
          placeholder: "AIza...",
          validate: (v) =>
            v.startsWith("AIza") ? undefined : "Google AI key should start with AIza",
        }),
      igUserId: () =>
        p.text({
          message: "Instagram User/Page ID",
          placeholder: "e.g., 17841449043762185",
          validate: (v) =>
            v.length > 5 ? undefined : "Please enter a valid Instagram ID",
        }),
      igAccessToken: () =>
        p.text({
          message: "Instagram Access Token",
          placeholder: "EAA...",
          validate: (v) =>
            v.length > 10 ? undefined : "Please enter a valid access token",
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
    googleAiKey: keys.googleAiKey as string,
    igUserId: keys.igUserId as string,
    igAccessToken: keys.igAccessToken as string,
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
