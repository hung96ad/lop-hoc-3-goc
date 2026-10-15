import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.base_class import Base
from app.db.session import engine


@pytest_asyncio.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_ai_essay_assessment_3_roots_3_poisons():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register Teacher & Create Class
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_ai@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao AI",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop Dao Duc & Tu Duy"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # 2. Create Essay Question with Rubrics
        q_res = await ac.post("/api/v1/questions", json={
            "type": "essay",
            "content": "Hãy viết về cách bạn giải quyết bất đồng với bạn bè dựa trên sự thấu hiểu và nhẫn nại.",
            "default_points": "10.00",
            "rubrics": [
                {
                    "criterion_name": "Tinh thần Lắng nghe & Đạo đức",
                    "description": "Biết đặt mình vào vị trí người khác, tôn trọng và không công kích",
                    "max_points": "5.00",
                    "level_descriptors": {"tot": 5, "kha": 4}
                },
                {
                    "criterion_name": "Trí tuệ & Giải pháp hài hòa",
                    "description": "Tư duy nhân quả, tìm kiếm giải pháp có lợi cho cả hai bên",
                    "max_points": "5.00",
                    "level_descriptors": {"tot": 5, "kha": 4}
                }
            ]
        }, headers=t_headers)
        q_id = q_res.json()["id"]

        # 3. Create Exam & Publish & Assign
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Kiểm tra Tự Luận 3 Gốc",
            "duration_minutes": 30,
            "total_score": "10.00",
            "questions": [{"question_id": q_id, "points": "10.00", "order_index": 0}]
        }, headers=t_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=t_headers)

        now = datetime.now(timezone.utc)
        asg_res = await ac.post("/api/v1/exams/assignments", json={
            "exam_id": exam_id,
            "class_id": class_id,
            "open_at": (now - timedelta(minutes=5)).isoformat(),
            "close_at": (now + timedelta(hours=2)).isoformat(),
            "max_attempts": 1
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # 4. Student Enrolls & Starts Attempt
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_ai@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh AI",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)

        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        attempt_id = start_res.json()["attempt_id"]
        eq_id = start_res.json()["questions"][0]["exam_question_id"]

        # 5. Student writes and saves essay answer
        student_essay_text = (
            "Khi có mâu thuẫn xảy ra, em chọn cách giữ bình tĩnh, lắng nghe bạn chia sẻ "
            "thay vì tức giận hay chỉ trích. Em nhận thấy mỗi người đều có góc nhìn riêng, "
            "và khi cùng nhau tìm ra nguyên nhân cốt lõi, cả hai có thể giải quyết vấn đề trong hòa thuận."
        )
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": eq_id,
            "text_response": student_essay_text,
            "client_version": 1
        }, headers=s_headers)

        # 6. Submit Attempt (Triggers AI Background Task)
        sub_res = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_res.status_code == 200
        assert sub_res.json()["status"] == "grading"

        # Wait a moment for background task to complete
        await asyncio.sleep(0.5)

        # Re-check attempt status (should transition to pending_review once AI completes)
        from app.db.session import AsyncSessionLocal
        from app.models.attempts import Attempt, Answer
        from app.models.grading import AIAnalysis, GradingResult
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        async with AsyncSessionLocal() as db:
            att = await db.scalar(select(Attempt).where(Attempt.id == attempt_id).options(selectinload(Attempt.answers)))
            assert att.status == "pending_review"
            assert att.essay_score > Decimal("0.00")
            
            # Check AIAnalysis content
            ans_id = att.answers[0].id
            ai_rec = await db.scalar(select(AIAnalysis).where(AIAnalysis.answer_id == ans_id))
            assert ai_rec is not None
            assert ai_rec.execution_status == "completed"
            assert "dao_duc" in ai_rec.three_roots_analysis
            assert "tri_tue" in ai_rec.three_roots_analysis
            assert "nghi_luc" in ai_rec.three_roots_analysis
            assert "tham" in ai_rec.three_poisons_analysis
            assert "san" in ai_rec.three_poisons_analysis
            assert "si" in ai_rec.three_poisons_analysis
            assert len(ai_rec.rubric_evaluations) == 2
            assert ai_rec.proposed_total_score <= Decimal("10.00")
