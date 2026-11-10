# 01 – Project Overview

- **Dự án:** E-commerce Marketplace Platform (lấy cảm hứng từ Amazon)
- **Học phần:** IT4409 – Công nghệ Web và dịch vụ trực tuyến
- **Nhóm:** 4 thành viên · **Thời lượng:** 8 tuần (09/11/2026 – 03/01/2027)
- **Trạng thái tài liệu:** v1.1 – phạm vi và thiết kế đã được xác nhận; dự án đang ở Phase 3 (khởi tạo)

## 1. Mục tiêu dự án

Xây dựng một sàn thương mại điện tử nhiều người bán (multi-vendor marketplace), nơi:

- **Guest** xem và tìm kiếm sản phẩm không cần đăng nhập.
- **Customer** mua hàng: giỏ hàng → đặt hàng → thanh toán → theo dõi đơn → đánh giá.
- **Seller** mở cửa hàng, đăng bán, quản lý tồn kho, xử lý đơn, xem doanh thu.
- **Admin** duyệt người bán, kiểm duyệt sản phẩm, quản lý danh mục, tài khoản, đơn hàng và xem thống kê.

Điểm khác biệt nghiệp vụ quan trọng nhất so với một web bán hàng thông thường: **một lần checkout có thể chứa sản phẩm của nhiều Seller**. Toàn bộ thiết kế database và order flow xoay quanh yêu cầu này (xem [04_Database_Design.md](04_Database_Design.md), mục 4).

## 2. Phân tích tổng thể

### 2.1 Các luồng nghiệp vụ cốt lõi

| # | Luồng | Tác nhân | Module liên quan |
|---|-------|----------|------------------|
| 1 | Đăng ký / đăng nhập / phân quyền | Tất cả | Auth, User |
| 2 | Đăng ký bán hàng → Admin duyệt → mở Store | Customer, Admin | Seller, Notification |
| 3 | Đăng sản phẩm (variant, ảnh, tồn kho) | Seller | Product, Category, Inventory |
| 4 | Duyệt / tìm kiếm / lọc sản phẩm | Guest, Customer | Search, Product |
| 5 | Giỏ hàng → Checkout → tách đơn theo Seller | Customer | Cart, Order, Inventory |
| 6 | Thanh toán (COD / cổng online) | Customer | Payment, Order |
| 7 | Seller xử lý đơn: xác nhận → giao → hoàn tất | Seller, Customer | Order, Notification |
| 8 | Đánh giá sản phẩm đã mua | Customer | Review |
| 9 | Quản trị và thống kê | Admin | Admin Dashboard |

### 2.2 Rủi ro chính và cách xử lý

| Rủi ro | Ảnh hưởng | Cách xử lý trong thiết kế |
|--------|-----------|---------------------------|
| Bán quá số lượng tồn kho (overselling) khi nhiều người đặt cùng lúc | Sai dữ liệu, mất uy tín | Trừ kho bằng câu lệnh `UPDATE ... WHERE quantity >= :qty` trong cùng transaction tạo đơn |
| Đơn hàng nhiều Seller | Seller A không được thấy/sửa đơn của Seller B | Tách `orders` (phía khách) và `seller_orders` (phía người bán) |
| Giá sản phẩm thay đổi sau khi đặt | Đơn cũ hiển thị sai giá | Snapshot tên, giá, ảnh vào `order_items` |
| Callback thanh toán bị gọi lặp hoặc giả mạo | Đơn bị đánh dấu đã trả tiền sai | Kiểm tra chữ ký (checksum), xử lý idempotent theo `provider_txn_id` |
| Trình độ nhóm không đồng đều | Trễ tiến độ, code khó tích hợp | Modular Monolith, API contract chốt trước, mỗi người sở hữu module riêng |
| 13 module trong 8 tuần, thời gian dự phòng rất ít | Trễ một task P0 kéo trễ cả chuỗi phía sau | Chia MVP / mở rộng rõ ràng (mục 3); kiểm tra tiến độ tại từng mốc (mục 6.4); thứ tự cắt giảm định sẵn (mục 6.6) |
| Khối lượng giao diện dồn vào một người | Seller Center xong muộn, ảnh hưởng kiểm thử | Admin và Seller Center dùng chung khung dashboard; phương án điều phối lại ở mục 6.6 |

## 3. Phạm vi MVP và tính năng mở rộng

Nguyên tắc: MVP phải chạy được **trọn vẹn một vòng mua bán** với cả 3 vai trò. Mọi thứ không nằm trên vòng đó được đẩy sang phần mở rộng.

| Module | MVP (bắt buộc) | Mở rộng (làm nếu còn thời gian) |
|--------|----------------|----------------------------------|
| Authentication | Register, login, logout, refresh token, RBAC | Quên mật khẩu qua email, xác thực email, OAuth Google |
| User Management | Hồ sơ cá nhân, đổi mật khẩu, sổ địa chỉ; Admin khóa/mở tài khoản | Upload avatar, lịch sử đăng nhập |
| Seller Management | Đăng ký bán hàng, Admin duyệt/từ chối, sửa thông tin Store | Trang Store công khai đẹp hơn, hoa hồng sàn |
| Product Management | CRUD sản phẩm, variant, upload ảnh, trạng thái DRAFT/ACTIVE/HIDDEN | Import CSV, sản phẩm nổi bật |
| Category Management | Cây danh mục 2 cấp, Admin CRUD | Thuộc tính riêng theo danh mục |
| Search & Filtering | Tìm theo tên, lọc danh mục / khoảng giá / rating, sắp xếp, phân trang | Gợi ý từ khóa (autocomplete), full-text nâng cao |
| Shopping Cart | Thêm/sửa/xóa item, kiểm tra tồn kho, nhóm theo Store | Giỏ hàng cho Guest (localStorage) rồi merge khi login |
| Inventory | Tồn kho theo variant, trừ/hoàn kho theo đơn, Seller cập nhật | Cảnh báo sắp hết hàng, lịch sử biến động kho |
| Order Management | Checkout, tách đơn theo Seller, luồng trạng thái, hủy đơn | Tự động hoàn tất sau N ngày, trả hàng/hoàn tiền |
| Payment | COD và VNPay sandbox | Hoàn tiền tự động, thêm cổng MoMo/Stripe |
| Review & Rating | Đánh giá 1–5 sao + bình luận cho sản phẩm đã nhận | Ảnh trong review, Seller phản hồi |
| Admin Dashboard | Quản lý user/seller/product/category/order, thống kê tổng quan | Export báo cáo |
| Notification | Thông báo in-app (lưu DB, polling) | Email, realtime bằng WebSocket |

**Không thuộc phạm vi dự án:** vận chuyển thật (tích hợp hãng ship), voucher/khuyến mãi, chat người mua – người bán, đa ngôn ngữ, ứng dụng mobile, microservices.

## 4. Technology Stack (đã thống nhất, không thay đổi)

| Tầng | Công nghệ |
|------|-----------|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, Node.js, TypeScript, RESTful API |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT (access + refresh), bcrypt, RBAC |
| Khác | Redis (cache, khi cần), Cloudinary (ảnh), Docker + Docker Compose |
| Testing | Jest (backend), Playwright (E2E) |
| Teamwork | Git, GitHub (Issues, Pull Requests, Actions) |

Kiến trúc: **Modular Monolith** – chi tiết ở [03_System_Architecture.md](03_System_Architecture.md).

## 5. Tổ chức nhóm

| Thành viên | Vai trò | Module sở hữu (owner) |
|------------|---------|------------------------|
| **M1** | Team Leader / System Architect | Kiến trúc, Prisma schema, API contract, CI, tích hợp; Notification, Admin Dashboard (API thống kê + giao diện Admin) |
| **M2** | Frontend Developer | Giao diện Customer: trang chủ, listing, chi tiết, search, cart, checkout, đơn hàng; giao diện Seller Center |
| **M3** | Backend Developer (Core) | Auth, User, Seller, Product, Category, Search |
| **M4** | Backend Developer (Commerce & QA) | Cart, Inventory, Order, Payment, Review; integration test, E2E test |

Giao diện Seller Center và Admin không có trong phân công ban đầu. Nhóm đã thống nhất: M2 làm Customer và Seller Center, M1 làm Admin.

Quy tắc sở hữu: mỗi module có đúng một owner. Người khác muốn sửa phải tạo Issue hoặc trao đổi với owner trước. File dùng chung (`schema.prisma`, `app.module.ts`, cấu hình) chỉ M1 merge.

## 6. Development Roadmap

Thời gian còn lại là **8 tuần**, tính từ tuần 09/11/2026; mốc hoàn thành là **03/01/2027**. Nếu hạn nộp chính thức khác, dịch các mốc bên dưới theo số ngày tương ứng.

### 6.1 Lịch theo phase

| Phase | Tuần | Thời gian | Nội dung | Kết quả đầu ra |
|-------|------|-----------|----------|----------------|
| 1 – Requirement Analysis | 1 | 09/11 – 15/11 | Cả nhóm đọc, phản biện và chốt docs 01, 02, 06 (đã có bản thảo đầy đủ) | 4 thành viên xác nhận |
| 2 – System Design | 1 | 09/11 – 15/11 | Chốt docs 03, 04, 05, 07; wireframe các màn Customer chính | ERD và API contract được duyệt |
| 3 – Project Initialization | 1 | 09/11 – 15/11 | Cài công cụ, tạo repo GitHub, khởi tạo monorepo (NestJS, Next.js, Prisma), Docker Compose, CI, seed data | Mốc M-A |
| 4 – Core Development (đợt 1) | 2–3 | 16/11 – 29/11 | Backend: Auth, Category, sản phẩm công khai và Search, User, Inventory, Cart, bắt đầu Order, Notification. Frontend: layout, đăng nhập, trang chủ, listing, chi tiết, bắt đầu giỏ hàng | Mốc M-B |
| 4 – Core Development (đợt 2) | 4–5 | 30/11 – 13/12 | Backend: Seller, quản lý sản phẩm, Order, Payment, Review, Admin. Frontend: checkout, tài khoản, đơn hàng, review, Admin, bắt đầu Seller Center | Mốc M-C |
| 5 – Integration & Testing | 6–7 | 14/12 – 27/12 | Hoàn tất Seller Center; integration test, E2E test, kiểm tra bảo mật, sửa lỗi; triển khai thử ngay từ tuần 6 | Test pass; bản chạy thử online |
| 6 – Deployment | 8 | 28/12 – 03/01 | Phát hành chính thức, hoàn thiện tài liệu, demo | Mốc M-D |

### 6.2 Nguyên tắc lập lịch

Tám tuần chỉ đủ khi năm điều sau được giữ:

1. **Phase 1–3 gói trong tuần 1.** Tài liệu phân tích và thiết kế đã có bản thảo đầy đủ, nên nhóm đọc, phản biện và chốt chứ không viết từ đầu. Bốn tuần phát triển và hai tuần kiểm thử được giữ nguyên.
2. **Backend làm API đọc công khai trước, API ghi của Seller sau.** Seller, store, khách hàng và sản phẩm mẫu có sẵn từ seed data (T-09), nên Frontend, Cart và Order không phải chờ module Seller và phần quản lý sản phẩm.
3. **Frontend không chờ API.** Khi endpoint chưa xong, giao diện được dựng theo doc 05 với dữ liệu giả, rồi nối API thật khi có.
4. **Test viết cùng PR với chức năng**, không dồn về tuần 6–7. Hai tuần đó dành cho integration test, E2E và sửa lỗi.
5. **Triển khai thử từ tuần 6**, không đợi tuần 8. VNPay chỉ gọi IPN được tới địa chỉ công khai, nên cần môi trường online để kiểm thử thanh toán; lỗi triển khai cũng lộ ra khi còn hai tuần để sửa.

Sau mốc M-C không thêm chức năng mới, trừ phần Seller Center đã lên lịch ở tuần 6.

### 6.3 Lịch theo tuần của từng thành viên

| Tuần | Thời gian | M1 | M2 | M3 | M4 |
|------|-----------|----|----|----|----|
| 1 | 09/11 – 15/11 | T-01, T-03, T-05, T-02; bắt đầu T-08 | T-07, T-04 | T-06; bắt đầu T-10 | T-09; bắt đầu T-16 |
| 2 | 16/11 – 22/11 | T-08, T-21 | T-23; bắt đầu T-24 | T-10, T-13; bắt đầu T-15 | T-16, T-17 |
| 3 | 23/11 – 29/11 | T-22 (người dùng, thống kê); T-28 (khung dashboard dùng chung) | T-24; bắt đầu T-25 | T-15, T-11; bắt đầu T-12 | T-18 |
| 4 | 30/11 – 06/12 | T-22 (người bán); T-28 | T-25; bắt đầu T-26 | T-12; bắt đầu T-14 | T-18, T-19 |
| 5 | 07/12 – 13/12 | T-22 (sản phẩm, đơn hàng, thanh toán); T-28 | T-26; bắt đầu T-27 | T-14 | T-20; bắt đầu T-29 |
| 6 | 14/12 – 20/12 | T-34 (triển khai thử); T-32 | T-27; T-33 | T-30, T-32; T-33 | T-29; T-31 (E2E-01, 02, 05) |
| 7 | 21/12 – 27/12 | T-33; chuẩn bị phát hành | T-33 | T-33 | T-31 (E2E-03, 04); T-33 |
| 8 | 28/12 – 03/01 | T-34 (phát hành); T-35 | T-35 | T-35 | T-35 |

M1 review Pull Request xuyên suốt, khoảng một ngày công mỗi tuần.

Việc phụ thuộc bên ngoài cần làm sớm:

- Đăng ký tài khoản VNPay sandbox: M4, trong tuần 1.
- Tạo tài khoản Cloudinary: M3, trước tuần 4.
- Chuẩn bị nơi triển khai (VPS hoặc dịch vụ managed, xem doc 09 mục 6.1): M1, trước tuần 6.

### 6.4 Mốc kiểm tra

| Mốc | Ngày | Điều kiện đạt |
|-----|------|---------------|
| **M-A** | 15/11 | Docs đã chốt. Mọi thành viên clone repo, chạy được `docker compose up`, `GET /api/health` trả 200, database có seed data |
| **M-B** | 29/11 | Trên giao diện thật: đăng ký, đăng nhập, tìm kiếm, lọc, xem chi tiết sản phẩm. Cart API chạy được qua Swagger |
| **M-C** | 13/12 | Một vòng mua hàng đầy đủ bằng COD trên giao diện; thanh toán VNPay chạy được qua tunnel; API của Seller hoàn chỉnh; Admin duyệt được seller. Ngừng thêm chức năng |
| **M-D** | 30/12 | Bản phát hành trên `main` đã triển khai. Từ đó đến 03/01 chỉ hoàn thiện tài liệu và chuẩn bị demo |

Tại mỗi mốc, cả nhóm demo nội bộ 30 phút. Nếu còn task P0 hoặc P1 của mốc đó chưa xong, M1 áp dụng mục 6.6 ngay trong buổi họp.

### 6.5 Khối lượng công việc

Mỗi người có khoảng 5 ngày công mỗi tuần, tức 40 ngày công trong 8 tuần.

| Thành viên | Task được giao | Sửa lỗi (T-33) | Việc khác | Tổng / 40 | Nhận xét |
|------------|----------------|-----------------|-----------|-----------|----------|
| M1 | 25 | 5 | Review PR, khoảng 8 | 38 | Tuần 1 dồn nhiều việc nhất |
| M2 | 29 | 5 | – | 34 | **Đường găng:** tuần 1–6 đã dùng 28/30 ngày công; dự phòng chỉ nằm ở tuần 7–8 |
| M3 | 28 | 5 | – | 33 | Dư khoảng 3 ngày công ở tuần 5 |
| M4 | 30 | 5 | – | 35 | Kín lịch đến hết tuần 6 |

Dự phòng toàn nhóm khoảng 12% và phần lớn nằm ở hai tuần cuối. Kế hoạch này không chịu được việc trễ một tuần ở Phase 4 nếu không cắt giảm.

### 6.6 Thứ tự cắt giảm khi trễ

Không cắt: vòng mua bán đầy đủ, tách đơn theo Seller, an toàn tồn kho, phân quyền.

Khi trễ ở một mốc, cắt lần lượt từ trên xuống cho đến khi kịp lịch:

1. Bỏ Redis cache (cây danh mục, thống kê). Hệ thống vẫn chạy đúng khi không cache.
2. Thống kê chỉ giữ số tổng quan: bỏ doanh thu theo ngày, sản phẩm bán chạy, store doanh thu cao và biểu đồ.
3. Bỏ giao diện kiểm duyệt review và xác nhận hoàn tiền của Admin; giữ API.
4. Thông báo chỉ giữ sự kiện đổi trạng thái đơn hàng.
5. E2E giảm còn 3 kịch bản: E2E-01, E2E-02, E2E-04.
6. Nếu cuối tuần 5 chưa nhận được IPN thành công từ VNPay: thay bằng cổng thanh toán giả lập qua cùng interface `PaymentProvider`, giữ nguyên Order và giao diện checkout.

Điều phối lại nhân lực, áp dụng song song với danh sách trên: nếu tại M-C mà T-27 (Seller Center) chưa bắt đầu, M1 giao trang đơn hàng và trang doanh thu của Seller Center cho thành viên còn dư thời gian (theo bảng 6.5 là M3), M2 giữ phần đăng ký seller, sản phẩm và tồn kho.

## 7. Bảng phân công chi tiết

Ký hiệu: Priority **P0** = chặn việc khác, **P1** = thuộc MVP, **P2** = mở rộng. Thời gian tính theo ngày công (1 ngày ≈ 3–4 giờ làm việc thực tế của sinh viên).

### 7.1 Phase 1–3: Phân tích, thiết kế, khởi tạo (tuần 1)

| Task ID | Task Name | Description | Member | Priority | Dependencies | Est. | Deliverables | Acceptance Criteria |
|---------|-----------|-------------|--------|----------|--------------|------|--------------|---------------------|
| T-01 | Chốt yêu cầu và MVP | Cả nhóm đọc, phản biện và chốt docs 01, 02, 06 | M1 (cả nhóm) | P0 | – | 1d | Docs đã duyệt | 4 thành viên xác nhận trên Issue |
| T-02 | Prisma schema | Chuyển ERD ở doc 04 thành `schema.prisma`; migration đầu tiên kèm SQL cho check constraint, partial index và index tìm kiếm | M1 | P0 | T-01, T-06 | 2d | `schema.prisma`, migration | `prisma migrate dev` chạy sạch trên database trống; đủ 20 bảng |
| T-03 | Chốt API contract | Rà soát doc 05 với M2, M3, M4 | M1 | P0 | T-01 | 1d | Doc 05 đã duyệt | FE và BE đồng ý từng endpoint |
| T-04 | Wireframe | Wireframe các màn Customer chính. Seller Center và Admin dùng chung bố cục bảng và biểu mẫu nên không vẽ riêng | M2 | P1 | T-01 | 2d | File Figma hoặc ảnh | Đủ các màn: trang chủ, listing, chi tiết, giỏ hàng, checkout, đơn hàng |
| T-05 | Khởi tạo repo và Git workflow | Tạo repo GitHub, hai nhánh chính, branch protection, CODEOWNERS, bảng Project (doc 07 mục 12) | M1 | P0 | – | 1d | Repo GitHub | Không push thẳng được vào `main`, `develop`; cả nhóm truy cập được |
| T-06 | Khởi tạo backend | NestJS, Prisma, config, validation pipe, exception filter, Swagger; Docker Compose tối thiểu cho PostgreSQL và Redis | M3 | P0 | T-05 | 2d | `apps/api` | `GET /api/health` trả 200; format response/error đúng doc 05 |
| T-07 | Khởi tạo frontend | Next.js, Tailwind, shadcn/ui, layout, API client | M2 | P0 | T-05 | 2d | `apps/web` | Trang chủ khung chạy được; gọi được `/api/health` |
| T-08 | Docker và CI | Dockerfile cho api và web, bổ sung vào Docker Compose; GitHub Actions chạy lint, test, build | M1 | P0 | T-06, T-07 | 2d | `docker-compose.yml`, workflow CI | `docker compose up` chạy toàn bộ; CI chạy trên mỗi PR |
| T-09 | Seed data | Script seed: roles, admin, cây danh mục, 2 seller đã duyệt kèm store, 1 customer có địa chỉ, sản phẩm mẫu có variant, tồn kho, ảnh | M4 | P0 | T-02 | 2d | `prisma/seed.ts` | Chạy lại nhiều lần không lỗi; có đủ tài khoản test ở doc 08 mục 5; ít nhất 30 sản phẩm ACTIVE |

### 7.2 Phase 4: Core Development (tuần 2–5, riêng T-27 kết thúc ở tuần 6)

| Task ID | Task Name | Description | Member | Priority | Dependencies | Est. | Deliverables | Acceptance Criteria |
|---------|-----------|-------------|--------|----------|--------------|------|--------------|---------------------|
| T-10 | Auth API | Register, login, logout, refresh. `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()` được merge trước để module khác dùng | M3 | P0 | T-06 | 4d | `auth` module + unit test | Đúng doc 05 mục 3; refresh token xoay vòng; test pass |
| T-11 | User API | Profile, đổi mật khẩu, CRUD địa chỉ | M3 | P0 | T-10 | 2d | `users` module | User chỉ sửa được dữ liệu của mình |
| T-12 | Seller API | Đăng ký seller, duyệt, quản lý store | M3 | P1 | T-10 | 3d | `sellers` module | Seller PENDING không đăng được sản phẩm |
| T-13 | Category API | Cây danh mục, Admin CRUD | M3 | P0 | T-10 | 2d | `categories` module | Không xóa được danh mục đang có sản phẩm |
| T-14 | Product API cho Seller | CRUD sản phẩm, variant, ảnh (Cloudinary) | M3 | P0 | T-12, T-13, T-15 | 5d | Phần ghi của `products` module | Seller chỉ sửa sản phẩm của store mình; có unit test |
| T-15 | Product công khai và Search API | `GET /api/products` (tìm kiếm, lọc, sắp xếp, phân trang) và `GET /api/products/:slug`, chạy trên seed data | M3 | P0 | T-09, T-13 | 3d | Phần đọc của `products` module | Đủ filter trong doc 05; p95 < 500ms với 10k sản phẩm seed |
| T-16 | Inventory API | Tồn kho theo variant, hàm trừ/hoàn kho an toàn | M4 | P0 | T-02, T-09 | 3d | `inventory` module | Test đồng thời: không âm kho |
| T-17 | Cart API | CRUD cart item, kiểm tra tồn kho | M4 | P0 | T-10, T-16 | 3d | `cart` module | Giỏ trả về nhóm theo store kèm cảnh báo hết hàng |
| T-18 | Order API | Checkout, tách seller order, state machine, hủy đơn | M4 | P0 | T-11, T-17 | 6d | `orders` module + integration test | Đơn 2 seller tạo 1 order + 2 seller order; chuyển trạng thái sai trả 409 |
| T-19 | Payment API | COD + VNPay sandbox, IPN callback | M4 | P1 | T-18 | 4d | `payments` module | Callback sai chữ ký bị từ chối; gọi lặp không cập nhật 2 lần |
| T-20 | Review API | Tạo/sửa review, cập nhật rating sản phẩm | M4 | P1 | T-18 | 2d | `reviews` module | Chỉ review được item đã DELIVERED; mỗi item 1 review |
| T-21 | Notification API | Định nghĩa tên và payload của domain event dùng chung; tạo thông báo qua event, danh sách, đánh dấu đã đọc | M1 | P1 | T-10 | 2d | `notifications` module | Có thông báo khi đơn đổi trạng thái, seller được duyệt |
| T-22 | Admin API | Quản lý user/seller/product/order, thống kê | M1 | P1 | T-12, T-14, T-18 | 4d | `admin` module | Mọi endpoint chặn role khác ADMIN (403) |
| T-23 | UI: layout, trang chủ, auth | Header, footer, login, register, lưu phiên | M2 | P0 | T-07, T-10 | 4d | Các trang tương ứng | Login xong giữ phiên sau reload; responsive |
| T-24 | UI: listing, search, chi tiết | Lưới sản phẩm, bộ lọc, trang chi tiết, chọn variant | M2 | P0 | T-13, T-15 | 5d | Các trang tương ứng | Filter đồng bộ với URL query |
| T-25 | UI: cart và checkout | Giỏ hàng, chọn địa chỉ, chọn thanh toán, kết quả | M2 | P0 | T-17, T-18, T-19 | 5d | Các trang tương ứng | Đặt hàng COD và VNPay sandbox thành công |
| T-26 | UI: tài khoản, đơn hàng, review | Profile, địa chỉ, lịch sử đơn, chi tiết đơn, form review | M2 | P1 | T-11, T-18, T-20 | 4d | Các trang tương ứng | Hiển thị đúng trạng thái từng seller order |
| T-27 | UI: Seller Center | Đăng ký seller, quản lý sản phẩm, tồn kho, đơn, doanh thu; dựng trên khung dashboard của T-28 | M2 | P1 | T-12, T-14, T-16, T-18, T-28 (phần khung) | 5d | Khu vực `/seller/*` | Seller hoàn thành được luồng đăng bán và xử lý đơn |
| T-28 | UI: Admin Dashboard | Khung dashboard dùng chung (sidebar, bảng dữ liệu, thẻ thống kê) giao trước cuối tuần 3; sau đó các trang quản lý, duyệt seller, thống kê | M1 | P1 | T-07, T-22 | 5d | Khu vực `/admin/*`, component dashboard dùng chung | Admin duyệt seller, khóa user, ẩn sản phẩm được |

### 7.3 Phase 5–6: Tích hợp, kiểm thử, triển khai (tuần 6–8)

| Task ID | Task Name | Description | Member | Priority | Dependencies | Est. | Deliverables | Acceptance Criteria |
|---------|-----------|-------------|--------|----------|--------------|------|--------------|---------------------|
| T-29 | Integration test backend | Test API với database thật cho luồng chính; bắt đầu từ tuần 5 với luồng tiền và tồn kho | M4 | P1 | T-18, T-19 | 4d | Bộ test `test/` | Luồng checkout, payment, hủy đơn có test; CI pass |
| T-30 | Unit test module Core | Bổ sung unit test còn thiếu cho Auth, Product, Seller | M3 | P1 | T-10–T-15 | 3d | File `*.spec.ts` | Coverage service ≥ 70% |
| T-31 | E2E test Playwright | 5 kịch bản (doc 08 mục 5). Viết E2E-01, 02, 05 trước; E2E-03, 04 sau khi Seller Center xong | M4 | P1 | T-25, T-27, T-28 | 4d | Thư mục `e2e/` | 5 kịch bản pass trên môi trường Docker |
| T-32 | Kiểm tra bảo mật | Rà soát theo checklist doc 08 mục 6 | M1 + M3 | P1 | T-22 | 2d | Báo cáo ngắn | Không còn lỗi mức cao |
| T-33 | Sửa lỗi tích hợp | Xử lý bug từ test và demo nội bộ | Cả nhóm | P0 | T-29, T-31 | 5d | Issue đã đóng | Không còn bug P0/P1 mở |
| T-34 | Triển khai production | Triển khai thử ở tuần 6 (env, migrate, HTTPS, IPN VNPay); phát hành chính thức ở tuần 8 | M1 | P1 | T-08, T-19; T-33 cho bản chính thức | 3d | URL production | Luồng mua hàng chạy được trên production |
| T-35 | Hoàn thiện tài liệu và demo | Cập nhật docs, README, slide, video demo | Cả nhóm | P1 | T-34 | 2d | Docs cuối, slide | Docs khớp với code đang chạy |

## 8. Danh mục tài liệu

| File | Nội dung |
|------|----------|
| [01_Project_Overview.md](01_Project_Overview.md) | Tổng quan, MVP, phân công, roadmap (tài liệu này) |
| [02_Requirements.md](02_Requirements.md) | Software Requirement Specification (SRS) |
| [03_System_Architecture.md](03_System_Architecture.md) | Kiến trúc hệ thống, cấu trúc thư mục, đặc tả module |
| [04_Database_Design.md](04_Database_Design.md) | ERD, ràng buộc, index, trạng thái đơn hàng/thanh toán |
| [05_API_Documentation.md](05_API_Documentation.md) | Đặc tả RESTful API |
| [06_Use_Cases.md](06_Use_Cases.md) | Use Case Diagram và đặc tả use case |
| [07_Git_Workflow.md](07_Git_Workflow.md) | Quy trình Git/GitHub, template, Definition of Done |
| [08_Testing_Plan.md](08_Testing_Plan.md) | Kế hoạch kiểm thử |
| [09_Deployment_Guide.md](09_Deployment_Guide.md) | Hướng dẫn cài đặt và triển khai |
