import { z } from 'zod';
import { uuidSchema } from './common';

export const practiceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  code: z.string(),
  isActive: z.boolean(),
});
export type Practice = z.infer<typeof practiceSchema>;

export const createPracticeRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  /** Short stable identifier: upper-case letters, digits and hyphen. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 characters: A-Z, 0-9 and hyphen'),
});
export type CreatePracticeRequest = z.infer<typeof createPracticeRequestSchema>;

export const updatePracticeRequestSchema = z
  .object({ name: z.string().trim().min(2).max(100), isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export type UpdatePracticeRequest = z.infer<typeof updatePracticeRequestSchema>;
