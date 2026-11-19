import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  loginRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type CurrentUser,
} from '@dpms/contracts';
import { toOpenApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Inject } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import type { AppRequest, Principal } from './auth.types';
import { AuthenticatedOnly, CurrentPrincipal, Public } from './decorators';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a session (sets an HttpOnly session cookie)' })
  @ApiBody({ schema: toOpenApi(loginRequestSchema) })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { user, token, expiresAt } = await this.auth.login(body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(this.sessions.cookieName, token, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
    return { user };
  }

  @AuthenticatedOnly()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentPrincipal() p: Principal,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(p.id, p.sessionId, { requestId: req.id, ip: req.ip });
    res.clearCookie(this.sessions.cookieName, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'lax',
      path: '/',
    });
  }

  @AuthenticatedOnly()
  @Get('me')
  @ApiOperation({ summary: 'Current user, assignments and effective permissions' })
  me(@CurrentPrincipal() p: Principal): { user: CurrentUser } {
    const { sessionId: _s, ...user } = p;
    return { user };
  }
}
