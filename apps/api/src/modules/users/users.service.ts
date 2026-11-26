import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/auth/auth-user';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfileDto } from '../auth/dto/auth-response.dto';
import { TokenService } from '../auth/token.service';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Giới hạn tối đa số địa chỉ mỗi người dùng (doc 03 mục 6.2). */
export const MAX_ADDRESSES_PER_USER = 10;

const USER_PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  userRoles: { select: { role: { select: { name: true } } } },
  seller: { select: { status: true } },
} satisfies Prisma.UserSelect;

type UserProfileRecord = Prisma.UserGetPayload<{
  select: typeof USER_PROFILE_SELECT;
}>;

const ADDRESS_SELECT = {
  id: true,
  recipientName: true,
  phone: true,
  province: true,
  district: true,
  ward: true,
  street: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    config: ConfigService,
  ) {
    this.bcryptRounds = config.get<number>('BCRYPT_ROUNDS', 10);
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });
    if (!user) {
      throw userNotFound();
    }
    return toUserProfile(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw userNotFound();
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      select: USER_PROFILE_SELECT,
    });

    return toUserProfile(updated);
  }

  /**
   * Đổi mật khẩu (doc 05 mục 4): kiểm tra mật khẩu hiện tại, lưu hash mới
   * và thu hồi mọi refresh token của các phiên khác trong cùng transaction.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentRefreshToken?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw userNotFound();
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new AppException(
        ErrorCode.WRONG_PASSWORD,
        'Mật khẩu hiện tại không đúng',
        HttpStatus.BAD_REQUEST,
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      await this.tokens.revokeOtherForUser(userId, currentRefreshToken, tx);
    });
  }

  async listAddresses(userId: string): Promise<AddressResponseDto[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: ADDRESS_SELECT,
    });
  }

  /**
   * Thêm địa chỉ mới (doc 03 mục 6.2):
   * - Tối đa 10 địa chỉ/user.
   * - Địa chỉ đầu tiên tự động thành mặc định.
   * - Nếu đặt làm mặc định mới, bỏ cờ mặc định cũ trước khi insert để khớp partial unique index.
   */
  async createAddress(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });
      if (existingCount >= MAX_ADDRESSES_PER_USER) {
        throw new AppException(
          ErrorCode.ADDRESS_LIMIT_REACHED,
          `Bạn chỉ có thể lưu tối đa ${MAX_ADDRESSES_PER_USER} địa chỉ giao hàng`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const willBeDefault = existingCount === 0 || dto.isDefault === true;
      if (willBeDefault && existingCount > 0) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          recipientName: dto.recipientName,
          phone: dto.phone,
          province: dto.province,
          district: dto.district,
          ward: dto.ward,
          street: dto.street,
          isDefault: willBeDefault,
        },
        select: ADDRESS_SELECT,
      });
    });
  }

  /**
   * Sửa địa chỉ của chính user. Không tồn tại hoặc thuộc user khác đều trả 404 (chống IDOR).
   */
  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true, isDefault: true },
      });
      if (!existing) {
        throw addressNotFound();
      }

      let nextIsDefault = existing.isDefault;

      if (dto.isDefault === true && !existing.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        nextIsDefault = true;
      } else if (dto.isDefault === false && existing.isDefault) {
        // Nếu người dùng bỏ mặc định trên địa chỉ hiện tại, chọn địa chỉ mới nhất khác lên thay;
        // nếu chỉ có một địa chỉ duy nhất thì giữ mặc định.
        const replacement = await tx.address.findFirst({
          where: { userId, id: { not: addressId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (replacement) {
          nextIsDefault = false;
          await tx.address.update({
            where: { id: addressId },
            data: { isDefault: false },
          });
          await tx.address.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.recipientName !== undefined
            ? { recipientName: dto.recipientName }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.province !== undefined ? { province: dto.province } : {}),
          ...(dto.district !== undefined ? { district: dto.district } : {}),
          ...(dto.ward !== undefined ? { ward: dto.ward } : {}),
          ...(dto.street !== undefined ? { street: dto.street } : {}),
          isDefault: nextIsDefault,
        },
        select: ADDRESS_SELECT,
      });
    });
  }

  /**
   * Xóa địa chỉ của chính user. Nếu xóa địa chỉ mặc định, địa chỉ mới nhất còn lại tự lên thay.
   */
  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true, isDefault: true },
      });
      if (!existing) {
        throw addressNotFound();
      }

      await tx.address.delete({ where: { id: addressId } });

      if (existing.isDefault) {
        const newestRemaining = await tx.address.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (newestRemaining) {
          await tx.address.update({
            where: { id: newestRemaining.id },
            data: { isDefault: true },
          });
        }
      }
    });
  }

  /**
   * Helper export cho OrdersModule (T-18) kiểm tra địa chỉ thuộc về user trước khi checkout.
   */
  async findAddressForUser(
    userId: string,
    addressId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<AddressResponseDto> {
    const address = await db.address.findFirst({
      where: { id: addressId, userId },
      select: ADDRESS_SELECT,
    });
    if (!address) {
      throw addressNotFound();
    }
    return address;
  }
}

function toUserProfile(user: UserProfileRecord): UserProfileDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    roles: user.userRoles.map(({ role }) => role.name as Role),
    sellerStatus: user.seller?.status ?? null,
  };
}

function userNotFound(): AppException {
  return new AppException(
    ErrorCode.USER_NOT_FOUND,
    'Không tìm thấy người dùng',
    HttpStatus.NOT_FOUND,
  );
}

function addressNotFound(): AppException {
  return new AppException(
    ErrorCode.ADDRESS_NOT_FOUND,
    'Không tìm thấy địa chỉ giao hàng',
    HttpStatus.NOT_FOUND,
  );
}
