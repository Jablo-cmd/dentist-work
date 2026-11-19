/* eslint-disable @typescript-eslint/no-require-imports */
/* Seeds a SYNTHETIC dataset for load testing. Never run against a database holding real data.
 *   LOAD_DATABASE_URL=postgresql://…/dpms_load node ops/load/seed.cjs
 * It truncates every table first, so it refuses any database whose name does not contain "load". */
const path = require('node:path');
const req = require('node:module').createRequire(
  path.join(__dirname, '../../apps/api/package.json'),
);
const { PrismaClient } = req('@prisma/client');
const argon2 = req('argon2');

const url = process.env.LOAD_DATABASE_URL;
if (!url || !/\/[^/?]*load[^/?]*(\?|$)/i.test(url)) {
  console.error('Refusing: LOAD_DATABASE_URL must point at a database whose name contains "load".');
  process.exit(2);
}
const PATIENTS = Number(process.env.LOAD_PATIENTS ?? 5000);
const APPTS = Number(process.env.LOAD_APPOINTMENTS ?? 2000);
const PASSWORD = 'Load-Synthetic-Passw0rd!';

(async () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables =
    await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
  const org = await prisma.organisation.create({ data: { name: 'Load Synthetic Org' } });
  const practice = await prisma.practice.create({
    data: { organisationId: org.id, name: 'Load Practice', code: 'LOAD' },
  });
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const owner = await prisma.user.create({
    data: {
      organisationId: org.id,
      email: 'owner@load.invalid',
      displayName: 'Load Owner',
      passwordHash: hash,
      roleAssignments: { create: { role: 'ORGANISATION_OWNER', practiceId: null } },
    },
  });
  const dentist = await prisma.user.create({
    data: {
      organisationId: org.id,
      email: 'dentist@load.invalid',
      displayName: 'Load Dentist',
      passwordHash: hash,
      roleAssignments: { create: { role: 'DENTIST', practiceId: practice.id } },
    },
  });
  const first = ['Ann', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ian', 'Jo'];
  const last = [
    'Syntheticson',
    'Testa',
    'Mockberg',
    'Fakeman',
    'Dummy',
    'Sample',
    'Placeholder',
    'Example',
  ];
  const rows = Array.from({ length: PATIENTS }, (_, i) => ({
    organisationId: org.id,
    registeringPracticeId: practice.id,
    firstName: first[i % first.length],
    lastName: `${last[i % last.length]}${i}`,
    dateOfBirth: new Date(Date.UTC(1950 + (i % 60), i % 12, 1 + (i % 28))),
    mobilePhone: `+2782${String(1000000 + i)}`,
  }));
  await prisma.patient.createMany({ data: rows });
  const patients = await prisma.patient.findMany({ select: { id: true }, take: PATIENTS });
  await prisma.patientPractice.createMany({
    data: patients.map((p) => ({ patientId: p.id, practiceId: practice.id })),
  });
  const base = Date.now() + 24 * 3600_000;
  await prisma.appointment.createMany({
    data: Array.from({ length: APPTS }, (_, i) => ({
      organisationId: org.id,
      practiceId: practice.id,
      patientId: patients[i % patients.length].id,
      practitionerUserId: dentist.id,
      startsAt: new Date(base + i * 30 * 60_000),
      endsAt: new Date(base + (i + 1) * 30 * 60_000),
    })),
  });
  process.stdout.write(
    JSON.stringify({
      org: org.id,
      practice: practice.id,
      patients: PATIENTS,
      appointments: APPTS,
      owner: owner.email,
      password: PASSWORD,
    }),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
