import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { IsOptionalNotNull } from '../../../common/validators/is-optional-not-null.decorator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Áo khoác nam cao cấp' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptionalNotNull()
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự' })
  @Length(2, 100, { message: 'Tên danh mục phải từ 2 đến 100 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptionalNotNull()
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên' })
  @Min(0, { message: 'Thứ tự hiển thị không được âm' })
  @Max(10000, { message: 'Thứ tự hiển thị tối đa là 10000' })
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptionalNotNull()
  @IsBoolean({ message: 'isActive phải là giá trị đúng/sai' })
  isActive?: boolean;
}
