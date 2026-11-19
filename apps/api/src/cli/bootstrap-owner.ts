/**
 * One-off administrative command: creates the organisation (if absent) and its first
 * Organisation Owner. Password is read from the DPMS_BOOTSTRAP_PASSWORD environment variable
 * (never a CLI argument, so it does not land in shell history or process listings).
 *
 *   DPMS_BOOTSTRAP_PASSWORD='…' node dist/cli/bootstrap-owner.js "Organisation Name" owner@example.com "Display Name"
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loginRequestSchema } from '@dpms/contracts';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../auth/password.service';

async function main(): Promise<void> {
  const [orgName, emailRaw, displayName] = process.argv.slice(2);
  const password = process.env.DPMS_BOOTSTRAP_PASSWORD;
  if (!orgName || !emailRaw || !displayName || !password) {
    console.error(
      'Usage: DPMS_BOOTSTRAP_PASSWORD=… bootstrap-owner "<organisation>" <email> "<display name>"',
    );
    process.exit(2);
  }
  const email = loginRequestSchema.shape.email.parse(emailRaw);
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`);
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    if ((await prisma.user.count()) > 0) {
      console.error(
        'Refusing to bootstrap: users already exist. Use the application to manage users.',
      );
      process.exit(3);
    }
    const passwordHash = await hashPassword(password);
    const owner = await prisma.$transaction(async (tx) => {
      const org =
        (await tx.organisation.findFirst()) ??
        (await tx.organisation.create({ data: { name: orgName } }));
      const user = await tx.user.create({
        data: {
          organisationId: org.id,
          email,
          displayName,
          passwordHash,
          roleAssignments: { create: { role: 'ORGANISATION_OWNER', practiceId: null } },
        },
      });
      await tx.auditEvent.create({
        data: {
          action: 'user.bootstrap_owner',
          outcome: 'SUCCESS',
          actorUserId: user.id,
          organisationId: org.id,
          targetType: 'user',
          targetId: user.id,
          metadata: { via: 'cli' },
        },
      });
      return user;
    });
    console.log(`Created Organisation Owner ${owner.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'bootstrap failed');
  process.exit(1);
});
