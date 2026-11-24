import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Font phải có bộ ký tự tiếng Việt, nếu không chữ có dấu sẽ hiển thị bằng font dự phòng.
// Biến `--font-sans` được theme của shadcn trong globals.css sử dụng.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: {
    default: "Marketplace",
    template: "%s | Marketplace",
  },
  description: "Sàn thương mại điện tử nhiều người bán – đồ án IT4409",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
