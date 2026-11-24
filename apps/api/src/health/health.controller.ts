import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái server và kết nối database' })
  @ApiResponse({
    status: 200,
    description: 'Server hoạt động bình thường',
    schema: {
      example: {
        success: true,
        data: { status: 'ok', db: 'up' },
      },
    },
  })
  async check() {
    const isDbUp = await this.prisma.checkConnection();
    return {
      status: 'ok',
      db: isDbUp ? 'up' : 'down',
    };
  }
}
