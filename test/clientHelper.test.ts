import { describe, expect, test } from "vitest";
import { makeRateLimiterAPI } from "../src/index";
import type { ComponentApi } from "../_generated/component";

describe("makeRateLimiterAPI", () => {
  test("returns component public function references", () => {
    const component = {
      rateLimits: {
        authorizeSpend: "authorizeRef",
        peekBudget: "peekBudgetRef",
        upsertTenantPlan: "upsertPlanRef",
        checkRateLimit: "checkRef",
        enforceRateLimit: "enforceRef",
        peek: "peekRef",
        cleanup: "cleanupRef",
      },
    } as unknown as ComponentApi;

    const api = makeRateLimiterAPI(component);

    expect(api.authorizeSpend).toBe("authorizeRef");
    expect(api.peekBudget).toBe("peekBudgetRef");
    expect(api.upsertTenantPlan).toBe("upsertPlanRef");
  });
});
