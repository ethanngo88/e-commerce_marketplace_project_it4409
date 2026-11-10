# 09 – Deployment Guide

> **Trạng thái:** repo hiện chỉ có tài liệu và cấu trúc thư mục, chưa có code. Mục 1 đã được kiểm tra với phiên bản công cụ tại ngày 10/11/2026. Từ mục 2 trở đi là kế hoạch; tên file và lệnh cụ thể được cập nhật khi các task khởi tạo (T-06, T-07, T-08) và triển khai (T-34) hoàn thành.

## 1. Yêu cầu phần mềm

| Phần mềm | Phiên bản | Ghi chú |
|----------|-----------|---------|
| Node.js | 24.x hoặc 26.x, tối thiểu 24.9 | NestJS 12 kết hợp với Jest không chạy được trên bản thấp hơn. Cả nhóm thống nhất một bản major và ghi vào `.nvmrc` khi khởi tạo |
| npm | Đi kèm Node.js | `apps/api` và `apps/web` là hai project npm độc lập (doc 03 mục 5) |
| Docker Desktop | Bản mới nhất | Trên Windows cần bật WSL 2 |
| Git | ≥ 2.40 | |
| VS Code | – | Extension đề xuất: Oxc, ESLint, Prettier, Prisma, Tailwind CSS IntelliSense |

Ai cần cài gì:

- **Node.js:** mọi thành viên viết và chạy code.
- **Docker:** dùng để chạy PostgreSQL và Redis khi lập trình, và để chạy toàn bộ hệ thống. Máy không chạy được Docker có thể dùng một database PostgreSQL trên cloud (ví dụ Neon) và đặt `DATABASE_URL` tương ứng.

Cài trên Windows bằng winget (chạy trong PowerShell), sau đó mở lại terminal:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
```

Sau khi cài, khởi động Docker Desktop một lần và chờ đến khi nó báo đang chạy. Trên macOS và Linux, cài Node.js LTS và Docker từ trang chủ hoặc trình quản lý gói. Kiểm tra:

```bash
node -v
npm -v
docker --version
docker compose version
```

**Vị trí thư mục dự án.** Đường dẫn chỉ nên gồm chữ không dấu, số, `-` và `_`. Trên Windows, ký tự `&` trong đường dẫn (ví dụ `...\Web&Server\...`) làm hỏng các lệnh `npm run` và bước cài những thư viện có script, vì `cmd.exe` coi `&` là dấu nối hai lệnh.

## 2. Các thành phần triển khai

```mermaid
flowchart LR
    U["Người dùng"] -->|HTTPS| RP["Reverse proxy<br/>(Caddy)"]
    RP -->|"/"| WEB["web<br/>Next.js :3000"]
    RP -->|"/api"| API["api<br/>NestJS :4000"]
    API --> PG[("postgres :5432")]
    API --> RD[("redis :6379")]
    API --> CL["Cloudinary"]
    API <--> VN["VNPay Sandbox"]
```

| Service | Image | Cổng | Volume |
|---------|-------|------|--------|
| `postgres` | `postgres:16-alpine` | 5432 | `pgdata` |
| `redis` | `redis:7-alpine` | 6379 | – |
| `api` | Build từ `apps/api/Dockerfile` | 4000 | – |
| `web` | Build từ `apps/web/Dockerfile` | 3000 | – |
| `caddy` (chỉ production) | `caddy:2-alpine` | 80, 443 | `caddy_data` |

## 3. Biến môi trường

Mỗi ứng dụng có file mẫu riêng liệt kê đủ tên biến với giá trị giả. Mỗi người sao chép file mẫu rồi điền giá trị. **Không commit file `.env` thật.**

| Ứng dụng | File mẫu | Sao chép thành |
|----------|----------|----------------|
| Backend | `apps/api/.env.example` | `apps/api/.env` |
| Frontend | `apps/web/.env.example` | `apps/web/.env.local` |

| Biến | Dùng bởi | Mô tả | Ví dụ (giá trị giả) |
|------|----------|-------|---------------------|
| `NODE_ENV` | api | Môi trường | `development` |
| `DATABASE_URL` | api | Chuỗi kết nối PostgreSQL | `postgresql://postgres:postgres@localhost:5432/marketplace_dev` |
| `REDIS_URL` | api | Chuỗi kết nối Redis | `redis://localhost:6379` |
| `API_PORT` | api | Cổng backend | `4000` |
| `CORS_ORIGIN` | api | Origin frontend được phép | `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | api | Khóa ký access token | chuỗi ngẫu nhiên ≥ 32 ký tự |
| `JWT_ACCESS_EXPIRES_IN` | api | Thời hạn access token | `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | api | Thời hạn refresh token | `7` |
| `BCRYPT_ROUNDS` | api | Cost của bcrypt | `10` |
| `CLOUDINARY_CLOUD_NAME` | api | Tài khoản Cloudinary | – |
| `CLOUDINARY_API_KEY` | api | | – |
| `CLOUDINARY_API_SECRET` | api | | – |
| `VNPAY_TMN_CODE` | api | Mã website do VNPay sandbox cấp | – |
| `VNPAY_HASH_SECRET` | api | Khóa ký của VNPay | – |
| `VNPAY_PAYMENT_URL` | api | URL cổng thanh toán | `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` |
| `VNPAY_RETURN_URL` | api | Trang kết quả ở frontend | `http://localhost:3000/checkout/result` |
| `PAYMENT_EXPIRES_MINUTES` | api | Hạn thanh toán online | `15` |
| `SHIPPING_FEE_PER_SELLER_ORDER` | api | Phí vận chuyển cố định (VND) | `30000` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | api (seed) | Tài khoản Admin ban đầu | – |
| `NEXT_PUBLIC_API_URL` | web | URL backend mà trình duyệt gọi | `http://localhost:4000/api` |

Tạo chuỗi ngẫu nhiên cho JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Backend kiểm tra biến môi trường khi khởi động (validation trong `ConfigModule`) và dừng ngay nếu thiếu biến bắt buộc. Biến có tiền tố `NEXT_PUBLIC_` được nhúng vào mã phía trình duyệt, nên không đặt secret vào đó.

## 4. Chạy ở môi trường development

Việc khởi tạo hai ứng dụng được hướng dẫn ở [apps/README.md](../apps/README.md). Phần dưới đây là quy trình sau khi khởi tạo xong.

Cách làm việc hằng ngày: chạy PostgreSQL và Redis bằng Docker, chạy `api` và `web` trực tiếp bằng Node.js để có hot reload.

```bash
# 1. Lấy code
git clone <repo-url>
cd <thư-mục-repo>
git checkout develop

# 2. Khởi động PostgreSQL và Redis
docker compose up -d postgres redis

# 3. Backend (terminal 1)
cd apps/api
cp .env.example .env          # rồi điền giá trị
npm install
npx prisma migrate dev        # tạo bảng theo các migration có sẵn
npx prisma db seed            # tạo dữ liệu mẫu
npm run start:dev             # http://localhost:4000/api

# 4. Frontend (terminal 2)
cd apps/web
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Kiểm tra:

| Địa chỉ | Kỳ vọng |
|---------|---------|
| `http://localhost:4000/api/health` | `{ "success": true, "data": { "status": "ok", "db": "up" } }` |
| `http://localhost:4000/api/docs` | Trang Swagger |
| `http://localhost:3000` | Trang chủ có sản phẩm mẫu |

Chạy toàn bộ bằng Docker (dùng để kiểm tra tích hợp và E2E):

```bash
docker compose up --build
```

**Thử thanh toán VNPay ở local.** IPN là lời gọi từ máy chủ VNPay tới backend nên `localhost` không nhận được. Có hai cách: dùng công cụ tunnel (ví dụ ngrok hoặc Cloudflare Tunnel) để có URL công khai tạm thời và khai báo URL đó làm IPN URL trong trang quản trị VNPay sandbox; hoặc kiểm thử luồng IPN bằng integration test và chỉ thử VNPay thật trên môi trường đã triển khai.

## 5. Làm việc với database

Các lệnh chạy trong thư mục `apps/api`.

| Việc cần làm | Lệnh |
|--------------|------|
| Tạo migration sau khi sửa `schema.prisma` | `npx prisma migrate dev --name <ten_mo_ta>` |
| Áp dụng migration mới sau khi pull code | `npx prisma migrate dev` |
| Sinh lại Prisma Client | `npx prisma generate` |
| Xem dữ liệu bằng giao diện | `npx prisma studio` |
| Xóa và tạo lại database development | `npx prisma migrate reset` |
| Áp dụng migration ở production | `npx prisma migrate deploy` |

- Dùng **Prisma 7** và giữ `prisma`, `@prisma/client` ở cùng một phiên bản. Không chạy `npm install prisma@latest`: thẻ `latest` trên npm hiện trỏ tới bản thử nghiệm Prisma 8, có bộ lệnh khác.
- Luôn gọi Prisma qua `npx` để dùng đúng bản đã cài trong project.
- Từ Prisma 7, `migrate dev` không tự chạy `generate`. Sau khi đổi schema phải chạy `npx prisma generate`.
- Không dùng `prisma db push` trên nhánh chung vì lệnh này không tạo file migration.
- Không chạy `migrate dev` hay `migrate reset` trên database production.
- Không sửa file migration đã merge; muốn thay đổi thì tạo migration mới.

## 6. Triển khai production

### 6.1 Lựa chọn hạ tầng

| Phương án | Ưu điểm | Nhược điểm |
|-----------|---------|------------|
| **A. Một VPS chạy Docker Compose** (đề xuất) | Giống hệt môi trường local; học được quy trình triển khai thực tế; có IP công khai cho IPN | Cần thuê VPS (khoảng 2 vCPU, 2–4GB RAM); tự quản lý |
| **B. Dịch vụ managed miễn phí** (frontend trên Vercel, backend trên Render hoặc Railway, PostgreSQL trên Neon hoặc Supabase, Redis trên Upstash) | Không tốn phí, không quản lý server | Gói miễn phí hay ngủ khi không dùng nên demo có thể chậm; cấu hình phân tán ở nhiều nơi; frontend và backend khác domain nên cookie refresh phải đặt `SameSite=None; Secure` |

Đề xuất phương án A nếu nhóm có VPS hoặc tín dụng sinh viên; nếu không thì dùng phương án B. Các bước dưới đây theo phương án A.

### 6.2 Cấu hình khác biệt so với development

| Hạng mục | Development | Production |
|----------|-------------|------------|
| `NODE_ENV` | `development` | `production` |
| Secret | Giá trị tạm | Chuỗi ngẫu nhiên mạnh, khác hoàn toàn development |
| Mật khẩu PostgreSQL | `postgres` | Mật khẩu mạnh; không mở cổng 5432 ra Internet |
| Cookie refresh token | `secure=false` | `secure=true` |
| `CORS_ORIGIN` | `http://localhost:3000` | Domain thật |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | `https://<domain>/api`; phải đặt trước khi build frontend |
| Swagger | Bật | Tắt hoặc đặt sau xác thực |
| Log | Dễ đọc | JSON |
| HTTPS | Không | Bắt buộc, Caddy tự cấp chứng chỉ |
| Dữ liệu seed | Đầy đủ dữ liệu mẫu | Chỉ roles, tài khoản Admin, danh mục |

### 6.3 Các bước triển khai lần đầu

```bash
# Trên VPS (Ubuntu), đã cài Docker và trỏ domain về IP của VPS

# 1. Lấy code từ nhánh main
git clone <repo-url> marketplace && cd marketplace
git checkout main

# 2. Tạo file .env production (không nằm trong repo)
nano .env

# 3. Build và khởi động
docker compose -f docker-compose.prod.yml up -d --build

# 4. Áp dụng migration
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 5. Seed dữ liệu tối thiểu (chỉ lần đầu)
docker compose -f docker-compose.prod.yml exec api npx prisma db seed

# 6. Kiểm tra
curl https://<domain>/api/health
```

Sau đó khai báo IPN URL `https://<domain>/api/payments/vnpay/ipn` trong trang quản trị VNPay sandbox.

### 6.4 Cập nhật phiên bản

```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Sao lưu database trước mỗi lần có migration (mục 7.2).

### 6.5 Quay lại phiên bản trước

```bash
git checkout <tag-phiên-bản-trước>
docker compose -f docker-compose.prod.yml up -d --build
```

Prisma không tự đảo ngược migration. Nếu phiên bản mới đã thay đổi schema theo cách không tương thích với code cũ, cần khôi phục database từ bản sao lưu.

## 7. Vận hành

### 7.1 Giám sát

| Hạng mục | Cách làm |
|----------|----------|
| Health check | `GET /api/health`; khai báo `healthcheck` trong Docker Compose để container tự khởi động lại |
| Kiểm tra từ bên ngoài | Dịch vụ uptime miễn phí (ví dụ UptimeRobot) gọi health check mỗi 5 phút |
| Log | `docker compose logs -f api`; log dạng JSON có request id, đường dẫn, mã trạng thái, thời gian xử lý |
| Lỗi | Mọi lỗi 500 được log kèm stack trace ở server, không trả về client |
| Tài nguyên | `docker stats` |

### 7.2 Sao lưu và khôi phục

```bash
# Sao lưu
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U <user> <db> | gzip > backup_$(date +%F).sql.gz

# Khôi phục
gunzip -c backup_2026-12-20.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U <user> <db>
```

Đặt cron sao lưu hằng ngày và giữ 7 bản gần nhất. Ảnh sản phẩm nằm ở Cloudinary nên không cần sao lưu riêng.

## 8. Checklist trước khi phát hành

- [ ] PR `develop` → `main` đã được merge; CI pass, bao gồm E2E.
- [ ] Đã gắn tag phiên bản.
- [ ] `.env` production đủ biến; secret khác với development.
- [ ] Cổng PostgreSQL và Redis không mở ra Internet.
- [ ] HTTPS hoạt động; HTTP tự chuyển hướng sang HTTPS.
- [ ] `prisma migrate deploy` chạy thành công.
- [ ] Tài khoản Admin đăng nhập được và đã đổi mật khẩu seed.
- [ ] Upload ảnh lên Cloudinary hoạt động.
- [ ] Thanh toán VNPay sandbox thành công; IPN cập nhật được trạng thái đơn.
- [ ] Kịch bản nghiệm thu MVP (doc 02 mục 5) chạy trọn vẹn trên production.
- [ ] Đã có bản sao lưu database và đã thử khôi phục.
- [ ] Tài liệu trong `docs/` khớp với phiên bản đang chạy.

## 9. Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|------------|------------------------|------------|
| `P1001: Can't reach database server` | Container PostgreSQL chưa chạy hoặc `DATABASE_URL` sai | `docker compose ps`; trong Docker dùng host `postgres`, ngoài Docker dùng `localhost` |
| Lỗi kiểu dữ liệu Prisma sau khi pull | Chưa sinh lại client hoặc chưa chạy migration | `npx prisma migrate dev`, rồi `npx prisma generate` |
| Lệnh `prisma` báo không có `migrate` hay `generate` | Đã cài nhầm Prisma 8 qua `npm install prisma@latest` | Trả `prisma` và `@prisma/client` trong `package.json` về bản 7, chạy lại `npm install` |
| Jest báo `ERR_REQUIRE_ASYNC_MODULE` | Node.js thấp hơn 24.9 | Nâng Node.js lên 24.x mới nhất hoặc 26.x |
| create-next-app báo `The directory web contains files that could conflict` | Thư mục `apps/web` đã có các thư mục giữ chỗ | Xóa tạm `apps/web`, khởi tạo, rồi `git restore web` ([apps/README.md](../apps/README.md)) |
| `prisma init` báo `A folder called prisma already exists` | Thư mục `apps/api/prisma` đã có sẵn | Xóa tạm `prisma/`, khởi tạo, rồi `git restore prisma` ([apps/README.md](../apps/README.md)) |
| `git status` coi `apps/api` hoặc `apps/web` là một mục duy nhất, không thấy file bên trong | Công cụ khởi tạo đã tạo repo git lồng nhau | Xóa thư mục `.git` bên trong ứng dụng; lần sau dùng `--skip-git` hoặc `--disable-git` |
| Cổng 5432, 3000 hoặc 4000 đã bị dùng | Có chương trình khác chiếm cổng | Dừng chương trình đó hoặc đổi cổng trong file `.env` của ứng dụng |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` không khớp URL frontend | Sửa `apps/api/.env`, khởi động lại backend |
| Đăng nhập xong, tải lại trang bị đăng xuất | Cookie refresh không được gửi | Kiểm tra `credentials: 'include'` ở frontend, `credentials: true` ở CORS, và thuộc tính `secure`/`sameSite` của cookie |
| VNPay báo sai chữ ký | Sai `VNPAY_HASH_SECRET` hoặc sắp xếp tham số không đúng | Đối chiếu secret; sắp xếp tham số theo bảng chữ cái trước khi ký |
| IPN không được gọi | URL IPN không truy cập được từ Internet | Dùng tunnel ở local; kiểm tra cấu hình trên trang VNPay sandbox |
| Hot reload không hoạt động trên Windows | Mã nguồn nằm trên ổ Windows nhưng chạy trong container Linux | Chạy `api` và `web` trực tiếp bằng Node.js (mục 4), chỉ dùng Docker cho database |
| `npm run` trên Windows báo `'...\node_modules\.bin\' is not recognized as an internal or external command` | Đường dẫn thư mục dự án chứa ký tự `&` | Đổi tên thư mục hoặc chuyển dự án sang đường dẫn không có ký tự đặc biệt (mục 1) |
