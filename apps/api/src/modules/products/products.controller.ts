import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Paginated } from '../../common/pagination/paginated';
import {
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'Tìm kiếm, lọc, sắp xếp và phân trang sản phẩm công khai',
  })
  @ApiResponse({ status: 200, type: [ProductSummaryDto] })
  search(
    @Query() query: QueryProductsDto,
  ): Promise<Paginated<ProductSummaryDto>> {
    return this.products.searchPublic(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Chi tiết một sản phẩm công khai theo slug' })
  @ApiResponse({ status: 200, type: ProductDetailDto })
  @ApiResponse({ status: 404, description: 'PRODUCT_NOT_FOUND' })
  getBySlug(@Param('slug') slug: string): Promise<ProductDetailDto> {
    return this.products.getPublicBySlug(slug);
  }
}
