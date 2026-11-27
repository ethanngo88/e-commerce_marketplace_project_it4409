import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { Paginated } from '../../common/pagination/paginated';
import { appendSlugSuffix, slugify } from '../../common/utils/slugify';
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CloudinaryService,
  UploadedImageResult,
  validateImageFile,
} from '../../upload/cloudinary.service';
import { CategoriesService } from '../categories/categories.service';
import {
  ProductImageDto,
  SellerProductDetailDto,
  SellerProductSummaryDto,
  SellerProductVariantDto,
} from './dto/product-response.dto';
import {
  CreateProductDto,
  CreateVariantDto,
  QuerySellerProductsDto,
  ReorderProductImagesDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateVariantDto,
} from './dto/seller-product.dto';

export const MAX_VARIANTS_PER_PRODUCT = 30;
export const MAX_IMAGES_PER_PRODUCT = 8;
const MAX_SLUG_ATTEMPTS = 5;

const SELLER_PRODUCT_DETAIL_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  status: true,
  minPrice: true,
  ratingAvg: true,
  ratingCount: true,
  soldCount: true,
  createdAt: true,
  updatedAt: true,
  store: { select: { name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, url: true, sortOrder: true },
  },
  variants: {
    orderBy: [{ price: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      name: true,
      attributes: true,
      price: true,
      isActive: true,
      inventory: { select: { quantity: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type SellerProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof SELLER_PRODUCT_DETAIL_SELECT;
}>;

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(
    storeId: string,
    query: QuerySellerProductsDto,
  ): Promise<Paginated<SellerProductSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductWhereInput = {
      storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            name: {
              contains: query.q,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          minPrice: true,
          ratingAvg: true,
          ratingCount: true,
          soldCount: true,
          createdAt: true,
          updatedAt: true,
          store: { select: { name: true, slug: true } },
          images: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            take: 1,
            select: { url: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return Paginated.of(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        status: item.status,
        thumbnailUrl: item.images[0]?.url ?? null,
        minPrice: item.minPrice,
        ratingAvg: Number(item.ratingAvg),
        ratingCount: item.ratingCount,
        soldCount: item.soldCount,
        store: item.store,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      page,
      limit,
      total,
    );
  }

  async getById(
    storeId: string,
    productId: string,
  ): Promise<SellerProductDetailDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: SELLER_PRODUCT_DETAIL_SELECT,
    });
    if (!product) {
      throw productNotFound();
    }
    return toSellerProductDetail(product);
  }

  /**
   * Tạo sản phẩm mới ở trạng thái DRAFT kèm toàn bộ variant và tồn kho ban đầu
   * trong cùng một transaction (doc 03 mục 6.5, doc 05 mục 7.2).
   */
  async create(
    storeId: string,
    dto: CreateProductDto,
  ): Promise<SellerProductDetailDto> {
    await this.categories.assertLeafCategory(dto.categoryId);
    assertUniqueSkusInPayload(dto.variants);

    const minPrice = Math.min(...dto.variants.map((v) => v.price));
    const baseSlug = slugify(dto.name, 200);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = appendSlugSuffix(baseSlug, undefined, 255);
      try {
        const created = await this.prisma.$transaction((tx) =>
          tx.product.create({
            data: {
              storeId,
              categoryId: dto.categoryId,
              name: dto.name,
              slug,
              description: dto.description ?? null,
              status: ProductStatus.DRAFT,
              minPrice,
              variants: {
                create: dto.variants.map((v) => ({
                  sku: v.sku,
                  name: v.name,
                  attributes: (v.attributes ?? {}) as Prisma.InputJsonValue,
                  price: v.price,
                  isActive: true,
                  inventory: {
                    create: { quantity: v.stock },
                  },
                })),
              },
            },
            select: SELLER_PRODUCT_DETAIL_SELECT,
          }),
        );
        return toSellerProductDetail(created);
      } catch (error) {
        if (!isPrismaError(error, 'P2002')) {
          throw error;
        }
      }
    }

    throw new AppException(
      ErrorCode.CONFLICT,
      'Không thể tạo đường dẫn sản phẩm duy nhất, vui lòng thử lại',
      HttpStatus.CONFLICT,
    );
  }

  async update(
    storeId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<SellerProductDetailDto> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    if (dto.categoryId !== undefined) {
      await this.categories.assertLeafCategory(dto.categoryId);
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
      select: SELLER_PRODUCT_DETAIL_SELECT,
    });

    return toSellerProductDetail(updated);
  }

  /**
   * Đổi trạng thái sản phẩm (DRAFT / ACTIVE / HIDDEN).
   * - Sản phẩm BANNED chỉ Admin mới đổi được (403 PRODUCT_BANNED).
   * - Chuyển sang ACTIVE yêu cầu ≥ 1 ảnh và ≥ 1 variant đang bật (400 PRODUCT_NOT_PUBLISHABLE).
   */
  async updateStatus(
    storeId: string,
    productId: string,
    dto: UpdateProductStatusDto,
  ): Promise<{ id: string; status: ProductStatus }> {
    const owned = await this.prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: {
        id: true,
        status: true,
        _count: { select: { images: true } },
        variants: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });
    if (!owned) {
      throw productNotFound();
    }

    assertNotBanned(owned.status);

    const targetStatus = dto.status as ProductStatus;
    if (targetStatus === ProductStatus.ACTIVE) {
      if (owned._count.images < 1 || owned.variants.length < 1) {
        throw new AppException(
          ErrorCode.PRODUCT_NOT_PUBLISHABLE,
          'Sản phẩm cần có ít nhất 1 ảnh và 1 biến thể đang hoạt động trước khi đăng bán',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: targetStatus },
      select: { id: true, status: true },
    });

    return updated;
  }

  async softDelete(storeId: string, productId: string): Promise<void> {
    await this.findOwnedProduct(storeId, productId);
    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });
  }

  async addVariant(
    storeId: string,
    productId: string,
    dto: CreateVariantDto,
  ): Promise<SellerProductVariantDto> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentCount = await tx.productVariant.count({
          where: { productId },
        });
        if (currentCount >= MAX_VARIANTS_PER_PRODUCT) {
          throw new AppException(
            ErrorCode.VALIDATION_ERROR,
            `Mỗi sản phẩm chỉ được có tối đa ${MAX_VARIANTS_PER_PRODUCT} biến thể`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const dup = await tx.productVariant.findUnique({
          where: { productId_sku: { productId, sku: dto.sku } },
          select: { id: true },
        });
        if (dup) {
          throw duplicateSku(dto.sku);
        }

        const created = await tx.productVariant.create({
          data: {
            productId,
            sku: dto.sku,
            name: dto.name,
            attributes: (dto.attributes ?? {}) as Prisma.InputJsonValue,
            price: dto.price,
            isActive: true,
            inventory: { create: { quantity: dto.stock } },
          },
          select: {
            id: true,
            sku: true,
            name: true,
            attributes: true,
            price: true,
            isActive: true,
            inventory: { select: { quantity: true } },
          },
        });

        await recalculateProductMinPrice(tx, productId);
        return toSellerVariantDto(created);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw duplicateSku(dto.sku);
      }
      throw error;
    }
  }

  async updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<SellerProductVariantDto> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
          select: { id: true, sku: true, isActive: true },
        });
        if (!variant) {
          throw variantNotFound();
        }

        if (dto.isActive === false && variant.isActive) {
          const otherActive = await tx.productVariant.count({
            where: { productId, isActive: true, id: { not: variantId } },
          });
          if (otherActive === 0) {
            throw lastActiveVariant();
          }
        }

        if (dto.sku !== undefined && dto.sku !== variant.sku) {
          const dup = await tx.productVariant.findUnique({
            where: { productId_sku: { productId, sku: dto.sku } },
            select: { id: true },
          });
          if (dup) {
            throw duplicateSku(dto.sku);
          }
        }

        const updated = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.attributes !== undefined
              ? { attributes: dto.attributes as Prisma.InputJsonValue }
              : {}),
            ...(dto.price !== undefined ? { price: dto.price } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: {
            id: true,
            sku: true,
            name: true,
            attributes: true,
            price: true,
            isActive: true,
            inventory: { select: { quantity: true } },
          },
        });

        await recalculateProductMinPrice(tx, productId);
        return toSellerVariantDto(updated);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw duplicateSku(dto.sku ?? '');
      }
      throw error;
    }
  }

  async deleteVariant(
    storeId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    try {
      await this.prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
          select: {
            id: true,
            isActive: true,
            _count: { select: { orderItems: true } },
          },
        });
        if (!variant) {
          throw variantNotFound();
        }

        if (variant._count.orderItems > 0) {
          throw variantHasOrders();
        }

        const totalVariants = await tx.productVariant.count({
          where: { productId },
        });
        if (totalVariants <= 1) {
          throw lastActiveVariant();
        }

        if (variant.isActive) {
          const otherActive = await tx.productVariant.count({
            where: { productId, isActive: true, id: { not: variantId } },
          });
          if (otherActive === 0) {
            throw lastActiveVariant();
          }
        }

        await tx.productVariant.delete({ where: { id: variantId } });
        await recalculateProductMinPrice(tx, productId);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw variantHasOrders();
      }
      throw error;
    }
  }

  async uploadImages(
    storeId: string,
    productId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<ProductImageDto[]> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    if (!files || files.length === 0) {
      throw new AppException(
        ErrorCode.INVALID_FILE,
        'Vui lòng chọn ít nhất một tệp ảnh hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingImages = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'desc' }],
      select: { id: true, sortOrder: true },
    });

    if (existingImages.length + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new AppException(
        ErrorCode.IMAGE_LIMIT_REACHED,
        `Mỗi sản phẩm chỉ được tải lên tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Kiểm tra toàn bộ file trước khi tải lên Cloudinary để tránh tải dở dang.
    for (const file of files) {
      validateImageFile(file);
    }

    const uploaded: UploadedImageResult[] = [];
    try {
      for (const file of files) {
        const res = await this.cloudinary.uploadImage(
          file,
          `marketplace/products/${productId}`,
        );
        uploaded.push(res);
      }

      const startOrder =
        existingImages.length > 0 ? existingImages[0].sortOrder + 1 : 0;

      return await this.prisma.$transaction(async (tx) => {
        const created: ProductImageDto[] = [];
        for (let idx = 0; idx < uploaded.length; idx++) {
          const img = await tx.productImage.create({
            data: {
              productId,
              url: uploaded[idx].url,
              publicId: uploaded[idx].publicId,
              sortOrder: startOrder + idx,
            },
            select: { id: true, url: true, sortOrder: true },
          });
          created.push(img);
        }
        return created;
      });
    } catch (error) {
      // Nếu lỗi giữa chừng, dọn các ảnh đã lỡ upload lên Cloudinary (best-effort).
      await Promise.all(
        uploaded.map((item) => this.cloudinary.deleteImage(item.publicId)),
      );
      throw error;
    }
  }

  async reorderImages(
    storeId: string,
    productId: string,
    dto: ReorderProductImagesDto,
  ): Promise<ProductImageDto[]> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    const existing = await this.prisma.productImage.findMany({
      where: { productId },
      select: { id: true },
    });

    const existingSet = new Set(existing.map((img) => img.id));
    const uniqueInput = new Set(dto.imageIds);
    if (
      uniqueInput.size !== dto.imageIds.length ||
      uniqueInput.size !== existingSet.size ||
      dto.imageIds.some((id) => !existingSet.has(id))
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Danh sách imageIds phải khớp đầy đủ và không trùng lặp với ảnh hiện có của sản phẩm',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.imageIds.length; i++) {
        await tx.productImage.update({
          where: { id: dto.imageIds[i] },
          data: { sortOrder: i },
        });
      }
      return tx.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, url: true, sortOrder: true },
      });
    });
  }

  async deleteImage(
    storeId: string,
    productId: string,
    imageId: string,
  ): Promise<void> {
    const owned = await this.findOwnedProduct(storeId, productId);
    assertNotBanned(owned.status);

    const image = await this.prisma.$transaction(async (tx) => {
      // Khóa dòng sản phẩm để các lần xóa ảnh của cùng sản phẩm chạy lần lượt.
      // Nếu không, hai request cùng thấy "còn 2 ảnh" và cùng xóa, sản phẩm ACTIVE hết ảnh.
      const [product] = await tx.$queryRaw<{ status: ProductStatus }[]>`
        SELECT status FROM products WHERE id = ${productId}::uuid FOR UPDATE`;

      const target = await tx.productImage.findFirst({
        where: { id: imageId, productId },
        select: { id: true, publicId: true },
      });
      if (!target) {
        throw new AppException(
          ErrorCode.IMAGE_NOT_FOUND,
          'Không tìm thấy ảnh sản phẩm',
          HttpStatus.NOT_FOUND,
        );
      }

      // Sản phẩm đang bán phải có ít nhất 1 ảnh (doc 03 mục 6.5).
      if (product?.status === ProductStatus.ACTIVE) {
        const imageCount = await tx.productImage.count({
          where: { productId },
        });
        if (imageCount <= 1) {
          throw new AppException(
            ErrorCode.PRODUCT_NOT_PUBLISHABLE,
            'Sản phẩm đang bán phải còn ít nhất một ảnh. Hãy thêm ảnh khác hoặc ẩn sản phẩm trước khi xóa ảnh này.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      await tx.productImage.delete({ where: { id: imageId } });
      return target;
    });

    // Xóa trên Cloudinary sau khi database đã xóa xong, để lỗi database không làm mất ảnh.
    await this.cloudinary.deleteImage(image.publicId);
  }

  private async findOwnedProduct(
    storeId: string,
    productId: string,
  ): Promise<{ id: string; status: ProductStatus }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) {
      throw productNotFound();
    }
    return product;
  }
}

async function recalculateProductMinPrice(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  const agg = await tx.productVariant.aggregate({
    where: { productId, isActive: true },
    _min: { price: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: { minPrice: agg._min.price ?? 0 },
  });
}

function assertUniqueSkusInPayload(variants: CreateVariantDto[]): void {
  const seen = new Set<string>();
  for (const variant of variants) {
    if (seen.has(variant.sku)) {
      throw duplicateSku(variant.sku);
    }
    seen.add(variant.sku);
  }
}

function assertNotBanned(status: ProductStatus): void {
  if (status === ProductStatus.BANNED) {
    throw new AppException(
      ErrorCode.PRODUCT_BANNED,
      'Sản phẩm đã bị quản trị viên cấm, không thể chỉnh sửa hoặc mở bán lại',
      HttpStatus.FORBIDDEN,
    );
  }
}

function toSellerProductDetail(
  product: SellerProductDetailRecord,
): SellerProductDetailDto {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    description: product.description,
    thumbnailUrl: product.images[0]?.url ?? null,
    minPrice: product.minPrice,
    ratingAvg: Number(product.ratingAvg),
    ratingCount: product.ratingCount,
    soldCount: product.soldCount,
    store: product.store,
    category: product.category,
    images: product.images,
    variants: product.variants.map(toSellerVariantDto),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toSellerVariantDto(variant: {
  id: string;
  sku: string;
  name: string;
  attributes: Prisma.JsonValue;
  price: number;
  isActive: boolean;
  inventory: { quantity: number } | null;
}): SellerProductVariantDto {
  const attributes =
    typeof variant.attributes === 'object' &&
    variant.attributes !== null &&
    !Array.isArray(variant.attributes)
      ? (variant.attributes as Record<string, unknown>)
      : {};
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    attributes,
    price: variant.price,
    isActive: variant.isActive,
    stock: variant.inventory?.quantity ?? 0,
  };
}

function productNotFound(): AppException {
  return new AppException(
    ErrorCode.PRODUCT_NOT_FOUND,
    'Không tìm thấy sản phẩm',
    HttpStatus.NOT_FOUND,
  );
}

function variantNotFound(): AppException {
  return new AppException(
    ErrorCode.VARIANT_NOT_FOUND,
    'Không tìm thấy biến thể sản phẩm',
    HttpStatus.NOT_FOUND,
  );
}

function duplicateSku(sku: string): AppException {
  return new AppException(
    ErrorCode.DUPLICATE_SKU,
    sku
      ? `Mã SKU "${sku}" đã tồn tại trong sản phẩm này`
      : 'Mã SKU bị trùng trong sản phẩm này',
    HttpStatus.CONFLICT,
  );
}

function lastActiveVariant(): AppException {
  return new AppException(
    ErrorCode.LAST_ACTIVE_VARIANT,
    'Sản phẩm phải giữ lại ít nhất một biến thể đang hoạt động',
    HttpStatus.BAD_REQUEST,
  );
}

function variantHasOrders(): AppException {
  return new AppException(
    ErrorCode.VARIANT_HAS_ORDERS,
    'Không thể xóa biến thể đã có đơn hàng, hãy tắt trạng thái hoạt động thay thế',
    HttpStatus.CONFLICT,
  );
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
