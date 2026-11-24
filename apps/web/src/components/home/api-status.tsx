"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { HealthStatus } from "@/types/api";

/**
 * Gọi `GET /api/health` từ trình duyệt: kiểm tra frontend kết nối được backend,
 * CORS đúng và API client đọc đúng định dạng response (tiêu chí của T-07).
 */
export function ApiStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.get<HealthStatus>("/health", { signal }),
    retry: false,
  });

  return (
    <Card data-testid="api-status">
      <CardHeader>
        <CardTitle className="text-base">Kết nối backend</CardTitle>
        <CardDescription>
          Kết quả gọi <code>GET /api/health</code> từ trình duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        {health.isPending && <Badge variant="secondary">Đang kiểm tra…</Badge>}
        {health.isSuccess && (
          <>
            <Badge data-testid="api-status-ok">API hoạt động</Badge>
            <span className="text-muted-foreground">
              Database: {health.data.db}
            </span>
          </>
        )}
        {health.isError && (
          <>
            <Badge variant="destructive" data-testid="api-status-error">
              Không gọi được API
            </Badge>
            <span className="text-muted-foreground">
              {health.error.message}
              {health.error instanceof ApiError && ` (${health.error.code})`}
            </span>
          </>
        )}
      </CardContent>
    </Card>
  );
}
