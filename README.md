# E-commerce Marketplace Platform

Nền tảng thương mại điện tử nhiều người bán, lấy cảm hứng từ Amazon. Đồ án học phần IT4409 – Công nghệ Web và dịch vụ trực tuyến, nhóm 4 thành viên.

**Trạng thái:** phân tích và thiết kế đã chốt; kế hoạch thực hiện 8 tuần (xem [Project Overview](docs/01_Project_Overview.md), mục 6). Repo hiện là bộ khung: tài liệu, quy trình làm việc và cấu trúc thư mục. Mã nguồn ứng dụng do các thành viên viết theo bảng phân công.

## Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript, RESTful API (Modular Monolith) |
| Database | PostgreSQL, Prisma ORM |
| Khác | JWT, bcrypt, Redis, Cloudinary, Docker, Jest, Playwright |

## Cấu trúc repository

| Đường dẫn | Nội dung |
|-----------|----------|
| [docs/](docs/) | Tài liệu phân tích, thiết kế, quy trình |
| [apps/](apps/README.md) | Backend (`api/`) và frontend (`web/`): cây thư mục đã tạo sẵn, file README hướng dẫn cách khởi tạo |
| `e2e/` | E2E test Playwright (T-31) |
| [.github/](.github/) | Template Pull Request, template Issue, CODEOWNERS |

## Bắt đầu

1. Đọc tài liệu theo thứ tự 01 → 02 → 06 → 03 → 04 → 05 → 07.
2. Tìm task của mình trong [bảng phân công](docs/01_Project_Overview.md) (mục 7) và lịch theo tuần (mục 6.3).
3. Cài công cụ theo [Deployment Guide](docs/09_Deployment_Guide.md), mục 1.
4. Làm việc theo [Git Workflow](docs/07_Git_Workflow.md): mỗi task một nhánh, một Pull Request vào `develop`.

## Tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [01 – Project Overview](docs/01_Project_Overview.md) | Tổng quan, phạm vi MVP, phân công, roadmap |
| [02 – Requirements](docs/02_Requirements.md) | Software Requirement Specification |
| [03 – System Architecture](docs/03_System_Architecture.md) | Kiến trúc, cấu trúc thư mục, đặc tả module |
| [04 – Database Design](docs/04_Database_Design.md) | ERD, ràng buộc, index, trạng thái đơn hàng |
| [05 – API Documentation](docs/05_API_Documentation.md) | Đặc tả RESTful API |
| [06 – Use Cases](docs/06_Use_Cases.md) | Use Case Diagram và đặc tả |
| [07 – Git Workflow](docs/07_Git_Workflow.md) | Quy trình Git/GitHub, template, Definition of Done |
| [08 – Testing Plan](docs/08_Testing_Plan.md) | Kế hoạch kiểm thử |
| [09 – Deployment Guide](docs/09_Deployment_Guide.md) | Cài đặt và triển khai |
