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
  organisationName: z.string(),
  /** When true the API only permits changing the password, viewing the profile and signing out. */
  mustChangePassword: z.boolean(),
  /** Whether this account has a confirmed second factor. */
  mfaEnabled: z.boolean(),
  /** True when policy requires a second factor and the user has not enrolled yet (API access is restricted until they do). */
  mfaEnrolmentRequired: z.boolean(),
  assignments: z.array(roleAssignmentSchema),
  /** Convenience for UI rendering only. The API re-checks every request; never rely on this for security. */
  permissions: z.array(permissionSchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const loginSuccessSchema = z.object({ user: currentUserSchema });
export const mfaChallengeResponseSchema = z.object({
  mfaRequired: z.literal(true),
  /** Opaque, single-use, short-lived. Exchange it with a code at POST /auth/mfa/verify. */
  challenge: z.string(),
});
/** Password accepted: either a session was started, or a second factor is still required. */
export const loginResponseSchema = z.union([loginSuccessSchema, mfaChallengeResponseSchema]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const recoveryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/, 'Invalid recovery code format');

export const mfaVerifyRequestSchema = z
  .object({
    challenge: z.string().min(20).max(200),
    code: totpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
  })
  .refine(
    (v) => (v.code === undefined) !== (v.recoveryCode === undefined),
    'Provide either a code or a recovery code',
  );
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export const mfaEnrolResponseSchema = z.object({
  /** Shown once. Base32 shared secret for authenticator apps. */
  secret: z.string(),
  otpauthUri: z.string(),
});
export type MfaEnrolResponse = z.infer<typeof mfaEnrolResponseSchema>;

export const mfaConfirmRequestSchema = z.object({ code: totpCodeSchema });
export const mfaConfirmResponseSchema = z.object({
  /** Shown once. Each code works a single time. Store them offline. */
  recoveryCodes: z.array(z.string()),
});
export type MfaConfirmResponse = z.infer<typeof mfaConfirmResponseSchema>;

export const mfaDisableRequestSchema = z.object({
  password: z.string().min(1).max(256),
  code: totpCodeSchema,
});
export type MfaDisableRequest = z.infer<typeof mfaDisableRequestSchema>;

export const MIN_PASSWORD_LENGTH = 12;
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(256);

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
