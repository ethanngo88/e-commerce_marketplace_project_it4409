import { appendSlugSuffix, slugify } from './slugify';

describe('slugify', () => {
  it('should normalize Vietnamese accents and đ/Đ into kebab-case', () => {
    expect(slugify('Điện thoại & Phụ kiện')).toBe('dien-thoai-phu-kien');
    expect(slugify('Đồ dùng nhà bếp')).toBe('do-dung-nha-bep');
    expect(slugify('  Áo thun cotton nam  ')).toBe('ao-thun-cotton-nam');
  });

  it('should fall back to "item" when input has no alphanumeric characters', () => {
    expect(slugify('!!! --- ???')).toBe('item');
  });

  it('should clip slugs exceeding maxLength without leaving a trailing dash', () => {
    expect(slugify('ao thun nam', 6)).toBe('ao-thu');
    expect(slugify('ao-thun-nam', 3)).toBe('ao');
  });

  it('should append a suffix while respecting maxLength', () => {
    expect(appendSlugSuffix('ao-nam', 'x8k2')).toBe('ao-nam-x8k2');
    expect(appendSlugSuffix('a'.repeat(150), 'ab12', 150)).toHaveLength(150);
  });
});
