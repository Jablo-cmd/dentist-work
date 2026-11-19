import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, OriginGuard, PermissionsGuard } from './auth/guards';
import { genReqId } from './common/request-id';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { PracticesModule } from './practices/practices.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        forRoutes: ['{*splat}'],
        pinoHttp: {
          level: env.logLevel,
          genReqId,
          // Never log credentials. Request/response bodies are never logged at all.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            censor: '[redacted]',
          },
          serializers: {
            // Path only: query strings can carry identifiers or search terms.
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url.split('?')[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health') },
        },
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
            skipIf: (ctx) =>
              !(ctx.switchToHttp().getRequest<{ originalUrl: string }>().originalUrl ?? '')
                .split('?')[0]!
                .endsWith('/auth/login'),
          },
        ],
      }),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    PracticesModule,
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
