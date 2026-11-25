import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

/**
 * Không kiểm tra độ mạnh mật khẩu khi đăng nhập: mật khẩu sai chỉ nhận
 * `INVALID_CREDENTIALS`, không tiết lộ quy tắc nào bị vi phạm.
 */
export class LoginDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MaxLength(72, { message: 'Mật khẩu không hợp lệ' })
  password!: string;
}
