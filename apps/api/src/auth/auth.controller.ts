import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  changePasswordRequestSchema,
  type ChangePasswordRequest,
  loginRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type CurrentUser,
  mfaConfirmRequestSchema,
  mfaDisableRequestSchema,
  mfaVerifyRequestSchema,
  type MfaConfirmResponse,
  type MfaDisableRequest,
  type MfaEnrolResponse,
  type MfaVerifyRequest,
} from '@dpms/contracts';
import { toOpenApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Inject } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import type { AppRequest, Principal } from './auth.types';
import {
  AllowPasswordChangePending,
  AuthenticatedOnly,
  CurrentPrincipal,
  Public,
} from './decorators';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private startSession(res: Response, token: string, expiresAt: Date): void {
    res.cookie(this.sessions.cookieName, token, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Password sign-in. Returns a session cookie, or an MFA challenge when a second factor is enrolled',
  })
  @ApiBody({ schema: toOpenApi(loginRequestSchema) })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const r = await this.auth.login(body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (r.kind === 'mfa') return { mfaRequired: true, challenge: r.challenge };
    this.startSession(res, r.token, r.expiresAt);
    return { user: r.user };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete sign-in with an authenticator code or a one-time recovery code',
  })
  @ApiBody({ schema: toOpenApi(mfaVerifyRequestSchema) })
  async verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: CurrentUser }> {
    const r = await this.auth.verifyMfa(body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.startSession(res, r.token, r.expiresAt);
    return { user: r.user };
  }

  @AuthenticatedOnly()
  @AllowPasswordChangePending()
  @Post('mfa/enrol')
  @HttpCode(200)
  @ApiOperation({ summary: 'Begin authenticator enrolment (returns the shared secret once)' })
  enrol(@CurrentPrincipal() p: Principal, @Req() req: AppRequest): Promise<MfaEnrolResponse> {
    return this.mfa.startEnrolment(p, { requestId: req.id, ip: req.ip });
  }

  @AuthenticatedOnly()
  @AllowPasswordChangePending()
  @Post('mfa/confirm')
  @HttpCode(200)
  @ApiBody({ schema: toOpenApi(mfaConfirmRequestSchema) })
  @ApiOperation({
    summary: 'Confirm enrolment with a code; returns one-time recovery codes (shown once)',
  })
  confirm(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(mfaConfirmRequestSchema)) body: { code: string },
    @Req() req: AppRequest,
  ): Promise<MfaConfirmResponse> {
    return this.mfa.confirmEnrolment(p, body.code, { requestId: req.id, ip: req.ip });
  }

  @AuthenticatedOnly()
  @Post('mfa/disable')
  @HttpCode(204)
  @ApiBody({ schema: toOpenApi(mfaDisableRequestSchema) })
  @ApiOperation({ summary: 'Disable the second factor (needs password and a current code)' })
  async disable(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(mfaDisableRequestSchema)) body: MfaDisableRequest,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.mfa.disable(p, body, { requestId: req.id, ip: req.ip });
  }

  @AuthenticatedOnly()
  @AllowPasswordChangePending()
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
  @AllowPasswordChangePending()
  @Get('me')
  @ApiOperation({ summary: 'Current user, assignments and effective permissions' })
  me(@CurrentPrincipal() p: Principal): { user: CurrentUser } {
    const { sessionId: _s, ...user } = p;
    return { user };
  }

  @AuthenticatedOnly()
  @AllowPasswordChangePending()
  @Post('change-password')
  @HttpCode(204)
  @ApiBody({ schema: toOpenApi(changePasswordRequestSchema) })
  @ApiOperation({ summary: 'Change own password; other sessions are revoked' })
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @CurrentPrincipal() p: Principal,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.auth.changePassword(p, body, { requestId: req.id, ip: req.ip });
  }
}
