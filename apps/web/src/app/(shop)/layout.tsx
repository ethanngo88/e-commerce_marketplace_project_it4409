import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Bố cục khu vực mua sắm: trang chủ, sản phẩm, giỏ hàng, đơn hàng, tài khoản. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
