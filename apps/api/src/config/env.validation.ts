import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class EnvironmentVariables {
  @Transform(emptyStringToUndefined)
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  API_PORT: number = 4000;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(32)
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  REFRESH_TOKEN_EXPIRES_DAYS: number = 7;

  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @IsOptional()
  BCRYPT_ROUNDS: number = 10;

  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  PAYMENT_EXPIRES_MINUTES: number = 15;

  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  SHIPPING_FEE_PER_SELLER_ORDER: number = 30000;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

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
