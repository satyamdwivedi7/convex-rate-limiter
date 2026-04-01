import { describe, expect, test } from "vitest";

describe("package surface", () => {
  test("resolves package subpath exports", async () => {
    await expect(import("convex-rate-limiter/convex.config.js")).resolves.toBeDefined();
    await expect(import("convex-rate-limiter/_generated/component.js")).resolves.toBeDefined();
    const testEntry = await import("convex-rate-limiter/test");
    expect(typeof testEntry.register).toBe("function");
    expect(typeof testEntry.default.register).toBe("function");
  });

  test("has root component function source files", async () => {
    await expect(import("../rateLimits.ts")).resolves.toBeDefined();
    await expect(import("../utils.ts")).resolves.toBeDefined();
  });
});
