import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Kiểm tra độ dài chuỗi theo số byte UTF-8 (quan trọng cho bcrypt vì bcrypt cắt ở 72 byte;
 * mật khẩu tiếng Việt có dấu có thể vượt 72 byte dù dưới 72 ký tự — doc 11 mục 9).
 */
export function MaxUtf8Bytes(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxUtf8Bytes',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') {
            return true;
          }
          const limit = args.constraints[0] as number;
          return Buffer.byteLength(value, 'utf8') <= limit;
        },
      },
    });
  };
}
