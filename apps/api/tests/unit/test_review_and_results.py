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
async def test_teacher_review_override_audit_and_student_results():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register Teacher & Create Class
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_review@example.com",
            "password": "Password123!",
            "full_name": "Co Giao Review",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop 11 Van"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # 2. Teacher creates Essay Question
        q_res = await ac.post("/api/v1/questions", json={
            "type": "essay",
            "content": "Phân tích ý nghĩa của lòng trung thực trong học tập.",
            "default_points": "10.00",
            "rubrics": [
                {
                    "criterion_name": "Đạo đức & Sự chính trực",
                    "description": "Trung thực với bản thân và thầy cô",
                    "max_points": "10.00",
                    "level_descriptors": {"tot": 10}
                }
            ]
        }, headers=t_headers)
        q_id = q_res.json()["id"]

        # 3. Exam & Assignment
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Bài thi Đạo Đức & Trung Thực",
            "duration_minutes": 25,
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

        # 4. Student Enroll & Submit
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_review@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh Cham Chi",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)
        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        attempt_id = start_res.json()["attempt_id"]
        eq_id = start_res.json()["questions"][0]["exam_question_id"]

        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": eq_id,
            "text_response": "Trung thực là nền tảng của nhân cách, giúp ta không tự lừa dối mình và luôn nỗ lực thực chất.",
            "client_version": 1
        }, headers=s_headers)

        await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        await asyncio.sleep(0.5)  # Wait for AI assessment

        # 5. Student checks results BEFORE teacher finalizes (Should be hidden/masked)
        pre_res = await ac.get(f"/api/v1/student/attempts/{attempt_id}/results", headers=s_headers)
        assert pre_res.status_code == 200
        assert pre_res.json()["is_published"] is False
        assert pre_res.json()["final_score"] is None

        # 6. Teacher inspects grading overview
        review_view_res = await ac.get(f"/api/v1/teacher/attempts/{attempt_id}/review", headers=t_headers)
        assert review_view_res.status_code == 200
        view_data = review_view_res.json()
        assert len(view_data["essay_details"]) == 1
        essay_item = view_data["essay_details"][0]
        gr_id = essay_item["grading_result"]["id"]
        curr_ver = essay_item["grading_result"]["version"]
        
        # Verify AI suggested score exists
        assert essay_item["ai_analysis"]["proposed_total_score"] > 0

        # 7. Teacher overrides score with audit reason
        override_res = await ac.put(f"/api/v1/teacher/grading-results/{gr_id}/override", json={
            "score": "9.50",
            "teacher_feedback": "Bài viết rất chân thành và sâu sắc, cô khen ngợi!",
            "reason": "Điều chỉnh tăng 1.5 điểm vì học sinh có dẫn chứng thực tế giàu cảm xúc",
            "expected_version": curr_ver
        }, headers=t_headers)
        assert override_res.status_code == 200

        # 8. Teacher finalizes attempt
        fin_res = await ac.post(f"/api/v1/teacher/attempts/{attempt_id}/finalize", headers=t_headers)
        assert fin_res.status_code == 200
        assert fin_res.json()["status"] == "finalized"

        # 9. Student checks results AFTER finalized (Should now see score and 3 Roots feedback)
        post_res = await ac.get(f"/api/v1/student/attempts/{attempt_id}/results", headers=s_headers)
        assert post_res.status_code == 200
        final_view = post_res.json()
        assert final_view["is_published"] is True
        assert Decimal(str(final_view["final_score"])) == Decimal("9.50")
        assert "Bài viết rất chân thành" in final_view["teacher_feedback"]
        assert "three_roots" in final_view["ai_feedback"]
