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
async def test_full_taking_and_objective_grading_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register Teacher & Create Class
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_take@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao Taking",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop 12A"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # 2. Teacher creates 2 MCQ questions
        q1_res = await ac.post("/api/v1/questions", json={
            "type": "single_choice",
            "content": "1 + 1 bằng mấy?",
            "default_points": "5.00",
            "options": [
                {"content": "2", "is_correct": True, "order_index": 0},
                {"content": "3", "is_correct": False, "order_index": 1}
            ]
        }, headers=t_headers)
        q1_id = q1_res.json()["id"]

        q2_res = await ac.post("/api/v1/questions", json={
            "type": "multiple_select",
            "content": "Chọn các số chẵn:",
            "default_points": "5.00",
            "options": [
                {"content": "2", "is_correct": True, "order_index": 0},
                {"content": "4", "is_correct": True, "order_index": 1},
                {"content": "5", "is_correct": False, "order_index": 2}
            ]
        }, headers=t_headers)
        q2_id = q2_res.json()["id"]

        # 3. Create Exam & Publish
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Kiểm tra Toán Logic",
            "duration_minutes": 20,
            "total_score": "10.00",
            "questions": [
                {"question_id": q1_id, "points": "5.00", "order_index": 0},
                {"question_id": q2_id, "points": "5.00", "order_index": 1}
            ]
        }, headers=t_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=t_headers)

        # 4. Assign exam to class
        now = datetime.now(timezone.utc)
        asg_res = await ac.post("/api/v1/exams/assignments", json={
            "exam_id": exam_id,
            "class_id": class_id,
            "open_at": (now - timedelta(minutes=5)).isoformat(),
            "close_at": (now + timedelta(hours=2)).isoformat(),
            "max_attempts": 2,
            "auto_publish_results": True
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # 5. Register Student & Enroll
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_take@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh Logic",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)

        # 6. Student views assignments
        asg_list_res = await ac.get("/api/v1/student/assignments", headers=s_headers)
        assert asg_list_res.status_code == 200
        assert len(asg_list_res.json()) == 1

        # 7. Student starts attempt
        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        assert start_res.status_code == 200
        attempt_data = start_res.json()
        attempt_id = attempt_data["attempt_id"]
        questions = attempt_data["questions"]
        assert len(questions) == 2

        # 8. Student answers Q1 (Correct: option '2') and Q2 (Correct: '2' and '4')
        q1_obj = questions[0]
        q1_opt_correct = [o["id"] for o in q1_obj["options"] if o["content"] == "2"]

        save_res1 = await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q1_obj["exam_question_id"],
            "selected_option_ids": q1_opt_correct,
            "client_version": 1
        }, headers=s_headers)
        assert save_res1.status_code == 200

        q2_obj = questions[1]
        q2_opt_correct = [o["id"] for o in q2_obj["options"] if o["content"] in ["2", "4"]]
        save_res2 = await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q2_obj["exam_question_id"],
            "selected_option_ids": q2_opt_correct,
            "client_version": 1
        }, headers=s_headers)
        assert save_res2.status_code == 200

        # 9. Submit Attempt
        sub_res = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_res.status_code == 200
        sub_data = sub_res.json()
        assert sub_data["status"] == "finalized"
        assert Decimal(str(sub_data["objective_score"])) == Decimal("10.00")
        assert sub_data["is_fully_graded"] is True
