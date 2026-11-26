import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Role } from '../src/common/auth/auth-user';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup-app';

describe('Categories API (e2e)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;

  const prismaMock = {
    checkConnection: jest.fn().mockResolvedValue(true),
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
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
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const signToken = (roles: Role[]) =>
    jwt.signAsync({ sub: 'user-1', email: 'test@example.com', roles });

  it('GET /api/categories should be public and return standard envelope', async () => {
    const tree = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        parentId: null,
        name: 'Thời trang nam',
        slug: 'thoi-trang-nam',
        isActive: true,
        sortOrder: 0,
        children: [],
      },
    ];
    prismaMock.category.findMany.mockResolvedValue(tree);

    const res = await request(app.getHttpServer())
      .get('/api/categories')
      .expect(200);

    expect(res.body).toEqual({ success: true, data: tree });
  });

  it('GET /api/categories/:slug should return 404 CATEGORY_NOT_FOUND for unknown slug', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/api/categories/does-not-exist')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('GET /api/admin/categories should reject unauthenticated (401) and non-admin (403)', async () => {
    await request(app.getHttpServer()).get('/api/admin/categories').expect(401);

    const customerToken = await signToken([Role.CUSTOMER]);
    const res = await request(app.getHttpServer())
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/admin/categories should allow ADMIN and reject level-3 with 400 CATEGORY_DEPTH_EXCEEDED', async () => {
    const adminToken = await signToken([Role.ADMIN]);

    // Tạo danh mục cấp 1 thành công
    prismaMock.category.create.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      parentId: null,
      name: 'Phụ kiện',
      slug: 'phu-kien',
      isActive: true,
      sortOrder: 1,
    });

    const createdRes = await request(app.getHttpServer())
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  Phụ kiện  ', sortOrder: 1 })
      .expect(201);

    expect(createdRes.body).toEqual({
      success: true,
      data: expect.objectContaining({ name: 'Phụ kiện', slug: 'phu-kien' }),
    });

    // Tạo cấp 3 bị chặn
    prismaMock.category.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      parentId: '11111111-1111-4111-8111-111111111111',
      _count: { products: 0 },
    });

    const depthRes = await request(app.getHttpServer())
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cấp 3',
        parentId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400);

    expect(depthRes.body.error.code).toBe('CATEGORY_DEPTH_EXCEEDED');
  });

  it('PATCH /api/admin/categories/:id should reject invalid UUID with 400 VALIDATION_ERROR', async () => {
    const adminToken = await signToken([Role.ADMIN]);

    const res = await request(app.getHttpServer())
      .patch('/api/admin/categories/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /api/admin/categories/:id should return 409 when category has products and 204 when empty', async () => {
    const adminToken = await signToken([Role.ADMIN]);
    const id = '22222222-2222-4222-8222-222222222222';

    prismaMock.category.findUnique.mockResolvedValueOnce({
      id,
      _count: { children: 0, products: 2 },
    });
    const conflictRes = await request(app.getHttpServer())
      .delete(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    expect(conflictRes.body.error.code).toBe('CATEGORY_HAS_PRODUCTS');

    prismaMock.category.findUnique.mockResolvedValueOnce({
      id,
      _count: { children: 0, products: 0 },
    });
    prismaMock.category.delete.mockResolvedValueOnce({ id });
    await request(app.getHttpServer())
      .delete(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });
});
