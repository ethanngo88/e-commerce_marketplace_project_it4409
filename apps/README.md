# apps

Mã nguồn của hai ứng dụng nằm trong thư mục này. Mỗi ứng dụng là một project npm độc lập, có `package.json`, `node_modules` và `package-lock.json` riêng.

| Thư mục | Ứng dụng | Người khởi tạo | Task | Trạng thái |
|---------|----------|----------------|------|------------|
| `api/` | Backend NestJS | M3 | T-06 | Đã khởi tạo (NestJS, Prisma 7, Swagger, `/api/health`) |
| `web/` | Frontend Next.js | M2 | T-07 | Chưa khởi tạo (xem hướng dẫn bên dưới) |

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
npx prisma db seed            # dữ liệu mẫu (xem mục "Dữ liệu mẫu" bên dưới)
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

## Dữ liệu mẫu (T-09)

`npx prisma db seed` chạy [api/prisma/seed.ts](api/prisma/seed.ts) với dữ liệu trong [api/prisma/seed-data.ts](api/prisma/seed-data.ts). File `.env` cần có `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` và `SEED_USER_PASSWORD` (xem `.env.example`).

| Tài khoản | Role | Mật khẩu | Ghi chú |
|-----------|------|----------|---------|
| `admin@example.com` | ADMIN | `SEED_ADMIN_PASSWORD` | |
| `seller1@example.com` | CUSTOMER, SELLER | `SEED_USER_PASSWORD` | Store `an-fashion`: thời trang |
| `seller2@example.com` | CUSTOMER, SELLER | `SEED_USER_PASSWORD` | Store `binh-minh-tech`: điện thoại, gia dụng, sách |
| `customer@example.com` | CUSTOMER | `SEED_USER_PASSWORD` | Có một địa chỉ mặc định |

Các trường hợp có sẵn để thử:

- 19 danh mục, 2 cấp. Danh mục `dong-ho-nam` đang tắt.
- 36 sản phẩm: 34 ACTIVE, `ao-khoac-denim` là DRAFT, `cay-xanh-mini-de-ban` là HIDDEN.
- Hết hàng ở mọi variant: `giay-tay-da-bo`, `tai-nghe-gaming-rgb`. Tồn kho thấp (3): `pin-sac-du-phong-10000mah`.
- Variant `SML-BE-L` đã tắt và rẻ hơn các variant khác, nên `minPrice` của `ao-so-mi-lua-nu` vẫn là 279.000đ.
- Tìm "ao thun" phải ra 3 sản phẩm "Áo thun..." (IT-18).
- Ảnh là ảnh giữ chỗ của placehold.co, `publicId` có tiền tố `seed/` và không tồn tại trên Cloudinary.
- `ratingAvg`, `ratingCount`, `soldCount` đều bằng 0, vì chưa có đơn hàng và review.

Seed chỉ tạo bản ghi còn thiếu, không ghi đè dữ liệu đã có. Muốn đưa database về đúng dữ liệu mẫu: `npx prisma migrate reset`, rồi `npx prisma db seed`.

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

## Frontend (M2, task T-07)

```bash
cd apps
rm -rf web             # PowerShell: Remove-Item -Recurse -Force web
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git
git restore web        # lấy lại các thư mục giữ chỗ trong web/src
cd web
npx shadcn@latest init
```

- create-next-app chỉ chạy khi thư mục đích chưa có hoặc đang trống; nếu không, nó dừng với thông báo `contains files that could conflict`. Vì vậy cần xóa tạm `web/`. Thư mục này chỉ chứa các file `.gitkeep`, và `git restore web` lấy lại chúng mà không đụng tới các file vừa sinh ra.
- `--disable-git` có cùng lý do với `--skip-git` ở trên.
- Các câu hỏi còn lại của hai công cụ có thể giữ giá trị mặc định.

## Sau khi khởi tạo

- Commit cả `package-lock.json` của từng ứng dụng, để mọi người cài đúng cùng một bộ phiên bản.
- Tạo file `.env.example` liệt kê tên biến môi trường với giá trị giả. Không commit file `.env` thật.
- Cập nhật file này và [docs/09_Deployment_Guide.md](../docs/09_Deployment_Guide.md) bằng các lệnh chạy thực tế.

Các phần khởi tạo khác thuộc về: Prisma schema (M1, T-02), Docker Compose và CI (M1, T-08), seed data (M4, T-09).
