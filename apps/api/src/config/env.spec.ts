import { EnvValidationError, loadEnv } from './env';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:SUPERSECRET@localhost:5432/db',
  WEB_ORIGINS: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('accepts a minimal valid development config with safe defaults', () => {
    const env = loadEnv(valid);
    expect(env.port).toBe(4000);
    expect(env.cookieSecure).toBe(false);
    expect(env.swaggerEnabled).toBe(true);
    expect(env.webOrigins).toEqual(['http://localhost:3000']);
  });

  it('fails fast when required variables are missing', () => {
    expect(() => loadEnv({})).toThrow(EnvValidationError);
  });

  it('rejects non-postgres database URLs without echoing the value', () => {
    try {
      loadEnv({ ...valid, DATABASE_URL: 'mysql://u:SUPERSECRET@h/db' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      expect((e as Error).message).toContain('DATABASE_URL');
      expect((e as Error).message).not.toContain('SUPERSECRET');
    }
  });

  it('enforces secure settings in production', () => {
    const prod = { ...valid, NODE_ENV: 'production' };
    expect(() =>
      loadEnv({ ...prod, COOKIE_SECURE: 'false', WEB_ORIGINS: 'https://app.example.com' }),
    ).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv(prod)).toThrow(/https/);
    const ok = loadEnv({ ...prod, WEB_ORIGINS: 'https://app.example.com' });
    expect(ok.cookieSecure).toBe(true);
    expect(ok.swaggerEnabled).toBe(false);
    expect(() =>
      loadEnv({ ...prod, WEB_ORIGINS: 'https://a.example.com', SWAGGER_ENABLED: 'true' }),
    ).toThrow(/SWAGGER/);
  });

  it('rejects idle timeout longer than session lifetime', () => {
    expect(() =>
      loadEnv({ ...valid, SESSION_TTL_MINUTES: '30', SESSION_IDLE_TIMEOUT_MINUTES: '60' }),
    ).toThrow(/IDLE/);
  });
});

describe('MFA configuration', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    WEB_ORIGINS: 'http://localhost:3000',
  };
  const key = Buffer.alloc(32, 1).toString('base64');
  it('is optional and off by default', () => {
    const env = loadEnv(base);
    expect(env.mfaKey).toBeNull();
    expect(env.mfaRequiredRoles).toEqual([]);
  });
  it('validates the key length and the role list', () => {
    expect(() =>
      loadEnv({ ...base, MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(() =>
      loadEnv({ ...base, MFA_ENCRYPTION_KEY: key, MFA_REQUIRED_ROLES: 'WIZARD' }),
    ).toThrow(/MFA_REQUIRED_ROLES/);
    expect(
      loadEnv({
        ...base,
        MFA_ENCRYPTION_KEY: key,
        MFA_REQUIRED_ROLES: 'DENTIST, ORGANISATION_OWNER',
      }).mfaRequiredRoles,
    ).toEqual(['DENTIST', 'ORGANISATION_OWNER']);
  });
  it('refuses to require MFA without an encryption key', () => {
    expect(() => loadEnv({ ...base, MFA_REQUIRED_ROLES: 'DENTIST' })).toThrow(
      /MFA_ENCRYPTION_KEY: required/,
    );
  });
});
