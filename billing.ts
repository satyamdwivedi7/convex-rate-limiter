export const PRICING_CATALOG: Record<string, number> = {
  "llm.gpt4o.input": 2,
  "llm.gpt4o.output": 4,
  "search.query": 1,
};

export function validateTenantInputs(tenantId: string, operation: string, units: number) {
  if (!tenantId) throw new Error("tenantId must be a non-empty string");
  if (!operation) throw new Error("operation must be a non-empty string");
  if (!Number.isInteger(units) || units <= 0) {
    throw new Error("units must be a positive integer");
  }
}

export function resolveOperationCost(operation: string): number {
  const cost = PRICING_CATALOG[operation];
  if (cost === undefined) {
    throw new Error(`Unknown operation: ${operation}`);
  }
  return cost;
}

export function computeRequiredCredits(operation: string, units: number): number {
  if (!Number.isInteger(units) || units <= 0) {
    throw new Error("units must be a positive integer");
  }
  return resolveOperationCost(operation) * units;
}
