import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    [key: string]: unknown;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((result) => {
        if (result === undefined || result === null) {
          return result;
        }

        if (
          typeof result === 'object' &&
          'data' in (result as Record<string, unknown>) &&
          'meta' in (result as Record<string, unknown>)
        ) {
          const paginated = result as unknown as PaginatedResult<unknown>;
          return {
            success: true,
            data: paginated.data,
            meta: paginated.meta,
          };
        }

        return {
          success: true,
          data: result,
        };
      }),
    );
  }
}
