import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { E2E } from './env';

/** Migrates the dedicated e2e database from scratch-state, wipes it, and seeds synthetic data. */
export default async function globalSetup(): Promise<void> {
  execFileSync('pnpm', ['--filter', '@dpms/api', 'exec', 'prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    stdio: 'inherit',
  });
  const prisma = new PrismaClient({ datasourceUrl: E2E.databaseUrl });
  try {
    const tables = await prisma.$queryRaw<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
    );

    const org = await prisma.organisation.create({ data: { name: 'E2E Synthetic Organisation' } });
    const practice = await prisma.practice.create({
      data: { organisationId: org.id, name: 'E2E Seed Practice', code: 'E2E-SEED' },
    });
    const mk = (email: string, name: string, password: string) =>
      argon2.hash(password, { type: argon2.argon2id }).then((passwordHash) =>
        prisma.user.create({
          data: {
            organisationId: org.id,
            email,
            displayName: name,
            passwordHash,
            roleAssignments: { create: { role: 'ORGANISATION_OWNER', practiceId: null } },
          },
        }),
      );
    await mk(E2E.ownerEmail, 'E2E Owner', E2E.ownerPassword);
    await mk(E2E.mfaEmail, 'E2E MFA Owner', E2E.mfaPassword);
    // A patient and an encounter so accessibility scans cover data-rich pages.
    const patient = await prisma.patient.create({
      data: {
        organisationId: org.id,
        registeringPracticeId: practice.id,
        firstName: 'Axe',
        lastName: 'Syntheticson',
        dateOfBirth: new Date('1988-08-08'),
        practices: { create: { practiceId: practice.id } },
      },
    });
    await prisma.allergy.create({
      data: {
        patientId: patient.id,
        substance: 'Synthetic latex',
        severity: 'SEVERE',
        source: 'Seed',
        recordedOn: new Date('2026-01-01'),
      },
    });
    await prisma.patientContact.create({
      data: {
        patientId: patient.id,
        name: 'Seed Contact',
        relationship: 'Friend',
        phone: '+27820000000',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
