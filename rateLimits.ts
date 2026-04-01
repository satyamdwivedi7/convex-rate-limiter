import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { computeRequiredCredits, validateTenantInputs } from "./billing";

export const upsertTenantPlan = mutation({
  args: {
    tenantId: v.string(),
    planId: v.string(),
    creditLimit: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!Number.isInteger(args.creditLimit) || args.creditLimit < 0) {
      throw new Error("creditLimit must be an integer >= 0");
    }
    if (args.periodStart >= args.periodEnd) {
      throw new Error("periodStart must be less than periodEnd");
    }

    const existing = await ctx.db
      .query("tenant_plans")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", args.tenantId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        planId: args.planId,
        creditLimit: args.creditLimit,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        creditsUsed: 0,
      });
    } else {
      await ctx.db.insert("tenant_plans", {
        ...args,
        creditsUsed: 0,
      });
    }
    return null;
  },
});

export const authorizeSpend = mutation({
  args: {
    tenantId: v.string(),
    operation: v.string(),
    units: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    charged: v.number(),
    remaining: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx, args) => {
    validateTenantInputs(args.tenantId, args.operation, args.units);
    const required = computeRequiredCredits(args.operation, args.units);

    const plan = await ctx.db
      .query("tenant_plans")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", args.tenantId))
      .unique();
    if (!plan) {
      throw new ConvexError({ code: "PLAN_NOT_FOUND", tenantId: args.tenantId });
    }

    const now = Date.now();
    if (now < plan.periodStart) {
      throw new ConvexError({
        code: "PLAN_PERIOD_NOT_STARTED",
        startsAt: plan.periodStart,
      });
    }
    if (now >= plan.periodEnd) {
      throw new ConvexError({
        code: "PLAN_PERIOD_EXPIRED",
        resetAt: plan.periodEnd,
      });
    }

    const remaining = Math.max(0, plan.creditLimit - plan.creditsUsed);
    if (required > remaining) {
      throw new ConvexError({
        code: "BUDGET_EXCEEDED",
        required,
        remaining,
        resetAt: plan.periodEnd,
      });
    }

    const nextUsed = plan.creditsUsed + required;
    await ctx.db.patch(plan._id, { creditsUsed: nextUsed });

    return {
      allowed: true,
      charged: required,
      remaining: Math.max(0, plan.creditLimit - nextUsed),
      resetAt: plan.periodEnd,
    };
  },
});

export const peekBudget = query({
  args: { tenantId: v.string() },
  returns: v.object({
    limit: v.number(),
    used: v.number(),
    remaining: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query("tenant_plans")
      .withIndex("by_tenantId", (q: any) => q.eq("tenantId", args.tenantId))
      .unique();
    if (!plan) {
      throw new ConvexError({ code: "PLAN_NOT_FOUND", tenantId: args.tenantId });
    }

    const remaining = Math.max(0, plan.creditLimit - plan.creditsUsed);
    return {
      limit: plan.creditLimit,
      used: plan.creditsUsed,
      remaining,
      resetAt: plan.periodEnd,
    };
  },
});
