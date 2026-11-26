import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  const createConfig = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string, defaultValue?: unknown) =>
        key in values ? values[key] : defaultValue,
    }) as unknown as ConfigService;

  it('should operate as a safe no-op when REDIS_URL is not configured', async () => {
    const service = new RedisService(
      createConfig({ NODE_ENV: 'development', REDIS_URL: undefined }),
    );

    await expect(service.getJson('categories:tree')).resolves.toBeNull();
    await expect(
      service.setJson('categories:tree', [{ id: '1' }], 600),
    ).resolves.toBeUndefined();
    await expect(service.del('categories:tree')).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('should disable Redis connection automatically when NODE_ENV is test', async () => {
    const service = new RedisService(
      createConfig({ NODE_ENV: 'test', REDIS_URL: 'redis://localhost:6379' }),
    );

    await expect(service.getJson('categories:tree')).resolves.toBeNull();
  });

  it('should fail open and return null when underlying Redis client throws', async () => {
    const service = new RedisService(
      createConfig({ NODE_ENV: 'test', REDIS_URL: undefined }),
    );
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => {});
    const fakeClient = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      status: 'end',
      disconnect: jest.fn(),
    };
    (service as any).client = fakeClient;

    await expect(service.getJson('categories:tree')).resolves.toBeNull();
    await expect(
      service.setJson('categories:tree', [], 600),
    ).resolves.toBeUndefined();
    await expect(service.del('categories:tree')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(3);

    await service.onModuleDestroy();
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it('should serialize and deserialize JSON payloads when Redis succeeds', async () => {
    const service = new RedisService(
      createConfig({ NODE_ENV: 'test', REDIS_URL: undefined }),
    );
    const store = new Map<string, string>();
    const fakeClient = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, val: string) => {
        store.set(key, val);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
      status: 'ready',
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    (service as any).client = fakeClient;

    await service.setJson('categories:tree', [{ slug: 'ao-nam' }], 600);
    expect(fakeClient.set).toHaveBeenCalledWith(
      'categories:tree',
      '[{"slug":"ao-nam"}]',
      'EX',
      600,
    );
    await expect(service.getJson('categories:tree')).resolves.toEqual([
      { slug: 'ao-nam' },
    ]);

    await service.del('categories:tree');
    await expect(service.getJson('categories:tree')).resolves.toBeNull();

    await service.onModuleDestroy();
    expect(fakeClient.quit).toHaveBeenCalledTimes(1);
  });
});
