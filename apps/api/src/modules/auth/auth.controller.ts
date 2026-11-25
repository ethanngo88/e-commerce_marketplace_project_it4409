import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { AuthService } from './auth.service';
import {
  AccessTokenResponseDto,
  AuthResponseDto,
  MeResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from './refresh-cookie';
import { IssuedRefreshToken } from './token.service';

/** Chống dò mật khẩu: tối đa 10 lần mỗi phút trên một IP (NFR-06). */
const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Đăng ký tài khoản Customer',
    description: 'Trả access token và đặt cookie refreshToken (httpOnly).',
  })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'EMAIL_ALREADY_EXISTS' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.auth.register(dto);
    this.setRefreshCookie(res, session.refresh);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập',
    description: 'Trả access token và đặt cookie refreshToken (httpOnly).',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 403, description: 'ACCOUNT_BANNED' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.auth.login(dto);
    this.setRefreshCookie(res, session.refresh);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lấy access token mới bằng cookie refreshToken, xoay vòng refresh token',
  })
  @ApiResponse({ status: 200, type: AccessTokenResponseDto })
  @ApiResponse({ status: 401, description: 'INVALID_REFRESH_TOKEN' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    try {
      const { accessToken, refresh } = await this.auth.refresh(
        readRefreshCookie(req),
      );
      this.setRefreshCookie(res, refresh);
      return { accessToken };
    } catch (error) {
      // Token hỏng thì xóa cookie, để trình duyệt không gửi lại token đó nữa.
      if (
        error instanceof AppException &&
        error.code === ErrorCode.INVALID_REFRESH_TOKEN
      ) {
        res.clearCookie(
          REFRESH_COOKIE_NAME,
          clearRefreshCookieOptions(this.isProduction),
        );
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thu hồi refresh token hiện tại và xóa cookie' })
  @ApiResponse({ status: 204 })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(
      REFRESH_COOKIE_NAME,
      clearRefreshCookieOptions(this.isProduction),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người đang đăng nhập' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return { user: await this.auth.me(user.id) };
  }

  private setRefreshCookie(res: Response, refresh: IssuedRefreshToken): void {
    res.cookie(
      REFRESH_COOKIE_NAME,
      refresh.token,
      refreshCookieOptions(this.isProduction, refresh.expiresAt),
    );
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
