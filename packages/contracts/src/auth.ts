import { z } from 'zod';
import { permissionSchema, roleKeySchema } from './access';
import { uuidSchema } from './common';

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Length cap protects the hashing function from oversized input; no composition rules (NIST 800-63B).
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const roleAssignmentSchema = z.object({
  role: roleKeySchema,
  /** null means the role applies organisation-wide. */
  practiceId: uuidSchema.nullable(),
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const currentUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  organisationId: uuidSchema,
  /** When true the API only permits changing the password, viewing the profile and signing out. */
  mustChangePassword: z.boolean(),
  assignments: z.array(roleAssignmentSchema),
  /** Convenience for UI rendering only. The API re-checks every request; never rely on this for security. */
  permissions: z.array(permissionSchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const loginResponseSchema = z.object({ user: currentUserSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const MIN_PASSWORD_LENGTH = 12;
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(256);

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
