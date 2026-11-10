# apps

Mã nguồn của hai ứng dụng nằm trong thư mục này. Mỗi ứng dụng là một project npm độc lập, có `package.json`, `node_modules` và `package-lock.json` riêng.

| Thư mục | Ứng dụng | Người khởi tạo | Task |
|---------|----------|----------------|------|
| `api/` | Backend NestJS | M3 | T-06 |
| `web/` | Frontend Next.js | M2 | T-07 |

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
