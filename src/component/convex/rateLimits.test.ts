// All imports declared once at the top of this file.
// Subsequent tasks append only describe() blocks below.
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
// Note: anyApi bypasses Convex's internal/public access control —
// this lets tests call internalMutation functions (e.g. cleanup) directly.
import schema from "./schema";
import { parseWindow, validateInputs } from "./utils";

// ─── parseWindow ─────────────────────────────────────────────────────────────

describe("parseWindow", () => {
  test("returns correct ms for each valid window string", () => {
    expect(parseWindow("1m")).toBe(60_000);
    expect(parseWindow("5m")).toBe(5 * 60_000);
    expect(parseWindow("15m")).toBe(15 * 60_000);
    expect(parseWindow("1h")).toBe(60 * 60_000);
    expect(parseWindow("6h")).toBe(6 * 60 * 60_000);
    expect(parseWindow("24h")).toBe(24 * 60 * 60_000);
    expect(parseWindow("7d")).toBe(7 * 24 * 60 * 60_000);
  });

  test("throws a plain Error for an unrecognized window string", () => {
    expect(() => parseWindow("2m")).toThrow(Error);
    expect(() => parseWindow("")).toThrow(Error);
    expect(() => parseWindow("30s")).toThrow(Error);
  });
});

// ─── validateInputs ──────────────────────────────────────────────────────────

describe("validateInputs", () => {
  test("does not throw for valid key and limit", () => {
    expect(() => validateInputs("user:123", 5)).not.toThrow();
    expect(() => validateInputs("login:a@b.com", 1)).not.toThrow();
  });

  test("throws for limit <= 0", () => {
    expect(() => validateInputs("key", 0)).toThrow(Error);
    expect(() => validateInputs("key", -1)).toThrow(Error);
  });

  test("throws for empty key", () => {
    expect(() => validateInputs("", 5)).toThrow(Error);
  });
});

// ─── checkRateLimit ───────────────────────────────────────────────────────────

const modules = import.meta.glob("./**/*.*s");

describe("checkRateLimit", () => {
  test("allows first request and returns remaining = limit - 1", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(anyApi.rateLimits.checkRateLimit, {
      key: "test:user1",
      limit: 5,
      window: "1m",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(typeof result.resetAt).toBe("number");
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test("decrements remaining on each allowed request", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:user2", limit: 3, window: "1m" };

    const r1 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  test("denies request at exactly limit, returns remaining: 0", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:user3", limit: 3, window: "1m" };

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    const denied = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(typeof denied.resetAt).toBe("number");
  });

  test("resets window after expiry, remaining returns to limit - 1", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:user4", limit: 3, window: "1m" };
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    // Advance past the 1-minute window
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);

    const result = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    vi.restoreAllMocks();
  });

  test("throws for empty key", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "", limit: 5, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for limit <= 0", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 0, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for invalid window string", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 5, window: "2m" })
    ).rejects.toThrow();
  });
});
