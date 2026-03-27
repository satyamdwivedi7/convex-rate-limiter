export { default } from "../convex.config";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitStatus = {
  remaining: number;
  resetAt: number | null;
};

export type RateLimitWindow =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "6h"
  | "24h"
  | "7d";
