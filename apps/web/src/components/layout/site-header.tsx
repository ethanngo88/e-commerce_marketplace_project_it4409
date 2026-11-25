import Link from "next/link";
import { Search, ShoppingCart, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Header khu vực mua sắm. Các trang đích (/products, /cart, /login...) được làm ở
 * T-23, T-24, T-25; trạng thái đăng nhập và số lượng giỏ hàng được nối ở T-23, T-25.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          Marketplace
        </Link>

        {/* Form GET thường: tìm kiếm chạy được cả khi JavaScript chưa tải xong. */}
        <form
          action="/products"
          role="search"
          className="flex flex-1 items-center gap-2"
        >
          <label htmlFor="site-search" className="sr-only">
            Tìm kiếm sản phẩm
          </label>
          <Input
            id="site-search"
            name="q"
            type="search"
            maxLength={100}
            placeholder="Tìm sản phẩm, ví dụ: áo thun"
            className="max-w-xl"
          />
          <Button type="submit" size="icon" aria-label="Tìm kiếm">
            <Search />
          </Button>
        </form>

        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href="/seller">
              <Store />
              Kênh người bán
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Giỏ hàng">
            <Link href="/cart">
              <ShoppingCart />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Đăng nhập</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
