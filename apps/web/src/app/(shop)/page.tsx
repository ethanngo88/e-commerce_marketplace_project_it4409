import Link from "next/link";
import { ApiStatus } from "@/components/home/api-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Trang chủ khung (T-07). Danh mục và sản phẩm hiện là dữ liệu giữ chỗ; T-24 thay bằng
 * dữ liệu thật từ `GET /api/categories` và `GET /api/products` (Server Component).
 */
const PLACEHOLDER_CATEGORIES = [
  "Thời trang nam",
  "Thời trang nữ",
  "Điện thoại & Phụ kiện",
  "Nhà cửa & Đời sống",
  "Sách",
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-4 rounded-xl bg-muted px-6 py-10 md:px-10">
        <Badge variant="secondary">Nhiều người bán, một giỏ hàng</Badge>
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          Mua sắm từ nhiều cửa hàng, thanh toán một lần
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Tìm sản phẩm từ các người bán đã được duyệt, đặt hàng một lần và theo dõi
          từng kiện hàng riêng của mỗi cửa hàng.
        </p>
        <Button asChild size="lg">
          <Link href="/products">Xem sản phẩm</Link>
        </Button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Danh mục</h2>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDER_CATEGORIES.map((name) => (
            <Badge key={name} variant="outline" className="px-3 py-1 text-sm">
              {name}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Sản phẩm mới</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="gap-3 py-4">
              <CardContent className="flex flex-col gap-3 px-4">
                <div className="aspect-square rounded-md bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-md">
        <ApiStatus />
      </section>
    </div>
  );
}
