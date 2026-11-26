import { randomBytes } from 'node:crypto';

/**
 * Chuyển chuỗi tiếng Việt thành slug URL-safe (chữ thường, không dấu, phân cách bằng `-`).
 * Xử lý riêng `đ`/`Đ` vì Unicode NFD không tách ký tự này.
 */
export function slugify(input: string, maxLength = 120): string {
  const normalized = input
    .trim()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const trimmed = normalized.slice(0, maxLength).replace(/-+$/g, '');
  return trimmed || 'item';
}

/**
 * Gắn hậu tố ngắn (mặc định 4 ký tự hex ngẫu nhiên) để tránh trùng slug.
 */
export function appendSlugSuffix(
  baseSlug: string,
  suffix = randomBytes(2).toString('hex'),
  maxLength = 150,
): string {
  const cleanSuffix = suffix.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const allowedBaseLen = Math.max(1, maxLength - cleanSuffix.length - 1);
  const clippedBase = baseSlug.slice(0, allowedBaseLen).replace(/-+$/g, '');
  return `${clippedBase || 'item'}-${cleanSuffix}`;
}
