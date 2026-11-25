import { SetMetadata } from '@nestjs/common';
import type { Role } from '../auth/auth-user';

export const ROLES_KEY = 'auth:roles';

/**
 * Chỉ cho phép người dùng có ít nhất một trong các role đã nêu, ví dụ
 * `@Roles(Role.ADMIN)`. Sai role thì nhận 403 `FORBIDDEN`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
