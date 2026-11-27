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
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { UserProfileDto } from '../auth/dto/auth-response.dto';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from '../auth/refresh-cookie';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

const addressIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      ErrorCode.VALIDATION_ERROR,
      'ID địa chỉ phải là UUID hợp lệ',
      HttpStatus.BAD_REQUEST,
    ),
});

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  private readonly isProduction: boolean;

  constructor(
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Get('me')
  @ApiOperation({ summary: 'Xem hồ sơ người dùng hiện tại' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  getMe(@CurrentUser('id') userId: string): Promise<UserProfileDto> {
    return this.users.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật hồ sơ (họ tên, số điện thoại)' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.users.updateProfile(userId, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đổi mật khẩu và thu hồi mọi phiên đăng nhập khác',
    description:
      'Phiên hiện tại vẫn đăng nhập: response đặt lại cookie refreshToken mới.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'WRONG_PASSWORD' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refresh = await this.users.changePassword(userId, dto);
    // Cookie có Path=/api/auth: đặt được từ response của endpoint khác đường dẫn.
    res.cookie(
      REFRESH_COOKIE_NAME,
      refresh.token,
      refreshCookieOptions(this.isProduction, refresh.expiresAt),
    );
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Danh sách địa chỉ giao hàng của tôi' })
  @ApiResponse({ status: 200, type: [AddressResponseDto] })
  listAddresses(
    @CurrentUser('id') userId: string,
  ): Promise<AddressResponseDto[]> {
    return this.users.listAddresses(userId);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Thêm địa chỉ giao hàng mới (tối đa 10 địa chỉ)' })
  @ApiResponse({ status: 201, type: AddressResponseDto })
  @ApiResponse({ status: 400, description: 'ADDRESS_LIMIT_REACHED' })
  createAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.users.createAddress(userId, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Cập nhật một địa chỉ giao hàng' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  @ApiResponse({ status: 404, description: 'ADDRESS_NOT_FOUND' })
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id', addressIdPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.users.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa một địa chỉ giao hàng' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'ADDRESS_NOT_FOUND' })
  deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id', addressIdPipe) addressId: string,
  ): Promise<void> {
    return this.users.deleteAddress(userId, addressId);
  }
}
