import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/auth/auth-user';
import { SellerStatus } from '../../../generated/prisma/client';

/** Đối tượng `user` trong doc 05 mục 3. Không bao giờ chứa `passwordHash`. */
export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'an@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  fullName!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  avatarUrl!: string | null;

  @ApiProperty({ enum: Role, isArray: true, example: ['CUSTOMER'] })
  roles!: Role[];

  @ApiProperty({
    enum: SellerStatus,
    nullable: true,
    example: null,
    description: 'Trạng thái hồ sơ người bán; null nếu chưa đăng ký bán hàng',
  })
  sellerStatus!: SellerStatus | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;

  @ApiProperty({ description: 'JWT, gửi qua header Authorization: Bearer' })
  accessToken!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}

export class MeResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}
