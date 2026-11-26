import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/auth/auth-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { CategoriesService } from './categories.service';
import {
  AdminCategoryTreeItemDto,
  CategoryItemDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const categoryIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      ErrorCode.VALIDATION_ERROR,
      'ID danh mục phải là UUID hợp lệ',
      HttpStatus.BAD_REQUEST,
    ),
});

@ApiTags('Admin Categories')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Toàn bộ cây danh mục (bao gồm đang tắt)' })
  @ApiResponse({ status: 200, type: [AdminCategoryTreeItemDto] })
  getAll(): Promise<AdminCategoryTreeItemDto[]> {
    return this.categories.getAdminTree();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo danh mục mới (tối đa 2 cấp)' })
  @ApiResponse({ status: 201, type: CategoryItemDto })
  @ApiResponse({ status: 400, description: 'CATEGORY_DEPTH_EXCEEDED' })
  @ApiResponse({ status: 404, description: 'CATEGORY_NOT_FOUND' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryItemDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa thông tin hoặc bật/tắt danh mục' })
  @ApiResponse({ status: 200, type: CategoryItemDto })
  @ApiResponse({ status: 404, description: 'CATEGORY_NOT_FOUND' })
  update(
    @Param('id', categoryIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryItemDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa danh mục chưa có con và chưa có sản phẩm' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'CATEGORY_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'CATEGORY_HAS_CHILDREN | CATEGORY_HAS_PRODUCTS',
  })
  remove(@Param('id', categoryIdPipe) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
