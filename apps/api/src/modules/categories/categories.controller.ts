import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import {
  CategoryDetailDto,
  CategoryTreeItemDto,
} from './dto/category-response.dto';

@ApiTags('Categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Cây danh mục đang bật (tối đa 2 cấp)' })
  @ApiResponse({ status: 200, type: [CategoryTreeItemDto] })
  getTree(): Promise<CategoryTreeItemDto[]> {
    return this.categories.getPublicTree();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Chi tiết một danh mục công khai theo slug' })
  @ApiResponse({ status: 200, type: CategoryDetailDto })
  @ApiResponse({ status: 404, description: 'CATEGORY_NOT_FOUND' })
  getBySlug(@Param('slug') slug: string): Promise<CategoryDetailDto> {
    return this.categories.getPublicBySlug(slug);
  }
}
