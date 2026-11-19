/**
 * Operator tool: validate and (optionally) import patients from a CSV.
 *
 *   node dist/cli/import-patients.js <file.csv> --practice-code CODE [--commit] [--operator "Name"]
 *
 * Defaults to a DRY RUN. Prints a reconciliation report (counts, row numbers, field names only).
 * Only run against production with documented authorisation and safeguards (docs/16, docs/05).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { runPatientImport } from '../migration/patient-import';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find(
    (a) =>
      !a.startsWith('--') &&
      args[args.indexOf(a) - 1] !== '--practice-code' &&
      args[args.indexOf(a) - 1] !== '--operator',
  );
  const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const practiceCode = flag('--practice-code');
  if (!file || !practiceCode) {
    console.error(
      'Usage: import-patients <file.csv> --practice-code CODE [--commit] [--operator "Name"]',
    );
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const report = await runPatientImport(prisma, {
      csvText: readFileSync(file, 'utf8'),
      practiceCode,
      commit: args.includes('--commit'),
      operator: flag('--operator') ?? 'unspecified',
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.mode === 'dry-run')
      console.error(
        '\nDRY RUN — nothing was written. Re-run with --commit to insert the clean rows.',
      );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'import failed');
  process.exit(1);
});
