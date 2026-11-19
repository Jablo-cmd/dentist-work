import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppointmentsModule } from './appointments/appointments.module';
import { ClinicalModule } from './clinical/clinical.module';
import { ImagingModule } from './imaging/imaging.module';
import { ScannerModule } from './scanner/scanner.module';
import { StorageModule } from './storage/storage.module';
import { BillingModule } from './billing/billing.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, OriginGuard, PermissionsGuard } from './auth/guards';
import { buildPinoHttpOptions } from './common/logging';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { PatientsModule } from './patients/patients.module';
import { PracticesModule } from './practices/practices.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        forRoutes: ['{*splat}'],
        pinoHttp: buildPinoHttpOptions(env.logLevel),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: env.rateLimitPerMinute },
          {
            name: 'login',
            ttl: 60_000,
            limit: env.loginRateLimitPerMinute,
            // Credential-guessing surfaces: password sign-in and second-factor verification.
            skipIf: (ctx) =>
              !/\/auth\/(login|mfa\/verify)$/.test(
                (ctx.switchToHttp().getRequest<{ originalUrl: string }>().originalUrl ?? '').split(
                  '?',
                )[0]!,
              ),
          },
        ],
      }),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    PracticesModule,
    PatientsModule,
    AppointmentsModule,
    ClinicalModule,
    StorageModule,
    ScannerModule,
    ImagingModule,
    BillingModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit -> origin (CSRF) -> authenticate -> authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
