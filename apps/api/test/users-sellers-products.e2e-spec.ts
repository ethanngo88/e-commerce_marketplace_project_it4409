import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcrypt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Role } from '../src/common/auth/auth-user';
import { ProductStatus, SellerStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup-app';
import { CloudinaryService } from '../src/upload/cloudinary.service';

describe('Users (T-11), Sellers (T-12), and Seller Products (T-14) API (e2e)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;

  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  const prismaMock = {
    checkConnection: jest.fn().mockResolvedValue(true),
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    address: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn(), create: jest.fn() },
    seller: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: { findUnique: jest.fn() },
    userRole: { upsert: jest.fn() },
    category: { findUnique: jest.fn() },
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productVariant: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    productImage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sellerOrder: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
  };

  const cloudinaryMock = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(CloudinaryService)
      .useValue(cloudinaryMock)
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
    prismaMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock),
    );
  });

  const signToken = (sub: string, roles: Role[]) =>
    jwt.signAsync({ sub, email: `${sub}@example.com`, roles });

  describe('T-11 Users API', () => {
    it('PATCH /api/users/me should validate Vietnamese phone format', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);

      const badRes = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '12345' })
        .expect(400);

      expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PATCH /api/users/me should return 400, not 500, when a required field is null', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: null })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { field: 'fullName', message: expect.any(String) },
      ]);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('PATCH /api/users/me should still accept phone: null to clear the phone number', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user-1@example.com',
        fullName: 'Nguyễn Văn An',
        phone: null,
        avatarUrl: null,
        userRoles: [{ role: { name: 'CUSTOMER' } }],
        seller: null,
      });

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: null })
        .expect(200);

      expect(res.body.data.phone).toBeNull();
    });

    it('PATCH /api/users/me/password should keep the current session by setting a new refresh cookie', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: bcrypt.hashSync('OldPass123', 4),
      });
      prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123', newPassword: 'NewPass456' })
        .expect(204);

      // Mọi refresh token cũ bị thu hồi, rồi phiên hiện tại nhận token mới qua cookie.
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(String(res.headers['set-cookie'])).toMatch(
        /refreshToken=[^;]+;.*Path=\/api\/auth;.*HttpOnly/,
      );
    });

    it('PATCH /api/users/me/password should reject >72 UTF-8 bytes Vietnamese password', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);

      // 30 ký tự 'ệ' = 90 bytes UTF-8 (> 72 byte dù < 72 ký tự).
      const res = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'OldPass123',
          newPassword: `${'ệ'.repeat(30)}a1`,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/users/me/addresses should create first address as default (201)', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);
      prismaMock.address.count.mockResolvedValue(0);
      prismaMock.address.create.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        recipientName: 'Nguyễn Văn An',
        phone: '0901234567',
        province: 'Hà Nội',
        district: 'Hai Bà Trưng',
        ward: 'Bách Khoa',
        street: 'Số 1',
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          recipientName: 'Nguyễn Văn An',
          phone: '0901234567',
          province: 'Hà Nội',
          district: 'Hai Bà Trưng',
          ward: 'Bách Khoa',
          street: 'Số 1',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDefault).toBe(true);
    });
  });

  describe('T-12 Sellers & ApprovedSellerGuard', () => {
    it('GET /api/stores/:slug should be public and return 200 with productCount', async () => {
      prismaMock.store.findFirst.mockResolvedValue({
        id: 'store-1',
        name: 'Shop An',
        slug: 'shop-an',
        description: 'Mô tả',
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { products: 14 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/stores/shop-an')
        .expect(200);

      expect(res.body.data.productCount).toBe(14);
    });

    it('IT-02 & IT-04: plain CUSTOMER gets 403 FORBIDDEN, PENDING seller gets 403 SELLER_NOT_APPROVED on /api/seller/*', async () => {
      const token = await signToken('user-1', [Role.CUSTOMER]);

      prismaMock.seller.findUnique.mockResolvedValueOnce(null);
      const customerRes = await request(app.getHttpServer())
        .get('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(customerRes.body.error.code).toBe('FORBIDDEN');

      prismaMock.seller.findUnique.mockResolvedValueOnce({
        id: 'seller-1',
        status: SellerStatus.PENDING,
        store: { id: 'store-1', slug: 'shop-1' },
      });
      const pendingRes = await request(app.getHttpServer())
        .get('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(pendingRes.body.error.code).toBe('SELLER_NOT_APPROVED');
    });

    it('PATCH /api/admin/sellers/:id/status should require ADMIN role', async () => {
      const custToken = await signToken('user-1', [Role.CUSTOMER]);

      await request(app.getHttpServer())
        .patch('/api/admin/sellers/11111111-1111-4111-8111-111111111111/status')
        .set('Authorization', `Bearer ${custToken}`)
        .send({ status: 'APPROVED' })
        .expect(403);
    });
  });

  describe('T-14 Seller Products API', () => {
    const approvedSellerMock = {
      id: 'seller-1',
      status: SellerStatus.APPROVED,
      store: { id: 'store-1', slug: 'shop-an' },
    };

    it('POST /api/seller/products should validate nested variants and create DRAFT product', async () => {
      const token = await signToken('seller-user', [
        Role.CUSTOMER,
        Role.SELLER,
      ]);
      prismaMock.seller.findUnique.mockResolvedValue(approvedSellerMock);

      // Giá nhỏ hơn 1000 -> lỗi nested validation variants.0.price
      const badRes = await request(app.getHttpServer())
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Áo thun cotton nam',
          categoryId: '11111111-1111-4111-8111-111111111111',
          variants: [{ sku: 'AT-1', name: 'Đen / M', price: 500, stock: 5 }],
        })
        .expect(400);

      expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(badRes.body.error.details[0].field).toBe('variants.0.price');

      // Hợp lệ -> 201
      prismaMock.category.findUnique.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        isActive: true,
        parent: { isActive: true },
        _count: { children: 0 },
      });
      prismaMock.product.create.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Áo thun cotton nam',
        slug: 'ao-thun-cotton-nam-x1y2',
        description: null,
        status: ProductStatus.DRAFT,
        minPrice: 150000,
        ratingAvg: '0.00',
        ratingCount: 0,
        soldCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        store: { name: 'Shop An', slug: 'shop-an' },
        category: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Áo nam',
          slug: 'ao-nam',
        },
        images: [],
        variants: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            sku: 'AT-1',
            name: 'Đen / M',
            attributes: {},
            price: 150000,
            isActive: true,
            inventory: { quantity: 5 },
          },
        ],
      });

      const okRes = await request(app.getHttpServer())
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Áo thun cotton nam',
          categoryId: '11111111-1111-4111-8111-111111111111',
          variants: [{ sku: 'AT-1', name: 'Đen / M', price: 150000, stock: 5 }],
        })
        .expect(201);

      expect(okRes.body.data.status).toBe('DRAFT');
      expect(okRes.body.data.minPrice).toBe(150000);
    });

    it('POST /api/seller/products/:id/images should reject fake .exe renamed to .jpg and accept real PNG', async () => {
      const token = await signToken('seller-user', [
        Role.CUSTOMER,
        Role.SELLER,
      ]);
      const productId = '22222222-2222-4222-8222-222222222222';
      prismaMock.seller.findUnique.mockResolvedValue(approvedSellerMock);
      prismaMock.product.findFirst.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
      });
      prismaMock.productImage.findMany.mockResolvedValue([]);

      const exeBuffer = Buffer.from(
        'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00',
      );
      const fakeRes = await request(app.getHttpServer())
        .post(`/api/seller/products/${productId}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', exeBuffer, {
          filename: 'malware.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
      expect(fakeRes.body.error.code).toBe('INVALID_FILE');

      cloudinaryMock.uploadImage.mockResolvedValueOnce({
        url: 'https://res.cloudinary.com/demo/real.png',
        publicId: 'marketplace/products/p1/real',
      });
      prismaMock.productImage.create.mockResolvedValueOnce({
        id: '44444444-4444-4444-8444-444444444444',
        url: 'https://res.cloudinary.com/demo/real.png',
        sortOrder: 0,
      });

      const realRes = await request(app.getHttpServer())
        .post(`/api/seller/products/${productId}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', validPng, {
          filename: 'real.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(realRes.body.data).toHaveLength(1);
      expect(realRes.body.data[0].url).toBe(
        'https://res.cloudinary.com/demo/real.png',
      );
    });
  });
});
