# 02 – Software Requirement Specification (SRS)

## 1. Giới thiệu

### 1.1 Mục đích

Tài liệu mô tả yêu cầu chức năng và phi chức năng của E-commerce Marketplace Platform. Đây là căn cứ để thiết kế, lập trình, kiểm thử và nghiệm thu.

### 1.2 Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| Guest | Người truy cập chưa đăng nhập |
| Customer | Người dùng đã đăng nhập, có thể mua hàng |
| Seller | Người dùng đã được Admin duyệt quyền bán hàng |
| Store | Gian hàng công khai của một Seller |
| Variant | Một phiên bản cụ thể của sản phẩm (ví dụ: màu Đỏ, size L), có giá và tồn kho riêng |
| SKU | Mã định danh variant do Seller đặt |
| Order | Đơn tổng của một lần checkout, thuộc về Customer |
| Seller Order | Phần đơn hàng thuộc về một Store trong một Order |
| COD | Cash on Delivery – thanh toán khi nhận hàng |
| RBAC | Role-Based Access Control |

### 1.3 Tác nhân và quyền

Một tài khoản có thể mang nhiều role cùng lúc. Seller luôn có thêm role Customer (người bán vẫn mua hàng được).

| Tác nhân | Mô tả | Cách có được role |
|----------|-------|-------------------|
| Guest | Xem trang chủ, tìm kiếm, xem sản phẩm, xem review | Mặc định |
| Customer | Mọi quyền của Guest + giỏ hàng, đặt hàng, review | Đăng ký tài khoản |
| Seller | Quản lý store, sản phẩm, tồn kho, đơn của store | Gửi hồ sơ, Admin duyệt |
| Admin | Quản trị toàn hệ thống | Tạo bằng seed script, không đăng ký công khai |
| Payment Gateway | Hệ thống ngoài, gửi kết quả thanh toán | – |

## 2. Yêu cầu chức năng (Functional Requirements)

Mức ưu tiên: **M** = MVP, **E** = mở rộng.

### 2.1 Authentication (FR-AUTH)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-AUTH-01 | Guest đăng ký bằng email, mật khẩu, họ tên. Email là duy nhất. | M |
| FR-AUTH-02 | Mật khẩu tối thiểu 8 ký tự, có chữ và số; lưu dạng hash bcrypt. | M |
| FR-AUTH-03 | Đăng nhập trả về access token (15 phút) và refresh token (7 ngày, httpOnly cookie). | M |
| FR-AUTH-04 | Refresh token được xoay vòng (rotation): mỗi lần refresh cấp token mới và thu hồi token cũ. | M |
| FR-AUTH-05 | Đăng xuất thu hồi refresh token hiện tại. | M |
| FR-AUTH-06 | Mọi API cần bảo vệ kiểm tra JWT và role. Tài khoản bị khóa không đăng nhập được. | M |
| FR-AUTH-07 | Quên mật khẩu qua email. | E |

### 2.2 User Management (FR-USER)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-USER-01 | Customer xem và sửa hồ sơ (họ tên, số điện thoại). | M |
| FR-USER-02 | Customer đổi mật khẩu, phải nhập đúng mật khẩu cũ. | M |
| FR-USER-03 | Customer quản lý sổ địa chỉ (tối đa 10), chọn một địa chỉ mặc định. | M |
| FR-USER-04 | Admin xem danh sách, tìm kiếm, khóa/mở khóa tài khoản. Admin không tự khóa mình. | M |
| FR-USER-05 | Upload avatar. | E |

### 2.3 Seller Management (FR-SELLER)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-SELLER-01 | Customer gửi hồ sơ đăng ký bán hàng: tên kinh doanh, số điện thoại, tên store, mô tả. | M |
| FR-SELLER-02 | Hồ sơ ở trạng thái PENDING cho đến khi Admin duyệt (APPROVED) hoặc từ chối kèm lý do (REJECTED). | M |
| FR-SELLER-03 | Khi được duyệt, user nhận role SELLER và store được kích hoạt. | M |
| FR-SELLER-04 | Hồ sơ bị từ chối có thể sửa và gửi lại. | M |
| FR-SELLER-05 | Seller sửa thông tin store (tên, mô tả, logo). | M |
| FR-SELLER-06 | Admin tạm ngưng (SUSPENDED) Seller; sản phẩm của store bị ẩn khỏi tìm kiếm. | M |
| FR-SELLER-07 | Trang store công khai hiển thị thông tin và sản phẩm. | M |
| FR-SELLER-08 | Seller xem doanh thu: tổng doanh thu, số đơn, sản phẩm bán chạy theo khoảng thời gian. | M |

### 2.4 Product và Category (FR-PROD, FR-CAT)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-PROD-01 | Seller tạo sản phẩm: tên, mô tả, danh mục, ít nhất 1 variant, ít nhất 1 ảnh. | M |
| FR-PROD-02 | Mỗi variant có SKU, tên, giá, tồn kho. SKU không trùng trong cùng sản phẩm. | M |
| FR-PROD-03 | Sản phẩm có trạng thái DRAFT, ACTIVE, HIDDEN, BANNED. Chỉ ACTIVE hiển thị công khai. | M |
| FR-PROD-04 | Seller chỉ sửa/xóa sản phẩm của store mình. Xóa là soft delete. | M |
| FR-PROD-05 | Upload tối đa 8 ảnh mỗi sản phẩm (JPEG/PNG/WebP, ≤ 5MB/ảnh). | M |
| FR-PROD-06 | Admin đặt trạng thái BANNED cho sản phẩm vi phạm; Seller không tự mở lại được. | M |
| FR-CAT-01 | Danh mục dạng cây tối đa 2 cấp. | M |
| FR-CAT-02 | Admin tạo, sửa, bật/tắt danh mục. Không xóa danh mục đang có sản phẩm hoặc danh mục con. | M |
| FR-CAT-03 | Sản phẩm chỉ gán vào danh mục lá (không có con). | M |

### 2.5 Search và Filtering (FR-SEARCH)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-SEARCH-01 | Tìm theo từ khóa trên tên sản phẩm, không phân biệt hoa thường và dấu tiếng Việt. | M |
| FR-SEARCH-02 | Lọc theo danh mục (gồm cả danh mục con), khoảng giá, rating tối thiểu, store. | M |
| FR-SEARCH-03 | Sắp xếp: mới nhất, giá tăng/giảm, bán chạy, rating. | M |
| FR-SEARCH-04 | Phân trang, mặc định 20, tối đa 100 mỗi trang. | M |
| FR-SEARCH-05 | Gợi ý từ khóa khi gõ. | E |

### 2.6 Cart và Inventory (FR-CART, FR-INV)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-CART-01 | Mỗi Customer có đúng một giỏ hàng, lưu trên server. | M |
| FR-CART-02 | Thêm variant vào giỏ; nếu đã có thì cộng dồn số lượng. | M |
| FR-CART-03 | Số lượng trong giỏ không vượt tồn kho hiện tại. | M |
| FR-CART-04 | Giỏ hàng hiển thị nhóm theo store, kèm giá hiện tại và cảnh báo nếu item hết hàng hoặc ngừng bán. | M |
| FR-CART-05 | Seller không thêm được sản phẩm của chính store mình vào giỏ. | M |
| FR-INV-01 | Mỗi variant có một bản ghi tồn kho, số lượng không âm. | M |
| FR-INV-02 | Seller cập nhật tồn kho của variant thuộc store mình. | M |
| FR-INV-03 | Tồn kho bị trừ khi tạo đơn và được hoàn khi đơn bị hủy hoặc thanh toán hết hạn. | M |
| FR-INV-04 | Hai đơn đặt đồng thời không được làm tồn kho âm. | M |

### 2.7 Order (FR-ORDER)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-ORDER-01 | Customer checkout các item đã chọn trong giỏ, với một địa chỉ giao hàng và một phương thức thanh toán. | M |
| FR-ORDER-02 | Hệ thống tạo 1 Order và N Seller Order (mỗi store một cái). | M |
| FR-ORDER-03 | Order lưu snapshot địa chỉ; order item lưu snapshot tên, giá, ảnh. | M |
| FR-ORDER-04 | Phí vận chuyển cố định cho mỗi Seller Order (cấu hình được, mặc định 30.000đ). | M |
| FR-ORDER-05 | Tạo đơn thành công thì xóa các item đã mua khỏi giỏ. | M |
| FR-ORDER-06 | Customer xem danh sách và chi tiết đơn của mình. | M |
| FR-ORDER-07 | Seller xem và xử lý Seller Order của store mình: xác nhận → đang giao → đã giao. | M |
| FR-ORDER-08 | Customer hủy Seller Order khi còn ở PENDING. Seller hủy khi ở PENDING hoặc CONFIRMED, phải nêu lý do. | M |
| FR-ORDER-09 | Customer xác nhận đã nhận hàng (DELIVERED → COMPLETED). | M |
| FR-ORDER-10 | Chỉ cho phép chuyển trạng thái theo sơ đồ trong doc 04 mục 5. | M |
| FR-ORDER-11 | Tự động COMPLETED sau 3 ngày kể từ DELIVERED. | E |

### 2.8 Payment (FR-PAY)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-PAY-01 | Hỗ trợ COD. | M |
| FR-PAY-02 | Hỗ trợ một cổng thanh toán online ở chế độ sandbox (VNPay). | M |
| FR-PAY-03 | Đơn online có hạn thanh toán 15 phút; quá hạn thì đơn bị hủy và hoàn kho. | M |
| FR-PAY-04 | Kết quả thanh toán được xác nhận qua callback server-to-server (IPN), có kiểm tra chữ ký. | M |
| FR-PAY-05 | Xử lý callback idempotent. | M |
| FR-PAY-06 | Hệ thống không lưu số thẻ, CVV hay bất kỳ dữ liệu thẻ nào. | M |
| FR-PAY-07 | Customer thanh toán lại đơn còn hạn nếu lần trước thất bại. | M |
| FR-PAY-08 | Đơn đã thanh toán online bị hủy được ghi nhận cần hoàn tiền; Admin xử lý thủ công. | M |

### 2.9 Review (FR-REVIEW)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-REVIEW-01 | Customer đánh giá (1–5 sao, bình luận ≤ 1000 ký tự) cho order item thuộc Seller Order đã DELIVERED hoặc COMPLETED. | M |
| FR-REVIEW-02 | Mỗi order item chỉ có một review; được sửa trong 7 ngày. | M |
| FR-REVIEW-03 | Rating trung bình và số lượt đánh giá của sản phẩm được cập nhật khi có review. | M |
| FR-REVIEW-04 | Mọi người xem được review của sản phẩm, có phân trang. | M |
| FR-REVIEW-05 | Admin ẩn review vi phạm. | M |
| FR-REVIEW-06 | Seller phản hồi review. | E |

### 2.10 Admin Dashboard và Notification (FR-ADMIN, FR-NOTI)

| ID | Yêu cầu | Ưu tiên |
|----|---------|---------|
| FR-ADMIN-01 | Thống kê tổng quan: số user, seller, sản phẩm, đơn hàng, tổng doanh thu. | M |
| FR-ADMIN-02 | Doanh thu theo ngày trong khoảng thời gian chọn. | M |
| FR-ADMIN-03 | Xem toàn bộ đơn hàng, lọc theo trạng thái; can thiệp hủy đơn. | M |
| FR-ADMIN-04 | Danh sách seller chờ duyệt. | M |
| FR-NOTI-01 | Tạo thông báo in-app khi: seller được duyệt/từ chối, có đơn mới (cho Seller), đơn đổi trạng thái (cho Customer), thanh toán thành công/thất bại. | M |
| FR-NOTI-02 | Người dùng xem danh sách thông báo, số chưa đọc, đánh dấu đã đọc. | M |
| FR-NOTI-03 | Gửi email cho các sự kiện quan trọng. | E |

## 3. Yêu cầu phi chức năng (Non-Functional Requirements)

| ID | Nhóm | Yêu cầu | Cách kiểm chứng |
|----|------|---------|-----------------|
| NFR-01 | Performance | API đọc (listing, chi tiết) phản hồi p95 < 500ms với 10.000 sản phẩm seed | Đo bằng k6 hoặc autocannon |
| NFR-02 | Performance | Trang chủ và trang listing có LCP < 2,5s trên mạng 4G giả lập | Lighthouse |
| NFR-03 | Security | Mật khẩu hash bcrypt (cost ≥ 10); không trả `password_hash` trong bất kỳ response nào | Code review, test |
| NFR-04 | Security | Mọi input được validate ở backend (class-validator); dùng Prisma tham số hóa, không nối chuỗi SQL | Code review |
| NFR-05 | Security | Secret đặt trong biến môi trường; `.env` nằm trong `.gitignore`; có `.env.example` | Kiểm tra repo |
| NFR-06 | Security | Rate limit cho login và register (ví dụ 10 lần/phút/IP); bật Helmet và CORS theo whitelist | Test thủ công |
| NFR-07 | Security | Kiểm tra quyền sở hữu tài nguyên ở tầng service (chống IDOR) | Integration test |
| NFR-08 | Reliability | Tạo đơn, trừ kho, xóa giỏ nằm trong một database transaction | Integration test |
| NFR-09 | Usability | Giao diện responsive từ 360px; thông báo lỗi bằng tiếng Việt, dễ hiểu | Kiểm tra thủ công |
| NFR-10 | Maintainability | TypeScript strict; lint bằng công cụ mặc định của từng framework (oxlint cho NestJS 12, ESLint cho Next.js) và format bằng Prettier; module không truy cập trực tiếp bảng của module khác | CI, code review |
| NFR-11 | Maintainability | Coverage unit test tầng service ≥ 70% | Jest coverage |
| NFR-12 | Portability | Toàn bộ hệ thống khởi động bằng một lệnh `docker compose up` | Thử trên máy mới |
| NFR-13 | Compatibility | Hỗ trợ 2 phiên bản mới nhất của Chrome, Edge, Firefox | Playwright |
| NFR-14 | Observability | Log có cấu trúc cho request và lỗi; có endpoint health check | Kiểm tra log |
| NFR-15 | Documentation | Swagger tự sinh tại `/api/docs`; docs cập nhật cùng PR thay đổi API/DB | Code review |

## 4. Ràng buộc và giả định

**Ràng buộc**

- Công nghệ cố định theo doc 01 mục 4.
- Kiến trúc Modular Monolith, một database PostgreSQL duy nhất.
- Thanh toán online chỉ ở chế độ sandbox, không xử lý tiền thật.

**Giả định**

- Đơn vị tiền tệ duy nhất là VND, lưu dạng số nguyên.
- Vận chuyển được mô phỏng: Seller tự cập nhật trạng thái giao hàng.
- Quy mô dữ liệu demo: dưới 10.000 sản phẩm, dưới 100 người dùng đồng thời.
- Thời lượng dự án 8 tuần; lịch chi tiết ở doc 01 mục 6.

## 5. Tiêu chí nghiệm thu MVP

Hệ thống đạt MVP khi kịch bản sau chạy trọn vẹn trên môi trường đã triển khai:

1. Người dùng A đăng ký, gửi hồ sơ bán hàng. Admin duyệt.
2. A tạo sản phẩm có 2 variant, đặt tồn kho. Người dùng B (Seller khác) cũng có sản phẩm.
3. Guest tìm thấy cả hai sản phẩm qua tìm kiếm và bộ lọc.
4. Người dùng C đăng ký, thêm sản phẩm của A và B vào giỏ, checkout bằng VNPay sandbox.
5. Hệ thống tạo 1 Order và 2 Seller Order; tồn kho giảm đúng; thanh toán được ghi nhận PAID.
6. A và B mỗi người chỉ thấy phần đơn của mình, xử lý đến DELIVERED.
7. C xác nhận nhận hàng và viết review; rating sản phẩm cập nhật.
8. Admin thấy đơn hàng và doanh thu trên dashboard.
