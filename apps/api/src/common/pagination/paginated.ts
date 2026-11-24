export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

/**
 * Kết quả có phân trang. Service trả đối tượng này, ResponseInterceptor chuyển
 * thành `{ success: true, data, meta }` theo doc 05 mục 1.4.
 */
export class Paginated<T> {
  constructor(
    readonly data: T[],
    readonly meta: PaginationMeta,
  ) {}

  /**
   * Tạo kết quả phân trang và tự tính `totalPages`.
   * `extraMeta` dùng cho thông tin thêm trong `meta`, ví dụ `summary` của review.
   */
  static of<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    extraMeta: Record<string, unknown> = {},
  ): Paginated<T> {
    return new Paginated(data, {
      ...extraMeta,
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    });
  }
}
