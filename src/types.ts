export interface BrandConfig {
  name: string;
  description: string;
  contentTypes: string[];
  projectDir: string;
}

export interface ApiKeys {
  openaiApiKey: string;
  googleAiKey: string;
  igUserId: string;
  igAccessToken: string;
  shopifyStore?: string;
  shopifyAccessToken?: string;
}

export interface GeneratedPrompts {
  ideasSystemPrompt: string;
  ratingSystemPrompt: string;
  contentBuilderSystemPrompt: string;
  scoringCriteria: string[];
  defaultHashtags: string[];
  initialTemplates: TemplateDefinition[];
}

export interface TemplateDefinition {
  name: string;
  displayName: string;
  description: string;
  promptTemplate: string;
  captionTemplate: string;
  imagePrompts: string[];
  defaultHashtags: string[];
}

export interface ProjectConfig {
  brand: BrandConfig;
  keys: ApiKeys;
  prompts: GeneratedPrompts;
  hasShopify: boolean;
}
