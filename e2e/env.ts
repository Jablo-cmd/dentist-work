/** Shared configuration for the end-to-end stack. All credentials here are throwaway, synthetic, local-only. */
const db =
  process.env.E2E_DATABASE_URL ??
  'postgresql://dpms:dpms_local_dev_only@localhost:5432/dpms_e2e?schema=public';

export const E2E = {
  databaseUrl: db,
  webUrl: 'http://localhost:3100',
  apiUrl: 'http://localhost:4100',
  s3Url: 'http://127.0.0.1:4571',
  ownerEmail: 'owner@e2e.invalid',
  ownerPassword: 'E2e-Synthetic-Owner-Passw0rd!',
  mfaEmail: 'mfa-owner@e2e.invalid',
  mfaPassword: 'E2e-Synthetic-Mfa-Passw0rd!',
  apiEnv: {
    NODE_ENV: 'development',
    API_PORT: '4100',
    WEB_ORIGINS: 'http://localhost:3100',
    DATABASE_URL: db,
    LOG_LEVEL: 'warn',
    RATE_LIMIT_PER_MINUTE: '10000',
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    LOGIN_MAX_FAILED_ATTEMPTS: '20',
    STORAGE_ENDPOINT: 'http://127.0.0.1:4571',
    STORAGE_REGION: 'af-south-1',
    STORAGE_BUCKET: 'dpms-e2e-private',
    STORAGE_ACCESS_KEY_ID: 'S3RVER',
    STORAGE_SECRET_ACCESS_KEY: 'S3RVER',
    STORAGE_FORCE_PATH_STYLE: 'true',
    // Test-only key. Never reuse.
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  } as Record<string, string>,
};
