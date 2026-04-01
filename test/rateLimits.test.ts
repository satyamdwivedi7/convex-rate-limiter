import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../schema";
import { computeRequiredCredits, resolveOperationCost } from "../billing";

const modules = import.meta.glob("../**/*.*s");

describe("billing schema tables", () => {
  test("supports tenant plan table", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("tenant_plans", {
        tenantId: "tenant_a",
        planId: "starter",
        creditLimit: 1000,
        periodStart: Date.now(),
        periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        creditsUsed: 0,
      });
      expect(id).toBeDefined();
    });
  });
});

describe("billing helpers", () => {
  test("resolves operation cost", () => {
    expect(resolveOperationCost("llm.gpt4o.input")).toBe(2);
    expect(resolveOperationCost("search.query")).toBe(1);
  });

  test("throws for unknown operation", () => {
    expect(() => resolveOperationCost("unknown.op")).toThrow();
  });

  test("computes required credits with units", () => {
    expect(computeRequiredCredits("llm.gpt4o.input", 3)).toBe(6);
    expect(() => computeRequiredCredits("llm.gpt4o.input", 0)).toThrow();
  });
});

describe("billing APIs", () => {
  const now = Date.now();
  const periodStart = now - 60_000;
  const periodEnd = now + 30 * 24 * 60 * 60 * 1000;

  test("upsertTenantPlan creates plan", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.rateLimits.upsertTenantPlan, {
      tenantId: "tenant_plan_1",
      planId: "starter",
      creditLimit: 100,
      periodStart,
      periodEnd,
    });

    await t.run(async (ctx) => {
      const plan = await ctx.db
        .query("tenant_plans")
        .withIndex("by_tenantId", (q: any) => q.eq("tenantId", "tenant_plan_1"))
        .unique();
      expect(plan).not.toBeNull();
      expect(plan?.creditLimit).toBe(100);
    });
  });

  test("authorizeSpend charges and returns remaining", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.rateLimits.upsertTenantPlan, {
      tenantId: "tenant_budget_1",
      planId: "pro",
      creditLimit: 20,
      periodStart,
      periodEnd,
    });

    const result = await t.mutation(anyApi.rateLimits.authorizeSpend, {
      tenantId: "tenant_budget_1",
      operation: "llm.gpt4o.input",
      units: 3,
    });

    expect(result.allowed).toBe(true);
    expect(result.charged).toBe(6);
    expect(result.remaining).toBe(14);
    expect(result.resetAt).toBe(periodEnd);
  });

  test("authorizeSpend throws BUDGET_EXCEEDED when required exceeds remaining", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.rateLimits.upsertTenantPlan, {
      tenantId: "tenant_budget_2",
      planId: "starter",
      creditLimit: 5,
      periodStart,
      periodEnd,
    });

    let errorData: any = null;
    try {
      await t.mutation(anyApi.rateLimits.authorizeSpend, {
        tenantId: "tenant_budget_2",
        operation: "llm.gpt4o.output",
        units: 2,
      });
    } catch (e: any) {
      const raw = e.data;
      errorData = typeof raw === "string" ? JSON.parse(raw) : raw;
    }

    expect(errorData.code).toBe("BUDGET_EXCEEDED");
    expect(errorData.required).toBe(8);
    expect(errorData.remaining).toBe(5);
    expect(errorData.resetAt).toBe(periodEnd);
  });

  test("peekBudget returns limit, used, remaining, resetAt", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.rateLimits.upsertTenantPlan, {
      tenantId: "tenant_budget_3",
      planId: "pro",
      creditLimit: 50,
      periodStart,
      periodEnd,
    });
    await t.mutation(anyApi.rateLimits.authorizeSpend, {
      tenantId: "tenant_budget_3",
      operation: "search.query",
      units: 4,
    });

    const status = await t.query(anyApi.rateLimits.peekBudget, {
      tenantId: "tenant_budget_3",
    });
    expect(status.limit).toBe(50);
    expect(status.used).toBe(4);
    expect(status.remaining).toBe(46);
    expect(status.resetAt).toBe(periodEnd);
  });

  test("rejects spend before period starts", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.mutation(anyApi.rateLimits.upsertTenantPlan, {
      tenantId: "tenant_budget_4",
      planId: "future",
      creditLimit: 100,
      periodStart: now + 60_000,
      periodEnd: now + 120_000,
    });

    let errorData: any = null;
    try {
      await t.mutation(anyApi.rateLimits.authorizeSpend, {
        tenantId: "tenant_budget_4",
        operation: "search.query",
        units: 1,
      });
    } catch (e: any) {
      const raw = e.data;
      errorData = typeof raw === "string" ? JSON.parse(raw) : raw;
    }

    expect(errorData.code).toBe("PLAN_PERIOD_NOT_STARTED");
  });
});
