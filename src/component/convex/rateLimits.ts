import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { parseWindow, validateInputs } from "./utils";

async function _checkWindow(
  ctx: { db: any },
  key: string,
  limit: number,
  window: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  validateInputs(key, limit);
  const windowMs = parseWindow(window);
  const now = Date.now();

  const existing = await ctx.db
    .query("rate_limits")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();

  // No record, or window has expired — reset
  if (!existing || now - existing.windowStart >= windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    } else {
      await ctx.db.insert("rate_limits", { key, count: 1, windowStart: now });
    }
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  // Within window: check count
  if (existing.count < limit) {
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return {
      allowed: true,
      remaining: limit - (existing.count + 1),
      resetAt: existing.windowStart + windowMs,
    };
  }

  // Limit exceeded — no write
  return {
    allowed: false,
    remaining: 0,
    resetAt: existing.windowStart + windowMs,
  };
}

export const checkRateLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    return _checkWindow(ctx, args.key, args.limit, args.window);
  },
});

export const enforceRateLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ remaining: number; resetAt: number }> => {
    const result = await _checkWindow(ctx, args.key, args.limit, args.window);
    if (!result.allowed) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        remaining: 0,
        resetAt: result.resetAt,
      });
    }
    return { remaining: result.remaining, resetAt: result.resetAt };
  },
});

export const peek = query({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ remaining: number; resetAt: number | null }> => {
    validateInputs(args.key, args.limit);
    const windowMs = parseWindow(args.window);
    const now = Date.now();

    const existing = await ctx.db
      .query("rate_limits")
      .withIndex("by_key", (q: any) => q.eq("key", args.key))
      .unique();

    if (!existing || now - existing.windowStart >= windowMs) {
      return { remaining: args.limit, resetAt: null };
    }

    return {
      remaining: Math.max(0, args.limit - existing.count),
      resetAt: existing.windowStart + windowMs,
    };
  },
});

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days — > max window of 7d
    const stale = await ctx.db
      .query("rate_limits")
      .filter((q: any) => q.lt(q.field("windowStart"), cutoff))
      .collect();
    await Promise.all(stale.map((r: any) => ctx.db.delete(r._id)));
  },
});
