import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { Paginated } from '../pagination/paginated';

/**
 * Bọc kết quả của handler theo định dạng chuẩn ở doc 05 mục 1.4:
 * - `undefined` (response 204) và `StreamableFile` giữ nguyên;
 * - `Paginated` thành `{ success: true, data, meta }`;
 * - mọi giá trị khác, kể cả `null`, thành `{ success: true, data }`.
 * Route hoặc controller có `@RawResponse()` không bị bọc.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRaw = this.reflector.getAllAndOverride<boolean | undefined>(
      RAW_RESPONSE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isRaw) {
      return next.handle();
    }

    return next.handle().pipe(
      map((result: unknown) => {
        if (result === undefined || result instanceof StreamableFile) {
          return result;
        }

        if (result instanceof Paginated) {
          return { success: true, data: result.data, meta: result.meta };
        }

        // Kể cả null: Express gửi body rỗng cho null, khiến res.json() ở frontend lỗi.
        return { success: true, data: result };
      }),
    );
  }
}
