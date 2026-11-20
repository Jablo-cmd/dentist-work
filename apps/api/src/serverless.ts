import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

/**
 * Vercel Functions entry. The same wiring as main.ts (configureApp), initialised once per warm instance
 * and then handed requests as a plain Node (req, res) handler. No listen(): Vercel owns the socket.
 * Background timers (e.g. malware-scan retries) are not reliable in a function; with no scanner configured
 * uploads simply stay quarantined (fail closed).
 */
let ready: Promise<(req: IncomingMessage, res: ServerResponse) => void> | undefined;

async function init(): Promise<(req: IncomingMessage, res: ServerResponse) => void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app, env);
  await app.init();
  const server = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;
  return server;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= init();
  try {
    (await ready)(req, res);
  } catch (err) {
    ready = undefined; // let the next request retry initialisation
    console.error('API initialisation failed', err instanceof Error ? err.message : err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      }),
    );
  }
}
