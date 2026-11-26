import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { NodeEnv } from '../config/env.validation';

/** Thời gian tối đa mở kết nối tới Redis trước khi bỏ qua cache (fail-open). */
const REDIS_CONNECT_TIMEOUT_MS = 2_000;

/**
 * Redis cache tùy chọn theo doc 03 mục 9:
 * - Nếu không cấu hình `REDIS_URL`, đang chạy test, hoặc Redis tạm mất kết nối,
 *   mọi thao tác cache tự bỏ qua (fail-open) để API vẫn phục vụ từ PostgreSQL.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor(configService: ConfigService) {
    const nodeEnv = configService.get<string>('NODE_ENV', NodeEnv.Development);
    const redisUrl = configService.get<string>('REDIS_URL');

    if (!redisUrl || nodeEnv === NodeEnv.Test) {
      this.client = null;
      return;
    }

    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5_000),
    });

    // Luôn lắng nghe sự kiện error để tránh làm sập tiến trình Node khi Redis chưa chạy.
    client.on('error', (error: Error) => {
      this.logger.warn(`Redis error (cache bypassed): ${error.message}`);
    });

    this.client = client;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.connect();
    } catch (error) {
      this.logger.warn(
        `Redis initial connect failed (cache bypassed): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }
    try {
      const raw = await this.client.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        `Redis GET failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client || ttlSeconds <= 0) {
      return;
    }
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Redis SET failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(
        `Redis DEL failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      if (this.client.status === 'ready') {
        await this.client.quit();
      } else {
        this.client.disconnect();
      }
    } catch {
      this.client.disconnect();
    }
  }
}
