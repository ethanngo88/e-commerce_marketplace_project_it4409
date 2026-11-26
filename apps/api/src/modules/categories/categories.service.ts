import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { appendSlugSuffix, slugify } from '../../common/utils/slugify';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  AdminCategoryTreeItemDto,
  CategoryDetailDto,
  CategoryItemDto,
  CategoryTreeItemDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** Key và TTL cache cây danh mục công khai (doc 03 mục 9: 10 phút). */
export const CATEGORIES_TREE_CACHE_KEY = 'categories:tree';
export const CATEGORIES_TREE_CACHE_TTL_SECONDS = 600;

const MAX_SLUG_ATTEMPTS = 5;

const CATEGORY_ORDER_BY: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

const CATEGORY_BASE_SELECT = {
  id: true,
  parentId: true,
  name: true,
  slug: true,
  isActive: true,
  sortOrder: true,
} satisfies Prisma.CategorySelect;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Cây danh mục đang bật (tối đa 2 cấp) cho trang công khai.
   * Đọc từ Redis cache (TTL 10 phút) nếu có, tự fallback sang PostgreSQL.
   */
  async getPublicTree(): Promise<CategoryTreeItemDto[]> {
    const cached = await this.redis.getJson<CategoryTreeItemDto[]>(
      CATEGORIES_TREE_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    const roots = await this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: CATEGORY_ORDER_BY,
      select: {
        ...CATEGORY_BASE_SELECT,
        children: {
          where: { isActive: true },
          orderBy: CATEGORY_ORDER_BY,
          select: CATEGORY_BASE_SELECT,
        },
      },
    });

    await this.redis.setJson(
      CATEGORIES_TREE_CACHE_KEY,
      roots,
      CATEGORIES_TREE_CACHE_TTL_SECONDS,
    );

    return roots;
  }

  /**
   * Chi tiết một danh mục công khai theo slug.
   * Danh mục tắt (hoặc có danh mục cha đang tắt) trả 404 CATEGORY_NOT_FOUND.
   */
  async getPublicBySlug(slug: string): Promise<CategoryDetailDto> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: {
        ...CATEGORY_BASE_SELECT,
        parent: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
        children: {
          where: { isActive: true },
          orderBy: CATEGORY_ORDER_BY,
          select: CATEGORY_BASE_SELECT,
        },
      },
    });

    if (
      !category ||
      !category.isActive ||
      (category.parent && !category.parent.isActive)
    ) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Không tìm thấy danh mục',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      slug: category.slug,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      parent: category.parent
        ? {
            id: category.parent.id,
            name: category.parent.name,
            slug: category.parent.slug,
          }
        : null,
      children: category.children,
    };
  }

  /**
   * Toàn bộ cây danh mục cho Admin (bao gồm cả danh mục đang tắt và số lượng sản phẩm).
   */
  async getAdminTree(): Promise<AdminCategoryTreeItemDto[]> {
    const roots = await this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: CATEGORY_ORDER_BY,
      select: {
        ...CATEGORY_BASE_SELECT,
        _count: { select: { products: true } },
        children: {
          orderBy: CATEGORY_ORDER_BY,
          select: {
            ...CATEGORY_BASE_SELECT,
            _count: { select: { products: true } },
          },
        },
      },
    });

    return roots.map((root) => ({
      id: root.id,
      parentId: root.parentId,
      name: root.name,
      slug: root.slug,
      isActive: root.isActive,
      sortOrder: root.sortOrder,
      productCount: root._count.products,
      children: root.children.map((child) => ({
        id: child.id,
        parentId: child.parentId,
        name: child.name,
        slug: child.slug,
        isActive: child.isActive,
        sortOrder: child.sortOrder,
        productCount: child._count.products,
      })),
    }));
  }

  /**
   * Tạo danh mục mới (Admin).
   * Ràng buộc: tối đa 2 cấp (doc 03 mục 6.4); không tạo danh mục con dưới danh mục đã có sản phẩm.
   */
  async create(dto: CreateCategoryDto): Promise<CategoryItemDto> {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
        select: {
          id: true,
          parentId: true,
          _count: { select: { products: true } },
        },
      });

      if (!parent) {
        throw new AppException(
          ErrorCode.CATEGORY_NOT_FOUND,
          'Không tìm thấy danh mục cha',
          HttpStatus.NOT_FOUND,
        );
      }

      if (parent.parentId !== null) {
        throw new AppException(
          ErrorCode.CATEGORY_DEPTH_EXCEEDED,
          'Danh mục chỉ hỗ trợ tối đa 2 cấp',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (parent._count.products > 0) {
        throw new AppException(
          ErrorCode.CATEGORY_HAS_PRODUCTS,
          'Không thể thêm danh mục con vào danh mục đang có sản phẩm',
          HttpStatus.CONFLICT,
        );
      }
    }

    const baseSlug = slugify(dto.name);
    const created = await this.createWithUniqueSlug(dto, baseSlug);
    await this.invalidateTreeCache();
    return created;
  }

  /**
   * Cập nhật tên, thứ tự hiển thị hoặc trạng thái bật/tắt (Admin).
   * Giữ nguyên slug để không làm hỏng URL công khai hiện có.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryItemDto> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Không tìm thấy danh mục',
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: CATEGORY_BASE_SELECT,
    });

    await this.invalidateTreeCache();
    return updated;
  }

  /**
   * Xóa danh mục (Admin). Chặn nếu còn danh mục con hoặc còn sản phẩm tham chiếu.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { children: true, products: true } },
      },
    });

    if (!existing) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Không tìm thấy danh mục',
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing._count.children > 0) {
      throw new AppException(
        ErrorCode.CATEGORY_HAS_CHILDREN,
        'Không thể xóa danh mục đang có danh mục con',
        HttpStatus.CONFLICT,
      );
    }

    if (existing._count.products > 0) {
      throw new AppException(
        ErrorCode.CATEGORY_HAS_PRODUCTS,
        'Không thể xóa danh mục đang có sản phẩm',
        HttpStatus.CONFLICT,
      );
    }

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new AppException(
          ErrorCode.CATEGORY_NOT_FOUND,
          'Không tìm thấy danh mục',
          HttpStatus.NOT_FOUND,
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new AppException(
          ErrorCode.CATEGORY_HAS_PRODUCTS,
          'Không thể xóa danh mục đang có dữ liệu liên kết',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.invalidateTreeCache();
  }

  /**
   * Trả về danh sách ID danh mục active gồm chính nó và các danh mục con active (nếu có).
   * Dùng bởi ProductsModule (T-15) để lọc theo danh mục cha bao gồm cả danh mục con.
   * Trả `null` nếu slug không tồn tại hoặc danh mục/cha đang tắt.
   */
  async resolveActiveCategoryIdsBySlug(slug: string): Promise<string[] | null> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: {
        id: true,
        isActive: true,
        parent: { select: { isActive: true } },
        children: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (
      !category ||
      !category.isActive ||
      (category.parent && !category.parent.isActive)
    ) {
      return null;
    }

    return [category.id, ...category.children.map((child) => child.id)];
  }

  /**
   * Kiểm tra danh mục tồn tại, đang bật và là danh mục lá (không có con).
   * Dùng bởi ProductsModule khi Seller tạo/sửa sản phẩm (T-14).
   */
  async assertLeafCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        isActive: true,
        parent: { select: { isActive: true } },
        _count: { select: { children: true } },
      },
    });

    if (
      !category ||
      !category.isActive ||
      (category.parent && !category.parent.isActive)
    ) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Không tìm thấy danh mục',
        HttpStatus.NOT_FOUND,
      );
    }

    if (category._count.children > 0) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_LEAF,
        'Sản phẩm chỉ có thể gán vào danh mục lá (không có danh mục con)',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async createWithUniqueSlug(
    dto: CreateCategoryDto,
    baseSlug: string,
  ): Promise<CategoryItemDto> {
    let candidate = baseSlug;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.category.create({
          data: {
            name: dto.name,
            slug: candidate,
            parentId: dto.parentId ?? null,
            sortOrder: dto.sortOrder ?? 0,
          },
          select: CATEGORY_BASE_SELECT,
        });
      } catch (error) {
        if (!isPrismaError(error, 'P2002')) {
          throw error;
        }
        candidate = appendSlugSuffix(baseSlug);
      }
    }

    throw new AppException(
      ErrorCode.CONFLICT,
      'Không thể tạo slug duy nhất cho danh mục, vui lòng thử lại',
      HttpStatus.CONFLICT,
    );
  }

  private async invalidateTreeCache(): Promise<void> {
    await this.redis.del(CATEGORIES_TREE_CACHE_KEY);
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
