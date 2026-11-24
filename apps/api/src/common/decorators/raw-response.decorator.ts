import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'response:raw';

/**
 * Trả kết quả của handler nguyên dạng, không bọc trong `{ success, data }`.
 *
 * Chỉ dùng cho endpoint có định dạng response do bên ngoài quy định, ví dụ IPN
 * của VNPay phải trả `{ RspCode, Message }` (doc 05 mục 11). Lỗi ném ra từ
 * handler vẫn đi qua HttpExceptionFilter, nên handler loại này phải tự bắt lỗi
 * và trả mã lỗi theo định dạng của bên ngoài.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
