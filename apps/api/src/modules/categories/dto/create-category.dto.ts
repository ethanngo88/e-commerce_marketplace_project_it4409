import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../common/validators/is-optional-not-null.decorator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Áo khoác nam', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự' })
  @Length(2, 100, { message: 'Tên danh mục phải từ 2 đến 100 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'ID danh mục cha (UUID). Bỏ trống để tạo danh mục cấp 1; tối đa 2 cấp.',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'parentId phải là UUID hợp lệ' })
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Thứ tự hiển thị (số nguyên không âm, mặc định 0)',
    example: 0,
    minimum: 0,
  })
  @IsOptionalNotNull()
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên' })
  @Min(0, { message: 'Thứ tự hiển thị không được âm' })
  @Max(10000, { message: 'Thứ tự hiển thị tối đa là 10000' })
  sortOrder?: number;
}
