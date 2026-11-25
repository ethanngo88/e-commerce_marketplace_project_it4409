import { ConfigService } from '@nestjs/config';
import { DB_CONNECTION_TIMEOUT_MS, PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('should create the pg pool with a connection timeout', async () => {
    const config = {
      get: () =>
        'postgresql://postgres:postgres@localhost:5432/marketplace_test',
    } as unknown as ConfigService;

    const service = new PrismaService(config);
    const pool = (
      service as unknown as {
        pool: { options: { connectionTimeoutMillis?: number } };
      }
    ).pool;

    expect(DB_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(pool.options.connectionTimeoutMillis).toBe(DB_CONNECTION_TIMEOUT_MS);

    await service.onModuleDestroy();
  });
});
