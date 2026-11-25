import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  API_PORT: number = 4000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  /**
   * Số reverse proxy đứng trước API (production sau Caddy: 1). Express chỉ tin
   * header X-Forwarded-For qua đúng số proxy này khi xác định IP của client,
   * và rate limit dựa vào IP đó. Để 0 khi không có proxy, nếu không client có
   * thể tự đặt header để giả IP.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  TRUST_PROXY_HOPS: number = 0;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // Bắt buộc ở mọi môi trường: đăng nhập (T-10) cần khóa để ký access token.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  // Số kèm đơn vị: s (giây), m (phút), h (giờ), d (ngày). Ví dụ 15m.
  @Matches(/^\d+[smhd]$/, {
    message: 'JWT_ACCESS_EXPIRES_IN phải có dạng số + đơn vị, ví dụ 15m',
  })
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  REFRESH_TOKEN_EXPIRES_DAYS: number = 7;

  @Type(() => Number)
  @IsInt()
  @Min(4)
  @IsOptional()
  BCRYPT_ROUNDS: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  PAYMENT_EXPIRES_MINUTES: number = 15;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  SHIPPING_FEE_PER_SELLER_ORDER: number = 30000;
}

/**
 * Bỏ các biến để trống hoặc chỉ có khoảng trắng, để chúng nhận giá trị mặc định.
 * Nếu giữ lại, `@Type(() => Number)` đổi '' thành 0 trước mọi bước kiểm tra,
 * ví dụ `SHIPPING_FEE_PER_SELLER_ORDER=` sẽ thành phí ship 0đ.
 */
function withoutBlankValues(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  );
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    withoutBlankValues(config),
    {
      enableImplicitConversion: true,
      exposeDefaultValues: true,
    },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validatedConfig;
}
