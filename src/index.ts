export { default } from "../convex.config";
import type { ComponentApi } from "../_generated/component.js";

export type BudgetAuthorizationResult = {
  allowed: boolean;
  charged: number;
  remaining: number;
  resetAt: number;
};

export type BudgetStatus = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: number;
};

export type BillingOperation =
  | "llm.gpt4o.input"
  | "llm.gpt4o.output"
  | "search.query";

export function makeRateLimiterAPI<T extends ComponentApi>(
  component: T
): T["rateLimits"] {
  return component.rateLimits;
}
