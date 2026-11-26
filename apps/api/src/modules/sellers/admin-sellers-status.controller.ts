import {
  Body,
  Controller,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/auth/auth-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { SellerDto } from './dto/seller-response.dto';
import { UpdateSellerStatusDto } from './dto/update-store.dto';
import { SellersService } from './sellers.service';

const sellerIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      ErrorCode.VALIDATION_ERROR,
      'ID hồ sơ người bán phải là UUID hợp lệ',
      HttpStatus.BAD_REQUEST,
    ),
});

@ApiTags('Admin Sellers')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/sellers')
export class AdminSellersStatusController {
  constructor(private readonly sellers: SellersService) {}

  @Patch(':id/status')
  @ApiOperation({ summary: 'Duyệt, từ chối, tạm ngưng hoặc mở lại người bán' })
  @ApiResponse({ status: 200, type: SellerDto })
  @ApiResponse({ status: 404, description: 'SELLER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'INVALID_SELLER_STATUS' })
  updateStatus(
    @Param('id', sellerIdPipe) sellerId: string,
    @Body() dto: UpdateSellerStatusDto,
  ): Promise<SellerDto> {
    return this.sellers.updateSellerStatus(sellerId, dto);
  }
}
