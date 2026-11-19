import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Liveness, Readiness } from '@dpms/contracts';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { APP_VERSION } from '../version';

const DB_TIMEOUT_MS = 2000;

@ApiTags('health')
@Public()
@SkipThrottle({ default: true, login: true })
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: process is running. Never touches dependencies. */
  @Get()
  live(): Liveness {
    return {
      status: 'ok',
      service: 'dpms-api',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: database reachable. 503 when not, so orchestrators stop routing traffic. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const started = Date.now();
    let up = false;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS).unref(),
        ),
      ]);
      up = true;
    } catch {
      up = false; // details deliberately not exposed
    }
    if (!up) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: up ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: up ? 'up' : 'down', latencyMs: up ? Date.now() - started : null },
      },
    };
  }
}
