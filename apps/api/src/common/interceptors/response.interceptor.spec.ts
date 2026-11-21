import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const context = {} as ExecutionContext;

  it('should wrap plain objects into { success: true, data }', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ status: 'ok', db: 'up' }),
      }),
    );

    expect(result).toEqual({
      success: true,
      data: { status: 'ok', db: 'up' },
    });
  });

  it('should wrap paginated results into { success: true, data, meta }', async () => {
    const payload = {
      data: [{ id: '1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    const result = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(payload),
      }),
    );

    expect(result).toEqual({
      success: true,
      data: payload.data,
      meta: payload.meta,
    });
  });

  it('should pass through undefined for 204 No Content responses', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(undefined),
      }),
    );

    expect(result).toBeUndefined();
  });
});
