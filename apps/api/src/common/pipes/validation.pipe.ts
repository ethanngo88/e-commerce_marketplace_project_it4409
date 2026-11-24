import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorCode } from '../errors/error-codes';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Chuyển lỗi của class-validator thành danh sách `{ field, message }` (doc 05 mục 1.5).
 * Lỗi trong DTO lồng nhau được trải phẳng với đường dẫn đầy đủ, ví dụ
 * `variants.1.price`, để frontend biết chính xác ô nhập nào sai.
 * Mỗi field chỉ lấy lỗi đầu tiên.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownMessage = Object.values(error.constraints ?? {})[0];
    const nested = flattenValidationErrors(error.children ?? [], field);

    if (ownMessage !== undefined) {
      return [{ field, message: ownMessage }, ...nested];
    }
    return nested.length > 0
      ? nested
      : [{ field, message: 'Giá trị không hợp lệ' }];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Dữ liệu đầu vào không hợp lệ',
        HttpStatus.BAD_REQUEST,
        flattenValidationErrors(errors),
      ),
  });
}
