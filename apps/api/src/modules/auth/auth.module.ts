import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    // global: JwtAuthGuard (đăng ký toàn cục trong AppModule) cần JwtService.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          // Định dạng (ví dụ 15m) đã được kiểm tra trong env.validation.ts.
          expiresIn: config.get<string>(
            'JWT_ACCESS_EXPIRES_IN',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
        // Chỉ chấp nhận đúng thuật toán đã ký, chống đổi thuật toán trong header.
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  // TokenService được Admin (T-22) dùng để thu hồi token khi khóa tài khoản.
  exports: [TokenService],
})
export class AuthModule {}
