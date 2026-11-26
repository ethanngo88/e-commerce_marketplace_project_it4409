import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class CategoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  parentId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  sortOrder!: number;
}

export class CategoryTreeItemDto extends CategoryItemDto {
  @ApiProperty({ type: () => [CategoryItemDto] })
  children!: CategoryItemDto[];
}

export class CategoryDetailDto extends CategoryItemDto {
  @ApiPropertyOptional({ type: () => CategoryRefDto, nullable: true })
  parent!: CategoryRefDto | null;

  @ApiProperty({ type: () => [CategoryItemDto] })
  children!: CategoryItemDto[];
}

export class AdminCategoryChildDto extends CategoryItemDto {
  @ApiProperty()
  productCount!: number;
}

export class AdminCategoryTreeItemDto extends AdminCategoryChildDto {
  @ApiProperty({ type: () => [AdminCategoryChildDto] })
  children!: AdminCategoryChildDto[];
}
