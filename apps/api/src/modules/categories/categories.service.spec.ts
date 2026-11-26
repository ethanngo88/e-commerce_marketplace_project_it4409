import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CATEGORIES_TREE_CACHE_KEY,
  CATEGORIES_TREE_CACHE_TTL_SECONDS,
  CategoriesService,
} from './categories.service';

describe('CategoriesService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let redis: DeepMockProxy<RedisService>;
  let service: CategoriesService;

  const rootCategory = {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    name: 'Thời trang nam',
    slug: 'thoi-trang-nam',
    isActive: true,
    sortOrder: 0,
    children: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: 'Áo nam',
        slug: 'ao-nam',
        isActive: true,
        sortOrder: 0,
      },
    ],
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    redis = mockDeep<RedisService>();
    redis.getJson.mockResolvedValue(null);
    redis.setJson.mockResolvedValue(undefined);
    redis.del.mockResolvedValue(undefined);
    service = new CategoriesService(prisma, redis);
  });

  describe('getPublicTree', () => {
    it('should return cached tree when Redis has a hit', async () => {
      redis.getJson.mockResolvedValue([rootCategory]);

      const result = await service.getPublicTree();

      expect(result).toEqual([rootCategory]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should query active categories and populate Redis cache on cache miss', async () => {
      prisma.category.findMany.mockResolvedValue([rootCategory] as never);

      const result = await service.getPublicTree();

      expect(result).toEqual([rootCategory]);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parentId: null, isActive: true },
        }),
      );
      expect(redis.setJson).toHaveBeenCalledWith(
        CATEGORIES_TREE_CACHE_KEY,
        [rootCategory],
        CATEGORIES_TREE_CACHE_TTL_SECONDS,
      );
    });
  });

  describe('getPublicBySlug', () => {
    it('should return an active category with active children', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...rootCategory,
        parent: null,
      } as never);

      const result = await service.getPublicBySlug('thoi-trang-nam');

      expect(result).toEqual({
        id: rootCategory.id,
        parentId: null,
        name: 'Thời trang nam',
        slug: 'thoi-trang-nam',
        isActive: true,
        sortOrder: 0,
        parent: null,
        children: rootCategory.children,
      });
    });

    it('should throw CATEGORY_NOT_FOUND when slug does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublicBySlug('khong-ton-tai'),
      ).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });

    it('should throw CATEGORY_NOT_FOUND when category is inactive', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...rootCategory,
        isActive: false,
        parent: null,
      } as never);

      await expect(
        service.getPublicBySlug('dong-ho-nam'),
      ).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });

    it('should throw CATEGORY_NOT_FOUND when parent category is inactive', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...rootCategory.children[0],
        parent: {
          id: rootCategory.id,
          name: rootCategory.name,
          slug: rootCategory.slug,
          isActive: false,
        },
        children: [],
      } as never);

      await expect(service.getPublicBySlug('ao-nam')).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('getAdminTree', () => {
    it('should return both active and inactive categories with productCount', async () => {
      prisma.category.findMany.mockResolvedValue([
        {
          id: rootCategory.id,
          parentId: null,
          name: 'Thời trang nam',
          slug: 'thoi-trang-nam',
          isActive: true,
          sortOrder: 0,
          _count: { products: 0 },
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              parentId: rootCategory.id,
              name: 'Đồng hồ nam',
              slug: 'dong-ho-nam',
              isActive: false,
              sortOrder: 3,
              _count: { products: 4 },
            },
          ],
        },
      ] as never);

      const result = await service.getAdminTree();

      expect(result).toEqual([
        {
          id: rootCategory.id,
          parentId: null,
          name: 'Thời trang nam',
          slug: 'thoi-trang-nam',
          isActive: true,
          sortOrder: 0,
          productCount: 0,
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              parentId: rootCategory.id,
              name: 'Đồng hồ nam',
              slug: 'dong-ho-nam',
              isActive: false,
              sortOrder: 3,
              productCount: 4,
            },
          ],
        },
      ]);
    });
  });

  describe('create', () => {
    it('should create a root category and invalidate cache', async () => {
      const created = {
        id: '44444444-4444-4444-8444-444444444444',
        parentId: null,
        name: 'Điện tử',
        slug: 'dien-tu',
        isActive: true,
        sortOrder: 2,
      };
      prisma.category.create.mockResolvedValue(created as never);

      const result = await service.create({ name: 'Điện tử', sortOrder: 2 });

      expect(result).toEqual(created);
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Điện tử',
            slug: 'dien-tu',
            parentId: null,
            sortOrder: 2,
          },
        }),
      );
      expect(redis.del).toHaveBeenCalledWith(CATEGORIES_TREE_CACHE_KEY);
    });

    it('should create a level-2 category under a root category with no products', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: rootCategory.id,
        parentId: null,
        _count: { products: 0 },
      } as never);
      prisma.category.create.mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        parentId: rootCategory.id,
        name: 'Áo khoác nam',
        slug: 'ao-khoac-nam',
        isActive: true,
        sortOrder: 0,
      } as never);

      const result = await service.create({
        name: 'Áo khoác nam',
        parentId: rootCategory.id,
      });

      expect(result.parentId).toBe(rootCategory.id);
      expect(redis.del).toHaveBeenCalledWith(CATEGORIES_TREE_CACHE_KEY);
    });

    it('should reject creating a level-3 category with CATEGORY_DEPTH_EXCEEDED', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        parentId: rootCategory.id,
        _count: { products: 0 },
      } as never);

      await expect(
        service.create({
          name: 'Áo polo',
          parentId: '22222222-2222-4222-8222-222222222222',
        }),
      ).rejects.toMatchObject({
        code: 'CATEGORY_DEPTH_EXCEEDED',
        status: 400,
      });
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('should reject when parentId does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Áo polo',
          parentId: '99999999-9999-4999-8999-999999999999',
        }),
      ).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });

    it('should reject adding a child under a category that already has products', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: rootCategory.id,
        parentId: null,
        _count: { products: 3 },
      } as never);

      await expect(
        service.create({ name: 'Con mới', parentId: rootCategory.id }),
      ).rejects.toMatchObject({
        code: 'CATEGORY_HAS_PRODUCTS',
        status: 409,
      });
    });

    it('should retry with a suffixed slug when P2002 occurs on slug collision', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      prisma.category.create
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({
          id: '66666666-6666-4666-8666-666666666666',
          parentId: null,
          name: 'Thời trang nam',
          slug: 'thoi-trang-nam-ab12',
          isActive: true,
          sortOrder: 0,
        } as never);

      const result = await service.create({ name: 'Thời trang nam' });

      expect(prisma.category.create).toHaveBeenCalledTimes(2);
      const secondSlug = prisma.category.create.mock.calls[1][0].data.slug;
      expect(secondSlug).toMatch(/^thoi-trang-nam-[0-9a-f]{4}$/);
      expect(result.id).toBe('66666666-6666-4666-8666-666666666666');
    });
  });

  describe('update', () => {
    it('should update fields and invalidate cache', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: rootCategory.id,
      } as never);
      prisma.category.update.mockResolvedValue({
        ...rootCategory,
        isActive: false,
        sortOrder: 5,
      } as never);

      const result = await service.update(rootCategory.id, {
        isActive: false,
        sortOrder: 5,
      });

      expect(result.isActive).toBe(false);
      expect(result.sortOrder).toBe(5);
      expect(redis.del).toHaveBeenCalledWith(CATEGORIES_TREE_CACHE_KEY);
    });

    it('should throw CATEGORY_NOT_FOUND when updating a missing category', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update('99999999-9999-4999-8999-999999999999', {
          isActive: false,
        }),
      ).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('remove', () => {
    it('should delete an empty leaf category and invalidate cache', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        _count: { children: 0, products: 0 },
      } as never);
      prisma.category.delete.mockResolvedValue({} as never);

      await service.remove('22222222-2222-4222-8222-222222222222');

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: '22222222-2222-4222-8222-222222222222' },
      });
      expect(redis.del).toHaveBeenCalledWith(CATEGORIES_TREE_CACHE_KEY);
    });

    it('should reject deleting a category that has children with CATEGORY_HAS_CHILDREN', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: rootCategory.id,
        _count: { children: 2, products: 0 },
      } as never);

      await expect(service.remove(rootCategory.id)).rejects.toMatchObject({
        code: 'CATEGORY_HAS_CHILDREN',
        status: 409,
      });
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('should reject deleting a category that has products with CATEGORY_HAS_PRODUCTS', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        _count: { children: 0, products: 5 },
      } as never);

      await expect(
        service.remove('22222222-2222-4222-8222-222222222222'),
      ).rejects.toMatchObject({
        code: 'CATEGORY_HAS_PRODUCTS',
        status: 409,
      });
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('should throw CATEGORY_NOT_FOUND when deleting a missing category', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('99999999-9999-4999-8999-999999999999'),
      ).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('resolveActiveCategoryIdsBySlug', () => {
    it('should return parent id plus active children ids for a root category', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'root-1',
        isActive: true,
        parent: null,
        children: [{ id: 'child-1' }, { id: 'child-2' }],
      } as never);

      await expect(
        service.resolveActiveCategoryIdsBySlug('thoi-trang-nam'),
      ).resolves.toEqual(['root-1', 'child-1', 'child-2']);
    });

    it('should return null when category is inactive or parent is inactive', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'child-1',
        isActive: true,
        parent: { isActive: false },
        children: [],
      } as never);

      await expect(
        service.resolveActiveCategoryIdsBySlug('ao-nam'),
      ).resolves.toBeNull();
    });
  });

  describe('assertLeafCategory', () => {
    it('should reject a category that has children with CATEGORY_NOT_LEAF', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'root-1',
        isActive: true,
        parent: null,
        _count: { children: 3 },
      } as never);

      await expect(service.assertLeafCategory('root-1')).rejects.toMatchObject({
        code: 'CATEGORY_NOT_LEAF',
        status: 400,
      });
    });

    it('should pass for an active leaf category', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'leaf-1',
        isActive: true,
        parent: { isActive: true },
        _count: { children: 0 },
      } as never);

      await expect(
        service.assertLeafCategory('leaf-1'),
      ).resolves.toBeUndefined();
    });
  });
});
