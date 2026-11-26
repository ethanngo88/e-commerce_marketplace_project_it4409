import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../../../generated/prisma/client';

export class ProductStoreSummaryDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class ProductCategoryRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class ProductImageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class ProductVariantPublicDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  attributes!: Record<string, unknown>;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  stock!: number;
}

export class ProductSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty()
  minPrice!: number;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty()
  soldCount!: number;

  @ApiProperty({ type: () => ProductStoreSummaryDto })
  store!: ProductStoreSummaryDto;
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: () => ProductCategoryRefDto })
  category!: ProductCategoryRefDto;

  @ApiProperty({ type: () => [ProductImageDto] })
  images!: ProductImageDto[];

  @ApiProperty({ type: () => [ProductVariantPublicDto] })
  variants!: ProductVariantPublicDto[];
}

export class SellerProductVariantDto extends ProductVariantPublicDto {
  @ApiProperty()
  isActive!: boolean;
}

export class SellerProductSummaryDto extends ProductSummaryDto {
  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SellerProductDetailDto extends ProductSummaryDto {
  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: () => ProductCategoryRefDto })
  category!: ProductCategoryRefDto;

  @ApiProperty({ type: () => [ProductImageDto] })
  images!: ProductImageDto[];

  @ApiProperty({ type: () => [SellerProductVariantDto] })
  variants!: SellerProductVariantDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
