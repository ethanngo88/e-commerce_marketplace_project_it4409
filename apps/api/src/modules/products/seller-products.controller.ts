import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { ApprovedSellerGuard } from '../../common/guards/approved-seller.guard';
import { Paginated } from '../../common/pagination/paginated';
import { ProductStatus } from '../../generated/prisma/client';
import {
  ProductImageDto,
  SellerProductDetailDto,
  SellerProductSummaryDto,
  SellerProductVariantDto,
} from './dto/product-response.dto';
import {
  CreateProductDto,
  CreateVariantDto,
  QuerySellerProductsDto,
  ReorderProductImagesDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateVariantDto,
} from './dto/seller-product.dto';
import {
  MAX_IMAGES_PER_PRODUCT,
  SellerProductsService,
} from './seller-products.service';

const MULTER_MEMORY_LIMIT_BYTES = 6 * 1024 * 1024;

const uuidPipe = (label: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () =>
      new AppException(
        ErrorCode.VALIDATION_ERROR,
        `${label} phải là UUID hợp lệ`,
        HttpStatus.BAD_REQUEST,
      ),
  });

const productIdPipe = uuidPipe('ID sản phẩm');
const variantIdPipe = uuidPipe('ID biến thể');
const imageIdPipe = uuidPipe('ID ảnh');

@ApiTags('Seller Products')
@ApiBearerAuth()
@UseGuards(ApprovedSellerGuard)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly sellerProducts: SellerProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách sản phẩm của cửa hàng (mọi trạng thái)' })
  @ApiResponse({ status: 200, type: [SellerProductSummaryDto] })
  list(
    @CurrentStore('storeId') storeId: string,
    @Query() query: QuerySellerProductsDto,
  ): Promise<Paginated<SellerProductSummaryDto>> {
    return this.sellerProducts.list(storeId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết sản phẩm của cửa hàng để chỉnh sửa' })
  @ApiResponse({ status: 200, type: SellerProductDetailDto })
  @ApiResponse({ status: 404, description: 'PRODUCT_NOT_FOUND' })
  getById(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
  ): Promise<SellerProductDetailDto> {
    return this.sellerProducts.getById(storeId, productId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo sản phẩm mới ở trạng thái DRAFT kèm biến thể và tồn kho',
  })
  @ApiResponse({ status: 201, type: SellerProductDetailDto })
  @ApiResponse({ status: 400, description: 'CATEGORY_NOT_LEAF' })
  @ApiResponse({ status: 404, description: 'CATEGORY_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_SKU' })
  create(
    @CurrentStore('storeId') storeId: string,
    @Body() dto: CreateProductDto,
  ): Promise<SellerProductDetailDto> {
    return this.sellerProducts.create(storeId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa thông tin chung của sản phẩm' })
  @ApiResponse({ status: 200, type: SellerProductDetailDto })
  @ApiResponse({ status: 403, description: 'PRODUCT_BANNED' })
  @ApiResponse({ status: 404, description: 'PRODUCT_NOT_FOUND' })
  update(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<SellerProductDetailDto> {
    return this.sellerProducts.update(storeId, productId, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Đổi trạng thái sản phẩm (DRAFT / ACTIVE / HIDDEN)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'PRODUCT_NOT_PUBLISHABLE' })
  @ApiResponse({ status: 403, description: 'PRODUCT_BANNED' })
  @ApiResponse({ status: 404, description: 'PRODUCT_NOT_FOUND' })
  updateStatus(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Body() dto: UpdateProductStatusDto,
  ): Promise<{ id: string; status: ProductStatus }> {
    return this.sellerProducts.updateStatus(storeId, productId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mềm sản phẩm' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'PRODUCT_NOT_FOUND' })
  remove(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
  ): Promise<void> {
    return this.sellerProducts.softDelete(storeId, productId);
  }

  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Thêm biến thể mới cho sản phẩm' })
  @ApiResponse({ status: 201, type: SellerProductVariantDto })
  @ApiResponse({ status: 409, description: 'DUPLICATE_SKU' })
  addVariant(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ): Promise<SellerProductVariantDto> {
    return this.sellerProducts.addVariant(storeId, productId, dto);
  }

  @Patch(':id/variants/:variantId')
  @ApiOperation({ summary: 'Cập nhật biến thể (giá, tên, SKU, bật/tắt)' })
  @ApiResponse({ status: 200, type: SellerProductVariantDto })
  @ApiResponse({ status: 400, description: 'LAST_ACTIVE_VARIANT' })
  @ApiResponse({ status: 404, description: 'VARIANT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_SKU' })
  updateVariant(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Param('variantId', variantIdPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<SellerProductVariantDto> {
    return this.sellerProducts.updateVariant(
      storeId,
      productId,
      variantId,
      dto,
    );
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa biến thể chưa từng được bán' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'LAST_ACTIVE_VARIANT' })
  @ApiResponse({ status: 409, description: 'VARIANT_HAS_ORDERS' })
  deleteVariant(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Param('variantId', variantIdPipe) variantId: string,
  ): Promise<void> {
    return this.sellerProducts.deleteVariant(storeId, productId, variantId);
  }

  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Tải ảnh sản phẩm lên Cloudinary (tối đa 8 ảnh/sản phẩm)',
  })
  @ApiResponse({ status: 201, type: [ProductImageDto] })
  @ApiResponse({
    status: 400,
    description: 'INVALID_FILE | IMAGE_LIMIT_REACHED',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_PRODUCT, {
      storage: memoryStorage(),
      limits: { fileSize: MULTER_MEMORY_LIMIT_BYTES },
    }),
  )
  uploadImages(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<ProductImageDto[]> {
    return this.sellerProducts.uploadImages(storeId, productId, files);
  }

  @Patch(':id/images/order')
  @ApiOperation({ summary: 'Sắp xếp thứ tự ảnh (ảnh đầu là ảnh đại diện)' })
  @ApiResponse({ status: 200, type: [ProductImageDto] })
  reorderImages(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Body() dto: ReorderProductImagesDto,
  ): Promise<ProductImageDto[]> {
    return this.sellerProducts.reorderImages(storeId, productId, dto);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa ảnh sản phẩm' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'IMAGE_NOT_FOUND' })
  deleteImage(
    @CurrentStore('storeId') storeId: string,
    @Param('id', productIdPipe) productId: string,
    @Param('imageId', imageIdPipe) imageId: string,
  ): Promise<void> {
    return this.sellerProducts.deleteImage(storeId, productId, imageId);
  }
}
