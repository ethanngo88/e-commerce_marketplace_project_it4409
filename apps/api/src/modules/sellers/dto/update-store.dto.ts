import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../common/validators/is-optional-not-null.decorator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Minh An Official' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Tên cửa hàng không hợp lệ' })
  @Length(2, 255, { message: 'Tên cửa hàng phải dài 2–255 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 'Cửa hàng chính hãng', nullable: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString({ message: 'Mô tả cửa hàng không hợp lệ' })
  @MaxLength(2000, { message: 'Mô tả cửa hàng tối đa 2000 ký tự' })
  description?: string | null;
}

export enum AdminSellerTargetStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateSellerStatusDto {
  @ApiProperty({ enum: AdminSellerTargetStatus })
  @IsEnum(AdminSellerTargetStatus, {
    message: 'Trạng thái phải là APPROVED, REJECTED hoặc SUSPENDED',
  })
  status!: AdminSellerTargetStatus;

  @ApiPropertyOptional({
    description: 'Bắt buộc khi từ chối (REJECTED) hoặc tạm ngưng (SUSPENDED)',
    example: 'Thiếu giấy phép kinh doanh hợp lệ',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? undefined : t;
  })
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Lý do tối đa 1000 ký tự' })
  reason?: string;
}

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class SellerStatsRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Ngày bắt đầu (YYYY-MM-DD)',
  })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsDateString({}, { message: 'from phải là ngày hợp lệ theo chuẩn ISO 8601' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Ngày kết thúc (YYYY-MM-DD)',
  })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsDateString({}, { message: 'to phải là ngày hợp lệ theo chuẩn ISO 8601' })
  to?: string;
}

export class SellerRevenueQueryDto {
  @ApiProperty({ example: '2026-11-01' })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsDateString({}, { message: 'from phải là ngày hợp lệ theo chuẩn ISO 8601' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsDateString({}, { message: 'to phải là ngày hợp lệ theo chuẩn ISO 8601' })
  to!: string;
}

export class SellerTopProductsQueryDto extends SellerStatsRangeQueryDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 50 })
  @Transform(({ value }: { value: unknown }) => {
    const cleaned = emptyToUndefined(value);
    if (cleaned === undefined) return 5;
    return typeof cleaned === 'string' ? Number(cleaned) : cleaned;
  })
  @IsOptional()
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit: number = 5;
}
