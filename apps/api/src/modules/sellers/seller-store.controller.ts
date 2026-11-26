import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { ApprovedSellerGuard } from '../../common/guards/approved-seller.guard';
import {
  SellerDailyRevenueDto,
  SellerStatsOverviewDto,
  SellerTopProductDto,
  StoreDto,
} from './dto/seller-response.dto';
import {
  SellerRevenueQueryDto,
  SellerStatsRangeQueryDto,
  SellerTopProductsQueryDto,
  UpdateStoreDto,
} from './dto/update-store.dto';
import { SellersService } from './sellers.service';

/** Giới hạn bộ nhớ Multer (6MB) để ảnh 5–6MB rơi vào validateImageFile (400 INVALID_FILE). */
const MULTER_MEMORY_LIMIT_BYTES = 6 * 1024 * 1024;

@ApiTags('Seller Store & Stats')
@ApiBearerAuth()
@UseGuards(ApprovedSellerGuard)
@Controller('seller')
export class SellerStoreController {
  constructor(private readonly sellers: SellersService) {}

  @Patch('store')
  @ApiOperation({ summary: 'Cập nhật tên, mô tả cửa hàng' })
  @ApiResponse({ status: 200, type: StoreDto })
  updateStore(
    @CurrentStore('storeId') storeId: string,
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreDto> {
    return this.sellers.updateMyStore(storeId, dto);
  }

  @Post('store/logo')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên logo cửa hàng (JPEG/PNG/WebP, ≤ 5MB)' })
  @ApiResponse({ status: 200, schema: { example: { logoUrl: 'https://...' } } })
  @ApiResponse({ status: 400, description: 'INVALID_FILE' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MULTER_MEMORY_LIMIT_BYTES },
    }),
  )
  uploadLogo(
    @CurrentStore('storeId') storeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ logoUrl: string }> {
    return this.sellers.uploadStoreLogo(storeId, file);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Tổng quan doanh thu và đơn hàng của cửa hàng' })
  @ApiResponse({ status: 200, type: SellerStatsOverviewDto })
  getOverview(
    @CurrentStore('storeId') storeId: string,
    @Query() query: SellerStatsRangeQueryDto,
  ): Promise<SellerStatsOverviewDto> {
    return this.sellers.getStatsOverview(storeId, query);
  }

  @Get('stats/revenue')
  @ApiOperation({
    summary: 'Doanh thu theo ngày của cửa hàng (tối đa 90 ngày)',
  })
  @ApiResponse({ status: 200, type: [SellerDailyRevenueDto] })
  getRevenue(
    @CurrentStore('storeId') storeId: string,
    @Query() query: SellerRevenueQueryDto,
  ): Promise<SellerDailyRevenueDto[]> {
    return this.sellers.getDailyRevenue(storeId, query);
  }

  @Get('stats/top-products')
  @ApiOperation({ summary: 'Sản phẩm bán chạy của cửa hàng' })
  @ApiResponse({ status: 200, type: [SellerTopProductDto] })
  getTopProducts(
    @CurrentStore('storeId') storeId: string,
    @Query() query: SellerTopProductsQueryDto,
  ): Promise<SellerTopProductDto[]> {
    return this.sellers.getTopProducts(storeId, query);
  }
}
