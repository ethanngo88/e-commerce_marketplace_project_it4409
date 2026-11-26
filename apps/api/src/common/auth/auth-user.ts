import type { Request } from 'express';

/** Tên role, khớp với bảng `roles` (doc 04 mục 5.4). */
export const Role = {
  CUSTOMER: 'CUSTOMER',
  SELLER: 'SELLER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Nội dung access token (doc 03 mục 6.1). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: Role[];
}

/**
 * Người dùng đã đăng nhập, do `JwtAuthGuard` gắn vào `request.user`.
 * Lấy trong controller bằng `@CurrentUser()`.
 *
 * `roles` là role tại thời điểm cấp access token. Role thay đổi (ví dụ seller vừa
 * được duyệt) chỉ có hiệu lực sau lần refresh token tiếp theo.
 */
export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
}

export interface SellerStoreContext {
  sellerId: string;
  storeId: string;
  storeSlug: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sellerStore?: SellerStoreContext;
}
