import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { VN_PHONE_REGEX } from '../../users/dto/update-profile.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterSellerDto {
  @ApiProperty({ example: 'Công ty TNHH Thời trang Minh An' })
  @Transform(trimString)
  @IsString({ message: 'Tên kinh doanh không hợp lệ' })
  @Length(2, 255, { message: 'Tên kinh doanh phải dài 2–255 ký tự' })
  businessName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(trimString)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone!: string;

  @ApiPropertyOptional({ example: '0109876543', maxLength: 50 })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? undefined : t;
  })
  @IsOptional()
  @IsString({ message: 'Mã số thuế không hợp lệ' })
  @MaxLength(50, { message: 'Mã số thuế tối đa 50 ký tự' })
  taxCode?: string;

  @ApiProperty({ example: 'Minh An Fashion' })
  @Transform(trimString)
  @IsString({ message: 'Tên cửa hàng không hợp lệ' })
  @Length(2, 255, { message: 'Tên cửa hàng phải dài 2–255 ký tự' })
  storeName!: string;

  @ApiPropertyOptional({
    example: 'Chuyên quần áo nam nữ chất liệu cotton cao cấp',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả cửa hàng không hợp lệ' })
  @MaxLength(2000, { message: 'Mô tả cửa hàng tối đa 2000 ký tự' })
  storeDescription?: string;
}

export class UpdateSellerProfileDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Minh An' })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Tên kinh doanh không hợp lệ' })
  @Length(2, 255, { message: 'Tên kinh doanh phải dài 2–255 ký tự' })
  businessName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone?: string;

  @ApiPropertyOptional({ example: '0109876543', nullable: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString({ message: 'Mã số thuế không hợp lệ' })
  @MaxLength(50, { message: 'Mã số thuế tối đa 50 ký tự' })
  taxCode?: string | null;

  @ApiPropertyOptional({ example: 'Minh An Store' })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Tên cửa hàng không hợp lệ' })
  @Length(2, 255, { message: 'Tên cửa hàng phải dài 2–255 ký tự' })
  storeName?: string;

  @ApiPropertyOptional({ example: 'Mô tả mới', nullable: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString({ message: 'Mô tả cửa hàng không hợp lệ' })
  @MaxLength(2000, { message: 'Mô tả cửa hàng tối đa 2000 ký tự' })
  storeDescription?: string | null;
}
