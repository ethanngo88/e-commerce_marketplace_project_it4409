import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module';
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

const prismaMock = {
  checkConnection: jest.fn(),
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
    controllers: [ProbeController],
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
