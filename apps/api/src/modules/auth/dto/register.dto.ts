import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { MaxUtf8Bytes } from '../../../common/validators/max-utf8-bytes.validator';

/** Email luôn được lưu và so sánh ở dạng chữ thường (doc 04 mục 6.1). */
export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Validation theo doc 05 mục 3. Message hiển thị dưới ô nhập ở frontend. */
export class RegisterDto {
  @ApiProperty({ example: 'an@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255, { message: 'Email quá dài' })
  email!: string;

  @ApiProperty({
    example: 'matkhau123',
    minLength: 8,
    maxLength: 72,
    description: '8–72 ký tự, có ít nhất một chữ cái và một chữ số',
  })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @Length(8, 72, { message: 'Mật khẩu phải dài 8–72 ký tự' })
  @MaxUtf8Bytes(72, { message: 'Mật khẩu không được vượt quá 72 byte UTF-8' })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu phải có ít nhất một chữ cái' })
  @Matches(/\d/, { message: 'Mật khẩu phải có ít nhất một chữ số' })
  password!: string;

  @ApiProperty({ example: 'Nguyễn Văn An', minLength: 2, maxLength: 100 })
  @Transform(trim)
  @IsString({ message: 'Họ tên không hợp lệ' })
  @Length(2, 100, { message: 'Họ tên phải dài 2–100 ký tự' })
  fullName!: string;
}
