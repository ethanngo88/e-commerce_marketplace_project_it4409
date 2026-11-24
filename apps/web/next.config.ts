import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Ảnh sản phẩm: Cloudinary (T-14) và ảnh giữ chỗ của seed data (T-09).
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
