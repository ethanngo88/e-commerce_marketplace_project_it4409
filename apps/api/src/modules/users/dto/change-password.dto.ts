import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { MaxUtf8Bytes } from '../../../common/validators/max-utf8-bytes.validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass123' })
  @IsString({ message: 'Mật khẩu hiện tại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @ApiProperty({
    example: 'NewPass123',
    minLength: 8,
    maxLength: 72,
    description: '8–72 ký tự (tối đa 72 byte UTF-8), gồm chữ và số',
  })
  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @Length(8, 72, { message: 'Mật khẩu mới phải dài 8–72 ký tự' })
  @MaxUtf8Bytes(72, {
    message: 'Mật khẩu mới không được vượt quá 72 byte UTF-8',
  })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu mới phải có ít nhất một chữ cái' })
  @Matches(/\d/, { message: 'Mật khẩu mới phải có ít nhất một chữ số' })
  newPassword!: string;
}
