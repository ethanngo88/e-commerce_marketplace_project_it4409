import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/client';
import { IsOptionalNotNull } from '../../../common/validators/is-optional-not-null.decorator';
import { MAX_PAGE } from '../../../common/pagination/paginated';

/** SKU: 1–50 ký tự gồm chữ, số, dấu gạch ngang (doc 05 mục 7.2). */
export const SKU_REGEX = /^[A-Za-z0-9-]+$/;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function trimOrUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
}

function parseOptionalInt(value: unknown, fallback: number): unknown {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return fallback;
    return Number(t);
  }
  return value;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'AT-DO-L', maxLength: 50 })
  @Transform(trimString)
  @IsString({ message: 'SKU không hợp lệ' })
  @Length(1, 50, { message: 'SKU phải dài 1–50 ký tự' })
  @Matches(SKU_REGEX, {
    message: 'SKU chỉ được chứa chữ cái, chữ số và dấu gạch ngang',
  })
  sku!: string;

  @ApiProperty({ example: 'Đỏ / L', maxLength: 255 })
  @Transform(trimString)
  @IsString({ message: 'Tên biến thể không hợp lệ' })
  @Length(1, 255, { message: 'Tên biến thể phải dài 1–255 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    example: { Màu: 'Đỏ', Size: 'L' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptionalNotNull()
  @IsObject({ message: 'Thuộc tính biến thể phải là đối tượng JSON' })
  attributes?: Record<string, unknown>;

  @ApiProperty({ example: 150000, minimum: 1000, maximum: 500000000 })
  @IsInt({ message: 'Giá biến thể phải là số nguyên (VND)' })
  @Min(1000, { message: 'Giá biến thể tối thiểu là 1.000đ' })
  @Max(500000000, { message: 'Giá biến thể tối đa là 500.000.000đ' })
  price!: number;

  @ApiProperty({ example: 20, minimum: 0, maximum: 1000000 })
  @IsInt({ message: 'Tồn kho phải là số nguyên' })
  @Min(0, { message: 'Tồn kho không được âm' })
  @Max(1000000, { message: 'Tồn kho tối đa là 1.000.000' })
  stock!: number;
}

export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'AT-DO-XL' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'SKU không hợp lệ' })
  @Length(1, 50, { message: 'SKU phải dài 1–50 ký tự' })
  @Matches(SKU_REGEX, {
    message: 'SKU chỉ được chứa chữ cái, chữ số và dấu gạch ngang',
  })
  sku?: string;

  @ApiPropertyOptional({ example: 'Đỏ / XL' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Tên biến thể không hợp lệ' })
  @Length(1, 255, { message: 'Tên biến thể phải dài 1–255 ký tự' })
  name?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptionalNotNull()
  @IsObject({ message: 'Thuộc tính biến thể phải là đối tượng JSON' })
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 180000, minimum: 1000, maximum: 500000000 })
  @IsOptionalNotNull()
  @IsInt({ message: 'Giá biến thể phải là số nguyên (VND)' })
  @Min(1000, { message: 'Giá biến thể tối thiểu là 1.000đ' })
  @Max(500000000, { message: 'Giá biến thể tối đa là 500.000.000đ' })
  price?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptionalNotNull()
  @IsBoolean({ message: 'isActive phải là giá trị đúng/sai' })
  isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty({
    example: 'Áo thun cotton nam cao cấp',
    minLength: 5,
    maxLength: 200,
  })
  @Transform(trimString)
  @IsString({ message: 'Tên sản phẩm không hợp lệ' })
  @Length(5, 200, { message: 'Tên sản phẩm phải dài 5–200 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Chất liệu 100% cotton thoáng mát',
    maxLength: 10000,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả sản phẩm không hợp lệ' })
  @MaxLength(10000, { message: 'Mô tả sản phẩm tối đa 10.000 ký tự' })
  description?: string;

  @ApiProperty({ example: '00000000-0000-4000-8000-000000000001' })
  @IsUUID(undefined, { message: 'categoryId phải là UUID hợp lệ' })
  categoryId!: string;

  @ApiProperty({ type: () => [CreateVariantDto], minItems: 1, maxItems: 30 })
  @IsArray({ message: 'variants phải là danh sách' })
  @ArrayMinSize(1, { message: 'Sản phẩm phải có ít nhất 1 biến thể' })
  @ArrayMaxSize(30, { message: 'Mỗi sản phẩm tối đa 30 biến thể' })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Áo thun cotton nam mẫu mới' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Tên sản phẩm không hợp lệ' })
  @Length(5, 200, { message: 'Tên sản phẩm phải dài 5–200 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 'Mô tả mới', nullable: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString({ message: 'Mô tả sản phẩm không hợp lệ' })
  @MaxLength(10000, { message: 'Mô tả sản phẩm tối đa 10.000 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ example: '00000000-0000-4000-8000-000000000001' })
  @IsOptionalNotNull()
  @IsUUID(undefined, { message: 'categoryId phải là UUID hợp lệ' })
  categoryId?: string;
}

export enum SellerProductStatusTarget {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: SellerProductStatusTarget })
  @IsEnum(SellerProductStatusTarget, {
    message: 'Trạng thái phải là DRAFT, ACTIVE hoặc HIDDEN',
  })
  status!: SellerProductStatusTarget;
}

export class ReorderProductImagesDto {
  @ApiProperty({ type: [String] })
  @IsArray({ message: 'imageIds phải là danh sách UUID' })
  @ArrayMinSize(1, { message: 'imageIds không được để trống' })
  @IsUUID(undefined, {
    each: true,
    message: 'Mỗi phần tử trong imageIds phải là UUID hợp lệ',
  })
  imageIds!: string[];
}

export class QuerySellerProductsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => trimOrUndefined(value))
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi' })
  @MaxLength(100, { message: 'Từ khóa tìm kiếm tối đa 100 ký tự' })
  q?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @Transform(({ value }: { value: unknown }) => trimOrUndefined(value))
  @IsOptional()
  @IsEnum(ProductStatus, {
    message: 'status phải là DRAFT, ACTIVE, HIDDEN hoặc BANNED',
  })
  status?: ProductStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }: { value: unknown }) => parseOptionalInt(value, 1))
  @IsOptional()
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  @Max(MAX_PAGE, { message: `page tối đa là ${MAX_PAGE}` })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }: { value: unknown }) => parseOptionalInt(value, 20))
  @IsOptional()
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit: number = 20;
}
