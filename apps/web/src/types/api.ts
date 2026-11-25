/**
 * Định dạng response chung của backend (docs/05_API_Documentation.md mục 1.4, 1.5).
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Kết quả của các endpoint danh sách có phân trang. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Phần tử của `details` khi `code = VALIDATION_ERROR`. */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/** `GET /api/health` (doc 05 mục 2). */
export interface HealthStatus {
  status: "ok";
  db: "up";
}
