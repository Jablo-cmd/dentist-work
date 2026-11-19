import { PrismaClient } from '@prisma/client';
import { runPatientImport } from '../src/migration/patient-import';
import { TEST_DATABASE_URL, resetAndSeed, type Fixtures } from './helpers';

const CSV = [
  'firstName,lastName,dateOfBirth,mobilePhone,idNumber',
  'Imp,Synthetica,1991-01-01,082 000 0010,',
  'Port,Synthetica,1992-02-02,,',
  'Bad,Synthetica,not-a-date,,',
  'Imp,Synthetica,1991-01-01,,', // in-file duplicate of row 2
  'Exi,Synthetica,1980-08-08,,', // matches an existing patient (seeded below)
].join('\n');

describe('patient import (integration)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    await prisma.patient.create({
      data: {
        organisationId: fx.orgId,
        registeringPracticeId: fx.practiceA,
        firstName: 'Existing',
        lastName: 'Synthetica',
        dateOfBirth: new Date('1980-08-08'),
        practices: { create: { practiceId: fx.practiceA } },
      },
    });
  });
  afterAll(async () => prisma.$disconnect());

  it('defaults to a dry run that writes nothing and reports what would happen', async () => {
    const r = await runPatientImport(prisma, {
      csvText: CSV,
      practiceCode: 'SYN-A',
      commit: false,
      operator: 'test',
    });
    expect(r).toMatchObject({ mode: 'dry-run', sourceRows: 5, clean: 2, inserted: 0 });
    expect(r.invalid).toEqual([{ row: 4, fields: ['dateOfBirth'] }]);
    expect(r.duplicatesInFile).toHaveLength(1);
    expect(r.possibleDuplicatesOfExisting).toHaveLength(1);
    expect(r.heldForReview).toEqual([4, 5, 6]);
    expect(await prisma.patient.count()).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/Synthetica|Imp|Port|082/);
  });

  it('commits only clean rows atomically, audits the import, and is safe to re-run', async () => {
    const r = await runPatientImport(prisma, {
      csvText: CSV,
      practiceCode: 'SYN-A',
      commit: true,
      operator: 'test',
    });
    expect(r.inserted).toBe(2);
    expect(await prisma.patient.count()).toBe(3);
    expect(await prisma.patientPractice.count({ where: { practiceId: fx.practiceA } })).toBe(3);
    expect(await prisma.auditEvent.count({ where: { action: 'migration.patient_import' } })).toBe(
      1,
    );
    const again = await runPatientImport(prisma, {
      csvText: CSV,
      practiceCode: 'SYN-A',
      commit: true,
      operator: 'test',
    });
    expect(again.inserted).toBe(0); // previously imported rows are now held, not duplicated
    expect(await prisma.patient.count()).toBe(3);
  });

  it('rejects unknown or inactive practices', async () => {
    await expect(
      runPatientImport(prisma, {
        csvText: CSV,
        practiceCode: 'NOPE',
        commit: true,
        operator: 'test',
      }),
    ).rejects.toThrow(/Practice code/);
  });
});
