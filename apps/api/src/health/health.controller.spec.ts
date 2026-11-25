import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { checkConnection: jest.Mock };

  beforeEach(async () => {
    prisma = {
      checkConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok and db up when database is reachable', async () => {
    prisma.checkConnection.mockResolvedValue(true);

    const result = await controller.check();

    expect(result).toEqual({ status: 'ok', db: 'up' });
  });

  it('should throw 503 SERVICE_UNAVAILABLE when database is unreachable', async () => {
    prisma.checkConnection.mockResolvedValue(false);

    const error = await controller.check().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(exception.details).toEqual({ db: 'down' });
  });
});
