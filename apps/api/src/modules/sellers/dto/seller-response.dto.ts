import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SellerStatus } from '../../../generated/prisma/client';

export class SellerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  taxCode!: string | null;

  @ApiProperty({ enum: SellerStatus })
  status!: SellerStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReason!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  approvedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class StoreDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class StorePublicDto extends StoreDto {
  @ApiProperty()
  productCount!: number;
}

export class SellerWithStoreDto {
  @ApiProperty({ type: () => SellerDto })
  seller!: SellerDto;

  @ApiProperty({ type: () => StoreDto })
  store!: StoreDto;
}

export class SellerStatsOverviewDto {
  @ApiProperty()
  revenue!: number;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  pendingOrderCount!: number;

  @ApiProperty()
  productCount!: number;

  @ApiProperty()
  lowStockCount!: number;
}

export class SellerDailyRevenueDto {
  @ApiProperty({ example: '2026-11-26' })
  date!: string;

  @ApiProperty()
  revenue!: number;

  @ApiProperty()
  orderCount!: number;
}

export class SellerTopProductDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantitySold!: number;

  @ApiProperty()
  revenue!: number;
}
