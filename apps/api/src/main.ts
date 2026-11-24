import { HttpStatus, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppException, ErrorCode } from './common/errors/error-codes';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const details = errors.map((err) => ({
          field: err.property,
          message:
            Object.values(err.constraints ?? {})[0] ?? 'Giá trị không hợp lệ',
        }));
        return new AppException(
          ErrorCode.VALIDATION_ERROR,
          'Dữ liệu đầu vào không hợp lệ',
          HttpStatus.BAD_REQUEST,
          details,
        );
      },
    }),
  );

  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('E-commerce Marketplace API')
      .setDescription(
        'RESTful API cho nền tảng thương mại điện tử nhiều người bán (IT4409)',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('API_PORT', 4000);
  await app.listen(port);
  logger.log(`API running at http://localhost:${port}/api`);
  if (nodeEnv !== 'production') {
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
