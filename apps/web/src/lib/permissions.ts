import type { CurrentUser, Permission } from '@dpms/contracts';

/** UI-only convenience. The API enforces every permission independently. */
export const can = (user: CurrentUser, permission: Permission): boolean =>
  user.permissions.includes(permission);
