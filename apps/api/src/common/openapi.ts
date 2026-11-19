import { z } from 'zod';

/** Converts a shared zod contract into an OpenAPI 3.0 schema object. */
export function toOpenApi(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}
