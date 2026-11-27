import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup-app';

describe('Public Products & Search API (e2e)', () => {
  let app: NestExpressApplication;

  const prismaMock = {
    checkConnection: jest.fn().mockResolvedValue(true),
    category: {
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/products should return paginated products with meta envelope without auth', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Áo thun cotton',
        slug: 'ao-thun-cotton',
        minPrice: 150000,
        ratingAvg: '4.60',
        ratingCount: 23,
        soldCount: 120,
        store: { name: 'Shop An', slug: 'shop-an' },
        images: [{ url: 'https://cdn.example.com/ao.jpg' }],
      },
    ]);
    prismaMock.product.count.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get(
        '/api/products?minPrice=&inStock=false&sort=price_asc&page=1&limit=20',
      )
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: [
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
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('GET /api/products should reject limit > 100 with 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products?limit=101')
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['minPrice', '/api/products?minPrice=3000000000'],
    ['maxPrice', '/api/products?maxPrice=3000000000'],
    ['page', '/api/products?page=100000000000000000000'],
  ])(
    'GET /api/products should return 400, not 500, when %s is too large for the database',
    async (field, url) => {
      const res = await request(app.getHttpServer()).get(url).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { field, message: expect.stringContaining('tối đa') },
      ]);
    },
  );

  it('GET /api/products should reject minPrice > maxPrice with 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products?minPrice=500000&maxPrice=100000')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/products should safely parameterize SQL injection attempts in q', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ total: 0n }])
      .mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .get('/api/products')
      .query({ q: "' OR 1=1 --" })
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('GET /api/products/:slug should return 200 ProductDetail and 404 PRODUCT_NOT_FOUND when missing', async () => {
    prismaMock.product.findFirst.mockResolvedValueOnce({
      id: 'prod-1',
      name: 'Áo thun cotton',
      slug: 'ao-thun-cotton',
      description: 'Mô tả',
      minPrice: 150000,
      ratingAvg: '4.80',
      ratingCount: 5,
      soldCount: 12,
      store: { name: 'Shop An', slug: 'shop-an' },
      category: { id: 'cat-1', name: 'Áo nam', slug: 'ao-nam' },
      images: [
        { id: 'img-1', url: 'https://cdn.example.com/1.jpg', sortOrder: 0 },
      ],
      variants: [
        {
          id: 'var-1',
          sku: 'AT-1',
          name: 'Đen / M',
          attributes: { Màu: 'Đen', Size: 'M' },
          price: 150000,
          inventory: { quantity: 8 },
        },
      ],
    });

    const okRes = await request(app.getHttpServer())
      .get('/api/products/ao-thun-cotton')
      .expect(200);

    expect(okRes.body.success).toBe(true);
    expect(okRes.body.data.variants[0].stock).toBe(8);

    prismaMock.product.findFirst.mockResolvedValueOnce(null);
    const notFoundRes = await request(app.getHttpServer())
      .get('/api/products/khong-ton-tai')
      .expect(404);

    expect(notFoundRes.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
