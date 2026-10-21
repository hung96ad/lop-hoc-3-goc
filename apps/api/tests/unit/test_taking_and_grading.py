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
        q1_obj = next(q for q in questions if "1 + 1" in q["content"])
        q1_opt_correct = [o["id"] for o in q1_obj["options"] if o["content"] == "2"]

        save_res1 = await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q1_obj["exam_question_id"],
            "selected_option_ids": q1_opt_correct,
            "client_version": 1
        }, headers=s_headers)
        assert save_res1.status_code == 200

        q2_obj = next(q for q in questions if "số chẵn" in q["content"])
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


@pytest.mark.asyncio
async def test_chatbot_guest_entry_and_instant_grading_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Teacher creates Class and Exam
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_bot@example.com",
            "password": "Password123!",
            "full_name": "Thầy Giáo Khảo Thí",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lớp Chánh Kiến Online"}, headers=t_headers)
        class_id = c_res.json()["id"]

        q_res = await ac.post("/api/v1/questions", json={
            "type": "single_choice",
            "content": "3 Gốc bao gồm những yếu tố nào?",
            "default_points": "10.00",
            "options": [
                {"content": "Đạo đức - Trí tuệ - Nghị lực", "is_correct": True, "order_index": 0},
                {"content": "Tham - Sân - Si", "is_correct": False, "order_index": 1}
            ]
        }, headers=t_headers)
        q_id = q_res.json()["id"]

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Khảo Sát Đầu Giờ 3 Gốc",
            "duration_minutes": 15,
            "total_score": "10.00",
            "questions": [{"question_id": q_id, "points": "10.00", "order_index": 0}]
        }, headers=t_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=t_headers)

        now = datetime.now(timezone.utc)
        await ac.post("/api/v1/exams/assignments", json={
            "exam_id": exam_id,
            "class_id": class_id,
            "open_at": (now - timedelta(minutes=5)).isoformat(),
            "close_at": (now + timedelta(hours=2)).isoformat(),
            "max_attempts": 2,
            "auto_publish_results": True
        }, headers=t_headers)

        # 2. Guest checks public classes (no login required)
        public_classes_res = await ac.get("/api/v1/classes/public")
        assert public_classes_res.status_code == 200
        classes = public_classes_res.json()
        assert any(c["id"] == class_id for c in classes)

        # 3. Guest enters via Chatbot entry (name, phone, class_id - no code required)
        guest_res = await ac.post("/api/v1/auth/guest-entry", json={
            "full_name": "Học Viên Vãng Lai",
            "phone": "0987654321",
            "class_id": class_id
        })
        assert guest_res.status_code == 200
        guest_data = guest_res.json()
        assert guest_data["full_name"] == "Học Viên Vãng Lai"
        assignment_id = guest_data["assignment_id"]
        guest_headers = {"Authorization": f"Bearer {guest_data['access_token']}"}

        # 4. Start exam
        start_res = await ac.post(f"/api/v1/student/assignments/{assignment_id}/start", headers=guest_headers)
        assert start_res.status_code == 200
        attempt_id = start_res.json()["attempt_id"]
        q_item = start_res.json()["questions"][0]
        correct_opt = [o["id"] for o in q_item["options"] if "Đạo đức" in o["content"]]

        # 5. Answer question
        ans_res = await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": q_item["exam_question_id"],
            "selected_option_ids": correct_opt,
            "client_version": 1
        }, headers=guest_headers)
        assert ans_res.status_code == 200

        # 6. Submit exam
        sub_res = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=guest_headers)
        assert sub_res.status_code == 200
        assert sub_res.json()["is_fully_graded"] is True

        # 7. Check instant AI result
        res_check = await ac.get(f"/api/v1/student/attempts/{attempt_id}/results", headers=guest_headers)
        assert res_check.status_code == 200
        assert Decimal(str(res_check.json()["final_score"])) == Decimal("10.00")


@pytest.mark.asyncio
async def test_questions_shuffled_each_attempt():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Teacher setup
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_shuffle@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao Shuffle",
            "role": "teacher"
        })
        t_headers = {"Authorization": f"Bearer {t_res.json()['access_token']}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop Xao Tron"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        # Create 5 distinct questions
        q_ids = []
        for i in range(5):
            q_res = await ac.post("/api/v1/questions", json={
                "type": "single_choice",
                "content": f"Câu hỏi kiểm tra số {i + 1}?",
                "default_points": "2.00",
                "options": [
                    {"content": f"Đáp án đúng {i + 1}", "is_correct": True, "order_index": 0},
                    {"content": f"Đáp án sai {i + 1}", "is_correct": False, "order_index": 1}
                ]
            }, headers=t_headers)
            q_ids.append(q_res.json()["id"])

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Bai Tap Tron Cau Hoi",
            "duration_minutes": 30,
            "total_score": "10.00",
            "questions": [{"question_id": qid, "points": "2.00", "order_index": idx} for idx, qid in enumerate(q_ids)]
        }, headers=t_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=t_headers)

        now = datetime.now(timezone.utc)
        asg_res = await ac.post("/api/v1/exams/assignments", json={
            "exam_id": exam_id,
            "class_id": class_id,
            "open_at": (now - timedelta(minutes=5)).isoformat(),
            "close_at": (now + timedelta(hours=2)).isoformat(),
            "max_attempts": 3
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # Student 1
        s1_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_s1@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh 1",
            "role": "student"
        })
        s1_headers = {"Authorization": f"Bearer {s1_res.json()['access_token']}"}
        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s1_headers)

        # Student 2
        s2_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_s2@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh 2",
            "role": "student"
        })
        s2_headers = {"Authorization": f"Bearer {s2_res.json()['access_token']}"}
        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s2_headers)

        # Attempt 1
        att1_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s1_headers)
        assert att1_res.status_code == 200
        order1 = [q["content"] for q in att1_res.json()["questions"]]
        assert len(order1) == 5

        # Attempt 2
        att2_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s2_headers)
        assert att2_res.status_code == 200
        order2 = [q["content"] for q in att2_res.json()["questions"]]
        assert len(order2) == 5

        # Reloading ongoing attempt should preserve its deterministic order
        att1_reload = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s1_headers)
        assert [q["content"] for q in att1_reload.json()["questions"]] == order1


@pytest.mark.asyncio
async def test_essay_gibberish_validation_rejects_and_forces_reentry():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Teacher creates class & essay question
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_essay_val@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao Van",
            "role": "teacher"
        })
        t_headers = {"Authorization": f"Bearer {t_res.json()['access_token']}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop Dao Duc"}, headers=t_headers)
        class_id = c_res.json()["id"]
        class_code = c_res.json()["code"]

        q_res = await ac.post("/api/v1/questions", json={
            "type": "essay",
            "content": "Hãy phân tích tầm quan trọng của tính trung thực trong cuộc sống.",
            "default_points": "10.00",
            "rubrics": [
                {
                    "criterion_name": "Sự trung thực & Đạo đức",
                    "description": "Nhận thức rõ giá trị của sự thật và lòng chính trực",
                    "max_points": "10.00",
                    "level_descriptors": {"tot": 10}
                }
            ]
        }, headers=t_headers)
        q_id = q_res.json()["id"]

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Khao Sat Tu Luan",
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
            "max_attempts": 2
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # Student registers & starts attempt
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_essay_val@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh Test",
            "role": "student"
        })
        s_headers = {"Authorization": f"Bearer {s_res.json()['access_token']}"}
        await ac.post("/api/v1/classes/enroll", json={"code": class_code}, headers=s_headers)

        start_res = await ac.post(f"/api/v1/student/assignments/{asg_id}/start", headers=s_headers)
        attempt_id = start_res.json()["attempt_id"]
        eq_id = start_res.json()["questions"][0]["exam_question_id"]

        # 1. Submitting without answering essay -> 400 Bad Request
        sub_fail1 = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_fail1.status_code == 400
        assert "chưa có câu trả lời hợp lệ" in sub_fail1.json()["detail"] or "nhập lại" in sub_fail1.json()["detail"]

        # 2. Saving gibberish answer (e.g. keyboard spam) and submitting -> 400 Bad Request
        gibberish_samples = [
            "asdfghjkl zxcvbnm",
            "aaaaaaaaaaaaaaaaaaaa",
            "hahahahahahahahaha",
            "chịu thôi thầy ơi câu này em không biết làm",
            "bla bla bla bla bla bla"
        ]
        for g_text in gibberish_samples:
            await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
                "exam_question_id": eq_id,
                "text_response": g_text,
                "client_version": 2
            }, headers=s_headers)

            sub_fail = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
            assert sub_fail.status_code == 400
            assert "nhập lại" in sub_fail.json()["detail"]

        # 3. Student re-enters a genuine, thoughtful essay response -> 200 OK
        valid_essay = (
            "Trung thực là phẩm chất cốt lõi giúp con người xây dựng niềm tin và sự tôn trọng "
            "trong các mối quan hệ xã hội. Khi ta sống chân thành, tâm trí sẽ luôn an yên và không phải lo sợ."
        )
        await ac.put(f"/api/v1/student/attempts/{attempt_id}/answers", json={
            "exam_question_id": eq_id,
            "text_response": valid_essay,
            "client_version": 3
        }, headers=s_headers)

        sub_success = await ac.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_success.status_code == 200
        assert sub_success.json()["status"] == "grading"


@pytest.mark.asyncio
async def test_logged_in_student_enter_class_exam():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Teacher creates class & exam assignment
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher_enter@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao Enter",
            "role": "teacher"
        })
        t_headers = {"Authorization": f"Bearer {t_res.json()['access_token']}"}

        c_res = await ac.post("/api/v1/classes", json={"name": "Lop 11B"}, headers=t_headers)
        class_id = c_res.json()["id"]

        q_res = await ac.post("/api/v1/questions", json={
            "type": "single_choice",
            "content": "3 Gốc bao gồm những yếu tố nào?",
            "default_points": "10.00",
            "options": [
                {"content": "Đạo đức - Trí tuệ - Nghị lực", "is_correct": True, "order_index": 0},
                {"content": "Tham - Sân - Si", "is_correct": False, "order_index": 1}
            ]
        }, headers=t_headers)
        q_id = q_res.json()["id"]

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Bai Thi 3 Goc",
            "duration_minutes": 15,
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
            "max_attempts": 2
        }, headers=t_headers)
        asg_id = asg_res.json()["id"]

        # Logged-in student (not enrolled yet)
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student_logged_in@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh Logged In",
            "role": "student"
        })
        s_headers = {"Authorization": f"Bearer {s_res.json()['access_token']}"}

        # Enter class exam directly via POST /api/v1/student/classes/{class_id}/enter
        enter_res = await ac.post(f"/api/v1/student/classes/{class_id}/enter", headers=s_headers)
        assert enter_res.status_code == 200
        data = enter_res.json()
        assert data["assignment_id"] == asg_id
        assert data["class_id"] == class_id

        # Student can start attempt directly
        start_res = await ac.post(f"/api/v1/student/assignments/{data['assignment_id']}/start", headers=s_headers)
        assert start_res.status_code == 200
        assert start_res.json()["exam_title"] == "Bai Thi 3 Goc"
