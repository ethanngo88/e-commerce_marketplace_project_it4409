import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException, ErrorCode } from '../errors/error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let errorLog: jest.SpyInstance;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    errorLog = jest
      .spyOn((filter as any).logger, 'error')
      .mockImplementation(() => {});
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
      }),
    } as unknown as ArgumentsHost;
  });

  const sentBody = () => jsonMock.mock.calls[0][0];

  it('should format AppException with code, message, and details', () => {
    const exception = new AppException(
      ErrorCode.VALIDATION_ERROR,
      'Dữ liệu đầu vào không hợp lệ',
      HttpStatus.BAD_REQUEST,
      [{ field: 'email', message: 'email must be an email' }],
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ',
        details: [{ field: 'email', message: 'email must be an email' }],
      },
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('should map NotFoundException to 404 NOT_FOUND with a Vietnamese message', () => {
    filter.catch(new NotFoundException('Cannot GET /api/unknown'), host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Không tìm thấy tài nguyên',
      },
    });
  });

  it('should replace the English message of ThrottlerException', () => {
    filter.catch(new ThrottlerException(), host);

    expect(statusMock).toHaveBeenCalledWith(429);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
      },
    });
  });

  it('should map other 4xx statuses to BAD_REQUEST instead of INTERNAL_ERROR', () => {
    filter.catch(
      new HttpException(
        'Unsupported Media Type',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      ),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(415);
    expect(sentBody().error.code).toBe('BAD_REQUEST');
  });

  it('should treat body-parser errors with a 4xx status as client errors', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      expose: true,
    });

    filter.catch(tooLarge, host);

    expect(statusMock).toHaveBeenCalledWith(413);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Dữ liệu gửi lên vượt quá kích thước cho phép',
      },
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('should hide the message of a 5xx HttpException and log it', () => {
    filter.catch(
      new InternalServerErrorException('relation "users" does not exist'),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi hệ thống',
      },
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it('should keep the message of a 5xx AppException and log it', () => {
    filter.catch(
      new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Hệ thống tạm thời không kết nối được cơ sở dữ liệu',
        HttpStatus.SERVICE_UNAVAILABLE,
        { db: 'down' },
      ),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(503);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Hệ thống tạm thời không kết nối được cơ sở dữ liệu',
        details: { db: 'down' },
      },
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it('should hide stack trace and return 500 INTERNAL_ERROR for unexpected errors', () => {
    filter.catch(new Error('sensitive db error'), host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(sentBody()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi hệ thống',
      },
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503])(
    'should only return codes listed in ErrorCode (HTTP %i)',
    (status) => {
      filter.catch(new HttpException('x', status), host);

      expect(Object.values(ErrorCode)).toContain(sentBody().error.code);
      expect(typeof sentBody().error.message).toBe('string');
      expect(sentBody().error.message).not.toBe('x');
    },
  );
});
