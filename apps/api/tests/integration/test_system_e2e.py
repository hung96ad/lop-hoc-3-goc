from datetime import datetime, timezone, timedelta
from decimal import Decimal
import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.base_class import Base
from app.db.session import engine


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_full_system_lifecycle_e2e():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Step 1: Teacher registers and sets up a classroom
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_sys@example.com",
            "password": "Password123!",
            "full_name": "Thầy Giáo Huỳnh",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Khóa Học Rèn Luyện 3 Gốc"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # Step 2: Teacher builds Question Bank with single_choice, multiple_select & essay
        # Q1: Single choice (2 pts)
        q1_res = await ac.post("/api/v1/questions", json={
            "type": "single_choice",
            "content": "Cốt lõi của Đạo Đức trong triết lý 3 Gốc là gì?",
            "default_points": "2.00",
            "options": [
                {"content": "Tâm vị tha, tình yêu thương và sự chính trực", "is_correct": True, "order_index": 0},
                {"content": "Mong cầu danh tiếng và thành tựu cá nhân", "is_correct": False, "order_index": 1}
            ]
        }, headers=t_headers)
        q1_id = q1_res.json()["id"]

        # Q2: Multiple select (3 pts)
        q2_res = await ac.post("/api/v1/questions", json={
            "type": "multiple_select",
            "content": "Các yếu tố nào sau đây thuộc về 3 Độc?",
            "default_points": "3.00",
            "options": [
                {"content": "Tham lam ích kỷ", "is_correct": True, "order_index": 0},
                {"content": "Sân hận giận dữ", "is_correct": True, "order_index": 1},
                {"content": "Si mê tăm tối", "is_correct": True, "order_index": 2},
                {"content": "Dũng cảm kiên định", "is_correct": False, "order_index": 3}
            ]
        }, headers=t_headers)
        q2_id = q2_res.json()["id"]

        # Q3: Essay with rubric (5 pts)
        q3_res = await ac.post("/api/v1/questions", json={
            "type": "essay",
            "content": "Hãy viết về một lần bạn vượt qua sự lười biếng hoặc cám dỗ để hoàn thành mục tiêu.",
            "default_points": "5.00",
            "rubrics": [
                {
                    "criterion_name": "Ý thức tự nhận thức & Nghị lực vươn lên",
                    "description": "Nhìn nhận trung thực khuyết điểm và ý chí kiên định",
                    "max_points": "5.00",
                    "level_descriptors": {"gioi": 5, "kha": 3}
                }
            ]
        }, headers=t_headers)
        q3_id = q3_res.json()["id"]

        # Step 3: Teacher creates Exam (total 10.00 pts), publishes and assigns
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Kỳ Thi Tốt Nghiệp Chuyên Đề 3 Gốc 3 Độc",
            "duration_minutes": 45,
            "total_score": "10.00",
            "questions": [
                {"question_id": q1_id, "points": "2.00", "order_index": 0},
                {"question_id": q2_id, "points": "3.00", "order_index": 1},
                {"question_id": q3_id, "points": "5.00", "order_index": 2}
            ]
        }, headers=t_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=t_headers)

        now = datetime.now(timezone.utc)
        asg_res = await ac.post("/api/v1/exams/assignments", json={
            "exam_id": exam_id,
            "class_id": class_id,
            "open_at": (now - timedelta(minutes=10)).isoformat(),
            "close_at": (now + timedelta(hours=3)).isoformat(),
            "max_attempts": 1
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # Step 4: Student registers, enrolls and begins exam
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_sys@example.com",
            "password": "Password123!",
            "full_name": "Học Viên Minh Đức",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)
        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        attempt_id = start_res.json()["attempt_id"]
        questions = start_res.json()["questions"]

        # Step 5: Student answers questions (Q1: single choice, Q2: multi-select, Q3: essay)
        q1_obj = next(q for q in questions if q["type"] == "single_choice")
        q1_correct = [o["id"] for o in q1_obj["options"] if "vị tha" in o["content"]]
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q1_obj["exam_question_id"],
            "selected_option_ids": q1_correct,
            "client_version": 1
        }, headers=s_headers)

        q2_obj = next(q for q in questions if q["type"] == "multiple_select")
        q2_correct = [o["id"] for o in q2_obj["options"] if o["content"] in ["Tham lam ích kỷ", "Sân hận giận dữ", "Si mê tăm tối"]]
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q2_obj["exam_question_id"],
            "selected_option_ids": q2_correct,
            "client_version": 1
        }, headers=s_headers)

        q3_obj = next(q for q in questions if q["type"] == "essay")
        essay_content = (
            "Có những buổi sáng trời lạnh em rất muốn ngủ tiếp thay vì thức dậy học bài. "
            "Nhưng em tự nhắc nhở bản thân rằng sự kiên trì hôm nay sẽ kiến tạo tương lai. "
            "Em đã bật dậy, tập thể dục và hoàn thành bài vở đúng kế hoạch."
        )
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q3_obj["exam_question_id"],
            "text_response": essay_content,
            "client_version": 1
        }, headers=s_headers)

        # Step 6: Submit exam
        sub_res = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_res.status_code == 200
        # Objective scored immediately: 2.00 (Q1) + 3.00 (Q2) = 5.00
        assert Decimal(str(sub_res.json()["objective_score"])) == Decimal("5.00")
        assert sub_res.json()["status"] == "grading"

        # Wait for background AI evaluation task
        await asyncio.sleep(0.5)

        # Step 7: Teacher reviews essay, inspects AI 3 Roots - 3 Poisons, adjusts score
        rev_res = await ac.get(f"/api/v1/teacher/attempts/{attempt_id}/review", headers=t_headers)
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert rev_data["status"] == "pending_review"
        essay_detail = rev_data["essay_details"][0]
        
        # Verify AI 3 Roots - 3 Poisons feedback
        ai_data = essay_detail["ai_analysis"]
        assert "nghi_luc" in ai_data["three_roots"]
        assert "tham" in ai_data["three_poisons"]
        assert len(ai_data["rubric_evaluations"]) == 1

        gr_id = essay_detail["grading_result"]["id"]
        gr_version = essay_detail["grading_result"]["version"]

        # Teacher adjusts essay score to 4.50 pts
        ovr_res = await ac.put(f"/api/v1/teacher/grading-results/{gr_id}/override", json={
            "score": "4.50",
            "teacher_feedback": "Thầy rất khen ngợi tính tự kỷ luật và ý chí của em!",
            "reason": "Bài làm có liên hệ bản thân chân thật",
            "expected_version": gr_version
        }, headers=t_headers)
        assert ovr_res.status_code == 200

        # Teacher finalizes
        fin_res = await ac.post(f"/api/v1/teacher/attempts/{attempt_id}/finalize", headers=t_headers)
        assert fin_res.status_code == 200

        # Step 8: Student views final certified score and transformative advice
        res_res = await ac.get(f"/api/v1/student/attempts/{attempt_id}/results", headers=s_headers)
        assert res_res.status_code == 200
        res_data = res_res.json()
        assert res_data["is_published"] is True
        # Total = Objective 5.00 + Essay Final 4.50 = 9.50
        assert Decimal(str(res_data["final_score"])) == Decimal("9.50")
        assert "Thầy rất khen ngợi" in res_data["teacher_feedback"]
        assert "three_roots" in res_data["ai_feedback"]
        assert "transformative_advice" in res_data["ai_feedback"]
