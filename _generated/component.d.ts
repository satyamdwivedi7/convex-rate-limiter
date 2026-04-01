import type { FunctionReference } from "convex/server";

export type ComponentApi<Name extends string | undefined = string | undefined> = {
  rateLimits: {
    checkRateLimit: FunctionReference<
      "mutation",
      "internal",
      { key: string; limit: number; window: string },
      { allowed: boolean; remaining: number; resetAt: number },
      Name
    >;
    enforceRateLimit: FunctionReference<
      "mutation",
      "internal",
      { key: string; limit: number; window: string },
      { remaining: number; resetAt: number },
      Name
    >;
    peek: FunctionReference<
      "query",
      "internal",
      { key: string; limit: number; window: string },
      { remaining: number; resetAt: number | null },
      Name
    >;
  };
};
