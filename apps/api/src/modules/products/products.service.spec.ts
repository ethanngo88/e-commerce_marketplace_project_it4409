import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Paginated } from '../../common/pagination/paginated';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';
import {
  escapeLikePattern,
  ProductsService,
  tokenizeSearchQuery,
} from './products.service';

describe('ProductsService (T-15 public read & search)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let categories: DeepMockProxy<CategoriesService>;
  let service: ProductsService;

  const summaryRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    name: 'Áo thun cotton',
    slug: 'ao-thun-cotton',
    minPrice: 150000,
    ratingAvg: '4.60',
    ratingCount: 23,
    soldCount: 120,
    store: { name: 'Shop An', slug: 'shop-an' },
    images: [{ url: 'https://cdn.example.com/ao.jpg' }],
    ...overrides,
  });

  const baseQuery = (
    overrides: Partial<QueryProductsDto> = {},
  ): QueryProductsDto => ({
    sort: ProductSort.NEWEST,
    page: 1,
    limit: 20,
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    categories = mockDeep<CategoriesService>();
    service = new ProductsService(prisma, categories);
  });

  describe('helpers', () => {
    it('should escape LIKE wildcards and backslashes', () => {
      expect(escapeLikePattern('100%_cotton\\a')).toBe('100\\%\\_cotton\\\\a');
    });

    it('should split search terms and cap at 10 tokens', () => {
      expect(tokenizeSearchQuery('  ao   thun  nam ')).toEqual([
        'ao',
        'thun',
        'nam',
      ]);
      expect(tokenizeSearchQuery('1 2 3 4 5 6 7 8 9 10 11 12')).toHaveLength(
        10,
      );
    });
  });

  describe('searchPublic', () => {
    it('should filter only ACTIVE, non-deleted products of APPROVED sellers and map Decimal ratingAvg to number', async () => {
      prisma.product.findMany.mockResolvedValue([summaryRecord()] as never);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.searchPublic(baseQuery());

      expect(result).toBeInstanceOf(Paginated);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(result.data).toEqual([
        {
          id: 'prod-1',
          name: 'Áo thun cotton',
          slug: 'ao-thun-cotton',
          thumbnailUrl: 'https://cdn.example.com/ao.jpg',
          minPrice: 150000,
          ratingAvg: 4.6,
          ratingCount: 23,
          soldCount: 120,
          store: { name: 'Shop An', slug: 'shop-an' },
        },
      ]);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            store: { seller: { status: 'APPROVED' } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter parent category including child category IDs', async () => {
      categories.resolveActiveCategoryIdsBySlug.mockResolvedValue([
        'cat-parent',
        'cat-child-1',
        'cat-child-2',
      ]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.searchPublic(baseQuery({ categorySlug: 'thoi-trang-nam' }));

      expect(categories.resolveActiveCategoryIdsBySlug).toHaveBeenCalledWith(
        'thoi-trang-nam',
      );
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: { in: ['cat-parent', 'cat-child-1', 'cat-child-2'] },
          }),
        }),
      );
    });

    it('should return an empty Paginated result immediately when categorySlug is unknown or inactive', async () => {
      categories.resolveActiveCategoryIdsBySlug.mockResolvedValue(null);

      const result = await service.searchPublic(
        baseQuery({ categorySlug: 'dong-ho-nam' }),
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should apply price range, rating, storeSlug, and inStock filters', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.searchPublic(
        baseQuery({
          storeSlug: 'shop-an',
          minPrice: 100000,
          maxPrice: 500000,
          minRating: 4,
          inStock: true,
        }),
      );

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            store: { seller: { status: 'APPROVED' }, slug: 'shop-an' },
            minPrice: { gte: 100000, lte: 500000 },
            ratingAvg: { gte: 4 },
            variants: {
              some: {
                isActive: true,
                inventory: { quantity: { gt: 0 } },
              },
            },
          },
        }),
      );
    });

    it('should reject when minPrice is greater than maxPrice', async () => {
      await expect(
        service.searchPublic(baseQuery({ minPrice: 500000, maxPrice: 100000 })),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    });

    it.each([
      [ProductSort.NEWEST, [{ createdAt: 'desc' }, { id: 'asc' }]],
      [ProductSort.PRICE_ASC, [{ minPrice: 'asc' }, { id: 'asc' }]],
      [ProductSort.PRICE_DESC, [{ minPrice: 'desc' }, { id: 'asc' }]],
      [ProductSort.BEST_SELLING, [{ soldCount: 'desc' }, { id: 'asc' }]],
      [
        ProductSort.RATING,
        [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
      ],
    ])(
      'should apply stable ordering with id tie-breaker for sort=%s',
      async (sort, expectedOrderBy) => {
        prisma.product.findMany.mockResolvedValue([]);
        prisma.product.count.mockResolvedValue(0);

        await service.searchPublic(baseQuery({ sort }));

        expect(prisma.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: expectedOrderBy }),
        );
      },
    );

    it('should use parameterized unaccent SQL when q is provided and preserve SQL ordering', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ total: 2n }] as never)
        .mockResolvedValueOnce([{ id: 'prod-2' }, { id: 'prod-1' }] as never);
      prisma.product.findMany.mockResolvedValue([
        summaryRecord({ id: 'prod-1', name: 'Áo thun 1', images: [] }),
        summaryRecord({ id: 'prod-2', name: 'Áo thun 2' }),
      ] as never);

      const result = await service.searchPublic(
        baseQuery({ q: 'ao thun', sort: ProductSort.PRICE_ASC }),
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(result.meta.total).toBe(2);
      expect(result.data.map((p) => p.id)).toEqual(['prod-2', 'prod-1']);
      expect(result.data[1].thumbnailUrl).toBeNull();
    });
  });

  describe('getPublicBySlug', () => {
    it('should return full ProductDetail with only active variants and stock from inventory', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Áo thun cotton',
        slug: 'ao-thun-cotton',
        description: 'Cotton 100%',
        minPrice: 150000,
        ratingAvg: '4.50',
        ratingCount: 10,
        soldCount: 55,
        store: { name: 'Shop An', slug: 'shop-an' },
        category: { id: 'cat-1', name: 'Áo nam', slug: 'ao-nam' },
        images: [
          { id: 'img-1', url: 'https://cdn.example.com/1.jpg', sortOrder: 0 },
        ],
        variants: [
          {
            id: 'var-1',
            sku: 'AT-DO-L',
            name: 'Đỏ / L',
            attributes: { Màu: 'Đỏ', Size: 'L' },
            price: 150000,
            inventory: { quantity: 12 },
          },
          {
            id: 'var-2',
            sku: 'AT-DEN-XL',
            name: 'Đen / XL',
            attributes: { Màu: 'Đen', Size: 'XL' },
            price: 165000,
            inventory: null,
          },
        ],
      } as never);

      const detail = await service.getPublicBySlug('ao-thun-cotton');

      expect(detail).toEqual({
        id: 'prod-1',
        name: 'Áo thun cotton',
        slug: 'ao-thun-cotton',
        description: 'Cotton 100%',
        thumbnailUrl: 'https://cdn.example.com/1.jpg',
        minPrice: 150000,
        ratingAvg: 4.5,
        ratingCount: 10,
        soldCount: 55,
        store: { name: 'Shop An', slug: 'shop-an' },
        category: { id: 'cat-1', name: 'Áo nam', slug: 'ao-nam' },
        images: [
          { id: 'img-1', url: 'https://cdn.example.com/1.jpg', sortOrder: 0 },
        ],
        variants: [
          {
            id: 'var-1',
            sku: 'AT-DO-L',
            name: 'Đỏ / L',
            attributes: { Màu: 'Đỏ', Size: 'L' },
            price: 150000,
            stock: 12,
          },
          {
            id: 'var-2',
            sku: 'AT-DEN-XL',
            name: 'Đen / XL',
            attributes: { Màu: 'Đen', Size: 'XL' },
            price: 165000,
            stock: 0,
          },
        ],
      });
    });

    it('should throw PRODUCT_NOT_FOUND when product is missing, non-ACTIVE, deleted, or seller not APPROVED', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublicBySlug('hidden-item'),
      ).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
        status: 404,
      });
    });
  });
});
