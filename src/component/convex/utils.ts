const WINDOW_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

export function parseWindow(window: string): number {
  const ms = WINDOW_MS[window];
  if (ms === undefined) {
    throw new Error(
      `Invalid window "${window}". Must be one of: ${Object.keys(WINDOW_MS).join(", ")}`
    );
  }
  return ms;
}

export function validateInputs(key: string, limit: number): void {
  if (!key) {
    throw new Error("key must be a non-empty string");
  }
  if (limit <= 0) {
    throw new Error("limit must be a positive integer greater than 0");
  }
}
