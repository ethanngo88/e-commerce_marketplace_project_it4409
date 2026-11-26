import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum ProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  BEST_SELLING = 'best_selling',
  RATING = 'rating',
}

/**
 * Chuẩn hóa chuỗi query rỗng thành `undefined` để tránh lỗi `@Type(() => Number)`
 * tự ép `""` thành `0` (bài học doc 10 mục 3.1).
 */
function trimOrUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Ép query string sang số chỉ khi khác rỗng; chuỗi không hợp lệ giữ `NaN`
 * để `class-validator` báo lỗi `400 VALIDATION_ERROR`.
 */
function parseOptionalNumber(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    return Number(trimmed);
  }
  return value;
}

/**
 * Ép query string sang boolean một cách tường minh: tránh `@Type(() => Boolean)`
 * của class-transformer vì `Boolean("false") === true`.
 */
function parseOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return undefined;
    }
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return value;
}

export class QueryProductsDto {
  @ApiPropertyOptional({
    description:
      'Từ khóa tìm kiếm trên tên sản phẩm (không phân biệt hoa thường và dấu)',
    maxLength: 100,
    example: 'ao thun',
  })
  @Transform(({ value }: { value: unknown }) => trimOrUndefined(value))
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Từ khóa tìm kiếm tối đa 100 ký tự' })
  q?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo slug danh mục (bao gồm cả danh mục con)',
    example: 'thoi-trang-nam',
  })
  @Transform(({ value }: { value: unknown }) => trimOrUndefined(value))
  @IsOptional()
  @IsString({ message: 'categorySlug phải là chuỗi ký tự' })
  @MaxLength(150, { message: 'categorySlug tối đa 150 ký tự' })
  categorySlug?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo slug của store',
    example: 'minh-an-fashion',
  })
  @Transform(({ value }: { value: unknown }) => trimOrUndefined(value))
  @IsOptional()
  @IsString({ message: 'storeSlug phải là chuỗi ký tự' })
  @MaxLength(255, { message: 'storeSlug tối đa 255 ký tự' })
  storeSlug?: string;

  @ApiPropertyOptional({
    description: 'Giá tối thiểu (VND, so với minPrice của sản phẩm)',
    minimum: 0,
    example: 100000,
  })
  @Transform(({ value }: { value: unknown }) => parseOptionalNumber(value))
  @IsOptional()
  @IsInt({ message: 'minPrice phải là số nguyên' })
  @Min(0, { message: 'minPrice không được âm' })
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Giá tối đa (VND, so với minPrice của sản phẩm)',
    minimum: 0,
    example: 500000,
  })
  @Transform(({ value }: { value: unknown }) => parseOptionalNumber(value))
  @IsOptional()
  @IsInt({ message: 'maxPrice phải là số nguyên' })
  @Min(0, { message: 'maxPrice không được âm' })
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Rating trung bình tối thiểu (1–5)',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @Transform(({ value }: { value: unknown }) => parseOptionalNumber(value))
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'minRating phải là số hợp lệ' },
  )
  @Min(1, { message: 'minRating tối thiểu là 1' })
  @Max(5, { message: 'minRating tối đa là 5' })
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Chỉ lấy sản phẩm còn hàng (true)',
    example: true,
  })
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsOptional()
  @IsBoolean({ message: 'inStock phải là true hoặc false' })
  inStock?: boolean;

  @ApiPropertyOptional({
    enum: ProductSort,
    default: ProductSort.NEWEST,
    description: 'Kiểu sắp xếp',
  })
  @Transform(({ value }: { value: unknown }) => {
    const cleaned = trimOrUndefined(value);
    return cleaned === undefined ? ProductSort.NEWEST : cleaned;
  })
  @IsOptional()
  @IsEnum(ProductSort, {
    message:
      'sort phải là một trong các giá trị: newest, price_asc, price_desc, best_selling, rating',
  })
  sort: ProductSort = ProductSort.NEWEST;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }: { value: unknown }) => {
    const parsed = parseOptionalNumber(value);
    return parsed === undefined ? 1 : parsed;
  })
  @IsOptional()
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }: { value: unknown }) => {
    const parsed = parseOptionalNumber(value);
    return parsed === undefined ? 20 : parsed;
  })
  @IsOptional()
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit: number = 20;
}
