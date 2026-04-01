import { describe, expect, test } from "vitest";
import { makeRateLimiterAPI } from "../src/index";

describe("makeRateLimiterAPI", () => {
  test("returns component public function references", () => {
    const component = {
      convex: {
        rateLimits: {
          checkRateLimit: "checkRef",
          enforceRateLimit: "enforceRef",
          peek: "peekRef",
        },
      },
    };

    const api = makeRateLimiterAPI(component);

    expect(api.checkRateLimit).toBe("checkRef");
    expect(api.enforceRateLimit).toBe("enforceRef");
    expect(api.peek).toBe("peekRef");
  });
});
