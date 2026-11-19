/** Writes the generated OpenAPI document to stdout (used for docs/contract review). */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './../app.module';
import { buildOpenApi, configureApp } from '../bootstrap';
import { loadEnv } from '../config/env';

async function main(): Promise<void> {
  process.env.LOG_LEVEL = 'silent';
  const env = { ...loadEnv(), swaggerEnabled: false };
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app, env);
  await app.init();
  process.stdout.write(JSON.stringify(buildOpenApi(app), null, 2));
  await app.close();
}
void main();
