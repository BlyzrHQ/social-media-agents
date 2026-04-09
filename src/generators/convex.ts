import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../types.js";

export function generateConvexFiles(config: ProjectConfig): void {
  const dir = path.resolve(config.brand.projectDir, "convex");
  fs.mkdirSync(dir, { recursive: true });

  // schema.ts
  fs.writeFileSync(
    path.join(dir, "schema.ts"),
    `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ideas: defineTable({
    productId: v.optional(v.string()),
    productName: v.optional(v.string()),
    concept: v.string(),
    type: v.union(v.literal("single_image"), v.literal("carousel")),
    template: v.string(),
    platforms: v.array(v.union(v.literal("ig"), v.literal("fb"), v.literal("tiktok"))),
    status: v.union(v.literal("new"), v.literal("approved"), v.literal("rejected"), v.literal("needs_review")),
    score: v.optional(v.number()),
    scoreReason: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    contentCreated: v.optional(v.boolean()),
    embedding: v.optional(v.array(v.number())),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_content_created", ["contentCreated"]),

  contentQueue: defineTable({
    ideaId: v.optional(v.id("ideas")),
    platform: v.union(v.literal("ig"), v.literal("fb"), v.literal("tiktok")),
    contentType: v.union(v.literal("single"), v.literal("carousel")),
    caption: v.string(),
    hashtags: v.array(v.string()),
    imageUrls: v.array(v.string()),
    imagePrompts: v.array(v.string()),
    scheduledFor: v.number(),
    status: v.union(v.literal("queued"), v.literal("posted"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_scheduled", ["scheduledFor"])
    .index("by_idea", ["ideaId"]),

  postedContent: defineTable({
    contentQueueId: v.id("contentQueue"),
    platform: v.union(v.literal("ig"), v.literal("fb"), v.literal("tiktok")),
    postId: v.optional(v.string()),
    postUrl: v.optional(v.string()),
    postedAt: v.number(),
    engagement: v.optional(v.object({
      likes: v.number(), comments: v.number(),
      shares: v.optional(v.number()), saves: v.optional(v.number()), views: v.optional(v.number()),
    })),
  })
    .index("by_platform", ["platform"])
    .index("by_posted", ["postedAt"]),

  templates: defineTable({
    name: v.string(),
    displayName: v.string(),
    type: v.union(v.literal("single_image"), v.literal("carousel")),
    description: v.string(),
    slideCount: v.optional(v.number()),
    promptTemplate: v.string(),
    captionTemplate: v.string(),
    defaultHashtags: v.array(v.string()),
    exampleOutput: v.optional(v.string()),
    isActive: v.boolean(),
    imagePrompts: v.optional(v.array(v.string())),
  })
    .index("by_name", ["name"])
    .index("by_type", ["type"]),

  events: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
    contentThemes: v.array(v.string()),
    hashtags: v.array(v.string()),
    visualStyle: v.optional(v.string()),
    colorPalette: v.optional(v.array(v.string())),
    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),
});
`
  );

  // ideas.ts
  fs.writeFileSync(
    path.join(dir, "ideas.ts"),
    `import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: { concept: v.string(), type: v.string(), template: v.string(), platforms: v.array(v.string()), embedding: v.optional(v.array(v.number())), productId: v.optional(v.string()), productName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ideas", { ...args, type: args.type as any, platforms: args.platforms as any, status: "new", createdAt: Date.now() });
  },
});

export const getPending = query({
  handler: async (ctx) => await ctx.db.query("ideas").withIndex("by_status", (q) => q.eq("status", "new")).collect(),
});

export const getRecent = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => await ctx.db.query("ideas").withIndex("by_created").order("desc").take(args.limit),
});

export const getUnprocessed = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const ideas = await ctx.db.query("ideas").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    return ideas.filter((i) => !i.contentCreated).slice(0, args.limit);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await ctx.db.get(args.id as any),
});

export const updateStatus = mutation({
  args: { id: v.string(), status: v.string(), score: v.optional(v.number()), scoreReason: v.optional(v.string()) },
  handler: async (ctx, args) => await ctx.db.patch(args.id as any, { status: args.status as any, score: args.score, scoreReason: args.scoreReason }),
});

export const markContentCreated = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => await ctx.db.patch(args.id as any, { contentCreated: true }),
});
`
  );

  // templates.ts
  fs.writeFileSync(
    path.join(dir, "templates.ts"),
    `import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: { name: v.string(), displayName: v.string(), type: v.union(v.literal("single_image"), v.literal("carousel")), description: v.string(), promptTemplate: v.string(), captionTemplate: v.string(), defaultHashtags: v.array(v.string()), isActive: v.boolean(), slideCount: v.optional(v.number()), imagePrompts: v.optional(v.array(v.string())), exampleOutput: v.optional(v.string()) },
  handler: async (ctx, args) => await ctx.db.insert("templates", args),
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => await ctx.db.query("templates").withIndex("by_name", (q) => q.eq("name", args.name)).first(),
});

export const listActive = query({
  handler: async (ctx) => await ctx.db.query("templates").filter((q) => q.eq(q.field("isActive"), true)).collect(),
});
`
  );

  // contentQueue.ts (named queue.ts for the add mutation path)
  fs.writeFileSync(
    path.join(dir, "queue.ts"),
    `import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const add = mutation({
  args: { caption: v.string(), imageUrl: v.string(), scheduledFor: v.string(), platform: v.string(), ideaId: v.optional(v.string()), imagePrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contentQueue", {
      ideaId: args.ideaId as any, platform: args.platform as any, contentType: "single", caption: args.caption,
      hashtags: [], imageUrls: [args.imageUrl], imagePrompts: args.imagePrompt ? [args.imagePrompt] : [],
      scheduledFor: new Date(args.scheduledFor).getTime(), status: "queued", createdAt: Date.now(),
    });
  },
});

export const getQueued = query({
  handler: async (ctx) => await ctx.db.query("contentQueue").withIndex("by_status", (q) => q.eq("status", "queued")).collect(),
});

export const getNextToPost = query({
  handler: async (ctx) => {
    const items = await ctx.db.query("contentQueue").withIndex("by_status", (q) => q.eq("status", "queued")).collect();
    const now = Date.now();
    return items.find((i) => i.scheduledFor <= now) || null;
  },
});

export const markPosted = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => await ctx.db.patch(args.id as any, { status: "posted" as any }),
});

export const markFailed = mutation({
  args: { id: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, args) => await ctx.db.patch(args.id as any, { status: "failed" as any }),
});
`
  );

  // Also create contentQueue.ts that re-exports for different path patterns
  fs.writeFileSync(
    path.join(dir, "contentQueue.ts"),
    `export { getQueued, getNextToPost, markPosted, markFailed } from "./queue";
`
  );

  // postedContent.ts
  fs.writeFileSync(
    path.join(dir, "postedContent.ts"),
    `import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const record = mutation({
  args: { contentQueueId: v.string(), platform: v.string(), postId: v.string(), postUrl: v.optional(v.string()), postedAt: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("postedContent", {
      contentQueueId: args.contentQueueId as any, platform: args.platform as any,
      postId: args.postId, postUrl: args.postUrl, postedAt: new Date(args.postedAt).getTime(),
    });
  },
});
`
  );

  // events.ts
  fs.writeFileSync(
    path.join(dir, "events.ts"),
    `import { query } from "./_generated/server";

export const getActive = query({
  handler: async (ctx) => await ctx.db.query("events").withIndex("by_active", (q) => q.eq("isActive", true)).collect(),
});
`
  );

  // files.ts — image upload action
  fs.writeFileSync(
    path.join(dir, "files.ts"),
    `import { v } from "convex/values";
import { action } from "./_generated/server";

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const uploadBase64Image = action({
  args: { base64Data: v.string(), mimeType: v.string() },
  handler: async (ctx, args) => {
    const bytes = base64ToUint8Array(args.base64Data);
    const storageId = await ctx.storage.store(new Blob([bytes as unknown as BlobPart], { type: args.mimeType }));
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to get storage URL");
    return { url, storageId };
  },
});
`
  );

  // Seed initial templates
  const templatesSeed = config.prompts.initialTemplates
    .map(
      (t) => `    {
      name: ${JSON.stringify(t.name)},
      displayName: ${JSON.stringify(t.displayName)},
      type: "single_image" as const,
      description: ${JSON.stringify(t.description)},
      promptTemplate: ${JSON.stringify(t.promptTemplate)},
      captionTemplate: ${JSON.stringify(t.captionTemplate)},
      imagePrompts: ${JSON.stringify(t.imagePrompts)},
      defaultHashtags: ${JSON.stringify(t.defaultHashtags)},
      isActive: true,
    }`
    )
    .join(",\n");

  fs.writeFileSync(
    path.join(dir, "seed.ts"),
    `import { mutation } from "./_generated/server";

export const seedTemplates = mutation({
  handler: async (ctx) => {
    const templates = [
${templatesSeed}
    ];
    for (const t of templates) {
      await ctx.db.insert("templates", t);
    }
    return \`Seeded \${templates.length} templates\`;
  },
});
`
  );
}
