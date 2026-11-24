import { Test, TestingModule } from '@nestjs/testing';
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

  it('should return status ok and db down when database is unreachable', async () => {
    prisma.checkConnection.mockResolvedValue(false);

    const result = await controller.check();

    expect(result).toEqual({ status: 'ok', db: 'down' });
  });
});
