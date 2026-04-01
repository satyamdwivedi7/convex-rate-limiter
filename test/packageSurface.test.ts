import { describe, expect, test } from "vitest";

describe("package surface", () => {
  test("resolves package export targets", async () => {
    await expect(import("../convex.config.ts")).resolves.toBeDefined();
    await expect(import("../_generated/component.js")).resolves.toBeDefined();
    const testEntry = await import("../test/index.js");
    expect(typeof testEntry.register).toBe("function");
    expect(typeof testEntry.default.register).toBe("function");
  });

  test("has root component function source files", async () => {
    await expect(import("../rateLimits.ts")).resolves.toBeDefined();
    await expect(import("../utils.ts")).resolves.toBeDefined();
    await expect(import("../billing.ts")).resolves.toBeDefined();
  });
});
