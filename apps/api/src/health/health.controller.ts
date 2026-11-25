import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';

const DB_DOWN_MESSAGE = 'Hệ thống tạm thời không kết nối được cơ sở dữ liệu';

// Healthcheck của Docker và dịch vụ uptime gọi định kỳ: không cần đăng nhập,
// không tính vào rate limit.
@Public()
@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái server và kết nối database' })
  @ApiResponse({
    status: 200,
    description: 'Server và database hoạt động bình thường',
    schema: {
      example: {
        success: true,
        data: { status: 'ok', db: 'up' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Không kết nối được database',
    schema: {
      example: {
        success: false,
        error: {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: DB_DOWN_MESSAGE,
          details: { db: 'down' },
        },
      },
    },
  })
  async check() {
    const isDbUp = await this.prisma.checkConnection();
    if (!isDbUp) {
      // Healthcheck của Docker và UptimeRobot chỉ đọc mã HTTP, nên phải trả 503 thay vì 200.
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        DB_DOWN_MESSAGE,
        HttpStatus.SERVICE_UNAVAILABLE,
        { db: 'down' },
      );
    }

    return { status: 'ok', db: 'up' };
  }
}
