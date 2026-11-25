import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AuthUser, Role } from '../../common/auth/auth-user';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { Prisma, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfileDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  invalidRefreshToken,
  IssuedRefreshToken,
  TokenService,
} from './token.service';

/** Các cột đọc ra cho đối tượng `user`; không có `passwordHash`. */
const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  status: true,
  userRoles: { select: { role: { select: { name: true } } } },
  seller: { select: { status: true } },
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface AuthSession {
  user: UserProfileDto;
  accessToken: string;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  private readonly bcryptRounds: number;
  /**
   * Hash giả để so sánh khi email không tồn tại, nhờ vậy thời gian phản hồi giống
   * trường hợp sai mật khẩu và không lộ email nào đã đăng ký.
   */
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    config: ConfigService,
  ) {
    this.bcryptRounds = config.get<number>('BCRYPT_ROUNDS', 10);
    this.dummyPasswordHash = bcrypt.hash(
      randomBytes(16).toString('hex'),
      this.bcryptRounds,
    );
  }

  /** UC-01: tạo tài khoản role CUSTOMER và đăng nhập luôn. */
  async register(dto: RegisterDto): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw emailAlreadyExists();
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    let user: UserRecord;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const customerRole = await tx.role.findUnique({
          where: { name: Role.CUSTOMER },
        });
        if (!customerRole) {
          throw new Error(
            'Bảng roles chưa có CUSTOMER. Chạy `npx prisma db seed` để tạo roles.',
          );
        }
        return tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            userRoles: { create: { roleId: customerRole.id } },
          },
          select: USER_SELECT,
        });
      });
    } catch (error) {
      // Hai request đăng ký cùng email gửi đồng thời: request sau vi phạm unique.
      if (isUniqueViolation(error)) {
        throw emailAlreadyExists();
      }
      throw error;
    }

    return this.startSession(user);
  }

  /** UC-02. Sai email hay sai mật khẩu đều trả cùng một lỗi (doc 05 mục 3). */
  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...USER_SELECT, passwordHash: true },
    });

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyPasswordHash),
    );
    if (!user || !passwordMatches) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email hoặc mật khẩu không đúng',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // Kiểm tra sau mật khẩu, để người không biết mật khẩu không dò được tài khoản nào bị khóa.
    if (user.status === UserStatus.BANNED) {
      throw new AppException(
        ErrorCode.ACCOUNT_BANNED,
        'Tài khoản của bạn đã bị khóa',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.startSession(user);
  }

  /** Cấp access token mới và xoay vòng refresh token. */
  async refresh(
    refreshToken: string | undefined,
  ): Promise<{ accessToken: string; refresh: IssuedRefreshToken }> {
    const { userId, refresh } =
      await this.tokens.rotateRefreshToken(refreshToken);

    const user = await this.findUser(userId);
    if (!user || user.status === UserStatus.BANNED) {
      await this.tokens.revokeAllForUser(userId);
      throw invalidRefreshToken();
    }

    // Access token mới mang role hiện tại, ví dụ SELLER sau khi được duyệt.
    const accessToken = await this.tokens.signAccessToken(toAuthUser(user));
    return { accessToken, refresh };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    await this.tokens.revokeRefreshToken(refreshToken);
  }

  async me(userId: string): Promise<UserProfileDto> {
    const user = await this.findUser(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return toProfile(user);
  }

  private findUser(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  private async startSession(user: UserRecord): Promise<AuthSession> {
    const accessToken = await this.tokens.signAccessToken(toAuthUser(user));
    const refresh = await this.tokens.issueRefreshToken(user.id);
    return { user: toProfile(user), accessToken, refresh };
  }
}

function rolesOf(user: UserRecord): Role[] {
  return user.userRoles.map(({ role }) => role.name as Role);
}

function toAuthUser(user: UserRecord): AuthUser {
  return { id: user.id, email: user.email, roles: rolesOf(user) };
}

function toProfile(user: UserRecord): UserProfileDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    roles: rolesOf(user),
    sellerStatus: user.seller?.status ?? null,
  };
}

function emailAlreadyExists(): AppException {
  return new AppException(
    ErrorCode.EMAIL_ALREADY_EXISTS,
    'Email đã được sử dụng',
    HttpStatus.CONFLICT,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
