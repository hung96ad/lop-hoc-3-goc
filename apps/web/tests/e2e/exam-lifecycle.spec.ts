import { test, expect } from "@playwright/test";

test.describe("EduAI Full Cycle Examination E2E", () => {
  const API_URL = "http://localhost:8000/api/v1";

  test("Should complete entire teacher-creation, student-taking, AI assessment, teacher review cycle", async ({ request }) => {
    // 1. Health check
    const healthRes = await request.get("http://localhost:8000/health");
    expect(healthRes.ok()).toBeTruthy();
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe("healthy");

    // 2. Register Teacher & Create Class
    const teacherEmail = `teacher_e2e_${Date.now()}@example.com`;
    const tReg = await request.post(`${API_URL}/auth/register`, {
      data: {
        email: teacherEmail,
        password: "Password123!",
        full_name: "Thầy Giáo E2E",
        role: "teacher"
      }
    });
    expect(tReg.ok()).toBeTruthy();
    const { access_token: teacherToken } = await tReg.json();
    const tHeaders = { Authorization: `Bearer ${teacherToken}` };

    const classRes = await request.post(`${API_URL}/classes`, {
      headers: tHeaders,
      data: { name: "Lớp 12A1 Khảo Thí" }
    });
    expect(classRes.ok()).toBeTruthy();
    const { id: classId, code: classCode } = await classRes.json();

    // 3. Teacher creates 1 MCQ and 1 Essay Question with Rubrics
    const mcqRes = await request.post(`${API_URL}/questions`, {
      headers: tHeaders,
      data: {
        type: "single_choice",
        content: "Chọn khẳng định đúng về sự tự chủ:",
        default_points: "4.00",
        options: [
          { content: "Làm chủ cảm xúc và hành vi trước cám dỗ", is_correct: true, order_index: 0 },
          { content: "Hành động bốc đồng theo ý thích", is_correct: false, order_index: 1 }
        ]
      }
    });
    expect(mcqRes.ok()).toBeTruthy();
    const { id: mcqId } = await mcqRes.json();

    const essayRes = await request.post(`${API_URL}/questions`, {
      headers: tHeaders,
      data: {
        type: "essay",
        content: "Trình bày suy nghĩ về việc rèn luyện Nghị Lực trong học tập và cuộc sống.",
        default_points: "6.00",
        rubrics: [
          {
            criterion_name: "Biểu hiện Nghị Lực & Sự bền bỉ",
            description: "Dám đối diện thử thách, không bỏ cuộc",
            max_points: "6.00",
            level_descriptors: { "xuat_sac": 6, "dat": 4 }
          }
        ]
      }
    });
    expect(essayRes.ok()).toBeTruthy();
    const { id: essayId } = await essayRes.json();

    // 4. Create Exam, Publish & Assign
    const examRes = await request.post(`${API_URL}/exams`, {
      headers: tHeaders,
      data: {
        title: "Đề Thi Khảo Sát Phẩm Chất 3 Gốc",
        duration_minutes: 30,
        total_score: "10.00",
        questions: [
          { question_id: mcqId, points: "4.00", order_index: 0 },
          { question_id: essayId, points: "6.00", order_index: 1 }
        ]
      }
    });
    expect(examRes.ok()).toBeTruthy();
    const { id: examId } = await examRes.json();

    const pubRes = await request.post(`${API_URL}/exams/${examId}/publish`, { headers: tHeaders });
    expect(pubRes.ok()).toBeTruthy();

    const now = new Date();
    const closeAt = new Date(now.getTime() + 2 * 3600 * 1000);
    const openAt = new Date(now.getTime() - 5 * 60 * 1000);

    const asgRes = await request.post(`${API_URL}/exams/assignments`, {
      headers: tHeaders,
      data: {
        exam_id: examId,
        class_id: classId,
        open_at: openAt.toISOString(),
        close_at: closeAt.toISOString(),
        max_attempts: 1
      }
    });
    expect(asgRes.ok()).toBeTruthy();
    const { id: assignmentId } = await asgRes.json();

    // 5. Register Student, Enroll & Start Attempt
    const studentEmail = `student_e2e_${Date.now()}@example.com`;
    const sReg = await request.post(`${API_URL}/auth/register`, {
      data: {
        email: studentEmail,
        password: "Password123!",
        full_name: "Học Viên Tiên Tiến",
        role: "student"
      }
    });
    expect(sReg.ok()).toBeTruthy();
    const { access_token: studentToken } = await sReg.json();
    const sHeaders = { Authorization: `Bearer ${studentToken}` };

    const enrollRes = await request.post(`${API_URL}/classes/enroll`, {
      headers: sHeaders,
      data: { code: classCode }
    });
    expect(enrollRes.ok()).toBeTruthy();

    const startRes = await request.post(`${API_URL}/student/assignments/${assignmentId}/start`, {
      headers: sHeaders
    });
    expect(startRes.ok()).toBeTruthy();
    const { attempt_id: attemptId, questions } = await startRes.json();

    // 6. Student answers MCQ and Essay with autosave
    const mcqItem = questions.find((q: any) => q.type === "single_choice");
    const essayItem = questions.find((q: any) => q.type === "essay");

    const correctOpt = mcqItem.options.find((o: any) => o.content.includes("Làm chủ"));
    await request.put(`${API_URL}/student/attempts/${attemptId}/answers`, {
      headers: sHeaders,
      data: {
        exam_question_id: mcqItem.exam_question_id,
        selected_option_ids: [correctOpt.id],
        client_version: 1
      }
    });

    await request.put(`${API_URL}/student/attempts/${attemptId}/answers`, {
      headers: sHeaders,
      data: {
        exam_question_id: essayItem.exam_question_id,
        text_response: "Nghị lực là khả năng kiên trì vượt qua khó khăn để hướng tới mục tiêu tốt đẹp. Em luôn nhắc nhở bản thân không bỏ cuộc khi gặp bài toán khó.",
        client_version: 1
      }
    });

    // 7. Student Submits
    const submitRes = await request.post(`${API_URL}/student/attempts/${attemptId}/submit`, {
      headers: sHeaders
    });
    expect(submitRes.ok()).toBeTruthy();
    const submitJson = await submitRes.json();
    expect(submitJson.status).toBe("grading");

    // Wait 1s for background AI task
    await new Promise((r) => setTimeout(r, 1000));

    // 8. Teacher Reviews & Overrides Grade
    const reviewRes = await request.get(`${API_URL}/teacher/attempts/${attemptId}/review`, {
      headers: tHeaders
    });
    expect(reviewRes.ok()).toBeTruthy();
    const reviewData = await reviewRes.json();
    expect(reviewData.essay_details.length).toBe(1);

    const essayDetail = reviewData.essay_details[0];
    const grId = essayDetail.grading_result.id;
    const currentVersion = essayDetail.grading_result.version;

    // AI proposed score should be present
    expect(essayDetail.ai_analysis.proposed_total_score).toBeGreaterThan(0);
    expect(essayDetail.ai_analysis.three_roots.nghi_luc).toBeDefined();

    // Override score
    const overrideRes = await request.put(`${API_URL}/teacher/grading-results/${grId}/override`, {
      headers: tHeaders,
      data: {
        score: "5.50",
        teacher_feedback: "Bài viết mạch lạc, thể hiện tinh thần dấn thân tốt.",
        reason: "Học sinh hiểu đúng bản chất của nghị lực trong học đường",
        expected_version: currentVersion
      }
    });
    expect(overrideRes.ok()).toBeTruthy();

    // Finalize
    const finalizeRes = await request.post(`${API_URL}/teacher/attempts/${attemptId}/finalize`, {
      headers: tHeaders
    });
    expect(finalizeRes.ok()).toBeTruthy();

    // 9. Student checks published result
    const resultRes = await request.get(`${API_URL}/student/attempts/${attemptId}/results`, {
      headers: sHeaders
    });
    expect(resultRes.ok()).toBeTruthy();
    const finalData = await resultRes.json();
    expect(finalData.is_published).toBe(true);
    // MCQ (4.00) + Essay Final (5.50) = 9.50
    expect(Number(finalData.final_score)).toBe(9.5);
    expect(finalData.ai_feedback.three_roots).toBeDefined();
  });
});
