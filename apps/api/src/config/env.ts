import { z } from 'zod';

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
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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
    trustProxyHops: e.TRUST_PROXY_HOPS,
    swaggerEnabled: e.SWAGGER_ENABLED ?? !isProduction,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    loginRateLimitPerMinute: e.LOGIN_RATE_LIMIT_PER_MINUTE,
    imagingMaxBytes: e.IMAGING_MAX_BYTES,
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
