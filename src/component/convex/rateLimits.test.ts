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
