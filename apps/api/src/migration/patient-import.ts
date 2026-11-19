import { z } from 'zod';
import { patientDetailsShape } from '@dpms/contracts';
import type { PrismaClient } from '@prisma/client';
import { parseCsv } from './csv';

const rowSchema = z
  .object(patientDetailsShape)
  .extend({ sex: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).default('UNSPECIFIED') });
export type ImportRow = z.infer<typeof rowSchema>;

export const REQUIRED_COLUMNS = ['firstName', 'lastName', 'dateOfBirth'] as const;
export const KNOWN_COLUMNS = Object.keys(patientDetailsShape);

/**
 * Reconciliation report. It contains counts, row numbers and field NAMES only — never patient
 * values — so it is safe to store and share under the same controls as any operational log.
 */
export interface ImportReport {
  mode: 'dry-run' | 'commit';
  sourceRows: number;
  valid: number;
  invalid: { row: number; fields: string[] }[];
  duplicatesInFile: { row: number; sameAsRow: number; reason: string }[];
  possibleDuplicatesOfExisting: { row: number; reason: string }[];
  /** Rows that are valid and have no duplicate signal: the only rows ever inserted. */
  clean: number;
  inserted: number;
  /** Row numbers needing human review (never auto-merged, never auto-inserted). */
  heldForReview: number[];
}

export interface Parsed {
  rows: { row: number; data: ImportRow }[];
  report: Omit<
    ImportReport,
    'mode' | 'inserted' | 'possibleDuplicatesOfExisting' | 'clean' | 'heldForReview'
  >;
}

export function parseAndValidate(csvText: string): Parsed {
  const table = parseCsv(csvText);
  if (table.length === 0) throw new Error('The file is empty.');
  const header = table[0]!.map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  const unknown = header.filter((h) => !KNOWN_COLUMNS.includes(h));
  if (unknown.length) throw new Error(`Unknown column(s): ${unknown.join(', ')}`);

  const rows: Parsed['rows'] = [];
  const invalid: Parsed['report']['invalid'] = [];
  const duplicatesInFile: Parsed['report']['duplicatesInFile'] = [];
  const byId = new Map<string, number>();
  const byNameDob = new Map<string, number>();

  table.slice(1).forEach((cells, idx) => {
    const row = idx + 2; // 1-based, counting the header as row 1
    const raw: Record<string, string> = {};
    header.forEach((h, i) => {
      const v = (cells[i] ?? '').trim();
      if (v !== '') raw[h] = v;
    });
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      invalid.push({
        row,
        fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'row')))],
      });
      return;
    }
    const d = parsed.data;
    const nameKey = `${d.lastName.toLowerCase()}|${d.dateOfBirth}|${d.firstName[0]!.toLowerCase()}`;
    const idKey = d.idNumber ?? '';
    const prior = (idKey && byId.get(idKey)) || byNameDob.get(nameKey);
    if (prior) {
      duplicatesInFile.push({
        row,
        sameAsRow: prior,
        reason:
          idKey && byId.has(idKey)
            ? 'same ID number'
            : 'same surname, first initial and date of birth',
      });
    } else {
      if (idKey) byId.set(idKey, row);
      byNameDob.set(nameKey, row);
      rows.push({ row, data: d });
    }
  });
  return {
    rows,
    report: {
      sourceRows: table.length - 1,
      valid: rows.length + duplicatesInFile.length,
      invalid,
      duplicatesInFile,
    },
  };
}

/**
 * Validates a patient CSV and, only with `commit`, inserts the rows that are valid AND show no
 * duplicate signal (in the file or in the existing organisation data). Everything else is
 * reported for human review. Re-running is safe: previously imported rows now match existing
 * patients and are held rather than inserted again.
 */
export async function runPatientImport(
  prisma: PrismaClient,
  opts: { csvText: string; practiceCode: string; commit: boolean; operator: string },
): Promise<ImportReport> {
  const practice = await prisma.practice.findFirst({
    where: { code: opts.practiceCode, isActive: true },
  });
  if (!practice) throw new Error('Practice code not found or inactive.');
  const { rows, report } = parseAndValidate(opts.csvText);

  const possible: ImportReport['possibleDuplicatesOfExisting'] = [];
  const clean: typeof rows = [];
  for (const r of rows) {
    const d = r.data;
    const or: object[] = [
      {
        dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00Z`),
        lastName: { equals: d.lastName, mode: 'insensitive' },
      },
    ];
    if (d.idNumber) or.push({ idNumber: d.idNumber });
    const hit = await prisma.patient.findFirst({
      where: { organisationId: practice.organisationId, OR: or },
    });
    if (hit)
      possible.push({
        row: r.row,
        reason:
          d.idNumber && hit.idNumber === d.idNumber
            ? 'same ID number as an existing patient'
            : 'same surname and date of birth as an existing patient',
      });
    else clean.push(r);
  }

  let inserted = 0;
  if (opts.commit && clean.length) {
    await prisma.$transaction(async (tx) => {
      for (const r of clean) {
        const { ...d } = r.data;
        await tx.patient.create({
          data: {
            ...d,
            dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00Z`),
            organisationId: practice.organisationId,
            registeringPracticeId: practice.id,
            practices: { create: { practiceId: practice.id } },
          },
        });
        inserted++;
      }
      await tx.auditEvent.create({
        data: {
          action: 'migration.patient_import',
          outcome: 'SUCCESS',
          organisationId: practice.organisationId,
          practiceId: practice.id,
          metadata: { operator: opts.operator, inserted, sourceRows: report.sourceRows },
        },
      });
    });
  }
  const held = [
    ...report.invalid.map((x) => x.row),
    ...report.duplicatesInFile.map((x) => x.row),
    ...possible.map((x) => x.row),
  ].sort((a, b) => a - b);
  return {
    mode: opts.commit ? 'commit' : 'dry-run',
    ...report,
    possibleDuplicatesOfExisting: possible,
    clean: clean.length,
    inserted,
    heldForReview: held,
  };
}
