import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** Số điện thoại Việt Nam: 10 chữ số, bắt đầu bằng 0 (doc 05 mục 4). */
export const VN_PHONE_REGEX = /^0\d{9}$/;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyễn Văn An',
    minLength: 2,
    maxLength: 100,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Họ tên không hợp lệ' })
  @Length(2, 100, { message: 'Họ tên phải dài 2–100 ký tự' })
  fullName?: string;

  @ApiPropertyOptional({
    example: '0901234567',
    description: 'Số điện thoại Việt Nam (10 chữ số, bắt đầu bằng 0)',
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) {
      return null;
    }
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone?: string | null;
}
