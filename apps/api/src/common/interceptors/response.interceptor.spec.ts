import { ExecutionContext, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { RawResponse } from '../decorators/raw-response.decorator';
import { Paginated } from '../pagination/paginated';
import { ResponseInterceptor } from './response.interceptor';

class SampleController {
  wrapped() {}

  @RawResponse()
  raw() {}
}

@RawResponse()
class RawController {
  any() {}
}

function contextFor(
  controller: new () => object,
  handler: string,
): ExecutionContext {
  return {
    getHandler: () =>
      (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor(new Reflector());

  const run = (
    value: unknown,
    context = contextFor(SampleController, 'wrapped'),
  ) =>
    lastValueFrom(interceptor.intercept(context, { handle: () => of(value) }));

  it('should wrap plain objects into { success: true, data }', async () => {
    await expect(run({ status: 'ok', db: 'up' })).resolves.toEqual({
      success: true,
      data: { status: 'ok', db: 'up' },
    });
  });

  it('should wrap null into { success: true, data: null }', async () => {
    await expect(run(null)).resolves.toEqual({ success: true, data: null });
  });

  it('should pass through undefined for 204 No Content responses', async () => {
    await expect(run(undefined)).resolves.toBeUndefined();
  });

  it('should wrap Paginated results into { success: true, data, meta }', async () => {
    const page = Paginated.of([{ id: '1' }], 1, 20, 1);

    await expect(run(page)).resolves.toEqual({
      success: true,
      data: [{ id: '1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('should not treat a plain object with data and meta keys as paginated', async () => {
    const payload = { data: [1], meta: { note: 'x' }, extra: 'kept' };

    await expect(run(payload)).resolves.toEqual({
      success: true,
      data: payload,
    });
  });

  it('should leave StreamableFile untouched', async () => {
    const file = new StreamableFile(Buffer.from('csv'));

    await expect(run(file)).resolves.toBe(file);
  });

  it('should not wrap handlers marked with @RawResponse()', async () => {
    const ipnReply = { RspCode: '00', Message: 'Confirm Success' };

    await expect(
      run(ipnReply, contextFor(SampleController, 'raw')),
    ).resolves.toEqual(ipnReply);
  });

  it('should not wrap handlers of a controller marked with @RawResponse()', async () => {
    await expect(run('ok', contextFor(RawController, 'any'))).resolves.toBe(
      'ok',
    );
  });
});
