import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthUser, Role } from '../src/common/auth/auth-user';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { Roles } from '../src/common/decorators/roles.decorator';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup-app';

class VariantInput {
  @IsString()
  sku!: string;

  @IsInt()
  @Min(0)
  price!: number;
}

class ProductInput {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInput)
  variants!: VariantInput[];
}

/** Controller chỉ có trong test, để kiểm tra pipeline dùng chung (validation, IP sau proxy). */
@Public()
@Controller('e2e-probe')
class ProbeController {
  @Get('ip')
  ip(@Req() req: { ip?: string }) {
    return { ip: req.ip };
  }

  @Post('products')
  createProduct(@Body() body: ProductInput) {
    return body;
  }
}

/** Route cần đăng nhập, để kiểm tra JwtAuthGuard, RolesGuard và @CurrentUser(). */
@Controller('e2e-guarded')
class GuardedProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }
}

const prismaMock = {
  checkConnection: jest.fn(),
  user: { findUnique: jest.fn() },
};

/**
 * Tạo app giống server thật: cùng AppModule và cùng configureApp() như main.ts.
 * `envOverrides` thay giá trị đọc từ ConfigService, dùng để thử cấu hình khác.
 */
async function createApp(
  envOverrides: Record<string, unknown> = {},
): Promise<NestExpressApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController, GuardedProbeController],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();

  const config = app.get(ConfigService);
  const readConfig = config.get.bind(config) as (
    key: string,
    defaultValue?: unknown,
  ) => unknown;
  jest
    .spyOn(config, 'get')
    .mockImplementation(((key: string, defaultValue?: unknown) =>
      key in envOverrides
        ? envOverrides[key]
        : readConfig(key, defaultValue)) as any);

  configureApp(app);
  await app.init();
  return app;
}

describe('App (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    prismaMock.checkConnection.mockResolvedValue(true);
  });

  it('GET /api/health should return 200 with standard envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', db: 'up' },
    });
  });

  it('GET /api/health should return 503 SERVICE_UNAVAILABLE when the database is down', async () => {
    prismaMock.checkConnection.mockResolvedValue(false);

    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Hệ thống tạm thời không kết nối được cơ sở dữ liệu',
        details: { db: 'down' },
      },
    });
  });

  it('GET /api/health should not be rate limited', async () => {
    // ThrottlerModule cho phép 100 request mỗi phút trên một IP.
    for (let i = 0; i < 105; i++) {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    }
  });

  it('GET /api/unknown-route should return 404 with standard error envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/unknown-route')
      .expect(404);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Không tìm thấy tài nguyên',
      },
    });
  });

  it('should apply security headers from helmet', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should reject an invalid nested body with the full field path', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/e2e-probe/products')
      .send({
        name: 'Áo thun',
        variants: [
          { sku: 'A-1', price: 100 },
          { sku: 'A-2', price: -5 },
        ],
      })
      .expect(400);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ',
        details: [{ field: 'variants.1.price', message: expect.any(String) }],
      },
    });
  });

  it('should reject fields that are not declared in the DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/e2e-probe/products')
      .send({ name: 'Áo thun', variants: [], isAdmin: true })
      .expect(400);

    expect(res.body.error.details).toEqual([
      { field: 'isAdmin', message: expect.any(String) },
    ]);
  });

  it('should return 413 PAYLOAD_TOO_LARGE for a JSON body over 100 kB', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/e2e-probe/products')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(200_000), variants: [] }))
      .expect(413);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Dữ liệu gửi lên vượt quá kích thước cho phép',
      },
    });
  });

  it('should ignore X-Forwarded-For when TRUST_PROXY_HOPS is 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/e2e-probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect(res.body.data.ip).not.toBe('203.0.113.7');
  });
});

describe('Authentication and authorization (e2e)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;
  const customer: AuthUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'customer@example.com',
    roles: [Role.CUSTOMER],
  };
  const signFor = (user: AuthUser) =>
    jwt.signAsync({ sub: user.id, email: user.email, roles: user.roles });

  beforeAll(async () => {
    app = await createApp();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(null);
  });

  const unauthorized = {
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Bạn cần đăng nhập để tiếp tục' },
  };

  it('should return 401 UNAUTHORIZED when a protected route has no token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/e2e-guarded/me')
      .expect(401);

    expect(res.body).toEqual(unauthorized);
  });

  it.each([
    ['a malformed token', 'Bearer not-a-jwt'],
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
  ])('should return 401 for %s', async (_case, header) => {
    await request(app.getHttpServer())
      .get('/api/e2e-guarded/me')
      .set('Authorization', header)
      .expect(401);
  });

  it('should return 401 for a token signed with another secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-that-is-at-least-32-chars',
    }).signAsync({ sub: customer.id, email: customer.email, roles: ['ADMIN'] });

    await request(app.getHttpServer())
      .get('/api/e2e-guarded/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('should return 401 for an expired token', async () => {
    const expired = await new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
    }).signAsync({
      sub: customer.id,
      email: customer.email,
      roles: customer.roles,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await request(app.getHttpServer())
      .get('/api/e2e-guarded/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('should expose the user from a valid token through @CurrentUser()', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/e2e-guarded/me')
      .set('Authorization', `Bearer ${await signFor(customer)}`)
      .expect(200);

    expect(res.body).toEqual({ success: true, data: customer });
  });

  it('should return 403 FORBIDDEN when the role does not match', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/e2e-guarded/admin')
      .set('Authorization', `Bearer ${await signFor(customer)}`)
      .expect(403);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này',
      },
    });
  });

  it('should allow a route with @Roles(ADMIN) for an admin token', async () => {
    const admin = { ...customer, roles: [Role.ADMIN] };

    await request(app.getHttpServer())
      .get('/api/e2e-guarded/admin')
      .set('Authorization', `Bearer ${await signFor(admin)}`)
      .expect(200);
  });

  it('should return Vietnamese validation messages for an invalid registration', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'abcdefgh', fullName: 'A' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { field: 'email', message: 'Email không hợp lệ' },
        { field: 'password', message: 'Mật khẩu phải có ít nhất một chữ số' },
        { field: 'fullName', message: 'Họ tên phải dài 2–100 ký tự' },
      ]),
    );
  });

  it('should reject refresh without a cookie and clear the cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(String(res.headers['set-cookie'])).toMatch(
      /refreshToken=;.*Path=\/api\/auth/,
    );
  });

  it('should require login for logout and me', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('should rate limit login to 10 requests per minute per IP', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongpass1' });

    for (let i = 0; i < 10; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('App behind a reverse proxy (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp({ TRUST_PROXY_HOPS: 1 });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should take the client IP from X-Forwarded-For', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/e2e-probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect(res.body.data.ip).toBe('203.0.113.7');
  });
});
