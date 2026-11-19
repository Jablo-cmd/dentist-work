import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@dpms/contracts';
import type { AppRequest, Principal } from './auth.types';

export const IS_PUBLIC = 'dpms:public';
export const AUTHENTICATED_ONLY = 'dpms:authenticated';
export const REQUIRED_PERMISSION = 'dpms:permission';

/** Route needs no session (login, health). Use sparingly; every use is a deliberate exposure. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs a valid session but no specific permission (e.g. "who am I", logout). */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY, true);

export interface PermissionRequirement {
  permission: Permission;
  orgWide: boolean;
}

/**
 * Route needs a permission. `orgWide: true` demands an organisation-wide grant.
 * Practice-scoped filtering for data in the handler is the service's responsibility.
 * Routes with none of Public / AuthenticatedOnly / RequirePermission are DENIED (see PermissionsGuard).
 */
export const RequirePermission = (permission: Permission, opts: { orgWide?: boolean } = {}) =>
  SetMetadata(REQUIRED_PERMISSION, {
    permission,
    orgWide: opts.orgWide ?? false,
  } satisfies PermissionRequirement);

export const CurrentPrincipal = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.principal) throw new Error('CurrentPrincipal used on an unauthenticated route');
  return req.principal satisfies Principal;
});
