import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { AppException, ErrorCode, ErrorCodeType } from '../errors/error-codes';

/**
 * Message tiếng Việt cho các lỗi chung (doc 05 mục 1.5 và 1.6). Message gốc của
 * exception có sẵn trong NestJS và thư viện (thường bằng tiếng Anh, ví dụ
 * "ThrottlerException: Too Many Requests") không được trả cho người dùng.
 */
const DEFAULT_MESSAGES: Partial<Record<ErrorCodeType, string>> = {
  VALIDATION_ERROR: 'Dữ liệu đầu vào không hợp lệ',
  BAD_REQUEST: 'Yêu cầu không hợp lệ',
  UNAUTHORIZED: 'Bạn cần đăng nhập để tiếp tục',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  NOT_FOUND: 'Không tìm thấy tài nguyên',
  CONFLICT: 'Yêu cầu xung đột với trạng thái hiện tại',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên vượt quá kích thước cho phép',
  TOO_MANY_REQUESTS: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
  SERVICE_UNAVAILABLE: 'Hệ thống tạm thời không khả dụng, vui lòng thử lại sau',
  INTERNAL_ERROR: 'Đã xảy ra lỗi hệ thống',
};

interface ErrorBody {
  status: number;
  code: ErrorCodeType;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, code, message, details } = this.toErrorBody(exception);

    // Lỗi phía server luôn được ghi log kèm stack; client chỉ nhận message chung.
    if (status >= 500) {
      this.logger.error(
        `${status} ${code}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorPayload: Record<string, unknown> = { code, message };
    if (details !== undefined) {
      errorPayload.details = details;
    }

    response.status(status).json({
      success: false,
      error: errorPayload,
    });
  }

  private toErrorBody(exception: unknown): ErrorBody {
    // Lỗi nghiệp vụ: giữ nguyên code, message (do nhóm tự viết bằng tiếng Việt) và details.
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    // Lỗi Prisma có mã xác định (doc 10 mục O1): lưới an toàn tránh trả 500 cho
    // vi phạm unique / không tìm thấy / ràng buộc khóa ngoại nếu service chưa bắt riêng.
    const prismaError = mapPrismaKnownError(exception);
    if (prismaError) {
      return prismaError;
    }

    // Exception có sẵn của NestJS và thư viện, hoặc lỗi 4xx từ middleware của
    // Express (ví dụ body-parser báo 413 khi body quá lớn): dùng message mặc định
    // theo mã lỗi. Mọi lỗi khác là 500.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (clientErrorStatus(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const code = codeForStatus(status);

    return {
      status,
      code,
      message: DEFAULT_MESSAGES[code] ?? 'Đã xảy ra lỗi hệ thống',
    };
  }
}

function mapPrismaKnownError(exception: unknown): ErrorBody | undefined {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }

  switch (exception.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Dữ liệu bị trùng với bản ghi đã tồn tại',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy tài nguyên',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Không thể thực hiện thao tác do dữ liệu đang được liên kết',
      };
    default:
      return undefined;
  }
}

/**
 * Status 4xx gắn trên lỗi không phải HttpException, ví dụ lỗi `entity.too.large`
 * của body-parser có `status = 413`.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const { status, statusCode } = exception as {
    status?: unknown;
    statusCode?: unknown;
  };
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && value >= 400 && value < 500
    ? value
    : undefined;
}

function codeForStatus(status: number): ErrorCodeType {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.CONFLICT;
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.TOO_MANY_REQUESTS;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 400 && status < 500
        ? ErrorCode.BAD_REQUEST
        : ErrorCode.INTERNAL_ERROR;
  }
}
