import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type RoleKey } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';
import { hashPassword } from '../src/auth/password.service';

export const ORIGIN = 'http://localhost:3000';
/** Synthetic credential used only for fixtures in the throwaway test database. */
export const TEST_PASSWORD = 'Synthetic-Test-Passw0rd!';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://dpms:dpms_local_dev_only@localhost:5432/dpms_test?schema=public';

export function testEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'test',
    // The application connects as TEST_APP_DATABASE_URL when set (least-privilege role, ops/db-roles.sql);
    // fixtures and cleanup always use the owner connection.
    DATABASE_URL: process.env.TEST_APP_DATABASE_URL ?? TEST_DATABASE_URL,
    WEB_ORIGINS: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_PER_MINUTE: '10000',
    LOGIN_RATE_LIMIT_PER_MINUTE: '10000',
    ENQUIRY_RATE_LIMIT_PER_HOUR: '10000',
    LOGIN_MAX_FAILED_ATTEMPTS: '3',
    // Test-only key (32 bytes, base64). Never reuse outside tests.
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  };
}

export async function createTestApp(
  overrides: Record<string, string | undefined> = {},
  providers: { token: unknown; value: unknown }[] = [],
): Promise<NestExpressApplication> {
  Object.assign(process.env, testEnv(overrides));
  // An override of `undefined` means "unset this variable".
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const p of providers) builder = builder.overrideProvider(p.token as never).useValue(p.value);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export interface Fixtures {
  orgId: string;
  practiceA: string;
  practiceB: string;
  users: Record<
    'owner' | 'adminA' | 'dentistA' | 'billingA' | 'recepA' | 'recepB' | 'inactive',
    { id: string; email: string }
  >;
}

export async function resetAndSeed(prisma: PrismaClient): Promise<Fixtures> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE mfa_challenges, mfa_recovery_codes, user_mfa, payment_allocations, payments, invoice_lines, invoices, invoice_sequences, imaging_assets, treatment_plan_item_events, treatment_plan_items, treatment_plans, dental_chart_entries, clinical_note_versions, clinical_encounters, appointment_events, appointments, audit_events, sessions, user_role_assignments, users, practices, organisations, patients, patient_practices CASCADE',
  );
  const org = await prisma.organisation.create({ data: { name: 'Synthetic Test Organisation' } });
  const [a, b] = await Promise.all([
    prisma.practice.create({
      data: { organisationId: org.id, name: 'Synthetic Practice A', code: 'SYN-A' },
    }),
    prisma.practice.create({
      data: { organisationId: org.id, name: 'Synthetic Practice B', code: 'SYN-B' },
    }),
  ]);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const mk = (email: string, role: RoleKey, practiceId: string | null, isActive = true) =>
    prisma.user.create({
      data: {
        organisationId: org.id,
        email,
        displayName: email.split('@')[0]!,
        passwordHash,
        isActive,
        roleAssignments: { create: { role, practiceId } },
      },
      select: { id: true, email: true },
    });
  const [owner, adminA, dentistA, billingA, recepA, recepB, inactive] = await Promise.all([
    mk('owner@test.invalid', 'ORGANISATION_OWNER', null),
    mk('admin-a@test.invalid', 'PRACTICE_ADMINISTRATOR', a.id),
    mk('dentist-a@test.invalid', 'DENTIST', a.id),
    mk('billing-a@test.invalid', 'BILLING_ADMINISTRATOR', a.id),
    mk('recep-a@test.invalid', 'RECEPTIONIST', a.id),
    mk('recep-b@test.invalid', 'RECEPTIONIST', b.id),
    mk('inactive@test.invalid', 'RECEPTIONIST', a.id, false),
  ]);
  return {
    orgId: org.id,
    practiceA: a.id,
    practiceB: b.id,
    users: { owner, adminA, dentistA, billingA, recepA, recepB, inactive },
  };
}

/** Logs in and returns a supertest agent that carries the session cookie and a trusted Origin. */
export async function loginAgent(
  app: NestExpressApplication,
  email: string,
  password = TEST_PASSWORD,
): Promise<{ agent: ReturnType<typeof request.agent>; res: request.Response }> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post('/api/v1/auth/login')
    .set('Origin', ORIGIN)
    .send({ email, password });
  return { agent, res };
}
