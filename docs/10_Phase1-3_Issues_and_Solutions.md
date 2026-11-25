# 10 – Lỗi phát hiện trong Phase 1–3 và cách giải quyết

- **Phạm vi:** Phase 1–3 (phân tích, thiết kế, khởi tạo; task T-01 đến T-09, xem [01 – Project Overview](01_Project_Overview.md) mục 7.1).
- **Thời gian:** 10/11/2026 – 25/11/2026.
- **Cập nhật:** 25/11/2026.
- **Cách đọc trạng thái:** *Đã sửa* là đã thay đổi trong repo; *Tránh trước* là phát hiện khi đọc tài liệu hoặc mã nguồn công cụ và đã ghi hướng dẫn; *Còn mở* là chưa xử lý (mục 6).

## 1. Tổng quan

| Nhóm | Số mục | Mục |
|------|--------|-----|
| Phân tích và thiết kế | 6 | 2 |
| Review backend (T-06, T-08) | 8 issue, gồm 5 lỗi quan trọng và 10 lỗi nhỏ | 3 |
| Khởi tạo backend, frontend, seed | 10 | 4 |
| Môi trường phát triển | 6 | 5 |
| Còn mở | 9 | 6 |

## 2. Phân tích và thiết kế (Phase 1–2)

| # | Vấn đề | Giải pháp | Trạng thái |
|---|--------|-----------|------------|
| D1 | Kế hoạch ban đầu giả định 10 tuần, thực tế chỉ còn 8 tuần | Lập lại roadmap 8 tuần, giữ nguyên MVP, gộp Phase 1–3 vào tuần 1, định sẵn thứ tự cắt giảm khi trễ (doc 01 mục 6.6) | Đã sửa |
| D2 | Chuỗi phụ thuộc khiến M4 phải chờ (T-16 phụ thuộc T-14); M2 quá tải | Làm API đọc sản phẩm trước, đưa seed data lên ưu tiên cao để tách phụ thuộc; quy định chuyển một phần Seller Center cho M3 nếu M2 trễ | Đã sửa |
| D3 | Doc 03 ghi `NOT_PRODUCT_OWNER` (403), mâu thuẫn quy tắc trả 404 của doc 05 | Sửa mã lỗi ở doc 03 theo doc 05 | Đã sửa |
| D4 | Doc 09 yêu cầu Node.js ≥ 20, phiên bản đã hết hỗ trợ | Cập nhật yêu cầu phiên bản Node.js | Đã sửa |
| D5 | Phần đầu doc 01 dùng nhiều dòng trích dẫn liền nhau nên bị gộp thành một dòng khi hiển thị | Đổi thành danh sách gạch đầu dòng | Đã sửa |
| D6 | Hiểu sai yêu cầu "khung dự án": sinh khoảng 61 file code ứng dụng, trong khi nhóm chỉ cần cấu trúc và tài liệu | Xóa các file thừa, chỉ giữ tài liệu, cấu trúc thư mục và [apps/README.md](../apps/README.md) | Đã sửa |

## 3. Review backend (T-06, T-08)

Review trên `develop` tại commit `a0319cc` (24/11). Các bản sửa nằm trong commit `abe6067` (nhánh `fix/T-06-api-review-findings`), đã merge vào `develop`.

### 3.1 Biến môi trường (P1)

- **Lỗi:** biến kiểu số để trống (`SHIPPING_FEE_PER_SELLER_ORDER=`) thành `0` thay vì giá trị mặc định. Phí ship thành 0đ mà không có cảnh báo; `API_PORT=` làm app không khởi động. Production thiếu `JWT_ACCESS_SECRET` vẫn khởi động.
- **Nguyên nhân:** `class-transformer` chạy `@Type(() => Number)` trước `@Transform`, nên `''` đã thành `0` trước khi hàm xử lý chuỗi rỗng được gọi. `@IsOptional()` bỏ qua kiểm tra secret.
- **Giải pháp:** loại mọi biến rỗng hoặc chỉ có khoảng trắng *trước* `plainToInstance`; bắt buộc `JWT_ACCESS_SECRET` ở production (T-10 nâng thành bắt buộc ở mọi môi trường).
- **File:** `apps/api/src/config/env.validation.ts`.

### 3.2 Rate limit sau reverse proxy (P1)

- **Lỗi:** rate limit tính theo `req.ip` nhưng chưa bật `trust proxy`. Sau Caddy, cả trang dùng chung 100 request/phút, kể cả IPN của VNPay.
- **Giải pháp:** thêm biến `TRUST_PROXY_HOPS` (mặc định `0`, production sau Caddy đặt `1`); `/api/health` không bị rate limit. Không bật cố định, vì khi không có proxy thì client giả được header `X-Forwarded-For`.
- **File:** `apps/api/src/setup-app.ts`, `health/health.controller.ts`.

### 3.3 Định dạng response (P0)

- **Lỗi:** handler trả `null` cho body rỗng, frontend gọi `res.json()` sẽ lỗi; không route nào bỏ bọc được (IPN VNPay cần `{ RspCode, Message }` trần); object có hai key `data` và `meta` bị đoán nhầm là kết quả phân trang.
- **Giải pháp:** `null` thành `{ success: true, data: null }`; thêm decorator `@RawResponse()`; phân trang dùng lớp `Paginated.of()` và kiểm tra bằng `instanceof`.
- **File:** `common/interceptors/response.interceptor.ts`, `common/decorators/raw-response.decorator.ts`, `common/pagination/paginated.ts`.

### 3.4 Health check (P1)

- **Lỗi:** `/api/health` trả 200 kể cả khi database chết, nên healthcheck Docker và dịch vụ giám sát luôn báo khỏe.
- **Giải pháp:** trả 503 `SERVICE_UNAVAILABLE`.
- **Kiểm chứng:** tắt PostgreSQL thì nhận 503 sau khoảng 5 giây, container chuyển `unhealthy`; bật lại thì `healthy`.

### 3.5 Timeout kết nối PostgreSQL (P1)

- **Lỗi:** pool `pg` không đặt `connectionTimeoutMillis` (mặc định chờ vô hạn), API treo khi database không phản hồi.
- **Giải pháp:** `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`.
- **Kiểm chứng:** địa chỉ không phản hồi báo lỗi sau 5,7 giây.
- **File:** `apps/api/src/prisma/prisma.service.ts`.

### 3.6 Xử lý lỗi (P1)

| Lỗi | Giải pháp |
|-----|-----------|
| Mã `NOT_FOUND`, `CONFLICT` không có trong `ErrorCode` và doc 05 | Bổ sung mã lỗi chung vào `ErrorCode` và doc 05 |
| Các lỗi 4xx khác bị gắn `INTERNAL_ERROR` | Ánh xạ đủ status sang mã lỗi (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`…) |
| Body quá 100 kB trả 500 | Đọc `status`/`statusCode` của lỗi body-parser, trả 413 |
| Lỗi 5xx không được log, message nội bộ lộ ra client | Log mọi lỗi ≥ 500 kèm stack; client chỉ nhận message chung |
| Message tiếng Anh của framework tới người dùng | Message mặc định tiếng Việt theo mã lỗi |

**Lưu ý cho cả nhóm:** lỗi nghiệp vụ phải ném bằng `AppException`; exception có sẵn của NestJS chỉ trả message chung.

### 3.7 Test e2e và validation lồng nhau (P2)

- **Lỗi:** test e2e chỉ đặt global prefix, không kiểm tra pipeline thật; lỗi trong DTO lồng nhau chỉ báo field cha.
- **Giải pháp:** tách `configureApp(app)` dùng chung cho `main.ts` và test; duyệt đệ quy lỗi validation để trả đường dẫn như `variants.1.price`.

### 3.8 Docker và phiên bản kiểu Node (P2)

- **Lỗi:** container chạy bằng root, mang theo devDependencies; `@types/node` là `^22` trong khi chạy Node 26.
- **Giải pháp:** `USER node`, `npm prune --omit=dev`; chuyển `prisma` và `dotenv` sang `dependencies` để vẫn chạy được migration; nâng `@types/node` lên `^26`.
- **Kiểm chứng:** image giảm từ 1,03 GB xuống 805 MB; `prisma migrate deploy` và `bcrypt` chạy được trong container.

### 3.9 Kết quả kiểm tra sau khi sửa

| | Trước | Sau |
|---|---|---|
| Lint, typecheck, build | Pass | Pass |
| Unit test | 13/13 | 50/50 |
| Test e2e | 2/2 | 10/10 |

Hai điểm từng nghi ngờ nhưng kiểm tra không phải lỗi: `prisma migrate dev` không xóa các index viết tay (`migrate diff` rỗng); `PrismaService` tự đóng pool là đúng.

## 4. Khởi tạo dự án (T-05, T-06, T-07, T-09)

| # | Vấn đề | Giải pháp | Trạng thái |
|---|--------|-----------|------------|
| S1 | `create-next-app` từ chối thư mục `apps/web` đã có file giữ chỗ | Xóa tạm thư mục, chạy công cụ, rồi `git restore` | Tránh trước |
| S2 | `prisma init` dừng khi thư mục `prisma/` đã tồn tại | Như trên | Tránh trước |
| S3 | Công cụ khởi tạo tạo repo Git lồng trong repo nhóm | Dùng `--skip-git` (NestJS), `--disable-git` (Next.js) | Tránh trước |
| S4 | `npm install prisma@latest` lúc đó trỏ tới bản thử nghiệm 8 có bộ lệnh khác | Ghim `prisma@7` | Tránh trước |
| S5 | npm workspaces làm hỏng đường dẫn Jest của project NestJS 12 mẫu | `apps/api` và `apps/web` là hai project npm độc lập | Tránh trước |
| S6 | `.gitignore` do create-next-app sinh có `.env*`, bỏ qua cả `.env.example` | Thêm ngoại lệ `!.env.example` | Đã sửa (T-07) |
| S7 | shadcn 4.23: chạy `init` không chỉ định preset thì dừng ở câu hỏi chọn preset; `-p radix-nova` báo `Invalid preset` | Dùng `init -t next -b radix -p nova -y` | Đã sửa (T-07) |
| S8 | `tsc --noEmit` của web lỗi vì file kiểu trong `.next/` đã cũ | Script `typecheck` đổi thành `next typegen && tsc --noEmit` | Đã sửa (T-07) |
| S9 | Kiểm tra tích hợp web–api thất bại vì chỉ chờ 60 giây, backend trên ổ E khởi động mất khoảng 60 giây | Chờ tối đa 240 giây; chạy lại thì API client nhận đúng `{ status: "ok", db: "up" }` | Đã sửa |
| S10 | Next.js 16.4 bật Cache Components: `next build` lỗi nếu đọc dữ liệu không cache ngoài `<Suspense>` | Ghi hướng dẫn cho M2 trong [apps/README.md](../apps/README.md) | Tránh trước |

S4 và S5 được kiểm tra ngày 10/11; code của nhóm hiện dùng NestJS 11.

Kết quả T-09: seed chạy hai lần không tạo trùng; 34 sản phẩm `ACTIVE`; thiếu hoặc yếu mật khẩu seed thì dừng trước khi ghi dữ liệu. Kết quả T-07: lint, build pass; API client pass 9/9 tình huống với server giả. CI trên GitHub cho `develop` sau khi merge (commit `5c5d939`) pass cả hai job Backend và Frontend.

## 5. Môi trường phát triển (Windows + WSL)

| # | Hiện tượng | Nguyên nhân | Cách xử lý |
|---|-----------|-------------|------------|
| E1 | Lệnh `npm run` trên Windows có nguy cơ hỏng | Tên thư mục `IT4409_Web&Server_Lec` có ký tự `&` (mới tái hiện bằng logic shim của npm, chưa thử bằng npm thật) | Chạy tool trong WSL, hoặc đổi tên thư mục |
| E2 | Git Bash không tìm thấy script khi gọi `wsl` | Git Bash tự đổi đường dẫn `/mnt/...` | Đặt `MSYS_NO_PATHCONV=1` trước lệnh |
| E3 | `docker compose up` từ WSL báo `error getting credentials` | Credential helper của Docker Desktop timeout qua WSL | Kéo image bằng Docker CLI của Windows, thêm thư mục `bin` của Docker Desktop vào `PATH` |
| E4 | npm 11.20 cảnh báo `install-scripts` | npm không chạy install script khi chưa được duyệt | `bcrypt` và Prisma vẫn chạy; duyệt bằng `npm install-scripts approve <pkg>` nếu gói nào cần |
| E5 | `npm install`, Jest, Next.js rất chậm (cài frontend 6 phút) | Project ở ổ E, công cụ chạy trong WSL: mỗi thao tác file đi qua giao thức 9P | Clone repo vào ổ Linux (`~/projects/it4409`), mở bằng extension WSL của VS Code |
| E6 | Mọi lệnh `wsl` báo `Wsl/Service/0x8007274c` | Lần đầu xảy ra khi Jest chạy nhiều worker trên `/mnt/e` (nguyên nhân nhiều khả năng là quá tải) | `wsl --terminate Ubuntu` (tắt mọi tiến trình đang chạy trong Ubuntu); giảm tải bằng `--maxWorkers=2` |

**E5 và E6 chưa giải quyết xong.** Ngày 25/11 đã clone repo vào `~/projects/it4409`, nhưng lỗi E6 lại xuất hiện khi chạy CI của T-10 trên bản clone này. Chưa xác định nguyên nhân của lần sau.

## 6. Còn mở (tính đến 25/11/2026)

| # | Vấn đề | Đề xuất | Người làm gợi ý |
|---|--------|---------|-----------------|
| O1 | Lỗi Prisma chưa được exception filter xử lý, ví dụ trùng unique (`P2002`) trả 500. Riêng đăng ký email đã xử lý trong `AuthService` (T-10) | Ánh xạ `P2002` sang 409, `P2025` sang 404 trong filter, trước khi làm T-11 đến T-13 | M3 |
| O2 | Chuỗi mẫu `JWT_ACCESS_SECRET` trong `.env.example` đủ 32 ký tự nên vẫn được chấp nhận, kể cả production | Từ chối chuỗi mẫu khi `NODE_ENV=production` | M3 |
| O3 | Seed không chạy được trên image production (không có `tsx`), xem doc 09 mục 6.3 | Chốt cách seed production trong T-34 | M1 |
| O4 | CI không có PostgreSQL nên migration và seed không được CI kiểm tra; `docker compose up` không tự chạy migration | Thêm service PostgreSQL vào CI trước T-29; ghi rõ bước migrate | M1 |
| O5 | T-05 chưa đạt: `CODEOWNERS` còn là comment; branch protection chưa bật (kiểm tra ngày 24/11); ba nhánh ngày 25/11 được merge thẳng vào `develop`, không qua PR | Điền username, bật protection, mọi thay đổi đi qua PR | M1 |
| O6 | `README.md` gốc vẫn ghi repo "chỉ là bộ khung" | Cập nhật trạng thái | M1 |
| O7 | `TRUST_PROXY_HOPS` mới kiểm tra bằng test, chưa thử sau Caddy thật; request server-side của Next.js dùng chung một IP | Kiểm tra khi triển khai thử | M1, M2 |
| O8 | `typescript` vẫn nằm trong image production do là optional peer dependency của `@prisma/client` | Chấp nhận, hoặc xem lại ở T-34 | M1 |
| O9 | Bản kiểm tra ở máy trên `develop` đã merge dừng giữa unit test, nên seed chưa được chạy trên code đã merge | Chạy `migrate deploy` và `db seed` trên database trống | M4 |
