"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";

/**
 * Provider dùng chung phía client. TanStack Query quản lý server state: cache,
 * refetch, trạng thái loading và lỗi (docs/03_System_Architecture.md mục 7).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Tạo trong useState để mỗi lần render lại không tạo cache mới.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Lỗi 4xx (sai dữ liệu, không có quyền, không tìm thấy) thử lại cũng vô ích.
            retry: (failureCount, error) =>
              failureCount < 2 &&
              !(error instanceof ApiError && error.status >= 400 && error.status < 500),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
