import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, Role } from '../auth/auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard toàn cục, chạy sau `JwtAuthGuard`: route có `@Roles(...)` chỉ cho người
 * dùng có ít nhất một role trong danh sách; sai role trả 403 `FORBIDDEN`.
 * Route không có `@Roles` thì chỉ cần đăng nhập.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      // Route vừa @Public() vừa @Roles(): coi như chưa đăng nhập.
      throw new UnauthorizedException();
    }
    if (requiredRoles.some((role) => user.roles.includes(role))) {
      return true;
    }
    throw new ForbiddenException();
  }
}
