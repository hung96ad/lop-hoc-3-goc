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


@pytest.mark.asyncio
async def test_ai_essay_assessment_three_poisons_deduction_and_min_zero():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register Teacher & Create Class
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_poison@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao Khao Thi",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop Ren Luyen 3 Goc"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # 2. Create Essay Question with both 3 Gốc and 3 Độc penalty rubrics
        q_res = await ac.post("/api/v1/questions", json={
            "type": "essay",
            "content": "Hãy phân tích thái độ của bạn trước cám dỗ lợi ích và sự tranh chấp.",
            "default_points": "10.00",
            "rubrics": [
                {
                    "criterion_name": "Đạo đức & Trách nhiệm",
                    "description": "Trung thực, vị tha",
                    "max_points": "5.00",
                    "is_deduction": False
                },
                {
                    "criterion_name": "Trí tuệ & Nghị lực",
                    "description": "Nhân quả, vượt khó",
                    "max_points": "5.00",
                    "is_deduction": False
                },
                {
                    "criterion_name": "Trừ điểm: Tham (Vị kỷ & Trục lợi)",
                    "description": "Trừ điểm nếu thể hiện lòng tham, vụ lợi",
                    "max_points": "3.00",
                    "is_deduction": True
                },
                {
                    "criterion_name": "Trừ điểm: Sân (Công kích & Giận dữ)",
                    "description": "Trừ điểm nếu thể hiện sự hận thù, công kích",
                    "max_points": "3.00",
                    "is_deduction": True
                }
            ]
        }, headers=t_headers)
        assert q_res.status_code == 200
        q_id = q_res.json()["id"]

        # 3. Create Exam & Publish & Assign
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Khao Sat Chuyen Hoa 3 Doc",
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
            "email": "student_poison@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh Co 3 Doc",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)

        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        attempt_id = start_res.json()["attempt_id"]
        eq_id = start_res.json()["questions"][0]["exam_question_id"]

        # Verify sanitized questions in start response contain rubrics for essay
        assert "rubrics" in start_res.json()["questions"][0]
        assert len(start_res.json()["questions"][0]["rubrics"]) == 4

        # 5. Student writes essay with high 3 Poisons (Tham & Sân)
        student_essay_with_poison = (
            "Tôi chỉ quan tâm đến vụ lợi cá nhân và tiền bạc cho riêng mình. "
            "Kẻ nào dám cản đường thì tôi sẽ rất tức giận và tìm cách trả thù, tiêu diệt bằng mọi giá."
        )
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": eq_id,
            "text_response": student_essay_with_poison,
            "client_version": 1
        }, headers=s_headers)

        # 6. Submit Attempt
        sub_res = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_res.status_code == 200

        # Wait for AI evaluation
        await asyncio.sleep(0.5)

        from app.db.session import AsyncSessionLocal
        from app.models.attempts import Attempt
        from app.models.grading import AIAnalysis, GradingResult
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        async with AsyncSessionLocal() as db:
            att = await db.scalar(select(Attempt).where(Attempt.id == attempt_id).options(selectinload(Attempt.answers)))
            assert att.status == "pending_review"
            ans_id = att.answers[0].id
            ai_rec = await db.scalar(select(AIAnalysis).where(AIAnalysis.answer_id == ans_id))
            assert ai_rec is not None

            # Verify 3 Poisons were detected and point deductions were recorded
            poisons = ai_rec.three_poisons_analysis
            assert float(poisons.get("points_deducted", 0)) > 0
            assert float(poisons.get("tham_deduction", 0)) > 0 or float(poisons.get("san_deduction", 0)) > 0

            # Verify deduction rubrics have deducted points
            deduction_evals = [e for e in ai_rec.rubric_evaluations if e.get("is_deduction")]
            assert len(deduction_evals) == 2
            assert any(float(e.get("points_deducted", 0)) > 0 for e in deduction_evals)

            # Crucial: Verify min score is 0.00
            assert ai_rec.proposed_total_score >= Decimal("0.00")
            assert att.essay_score >= Decimal("0.00")
            assert att.final_score >= Decimal("0.00")

        # 7. Test teacher override rejects score < 0
        overview_res = await ac.get(f"/api/v1/teacher/attempts/{attempt_id}/review", headers=t_headers)
        gr_id = overview_res.json()["essay_details"][0]["grading_result"]["id"]
        gr_ver = overview_res.json()["essay_details"][0]["grading_result"]["version"]

        bad_override = await ac.put(f"/api/v1/teacher/grading-results/{gr_id}/override", json={
            "score": -1.0,
            "reason": "Test negative",
            "expected_version": gr_ver
        }, headers=t_headers)
        assert bad_override.status_code in [400, 422]  # Validation error: score cannot be negative
