# apps

Mã nguồn của hai ứng dụng nằm trong thư mục này. Mỗi ứng dụng là một project npm độc lập, có `package.json`, `node_modules` và `package-lock.json` riêng.

| Thư mục | Ứng dụng | Người khởi tạo | Task | Trạng thái |
|---------|----------|----------------|------|------------|
| `api/` | Backend NestJS | M3 | T-06 | Đã khởi tạo (NestJS, Prisma 7, Swagger, `/api/health`) |
| `web/` | Frontend Next.js | M2 | T-07 | Đã khởi tạo (Next.js 16, Tailwind 4, shadcn/ui, TanStack Query, API client) |

## Chạy nhanh Backend (`apps/api`)

```bash
# Từ thư mục gốc repo: bật PostgreSQL và Redis
docker compose up -d postgres redis

# Từ apps/api:
cd apps/api
cp .env.example .env          # điền JWT_ACCESS_SECRET và biến môi trường cần thiết
npm install
npx prisma migrate dev        # áp dụng migration (đủ 20 bảng + constraint + search index)
npx prisma generate           # sinh Prisma Client
npm run start:dev             # API: http://localhost:4000/api · Swagger: http://localhost:4000/api/docs
```

Các lệnh kiểm tra chất lượng trong `apps/api`:

```bash
npm run lint:check            # kiểm tra ESLint
npm run typecheck             # kiểm tra kiểu TypeScript (tsc --noEmit)
npm test                      # chạy unit test (Jest)
npm run test:e2e              # chạy e2e test (Supertest)
npm run build                 # build ra dist/main.js
```

Cây thư mục đích của hai ứng dụng ([docs/03_System_Architecture.md](../docs/03_System_Architecture.md), mục 5) đã được tạo sẵn. Git không lưu thư mục trống, nên mỗi thư mục lá chứa một file `.gitkeep` rỗng. Mã nguồn và file cấu hình chưa có: công cụ khởi tạo chính thức sẽ tạo ra chúng theo các bước dưới đây. Khi một thư mục đã có file thật, xóa file `.gitkeep` của thư mục đó.

## Trước khi bắt đầu

- Cài Node.js 24.x (từ 24.9 trở lên) hoặc 26.x. NestJS 12 kết hợp với Jest không chạy được trên bản thấp hơn.
- Làm trên nhánh riêng của task, ví dụ `feature/T-06-init-backend`, và chạy các lệnh dưới đây từ thư mục `apps/`.

## Backend (M3, task T-06)

```bash
cd apps
npx @nestjs/cli@latest new api --package-manager npm --skip-git --no-observe
```

- Khi được hỏi module system, chọn **CommonJS**. Lựa chọn này sinh ra cấu hình Jest, đúng công nghệ nhóm đã thống nhất; chọn ESM sẽ sinh ra Vitest.
- `--skip-git` là bắt buộc. Thiếu nó, công cụ tạo một repo git lồng bên trong repo của nhóm.
- `nest new` vẫn chạy được dù `api/` đã có các thư mục giữ chỗ, vì không file nào của template trùng với các file `.gitkeep`.
- Cài Prisma theo [trang Prisma trong tài liệu NestJS](https://docs.nestjs.com/data/prisma), với PostgreSQL và đúng bản 7:

  ```bash
  cd api
  npm install prisma@7 dotenv --save-dev
  npm install @prisma/client@7 @prisma/adapter-pg
  ```

  Không chạy `npm install prisma@latest`: thẻ `latest` trên npm hiện trỏ tới bản thử nghiệm Prisma 8, có bộ lệnh khác. Vì project là CommonJS, khối `generator` trong `schema.prisma` cần thêm `moduleFormat = "cjs"`, như tài liệu trên hướng dẫn.

- `npx prisma init` dừng với lỗi `A folder called prisma already exists` khi thư mục `prisma/` đã tồn tại. Repo có sẵn `api/prisma/migrations/.gitkeep`, nên xóa tạm thư mục rồi lấy lại sau khi khởi tạo:

  ```bash
  rm -rf prisma          # PowerShell: Remove-Item -Recurse -Force prisma
  npx prisma init --datasource-provider postgresql
  git restore prisma     # lấy lại prisma/migrations/.gitkeep
  ```

  Các tùy chọn khác của `prisma init`, ví dụ `--output`, làm theo tài liệu NestJS. File `.gitkeep` trong `migrations/` không ảnh hưởng tới `prisma migrate`, vì Prisma chỉ đọc các thư mục con trong đó.

- Phần còn lại của task (config, validation pipe, exception filter, Swagger, `GET /api/health`) làm theo tiêu chí ở [docs/01_Project_Overview.md](../docs/01_Project_Overview.md), mục 7.1, và định dạng response ở [docs/05_API_Documentation.md](../docs/05_API_Documentation.md), mục 1.

## Frontend (`apps/web`, task T-07)

Chạy (backend phải đang chạy ở cổng 4000 để trang chủ báo "API hoạt động"):

```bash
cd apps/web
cp .env.example .env.local    # PowerShell: Copy-Item .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Các lệnh kiểm tra: `npm run lint`, `npm run typecheck`, `npm run build`.

Project được tạo bằng hai lệnh sau, các tùy chọn khác giữ mặc định:

```bash
npx create-next-app@16.4.6 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --no-agents-md
npx shadcn@4.23.0 init -t next -b radix -p nova   # chạy trong apps/web
```

Những điều cần biết khi viết code frontend:

- **Gọi API:** luôn qua [web/src/lib/api.ts](web/src/lib/api.ts), không gọi `fetch` trực tiếp. Hàm trả về `data`; lỗi được ném thành `ApiError` có `status`, `code`, `message` tiếng Việt và `details` (doc 05 mục 1.5). Danh sách phân trang dùng `api.getPage()`. Kiểu response chung nằm ở [web/src/types/api.ts](web/src/types/api.ts).
- **Phiên đăng nhập (T-23):** sau khi đăng nhập gọi `setAccessToken(token)`; dùng `onSessionExpire()` để đăng xuất khi refresh thất bại. API client tự gọi `/auth/refresh` khi gặp 401 rồi thử lại một lần. Không lưu token vào `localStorage`.
- **Server state:** dùng `useQuery`, `useMutation` của TanStack Query; provider ở [web/src/app/providers.tsx](web/src/app/providers.tsx).
- **Component UI:** shadcn/ui bản Radix, thêm bằng `npx shadcn@latest add <tên>`; file sinh ra nằm ở `src/components/ui/`. Hàm `cn()` lấy từ gói `cn` của shadcn (thay cho `clsx` + `tailwind-merge`).
- **Route:** khu mua sắm nằm trong `src/app/(shop)/` (dùng chung header, footer); `(auth)/`, `seller/`, `admin/` còn trống. Các link `/products`, `/cart`, `/login`, `/seller` trên header chưa có trang và đang trả 404.
- **Cache Components:** `next.config.ts` bật `cacheComponents` (mặc định của Next.js 16.4). Server Component đọc dữ liệu không cache (ví dụ gọi API sản phẩm) phải nằm trong `<Suspense>`, nếu không `next build` báo lỗi. Đọc tài liệu Next.js về Cache Components trước khi làm T-24; bản đúng phiên bản đang dùng có sẵn trong `web/node_modules/next/dist/docs/01-app/02-guides/` (ví dụ `building.md`, `migrating-to-cache-components.md`).
- **Biến môi trường:** `NEXT_PUBLIC_API_URL` được nhúng vào code lúc build; đổi giá trị thì phải build lại.

## Sau khi khởi tạo

- Commit cả `package-lock.json` của từng ứng dụng, để mọi người cài đúng cùng một bộ phiên bản.
- Tạo file `.env.example` liệt kê tên biến môi trường với giá trị giả. Không commit file `.env` thật.
- Cập nhật file này và [docs/09_Deployment_Guide.md](../docs/09_Deployment_Guide.md) bằng các lệnh chạy thực tế.

Các phần khởi tạo khác thuộc về: Prisma schema (M1, T-02), Docker Compose và CI (M1, T-08), seed data (M4, T-09).
