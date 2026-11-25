import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Đánh dấu route hoặc controller không cần đăng nhập. Mặc định mọi route đều
 * cần access token, vì `JwtAuthGuard` được áp dụng toàn cục.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
