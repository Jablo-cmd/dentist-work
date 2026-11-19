import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { EnvValidationError, loadEnv } from './config/env';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app, env);
  // Surface the effective MFA policy at startup so a misconfiguration is visible in the logs.
  app
    .get(Logger)
    .warn(
      `MFA policy: ${env.mfaPolicySource}; required roles: ${env.mfaRequiredRoles.join(',') || '(none)'}`,
    );
  await app.listen(env.port);
}

void main();
