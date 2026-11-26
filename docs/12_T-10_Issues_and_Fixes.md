# 12 – T-10 Auth API: lỗi phát hiện khi kiểm chứng và cách sửa

- **Phạm vi:** Task **T-10** (Auth API & JWT/RBAC Guards – M3, P0), xem [01 – Project Overview](01_Project_Overview.md) mục 7.2 và [11 – T-10 Auth API: cách thực hiện](11_T-10_Auth_Implementation.md).
- **Nhánh:** `feature/T-10-auth-api` (đối chiếu từ commit `09d2f5b` sang bản sửa `0baaf39`).
- **Thời gian kiểm chứng & sửa:** 26/11/2026.
- **Trạng thái:** đã sửa toàn bộ lỗi chặn và hoàn tất kiểm chứng tự động + kiểm thử live trên PostgreSQL 16 thật.

---

## 1. Tổng quan các vấn đề phát hiện trên T-10

Ở thời điểm commit `09d2f5b`, [doc 11](11_T-10_Auth_Implementation.md) mục 8 ghi nhận nhánh `feature/T-10-auth-api` mới chạy qua `lint:check` và `typecheck`, chưa chạy xong unit test, e2e, build và thử với database thật do lỗi WSL `0x8007274c`. Khi tiến hành kiểm chứng đầy đủ trên Windows, đã phát hiện **2 lỗi kỹ thuật thật** và hoàn tất phần kiểm chứng còn thiếu:

| Mã | Mức độ | Vấn đề | Trạng thái |
|----|--------|--------|------------|
| T10-1 | **P0** | `@nestjs/jwt@^12.0.5` là gói ESM-only làm crash toàn bộ Jest (unit test Auth & toàn bộ e2e test) | Đã sửa (`0baaf39`) |
| T10-2 | **P1** | Chuỗi mẫu `JWT_ACCESS_SECRET` trong `.env.example` đủ 32 ký tự nên vẫn qua kiểm tra ở `NODE_ENV=production` (mục **O2** trong [doc 10](10_Phase1-3_Issues_and_Solutions.md)) | Đã sửa (`0baaf39`) |
| T10-3 | **P1** | Chưa chạy kiểm chứng `build`, `unit test`, `test:e2e`, seed và API thật trên PostgreSQL | Đã hoàn tất |

---

## 2. Chi tiết từng lỗi và cách sửa

### 2.1 Lỗi `@nestjs/jwt@^12.0.5` ESM-only làm vỡ Jest CommonJS (P0)

- **Hiện tượng:**
  - Chạy `npm test` thất bại **3/11 test suites**: `token.service.spec.ts`, `auth.service.spec.ts`, `jwt-auth.guard.spec.ts`.
  - Chạy `npm run test:e2e` thất bại **1/1 suite** (`test/app.e2e-spec.ts`), đồng nghĩa mọi E2E test của các module sau (T-13, T-15...) đều bị chặn vì `AppModule` import `AuthModule`.
  - Thông báo lỗi:
    ```text
    D:\...\apps\api\node_modules\@nestjs\jwt\dist\index.js:1
    import jsonwebtoken from 'jsonwebtoken';
    ^^^^^^
    SyntaxError: Cannot use import statement outside a module
    ```
- **Nguyên nhân gốc:**
  - `apps/api` đang dùng **NestJS 11 + CommonJS + Jest 29 (`ts-jest` CJS)**, nhưng `package.json` lại cài `"@nestjs/jwt": "^12.0.5"`.
  - Trong `node_modules/@nestjs/jwt/package.json`, phiên bản `12.0.5` được xuất bản theo dạng **pure ESM** (`"type": "module"`, `exports` chỉ trỏ tới ESM `./dist/index.js`).
  - Lỗi lọt qua bước kiểm tra ban đầu vì `tsc --noEmit` và `nest build` chỉ đọc file `.d.ts` (không thực thi JS của `node_modules`), còn Node 26 hỗ trợ `require(esm)` ở runtime; chỉ khi Jest VM nạp `node_modules/@nestjs/jwt/dist/index.js` theo mặc định không transform thì lỗi mới nổ.
- **Cách sửa:**
  - Đối chiếu toàn bộ API đang dùng trong `auth.module.ts`, `token.service.ts`, `jwt-auth.guard.ts` (`JwtModule.registerAsync({ global: true, ... })`, `JwtSignOptions['expiresIn']`, `signAsync`, `verifyAsync`) — tất cả đều tương thích hoàn toàn với dòng v11.
  - Hạ phiên bản về **`@nestjs/jwt@^11.0.2`** (bản CommonJS chuẩn đi cùng hệ sinh thái NestJS 11) thay vì thêm cấu hình `transformIgnorePatterns` phức tạp cho Jest.
- **File thay đổi:** `apps/api/package.json`, `apps/api/package-lock.json`.

---

### 2.2 Chấp nhận `JWT_ACCESS_SECRET` mẫu ở môi trường production (P1 – mục O2)

- **Hiện tượng:**
  - File `apps/api/.env.example` có giá trị mẫu:
    ```env
    JWT_ACCESS_SECRET=replace-with-a-random-string-at-least-32-characters-long
    ```
  - Vì chuỗi này dài 56 ký tự (≥ 32 ký tự), `validateEnv()` trước đây chấp nhận nó ngay cả khi `NODE_ENV=production`. Nếu người triển khai sao chép `.env.example` mà quên thay secret, bất kỳ ai đọc repo công khai đều tự ký được access token giả mang quyền `ADMIN`.
- **Cách sửa:**
  - Khai báo hằng số `PLACEHOLDER_JWT_ACCESS_SECRET` trong `apps/api/src/config/env.validation.ts`.
  - Trong `validateEnv()`, nếu `NODE_ENV === NodeEnv.Production` và `JWT_ACCESS_SECRET === PLACEHOLDER_JWT_ACCESS_SECRET`, ném lỗi `Invalid environment configuration: JWT_ACCESS_SECRET: cannot use the example placeholder in production` để chặn ứng dụng khởi động.
  - Vẫn cho phép dùng giá trị mẫu ở môi trường `development` để người mới clone repo chạy nhanh ở local.
  - Bổ sung 2 unit test tương ứng trong `apps/api/src/config/env.validation.spec.ts`.
- **File thay đổi:** `apps/api/src/config/env.validation.ts`, `apps/api/src/config/env.validation.spec.ts`.

---

## 3. Kết quả kiểm chứng sau khi sửa

### 3.1 Kiểm thử tự động

| Hạng mục | Trước sửa (`09d2f5b`) | Sau sửa (`0baaf39`) |
|---|---|---|
| `npx prisma validate && npx prisma generate` | Pass | **Pass** |
| `npm run lint:check` | Pass | **Pass** |
| `npm run typecheck` | Pass | **Pass** |
| `npm test -- --maxWorkers=2` | **Fail 3/11 suites** (60/60 suites cũ) | **Pass 11/11 suites (86/86 tests)** |
| `npm run test:e2e` | **Fail 1/1 suite** (vỡ lúc load) | **Pass 1/1 suite (22/22 tests)** |
| `npm run build` | Chưa kiểm chứng | **Pass** |

### 3.2 Kiểm thử live trên PostgreSQL 16 + Seed data thật

Đã khởi động Docker Compose (`postgres:16-alpine`), chạy `npx prisma migrate deploy` và `npx prisma db seed` (chạy 2 lần liên tiếp xác nhận idempotent: 3 roles, 4 tài khoản mẫu, 19 danh mục, 2 seller/store, 36 sản phẩm), khởi động server `node dist/main.js` và kiểm tra đủ checklist mục 8.1 của [doc 11](11_T-10_Auth_Implementation.md):

| Kịch bản kiểm thử live | Kết quả |
|---|---|
| `POST /api/auth/login` với `admin@example.com` và `customer@example.com` | ✅ `200`, nhận `accessToken` + cookie `refreshToken` (`HttpOnly`) |
| `GET /api/auth/me` với Bearer token | ✅ `200`, trả đúng `email` và `roles` hiện tại từ DB |
| `POST /api/auth/refresh` xoay vòng cookie | ✅ `200`, cấp `accessToken` mới và cookie mới khác cookie cũ |
| Gửi lại cookie cũ đã xoay (reuse detection) | ✅ `401 INVALID_REFRESH_TOKEN`, đồng thời thu hồi luôn cookie mới vừa cấp (`401`) |
| `POST /api/auth/logout` rồi gọi `POST /api/auth/refresh` bằng cookie vừa đăng xuất | ✅ Logout `204`, refresh sau đó nhận `401` |
| Tài khoản ở trạng thái `BANNED` thử đăng nhập | ✅ `403 ACCOUNT_BANNED` (đã khôi phục lại `ACTIVE` sau test) |
| Gọi `POST /api/auth/login` vượt quá 10 lần/phút trên 1 IP | ✅ Lần thứ 11 trả `429 TOO_MANY_REQUESTS` |

---

## 4. Hạn chế đã biết (chuyển tiếp sang task liên quan)

Các giới hạn thiết kế đã ghi nhận trong [doc 11](11_T-10_Auth_Implementation.md) mục 9 không phải lỗi chặn T-10 và sẽ xử lý đúng nơi sở hữu:
- **Giới hạn 72 byte của `bcrypt`:** mật khẩu tiếng Việt có dấu có thể vượt 72 byte dù < 72 ký tự → cần kiểm tra theo `Buffer.byteLength(password, 'utf8') <= 72` khi làm đổi mật khẩu ở **T-11** (và đồng bộ lại DTO đăng ký).
- **Hai tab cùng gọi `/auth/refresh` song song:** xem xét đồng bộ refresh ở frontend (**T-23**) hoặc thêm khoảng ân hạn ngắn cho token vừa xoay.
- **Dọn bản ghi `refresh_tokens` hết hạn / đã thu hồi:** bổ sung tác vụ dọn định kỳ ở giai đoạn vận hành (**T-34**).

---

## 5. Bài học rút ra

1. **Đồng bộ major version với hệ sinh thái NestJS hiện dùng:** khi repo dùng NestJS 11 CommonJS + Jest 29, mọi gói `@nestjs/*` mới cài thêm phải ghim đúng nhánh tương thích CommonJS (ví dụ `@nestjs/jwt@^11`), không cài mù `@latest` (v12 ESM-only).
2. **`typecheck` và `build` xanh không thay thế được chạy Jest và kiểm thử live:** lỗi ESM chỉ lộ khi Jest thực thi module, còn lỗi secret mẫu hay hành vi cookie/rate-limit cần kiểm chứng cả bằng unit test biên lẫn chạy thật với PostgreSQL.
