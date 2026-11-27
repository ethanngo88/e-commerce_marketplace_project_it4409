import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, Matches } from 'class-validator';
import { VN_PHONE_REGEX } from './update-profile.dto';
import { IsOptionalNotNull } from '../../../common/validators/is-optional-not-null.decorator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAddressDto {
  @ApiProperty({ example: 'Trần Thị Bình', minLength: 2, maxLength: 100 })
  @Transform(trimString)
  @IsString({ message: 'Tên người nhận không hợp lệ' })
  @Length(2, 100, { message: 'Tên người nhận phải dài 2–100 ký tự' })
  recipientName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(trimString)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone!: string;

  @ApiProperty({ example: 'Hà Nội' })
  @Transform(trimString)
  @IsString({ message: 'Tỉnh/Thành phố không hợp lệ' })
  @Length(1, 100, { message: 'Tỉnh/Thành phố phải dài 1–100 ký tự' })
  province!: string;

  @ApiProperty({ example: 'Quận Hai Bà Trưng' })
  @Transform(trimString)
  @IsString({ message: 'Quận/Huyện không hợp lệ' })
  @Length(1, 100, { message: 'Quận/Huyện phải dài 1–100 ký tự' })
  district!: string;

  @ApiProperty({ example: 'Phường Bách Khoa' })
  @Transform(trimString)
  @IsString({ message: 'Phường/Xã không hợp lệ' })
  @Length(1, 100, { message: 'Phường/Xã phải dài 1–100 ký tự' })
  ward!: string;

  @ApiProperty({ example: 'Số 12, ngõ 34 Tạ Quang Bửu' })
  @Transform(trimString)
  @IsString({ message: 'Địa chỉ cụ thể không hợp lệ' })
  @Length(1, 255, { message: 'Địa chỉ cụ thể phải dài 1–255 ký tự' })
  street!: string;

  @ApiPropertyOptional({ example: false })
  @IsOptionalNotNull()
  @IsBoolean({ message: 'isDefault phải là giá trị đúng/sai' })
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Trần Thị Bình' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Tên người nhận không hợp lệ' })
  @Length(2, 100, { message: 'Tên người nhận phải dài 2–100 ký tự' })
  recipientName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Tỉnh/Thành phố không hợp lệ' })
  @Length(1, 100, { message: 'Tỉnh/Thành phố phải dài 1–100 ký tự' })
  province?: string;

  @ApiPropertyOptional({ example: 'Quận Hai Bà Trưng' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Quận/Huyện không hợp lệ' })
  @Length(1, 100, { message: 'Quận/Huyện phải dài 1–100 ký tự' })
  district?: string;

  @ApiPropertyOptional({ example: 'Phường Bách Khoa' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Phường/Xã không hợp lệ' })
  @Length(1, 100, { message: 'Phường/Xã phải dài 1–100 ký tự' })
  ward?: string;

  @ApiPropertyOptional({ example: 'Số 12, ngõ 34 Tạ Quang Bửu' })
  @Transform(trimString)
  @IsOptionalNotNull()
  @IsString({ message: 'Địa chỉ cụ thể không hợp lệ' })
  @Length(1, 255, { message: 'Địa chỉ cụ thể phải dài 1–255 ký tự' })
  street?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptionalNotNull()
  @IsBoolean({ message: 'isDefault phải là giá trị đúng/sai' })
  isDefault?: boolean;
}

export class AddressResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  recipientName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  province!: string;

  @ApiProperty()
  district!: string;

  @ApiProperty()
  ward!: string;

  @ApiProperty()
  street!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
