import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, SellerStoreContext } from '../auth/auth-user';

/**
 * Lấy thông tin store đã được `ApprovedSellerGuard` gắn vào request.
 * Dùng trong các route `/api/seller/*`, ví dụ `@CurrentStore() store` hoặc `@CurrentStore('storeId') storeId`.
 */
export const CurrentStore = createParamDecorator(
  (field: keyof SellerStoreContext | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const store = request.sellerStore;
    return field ? store?.[field] : store;
  },
);
