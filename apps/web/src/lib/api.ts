/**
 * API client dùng chung cho mọi lời gọi backend (docs/03_System_Architecture.md mục 7).
 *
 * - Trả thẳng `data` của response; lỗi được ném thành `ApiError` mang `code`, `message`
 *   tiếng Việt và `details` từ backend (doc 05 mục 1.5).
 * - Access token chỉ giữ trong bộ nhớ, không lưu vào localStorage. Refresh token nằm
 *   trong cookie httpOnly do backend đặt, nên mọi request gửi kèm cookie.
 * - Trên trình duyệt, gặp 401 thì gọi `POST /auth/refresh` một lần rồi thử lại request.
 *
 * Ví dụ:
 *   const health = await api.get<HealthStatus>("/health");
 *   const page = await api.getPage<ProductSummary>("/products", { query: { q: "áo", page: 2 } });
 *   await api.post("/cart/items", { variantId, quantity: 1 });
 */
import type {
  ApiResponse,
  Paginated,
  PaginationMeta,
} from "@/types/api";

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Server Components chạy trong container Docker không gọi được `localhost:4000`
 * của máy người dùng, nên dùng `API_INTERNAL_URL` (ví dụ `http://api:4000/api`) nếu có.
 */
function baseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL || PUBLIC_API_URL;
  }
  return PUBLIC_API_URL;
}

export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 khi không kết nối được máy chủ. */
    readonly status: number,
    /** Mã lỗi của backend, ví dụ `INSUFFICIENT_STOCK` (doc 05 mục 15). */
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Access token và phiên đăng nhập
// ---------------------------------------------------------------------------

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

/** Gọi sau khi đăng nhập, đăng ký hoặc đăng xuất (`null`). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Đăng ký hàm được gọi khi refresh thất bại, ví dụ để xóa thông tin user và chuyển
 * về trang đăng nhập. Trả về hàm hủy đăng ký.
 */
export function onSessionExpire(handler: () => void): () => void {
  onSessionExpired = handler;
  return () => {
    if (onSessionExpired === handler) {
      onSessionExpired = null;
    }
  };
}

/**
 * Lấy access token mới bằng cookie refresh. Nhiều request cùng gặp 401 chỉ tạo
 * một lời gọi refresh, vì backend xoay vòng refresh token ở mỗi lần gọi.
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as ApiResponse<{
        accessToken: string;
      }> | null;
      if (!response.ok || !body?.success) {
        return false;
      }
      accessToken = body.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------------------------------------------------------------------------
// Gửi request
// ---------------------------------------------------------------------------

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Cache của `fetch` (Server Components). */
  cache?: RequestCache;
  /** Tùy chọn riêng của Next.js, ví dụ `{ revalidate: 60 }`. */
  next?: NextFetchRequestConfig;
}

interface InternalOptions extends RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Object được gửi dạng JSON; `FormData` được gửi dạng multipart (upload ảnh). */
  body?: unknown;
}

/** Các endpoint mà 401 nghĩa là sai thông tin, không phải hết hạn access token. */
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function send(path: string, options: InternalOptions): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method,
      headers,
      body,
      credentials: "include",
      signal: options.signal,
      cache: options.cache,
      next: options.next,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Không kết nối được máy chủ, vui lòng kiểm tra mạng và thử lại",
    );
  }
}

async function parse<T>(response: Response): Promise<{ data: T; meta?: PaginationMeta }> {
  if (response.status === 204) {
    return { data: undefined as T };
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (body?.success === true) {
    return { data: body.data, meta: body.meta };
  }
  if (body?.success === false) {
    const { code, message, details } = body.error;
    throw new ApiError(response.status, code, message, details);
  }
  throw new ApiError(
    response.status,
    response.ok ? "INVALID_RESPONSE" : "INTERNAL_ERROR",
    "Máy chủ trả về dữ liệu không hợp lệ",
  );
}

async function request<T>(
  path: string,
  options: InternalOptions,
): Promise<{ data: T; meta?: PaginationMeta }> {
  let response = await send(path, options);

  const canRefresh =
    response.status === 401 &&
    typeof window !== "undefined" &&
    !NO_REFRESH_PATHS.has(path);
  if (canRefresh) {
    if (await refreshAccessToken()) {
      response = await send(path, options);
    } else {
      accessToken = null;
      onSessionExpired?.();
    }
  }

  return parse<T>(response);
}

export const api = {
  get: async <T>(path: string, options: RequestOptions = {}) =>
    (await request<T>(path, { ...options, method: "GET" })).data,

  /** Danh sách có phân trang: trả cả `data` và `meta` (doc 05 mục 1.4). */
  getPage: async <T>(path: string, options: RequestOptions = {}): Promise<Paginated<T>> => {
    const { data, meta } = await request<T[]>(path, { ...options, method: "GET" });
    if (!meta) {
      throw new ApiError(200, "INVALID_RESPONSE", "Thiếu thông tin phân trang");
    }
    return { data, meta };
  },

  post: async <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    (await request<T>(path, { ...options, method: "POST", body })).data,

  put: async <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    (await request<T>(path, { ...options, method: "PUT", body })).data,

  patch: async <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    (await request<T>(path, { ...options, method: "PATCH", body })).data,

  delete: async <T = void>(path: string, options: RequestOptions = {}) =>
    (await request<T>(path, { ...options, method: "DELETE" })).data,
};
