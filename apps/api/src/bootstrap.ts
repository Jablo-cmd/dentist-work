import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { noStore } from './common/no-store.middleware';
import type { Env } from './config/env';
import { APP_VERSION } from './version';

export function buildOpenApi(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Noordwyk DPMS API')
    .setDescription(
      'Foundation API. Only endpoints listed here exist; planned modules are in docs/.',
    )
    .setVersion(APP_VERSION)
    .addCookieAuth('dpms_session')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Shared by main.ts and the integration tests so both exercise identical wiring. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.trustProxyHops);
  app.disable('x-powered-by');

  const strict = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: env.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
  });
  const docs = helmet({ strictTransportSecurity: false });
  app.use((req: { path: string }, res: unknown, next: () => void) =>
    (env.swaggerEnabled && req.path.startsWith('/api/docs') ? docs : strict)(
      req as never,
      res as never,
      next as never,
    ),
  );

  app.enableCors({
    origin: env.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.use(noStore);
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (env.swaggerEnabled)
    SwaggerModule.setup('api/docs', app, buildOpenApi(app), {
      jsonDocumentUrl: 'api/docs/openapi.json',
    });
}
