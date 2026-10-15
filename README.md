# Nền tảng thi trực tuyến tích hợp AI Agent tiếng Việt (3 Gốc - 3 Độc)

Hệ thống quản lý, tổ chức thi trực tuyến toàn diện gồm Teacher Portal & Student Portal, hỗ trợ chấm điểm trắc nghiệm tự động và đánh giá bài luận theo triết lý 3 Gốc (Đạo đức - Trí tuệ - Nghị lực) và 3 Độc (Tham - Sân - Si).

## Cấu trúc thư mục
- `apps/web`: Frontend Next.js 14/15 App Router, Tailwind CSS, shadcn/ui.
- `apps/api`: Backend FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, ARQ Worker, AI Agents.
- `infra`: Docker compose, scripts, reverse proxy configs.

## Hướng dẫn khởi chạy nhanh

### Yêu cầu
- Docker & Docker Compose
- Node.js >= 18
- Python >= 3.11

### Chạy bằng Docker Compose
```bash
cp .env.example .env
docker compose up -d
```
- Frontend: http://localhost:3000
- Backend Docs: http://localhost:8000/docs
