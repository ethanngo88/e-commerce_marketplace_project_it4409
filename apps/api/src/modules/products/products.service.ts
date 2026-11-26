import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { Paginated } from '../../common/pagination/paginated';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import {
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

const MAX_SEARCH_TOKENS = 10;

const PUBLIC_PRODUCT_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  minPrice: true,
  ratingAvg: true,
  ratingCount: true,
  soldCount: true,
  store: {
    select: {
      name: true,
      slug: true,
    },
  },
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 1,
    select: {
      url: true,
    },
  },
} satisfies Prisma.ProductSelect;

type PublicProductSummaryRecord = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_SUMMARY_SELECT;
}>;

/** Escape ký tự wildcard của PostgreSQL LIKE (`\`, `%`, `_`). */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Tách từ khóa thành các token tối đa MAX_SEARCH_TOKENS để tìm không dấu. */
export function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, MAX_SEARCH_TOKENS);
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  /**
   * Tìm kiếm, lọc, sắp xếp và phân trang sản phẩm công khai (doc 05 mục 7.1, doc 03 mục 6.6).
   * Chỉ trả sản phẩm ACTIVE, chưa xóa mềm, thuộc store của Seller APPROVED.
   */
  async searchPublic(
    query: QueryProductsDto,
  ): Promise<Paginated<ProductSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort = query.sort ?? ProductSort.NEWEST;

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Giá tối thiểu không được lớn hơn giá tối đa',
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'minPrice',
            message: 'Giá tối thiểu không được lớn hơn giá tối đa',
          },
        ],
      );
    }

    let categoryIds: string[] | undefined;
    if (query.categorySlug) {
      const resolved = await this.categories.resolveActiveCategoryIdsBySlug(
        query.categorySlug,
      );
      if (!resolved || resolved.length === 0) {
        return Paginated.of([], page, limit, 0);
      }
      categoryIds = resolved;
    }

    const tokens = query.q ? tokenizeSearchQuery(query.q) : [];
    if (tokens.length > 0) {
      return this.searchWithUnaccentSql(
        query,
        tokens,
        categoryIds,
        page,
        limit,
        sort,
      );
    }

    return this.listWithoutTextSearch(query, categoryIds, page, limit, sort);
  }

  /**
   * Chi tiết một sản phẩm công khai theo slug (doc 05 mục 7.1).
   * Trả 404 PRODUCT_NOT_FOUND nếu sản phẩm không tồn tại, không ACTIVE, đã xóa mềm,
   * hoặc thuộc Seller không ở trạng thái APPROVED.
   */
  async getPublicBySlug(slug: string): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        status: 'ACTIVE',
        deletedAt: null,
        store: {
          seller: { status: 'APPROVED' },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        minPrice: true,
        ratingAvg: true,
        ratingCount: true,
        soldCount: true,
        store: {
          select: {
            name: true,
            slug: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        images: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            url: true,
            sortOrder: true,
          },
        },
        variants: {
          where: { isActive: true },
          orderBy: [{ price: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            sku: true,
            name: true,
            attributes: true,
            price: true,
            inventory: {
              select: { quantity: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new AppException(
        ErrorCode.PRODUCT_NOT_FOUND,
        'Không tìm thấy sản phẩm',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      thumbnailUrl: product.images[0]?.url ?? null,
      minPrice: product.minPrice,
      ratingAvg: Number(product.ratingAvg),
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      store: product.store,
      category: product.category,
      images: product.images,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        attributes: toAttributesObject(variant.attributes),
        price: variant.price,
        stock: variant.inventory?.quantity ?? 0,
      })),
    };
  }

  private async listWithoutTextSearch(
    query: QueryProductsDto,
    categoryIds: string[] | undefined,
    page: number,
    limit: number,
    sort: ProductSort,
  ): Promise<Paginated<ProductSummaryDto>> {
    const where = buildPublicProductWhere(query, categoryIds);
    const orderBy = buildPrismaOrderBy(sort);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: PUBLIC_PRODUCT_SUMMARY_SELECT,
      }),
      this.prisma.product.count({ where }),
    ]);

    return Paginated.of(items.map(toProductSummaryDto), page, limit, total);
  }

  /**
   * Tìm kiếm tiếng Việt không dấu dùng hàm `f_unaccent` và GIN trigram index
   * `products_name_trgm_idx` đã cài ở migration đầu tiên (doc 04 mục 7).
   * Mọi tham số đều bind qua Prisma.sql (chống SQL injection).
   */
  private async searchWithUnaccentSql(
    query: QueryProductsDto,
    tokens: string[],
    categoryIds: string[] | undefined,
    page: number,
    limit: number,
    sort: ProductSort,
  ): Promise<Paginated<ProductSummaryDto>> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'ACTIVE'::"product_status"`,
      Prisma.sql`p.deleted_at IS NULL`,
      Prisma.sql`sel.status = 'APPROVED'::"seller_status"`,
    ];

    for (const token of tokens) {
      const escaped = escapeLikePattern(token);
      conditions.push(
        Prisma.sql`f_unaccent(lower(p.name)) LIKE '%' || f_unaccent(lower(${escaped})) || '%' ESCAPE '\\'`,
      );
    }

    if (categoryIds && categoryIds.length > 0) {
      const uuidValues = categoryIds.map((id) => Prisma.sql`${id}::uuid`);
      conditions.push(
        Prisma.sql`p.category_id IN (${Prisma.join(uuidValues)})`,
      );
    }

    if (query.storeSlug) {
      conditions.push(Prisma.sql`st.slug = ${query.storeSlug}`);
    }

    if (query.minPrice !== undefined) {
      conditions.push(Prisma.sql`p.min_price >= ${query.minPrice}`);
    }

    if (query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`p.min_price <= ${query.maxPrice}`);
    }

    if (query.minRating !== undefined) {
      conditions.push(Prisma.sql`p.rating_avg >= ${query.minRating}`);
    }

    if (query.inStock === true) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM product_variants pv
          INNER JOIN inventory inv ON inv.variant_id = pv.id
          WHERE pv.product_id = p.id
            AND pv.is_active = true
            AND inv.quantity > 0
        )`,
      );
    }

    const whereSql = Prisma.join(conditions, ' AND ');
    const orderBySql = buildRawOrderBy(sort);
    const offset = (page - 1) * limit;

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM products p
        INNER JOIN stores st ON st.id = p.store_id
        INNER JOIN sellers sel ON sel.id = st.seller_id
        WHERE ${whereSql}
      `),
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p.id
        FROM products p
        INNER JOIN stores st ON st.id = p.store_id
        INNER JOIN sellers sel ON sel.id = st.seller_id
        WHERE ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT ${limit}
        OFFSET ${offset}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    if (total === 0 || idRows.length === 0) {
      return Paginated.of([], page, limit, total);
    }

    const orderedIds = idRows.map((row) => row.id);
    const records = await this.prisma.product.findMany({
      where: { id: { in: orderedIds } },
      select: PUBLIC_PRODUCT_SUMMARY_SELECT,
    });

    const recordById = new Map(records.map((record) => [record.id, record]));
    const orderedSummaries = orderedIds
      .map((id) => recordById.get(id))
      .filter(
        (record): record is PublicProductSummaryRecord => record !== undefined,
      )
      .map(toProductSummaryDto);

    return Paginated.of(orderedSummaries, page, limit, total);
  }
}

function buildPublicProductWhere(
  query: QueryProductsDto,
  categoryIds: string[] | undefined,
): Prisma.ProductWhereInput {
  const storeFilter: Prisma.StoreWhereInput = {
    seller: { status: 'APPROVED' },
    ...(query.storeSlug ? { slug: query.storeSlug } : {}),
  };

  const minPriceFilter: Prisma.IntFilter = {};
  if (query.minPrice !== undefined) {
    minPriceFilter.gte = query.minPrice;
  }
  if (query.maxPrice !== undefined) {
    minPriceFilter.lte = query.maxPrice;
  }

  return {
    status: 'ACTIVE',
    deletedAt: null,
    store: storeFilter,
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(Object.keys(minPriceFilter).length > 0
      ? { minPrice: minPriceFilter }
      : {}),
    ...(query.minRating !== undefined
      ? { ratingAvg: { gte: query.minRating } }
      : {}),
    ...(query.inStock === true
      ? {
          variants: {
            some: {
              isActive: true,
              inventory: { quantity: { gt: 0 } },
            },
          },
        }
      : {}),
  };
}

/** Sắp xếp luôn kèm `id` làm khóa phụ để phân trang ổn định (doc 03 mục 6.6). */
function buildPrismaOrderBy(
  sort: ProductSort,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case ProductSort.PRICE_ASC:
      return [{ minPrice: 'asc' }, { id: 'asc' }];
    case ProductSort.PRICE_DESC:
      return [{ minPrice: 'desc' }, { id: 'asc' }];
    case ProductSort.BEST_SELLING:
      return [{ soldCount: 'desc' }, { id: 'asc' }];
    case ProductSort.RATING:
      return [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }];
    case ProductSort.NEWEST:
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

function buildRawOrderBy(sort: ProductSort): Prisma.Sql {
  switch (sort) {
    case ProductSort.PRICE_ASC:
      return Prisma.sql`p.min_price ASC, p.id ASC`;
    case ProductSort.PRICE_DESC:
      return Prisma.sql`p.min_price DESC, p.id ASC`;
    case ProductSort.BEST_SELLING:
      return Prisma.sql`p.sold_count DESC, p.id ASC`;
    case ProductSort.RATING:
      return Prisma.sql`p.rating_avg DESC, p.rating_count DESC, p.id ASC`;
    case ProductSort.NEWEST:
    default:
      return Prisma.sql`p.created_at DESC, p.id ASC`;
  }
}

function toProductSummaryDto(
  record: PublicProductSummaryRecord,
): ProductSummaryDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    thumbnailUrl: record.images[0]?.url ?? null,
    minPrice: record.minPrice,
    ratingAvg: Number(record.ratingAvg),
    ratingCount: record.ratingCount,
    soldCount: record.soldCount,
    store: record.store,
  };
}

function toAttributesObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
