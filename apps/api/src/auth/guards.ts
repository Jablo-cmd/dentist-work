import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CodedHttpException } from '../common/http-exception.filter';
import { ENV, type Env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { hasPermission } from '../access/permissions';
import type { AppRequest } from './auth.types';
import {
  ALLOW_PASSWORD_CHANGE_PENDING,
  AUTHENTICATED_ONLY,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
  type PermissionRequirement,
} from './decorators';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): every state-changing request must
 * carry an Origin (or Referer) matching an allow-listed web origin. Applies to public routes too
 * (login CSRF). Non-browser clients must set a trusted Origin explicitly.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (!origin || !this.env.webOrigins.includes(origin)) {
      throw new CodedHttpException(
        HttpStatus.FORBIDDEN,
        'CSRF_REJECTED',
        'Request origin not allowed.',
      );
    }
    return true;
  }
}

/** Resolves the session cookie to a principal. Public routes skip the requirement, not the lookup. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<AppRequest>();
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[
      this.sessions.cookieName
    ];
    if (!token || token.length > 200) throw new UnauthorizedException();
    const principal = await this.sessions.resolve(token);
    if (!principal) throw new UnauthorizedException();
    req.principal = principal;
    return true;
  }
}

/** Deny-by-default authorisation: a route must opt in via Public, AuthenticatedOnly or RequirePermission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (
      req.principal?.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING, targets)
    ) {
      throw new CodedHttpException(
        HttpStatus.FORBIDDEN,
        'PASSWORD_CHANGE_REQUIRED',
        'Password change required.',
      );
    }
    const required = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    if (!required) {
      if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY, targets) && req.principal)
        return true;
      throw new ForbiddenException(); // undeclared route => denied
    }
    const p = req.principal;
    if (p && hasPermission(p.assignments, required.permission, { orgWide: required.orgWide }))
      return true;
    await this.audit.recordBestEffort({
      action: 'access.denied',
      outcome: 'DENIED',
      actorUserId: p?.id,
      organisationId: p?.organisationId,
      requestId: req.id,
      ipAddress: req.ip,
      metadata: { permission: required.permission },
    });
    throw new ForbiddenException();
  }
}
