import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";

export declare function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name?: string
): void;

declare const _default: {
  register: typeof register;
  schema: SchemaDefinition<GenericSchema, boolean>;
};

export default _default;
