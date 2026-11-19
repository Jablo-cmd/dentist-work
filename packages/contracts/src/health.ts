import { z } from 'zod';

/** Liveness: the process is up. Says nothing about dependencies. */
export const livenessSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('dpms-api'),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string().datetime(),
});
export type Liveness = z.infer<typeof livenessSchema>;

export const dependencyStatusSchema = z.enum(['up', 'down']);

/** Readiness: the instance can serve traffic (database reachable). */
export const readinessSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: z.object({
      status: dependencyStatusSchema,
      latencyMs: z.number().nullable(),
    }),
    /** Informational: private object storage. `not_configured` is not a failure; imaging is simply unavailable. */
    storage: z.object({ status: z.enum(['up', 'down', 'not_configured']) }).optional(),
  }),
});
export type Readiness = z.infer<typeof readinessSchema>;
