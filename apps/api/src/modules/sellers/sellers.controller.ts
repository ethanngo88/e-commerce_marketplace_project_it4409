import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  RegisterSellerDto,
  UpdateSellerProfileDto,
} from './dto/register-seller.dto';
import { SellerWithStoreDto } from './dto/seller-response.dto';
import { SellersService } from './sellers.service';

@ApiTags('Sellers')
@ApiBearerAuth()
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Roles(Role.CUSTOMER)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi hồ sơ đăng ký bán hàng (trạng thái PENDING)' })
  @ApiResponse({ status: 201, type: SellerWithStoreDto })
  @ApiResponse({ status: 409, description: 'SELLER_ALREADY_REGISTERED' })
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterSellerDto,
  ): Promise<SellerWithStoreDto> {
    return this.sellers.register(userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Xem hồ sơ người bán và trạng thái duyệt của tôi' })
  @ApiResponse({ status: 200, type: SellerWithStoreDto })
  @ApiResponse({ status: 404, description: 'SELLER_NOT_FOUND' })
  getMySeller(@CurrentUser('id') userId: string): Promise<SellerWithStoreDto> {
    return this.sellers.getMySeller(userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Sửa hồ sơ người bán (nếu đang REJECTED sẽ chuyển về PENDING)',
  })
  @ApiResponse({ status: 200, type: SellerWithStoreDto })
  @ApiResponse({ status: 404, description: 'SELLER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'INVALID_SELLER_STATUS' })
  updateMySeller(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSellerProfileDto,
  ): Promise<SellerWithStoreDto> {
    return this.sellers.updateMySeller(userId, dto);
  }
}
