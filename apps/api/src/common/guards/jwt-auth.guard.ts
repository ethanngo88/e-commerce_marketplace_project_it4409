import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AccessTokenPayload,
  AuthenticatedRequest,
  Role,
} from '../auth/auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const KNOWN_ROLES = new Set<string>(Object.values(Role));

/**
 * Guard toàn cục (đăng ký trong AppModule): mọi route cần header
 * `Authorization: Bearer <accessToken>`, trừ route có `@Public()`.
 * Token thiếu, sai chữ ký hoặc hết hạn đều trả 401 `UNAUTHORIZED`; frontend
 * khi đó gọi `POST /api/auth/refresh` rồi thử lại.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: Partial<AccessTokenPayload>;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      !Array.isArray(payload.roles)
    ) {
      throw new UnauthorizedException();
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles.filter((role): role is Role =>
        KNOWN_ROLES.has(role),
      ),
    };
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
