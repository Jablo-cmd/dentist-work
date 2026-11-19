import { ROLE_KEYS } from '@dpms/contracts';
import { z } from 'zod';

/**
 * Recommended default MFA policy (client confirmation required — docs/25): every role that can read
 * clinical or financial information, plus administrators. Receptionists (demographics and
 * scheduling only) are a phase-in decision, not forced by default.
 */
export const RECOMMENDED_MFA_ROLES = [
  'ORGANISATION_OWNER',
  'PRACTICE_ADMINISTRATOR',
  'DENTIST',
  'BILLING_ADMINISTRATOR',
] as const;

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url()).min(1)),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgresql:// URL'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(60 * 24 * 7)
    .default(480),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(60 * 24)
    .default(60),
  COOKIE_SECURE: bool.optional(),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(15),
  /** Number of reverse-proxy hops to trust for client-IP derivation. 0 = trust none. */
  /**
   * Reverse proxies in front of the API whose X-Forwarded-For is trusted (the web app's proxy counts as one,
   * plus any load balancer). Unset = 0 in development; REQUIRED in production, because with 0 every user
   * appears to come from the proxy's address (shared rate-limit bucket, meaningless audit IPs).
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  SWAGGER_ENABLED: bool.optional(),
  // Private S3-compatible object storage (imaging). All-or-nothing; leave unset to disable imaging.
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(3).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_FORCE_PATH_STYLE: bool.optional(),
  /** 32 random bytes, base64. Required to enable MFA. Generate with: openssl rand -base64 32 */
  MFA_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || Buffer.from(v, 'base64').length === 32,
      'must be 32 bytes, base64-encoded',
    ),
  MFA_ISSUER: z.string().min(1).max(60).default('Noordwyk DPMS'),
  /**
   * Comma-separated role keys that MUST enrol a second factor, or `NONE`.
   * Unset: development/test = nobody; **production = RECOMMENDED_MFA_ROLES** (secure default).
   * `NONE` in production additionally requires MFA_ALLOW_UNENFORCED=true (an explicit, logged client decision).
   */
  MFA_REQUIRED_ROLES: z.string().optional(),
  MFA_ALLOW_UNENFORCED: bool.optional(),
  // Malware scanner (ClamAV clamd protocol). Unset = no scanner: uploads stay quarantined (fail closed).
  SCANNER_HOST: z.string().min(1).optional(),
  SCANNER_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  SCANNER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  SCANNER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
  IMAGING_MAX_BYTES: z.coerce.number().int().min(1024).max(100_000_000).default(25_000_000),
});

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  webOrigins: string[];
  databaseUrl: string;
  logLevel: string;
  sessionTtlMinutes: number;
  sessionIdleTimeoutMinutes: number;
  cookieSecure: boolean;
  loginMaxFailedAttempts: number;
  loginLockoutMinutes: number;
  trustProxyHops: number;
  swaggerEnabled: boolean;
  rateLimitPerMinute: number;
  loginRateLimitPerMinute: number;
  /** null = object storage not configured (imaging disabled). */
  storage: StorageConfig | null;
  imagingMaxBytes: number;
  /** null = no scanner configured (uploads remain quarantined). */
  scanner: { host: string; port: number; timeoutMs: number } | null;
  scannerMaxAttempts: number;
  /** null = MFA unavailable (no encryption key). */
  mfaKey: Buffer | null;
  mfaIssuer: string;
  mfaRequiredRoles: readonly (typeof ROLE_KEYS)[number][];
  /** Where the effective policy came from (for the startup log). */
  mfaPolicySource:
    'explicit' | 'production-default' | 'development-default' | 'explicitly-disabled';
};

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates and normalises environment variables. Fails fast at startup.
 * Error messages name variables and rules only — never the supplied values (they may be secrets).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const problems: string[] = [];

  const cookieSecure = e.COOKIE_SECURE ?? isProduction;
  if (isProduction) {
    if (!cookieSecure) problems.push('COOKIE_SECURE: must be true in production');
    if (e.WEB_ORIGINS.some((o) => !o.startsWith('https://')))
      problems.push('WEB_ORIGINS: every origin must be https:// in production');
    if (e.SWAGGER_ENABLED === true)
      problems.push('SWAGGER_ENABLED: must not be enabled in production without explicit review');
  }
  const storageVars = [
    e.STORAGE_BUCKET,
    e.STORAGE_REGION,
    e.STORAGE_ACCESS_KEY_ID,
    e.STORAGE_SECRET_ACCESS_KEY,
  ];
  const storageSet = storageVars.filter((v) => v !== undefined).length;
  if (storageSet > 0 && storageSet < storageVars.length)
    problems.push(
      'STORAGE_*: STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY must be set together',
    );
  if (isProduction && e.STORAGE_ENDPOINT && !e.STORAGE_ENDPOINT.startsWith('https://'))
    problems.push('STORAGE_ENDPOINT: must be https:// in production');
  // ---- MFA policy: fail safe -------------------------------------------------------------
  const rawPolicy = (e.MFA_REQUIRED_ROLES ?? '').trim();
  let mfaRoles: (typeof ROLE_KEYS)[number][] = [];
  let mfaPolicySource: Env['mfaPolicySource'];
  if (rawPolicy === '') {
    mfaRoles = isProduction ? [...RECOMMENDED_MFA_ROLES] : [];
    mfaPolicySource = isProduction ? 'production-default' : 'development-default';
  } else if (rawPolicy.toUpperCase() === 'NONE') {
    mfaPolicySource = 'explicitly-disabled';
    if (isProduction && e.MFA_ALLOW_UNENFORCED !== true)
      problems.push(
        'MFA_REQUIRED_ROLES=NONE: refused in production unless MFA_ALLOW_UNENFORCED=true (explicit client decision)',
      );
  } else {
    const parsedRoles = z.array(z.enum(ROLE_KEYS)).safeParse(
      rawPolicy
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );
    if (!parsedRoles.success)
      problems.push(
        'MFA_REQUIRED_ROLES: must be a comma-separated list of valid role keys, or NONE',
      );
    else mfaRoles = parsedRoles.data;
    mfaPolicySource = 'explicit';
    if (isProduction && mfaRoles.length === 0)
      problems.push('MFA_REQUIRED_ROLES: must not be empty in production');
    if (isProduction && !mfaRoles.includes('ORGANISATION_OWNER'))
      problems.push('MFA_REQUIRED_ROLES: must include ORGANISATION_OWNER in production');
  }
  if (mfaRoles.length > 0 && !e.MFA_ENCRYPTION_KEY)
    problems.push(
      'MFA_ENCRYPTION_KEY: required when MFA is enforced (always the case in production unless explicitly disabled)',
    );
  if (isProduction && e.TRUST_PROXY_HOPS === undefined)
    problems.push(
      'TRUST_PROXY_HOPS: must be set explicitly in production (number of trusted reverse proxies in front of the API; see docs/22)',
    );
  if (isProduction && e.TRUST_PROXY_HOPS === 0)
    problems.push(
      'TRUST_PROXY_HOPS: 0 is invalid in production because the web app always proxies API requests',
    );
  if (e.SESSION_IDLE_TIMEOUT_MINUTES > e.SESSION_TTL_MINUTES)
    problems.push('SESSION_IDLE_TIMEOUT_MINUTES: must not exceed SESSION_TTL_MINUTES');
  if (problems.length) throw new EnvValidationError(problems);

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    port: e.API_PORT,
    webOrigins: e.WEB_ORIGINS,
    databaseUrl: e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    sessionTtlMinutes: e.SESSION_TTL_MINUTES,
    sessionIdleTimeoutMinutes: e.SESSION_IDLE_TIMEOUT_MINUTES,
    cookieSecure,
    loginMaxFailedAttempts: e.LOGIN_MAX_FAILED_ATTEMPTS,
    loginLockoutMinutes: e.LOGIN_LOCKOUT_MINUTES,
    trustProxyHops: e.TRUST_PROXY_HOPS ?? 0,
    swaggerEnabled: e.SWAGGER_ENABLED ?? !isProduction,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    loginRateLimitPerMinute: e.LOGIN_RATE_LIMIT_PER_MINUTE,
    imagingMaxBytes: e.IMAGING_MAX_BYTES,
    scanner: e.SCANNER_HOST
      ? { host: e.SCANNER_HOST, port: e.SCANNER_PORT, timeoutMs: e.SCANNER_TIMEOUT_MS }
      : null,
    scannerMaxAttempts: e.SCANNER_MAX_ATTEMPTS,
    mfaKey: e.MFA_ENCRYPTION_KEY ? Buffer.from(e.MFA_ENCRYPTION_KEY, 'base64') : null,
    mfaIssuer: e.MFA_ISSUER,
    mfaRequiredRoles: mfaRoles,
    mfaPolicySource,
    storage:
      storageSet === storageVars.length
        ? {
            endpoint: e.STORAGE_ENDPOINT,
            region: e.STORAGE_REGION!,
            bucket: e.STORAGE_BUCKET!,
            accessKeyId: e.STORAGE_ACCESS_KEY_ID!,
            secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY!,
            forcePathStyle: e.STORAGE_FORCE_PATH_STYLE ?? false,
          }
        : null,
  };
}

export const ENV = Symbol('ENV');
