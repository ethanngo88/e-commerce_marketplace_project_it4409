import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
