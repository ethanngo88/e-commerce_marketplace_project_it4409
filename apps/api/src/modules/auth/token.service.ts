import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AccessTokenPayload, AuthUser } from '../../common/auth/auth-user';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  /** Chuỗi gốc: chỉ gửi cho client qua cookie, không lưu ở đâu khác. */
  token: string;
  expiresAt: Date;
}

export function invalidRefreshToken(): AppException {
  return new AppException(
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    HttpStatus.UNAUTHORIZED,
  );
}

/** Database chỉ lưu SHA-256 của refresh token (doc 03 mục 6.1). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Access token (JWT, 15 phút) và refresh token (chuỗi ngẫu nhiên, 7 ngày, xoay vòng).
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshTtlMs =
      config.get<number>('REFRESH_TOKEN_EXPIRES_DAYS', 7) * DAY_MS;
  }

  signAccessToken(user: AuthUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };
    return this.jwt.signAsync(payload);
  }

  async issueRefreshToken(
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await db.refreshToken.create({
      data: { userId, tokenHash: hashRefreshToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  /**
   * Xoay vòng (FR-AUTH-04): thu hồi token đang dùng và cấp token mới.
   *
   * Token đã bị thu hồi mà vẫn được gửi lên nghĩa là nó đã lọt ra ngoài (ai đó đã
   * dùng nó trước). Khi đó thu hồi mọi refresh token của user, buộc đăng nhập lại.
   */
  async rotateRefreshToken(
    token: string | undefined,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    if (!token) {
      throw invalidRefreshToken();
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
    });
    if (!stored) {
      throw invalidRefreshToken();
    }
    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      this.logger.warn(
        `Revoked refresh token reused for user ${stored.userId}; all sessions revoked`,
      );
      throw invalidRefreshToken();
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw invalidRefreshToken();
    }

    const refresh = await this.prisma.$transaction(async (tx) => {
      // Điều kiện `revokedAt: null` khiến hai request dùng cùng token cùng lúc
      // chỉ có một request thu hồi được; request còn lại bị coi là dùng lại.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) {
        return null;
      }
      return this.issueRefreshToken(stored.userId, tx);
    });

    if (!refresh) {
      await this.revokeAllForUser(stored.userId);
      throw invalidRefreshToken();
    }
    return { userId: stored.userId, refresh };
  }

  /** Đăng xuất (FR-AUTH-05). Token không tồn tại hoặc đã thu hồi thì bỏ qua. */
  async revokeRefreshToken(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Dùng khi phát hiện token bị dùng lại, và khi Admin khóa tài khoản (T-22). */
  async revokeAllForUser(
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
