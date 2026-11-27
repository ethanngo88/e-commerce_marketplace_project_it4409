import { ValidateIf, ValidationOptions } from 'class-validator';

/**
 * Field được phép bỏ qua (không gửi), nhưng nếu gửi thì không được là `null`.
 *
 * Dùng thay `@IsOptional()` cho field ứng với cột NOT NULL trong database.
 * `@IsOptional()` coi `null` giống như không gửi và bỏ qua mọi validator, nên
 * `{ "name": null }` lọt xuống service, Prisma từ chối ghi `null` và API trả 500.
 * Với decorator này, `null` vẫn đi qua các validator phía sau (ví dụ `@IsString()`)
 * và nhận 400 `VALIDATION_ERROR`.
 *
 * Field được phép xóa giá trị (cột cho phép NULL, ví dụ `phone` của user,
 * `description` của sản phẩm) vẫn dùng `@IsOptional()`.
 */
export function IsOptionalNotNull(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateIf(
    (_object: object, value: unknown) => value !== undefined,
    validationOptions,
  );
}
