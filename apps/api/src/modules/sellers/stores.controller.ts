import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { StorePublicDto } from './dto/seller-response.dto';
import { SellersService } from './sellers.service';

@ApiTags('Stores')
@Public()
@Controller('stores')
export class StoresController {
  constructor(private readonly sellers: SellersService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Trang cửa hàng công khai kèm số sản phẩm ACTIVE' })
  @ApiResponse({ status: 200, type: StorePublicDto })
  @ApiResponse({ status: 404, description: 'STORE_NOT_FOUND' })
  getBySlug(@Param('slug') slug: string): Promise<StorePublicDto> {
    return this.sellers.getPublicStoreBySlug(slug);
  }
}
