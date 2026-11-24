import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AppException, ErrorCode } from '../errors/error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format AppException with code, message, and details', () => {
    const exception = new AppException(
      ErrorCode.VALIDATION_ERROR,
      'Dữ liệu đầu vào không hợp lệ',
      HttpStatus.BAD_REQUEST,
      [{ field: 'email', message: 'email must be an email' }],
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ',
        details: [{ field: 'email', message: 'email must be an email' }],
      },
    });
  });

  it('should map NotFoundException to 404 NOT_FOUND', () => {
    filter.catch(new NotFoundException('Cannot GET /api/unknown'), host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/unknown',
      },
    });
  });

  it('should hide stack trace and return 500 INTERNAL_ERROR for unexpected errors', () => {
    jest.spyOn((filter as any).logger, 'error').mockImplementation(() => {});

    filter.catch(new Error('sensitive db error'), host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi hệ thống',
      },
    });
  });
});
