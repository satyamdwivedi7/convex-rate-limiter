import type { FunctionReference } from "convex/server";

export type ComponentApi<Name extends string | undefined = string | undefined> = {
  rateLimits: {
    authorizeSpend: FunctionReference<
      "mutation",
      "internal",
      { tenantId: string; operation: string; units: number },
      { allowed: boolean; charged: number; remaining: number; resetAt: number },
      Name
    >;
    peekBudget: FunctionReference<
      "query",
      "internal",
      { tenantId: string },
      { limit: number; used: number; remaining: number; resetAt: number },
      Name
    >;
    upsertTenantPlan: FunctionReference<
      "mutation",
      "internal",
      {
        tenantId: string;
        planId: string;
        creditLimit: number;
        periodStart: number;
        periodEnd: number;
      },
      null,
      Name
    >;
  };
};
