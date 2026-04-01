import { describe, expect, test } from "vitest";
import { makeRateLimiterAPI } from "../src/index";
import type { ComponentApi } from "../_generated/component";

describe("makeRateLimiterAPI", () => {
  test("returns component public function references", () => {
    const component = {
      rateLimits: {
        checkRateLimit: "checkRef",
        enforceRateLimit: "enforceRef",
        peek: "peekRef",
      },
    } as unknown as ComponentApi;

    const api = makeRateLimiterAPI(component);

    expect(api.checkRateLimit).toBe("checkRef");
    expect(api.enforceRateLimit).toBe("enforceRef");
    expect(api.peek).toBe("peekRef");
  });
});
