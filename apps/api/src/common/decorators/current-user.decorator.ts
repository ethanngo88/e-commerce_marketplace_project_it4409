import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '../auth/auth-user';

/**
 * Lấy người dùng đang đăng nhập trong controller:
 * `me(@CurrentUser() user: AuthUser)` hoặc `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    return field ? user?.[field] : user;
  },
);
