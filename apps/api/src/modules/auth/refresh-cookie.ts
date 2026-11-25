import type { CookieOptions } from 'express';

/** Cookie chứa refresh token (doc 05 mục 3). */
export const REFRESH_COOKIE_NAME = 'refreshToken';

/** Trình duyệt chỉ gửi cookie tới `/api/auth/*`, không gửi kèm mọi request khác. */
const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * `httpOnly`: JavaScript của trang không đọc được token (chống XSS lấy token).
 * `sameSite=lax`: không gửi kèm request POST từ site khác (chống CSRF).
 * `secure`: chỉ gửi qua HTTPS ở production.
 */
function baseOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function refreshCookieOptions(
  isProduction: boolean,
  expiresAt: Date,
): CookieOptions {
  return { ...baseOptions(isProduction), expires: expiresAt };
}

/** Xóa cookie phải dùng đúng `path` lúc đặt, nếu không trình duyệt giữ nguyên. */
export function clearRefreshCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return baseOptions(isProduction);
}
