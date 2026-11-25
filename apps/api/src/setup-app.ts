import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createValidationPipe } from './common/pipes/validation.pipe';

/**
 * Cấu hình HTTP dùng chung cho server thật (main.ts) và các test tạo app
 * (test e2e, integration test), để test chạy đúng pipeline của server.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Lấy IP thật của client sau reverse proxy; ThrottlerGuard đếm request theo IP này.
  app.set('trust proxy', config.get<number>('TRUST_PROXY_HOPS', 0));

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());
}
