import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>© 2026 Marketplace · Đồ án IT4409 – Công nghệ Web và dịch vụ trực tuyến</p>
        <nav className="flex gap-4">
          <Link href="/products" className="hover:text-foreground">
            Sản phẩm
          </Link>
          <Link href="/seller" className="hover:text-foreground">
            Bán hàng cùng Marketplace
          </Link>
        </nav>
      </div>
    </footer>
  );
}
