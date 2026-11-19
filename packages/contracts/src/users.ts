import { z } from 'zod';
import { roleKeySchema } from './access';
import { paginationQuerySchema, uuidSchema } from './common';
import { passwordSchema } from './auth';

export const userAssignmentSchema = z.object({
  id: uuidSchema,
  role: roleKeySchema,
  practiceId: uuidSchema.nullable(),
});

export const userSummarySchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  assignments: z.array(userAssignmentSchema),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

const emailField = z.string().trim().toLowerCase().email().max(254);

export const createUserRequestSchema = z.object({
  email: emailField,
  displayName: z.string().trim().min(2).max(100),
  /** One-time password chosen by the administrator; the user must change it at first sign-in. */
  temporaryPassword: passwordSchema,
  assignments: z
    .array(z.object({ role: roleKeySchema, practiceId: uuidSchema.nullable() }))
    .min(1)
    .max(20),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({ displayName: z.string().trim().min(2).max(100), isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const addAssignmentRequestSchema = z.object({
  role: roleKeySchema,
  practiceId: uuidSchema.nullable(),
});
export type AddAssignmentRequest = z.infer<typeof addAssignmentRequestSchema>;

export const resetPasswordRequestSchema = z.object({ temporaryPassword: passwordSchema });
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const usersQuerySchema = paginationQuerySchema;
