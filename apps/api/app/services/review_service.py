from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.attempts import Attempt, AttemptStatus, Answer
from app.models.grading import GradingResult, GradeReview, AIAnalysis
from app.models.exams import Exam, ExamAssignment
from app.schemas.grading import (
    TeacherOverrideRequest,
    AttemptGradingOverview,
    EssayGradingDetail,
    GradingResultRead,
    GradeReviewRead,
    StudentResultResponse
)


class ReviewService:
    @staticmethod
    async def list_teacher_attempts(
        db: AsyncSession,
        teacher_id: str
    ) -> List[dict]:
        query = (
            select(Attempt)
            .join(Attempt.assignment)
            .join(ExamAssignment.exam)
            .where(Exam.created_by == teacher_id)
            .options(
                selectinload(Attempt.student),
                selectinload(Attempt.assignment).selectinload(ExamAssignment.exam),
                selectinload(Attempt.assignment).selectinload(ExamAssignment.class_obj),
            )
            .order_by(Attempt.started_at.desc())
        )
        res = await db.execute(query)
        attempts = res.scalars().all()
        return [
            {
                "id": att.id,
                "student_id": att.student_id,
                "student_name": att.student.full_name if att.student else "Học viên",
                "student_email": att.student.email if att.student else "",
                "exam_title": att.assignment.exam.title if att.assignment and att.assignment.exam else "Đề thi",
                "class_name": att.assignment.class_obj.name if att.assignment and att.assignment.class_obj else "Lớp học",
                "status": att.status,
                "started_at": att.started_at,
                "submitted_at": att.submitted_at,
                "objective_score": float(att.objective_score),
                "essay_score": float(att.essay_score),
                "final_score": float(att.final_score),
            }
            for att in attempts
        ]

    @staticmethod
    async def get_attempt_grading_overview(
        db: AsyncSession,
        attempt_id: str,
        teacher_id: str
    ) -> AttemptGradingOverview:
        # Load attempt with full student, exam, answers, question, rubrics, grading_results & ai_analyses
        query = select(Attempt).where(Attempt.id == attempt_id).options(
            selectinload(Attempt.student),
            selectinload(Attempt.assignment).selectinload(ExamAssignment.exam),
            selectinload(Attempt.answers).selectinload(Answer.exam_question),
            selectinload(Attempt.answers).selectinload(Answer.grading_result).selectinload(GradingResult.reviews).selectinload(GradeReview.reviewer),
            selectinload(Attempt.answers).selectinload(Answer.ai_analyses)
        )
        res = await db.execute(query)
        attempt = res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        # Collect essay details
        essay_details = []
        for ans in attempt.answers:
            eq = ans.exam_question
            if eq.frozen_question_data.get("type") == "essay":
                gr = ans.grading_result
                gr_read = None
                if gr:
                    reviews_read = [
                        GradeReviewRead(
                            id=r.id,
                            reviewer_id=r.reviewer_id,
                            reviewer_name=r.reviewer.full_name if r.reviewer else None,
                            previous_score=r.previous_score,
                            new_score=r.new_score,
                            reason=r.reason,
                            changed_at=r.changed_at
                        )
                        for r in gr.reviews
                    ]
                    gr_read = GradingResultRead(
                        id=gr.id,
                        answer_id=gr.answer_id,
                        score=gr.score,
                        auto_graded_score=gr.auto_graded_score,
                        ai_suggested_score=gr.ai_suggested_score,
                        teacher_final_score=gr.teacher_final_score,
                        teacher_feedback=gr.teacher_feedback,
                        graded_by=gr.graded_by,
                        finalized_at=gr.finalized_at,
                        version=gr.version,
                        reviews=reviews_read
                    )

                latest_ai = ans.ai_analyses[0] if ans.ai_analyses else None
                ai_dict = None
                if latest_ai:
                    ai_dict = {
                        "job_version": latest_ai.job_version,
                        "model_provider": latest_ai.model_provider,
                        "three_roots": latest_ai.three_roots_analysis,
                        "three_poisons": latest_ai.three_poisons_analysis,
                        "feedback": latest_ai.pedagogical_feedback,
                        "rubric_evaluations": latest_ai.rubric_evaluations,
                        "proposed_total_score": float(latest_ai.proposed_total_score),
                        "confidence_score": latest_ai.confidence_score,
                        "requires_manual_audit": latest_ai.requires_manual_audit,
                        "audit_reason": latest_ai.audit_reason
                    }

                essay_details.append(EssayGradingDetail(
                    answer_id=ans.id,
                    question_content=eq.frozen_question_data.get("content", ""),
                    points=eq.points,
                    student_response=ans.text_response,
                    rubrics=eq.frozen_rubric_data,
                    grading_result=gr_read,
                    ai_analysis=ai_dict
                ))

        return AttemptGradingOverview(
            attempt_id=attempt.id,
            student_id=attempt.student_id,
            student_name=attempt.student.full_name,
            student_email=attempt.student.email,
            exam_title=attempt.assignment.exam.title,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            objective_score=attempt.objective_score,
            essay_score=attempt.essay_score,
            final_score=attempt.final_score,
            essay_details=essay_details
        )

    @staticmethod
    async def override_grade(
        db: AsyncSession,
        grading_result_id: str,
        teacher_id: str,
        data: TeacherOverrideRequest
    ) -> GradingResult:
        query = select(GradingResult).where(GradingResult.id == grading_result_id).options(
            selectinload(GradingResult.answer).selectinload(Answer.attempt),
            selectinload(GradingResult.answer).selectinload(Answer.exam_question)
        )
        res = await db.execute(query)
        gr = res.scalar_one_or_none()
        if not gr:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grading result not found")

        # Optimistic concurrency check
        if gr.version != data.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Dữ liệu đã được cập nhật bởi phiên khác (Current version: {gr.version}, Expected: {data.expected_version})"
            )

        # Check score upper limit and lower limit
        eq_max_points = gr.answer.exam_question.points
        if data.score > eq_max_points:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Điểm số ({data.score}) không được vượt quá điểm tối đa ({eq_max_points})"
            )
        if data.score < Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Điểm số câu tự luận tối thiểu là 0.00 điểm"
            )

        prev_score = gr.teacher_final_score

        # Create audit review entry
        review = GradeReview(
            grading_result_id=gr.id,
            reviewer_id=teacher_id,
            previous_score=prev_score,
            new_score=data.score,
            reason=data.reason,
            changed_at=datetime.now(timezone.utc)
        )
        db.add(review)

        # Update GradingResult
        gr.teacher_final_score = data.score
        gr.score = data.score
        gr.teacher_feedback = data.teacher_feedback or ""
        gr.graded_by = teacher_id
        gr.version += 1
        gr.finalized_at = datetime.now(timezone.utc)

        # Re-calculate Attempt essay and final scores
        att_id = gr.answer.attempt_id
        attempt_query = select(Attempt).where(Attempt.id == att_id).options(
            selectinload(Attempt.answers).selectinload(Answer.grading_result),
            selectinload(Attempt.answers).selectinload(Answer.exam_question)
        )
        att_res = await db.execute(attempt_query)
        attempt = att_res.scalar_one()

        total_essay = Decimal("0.00")
        for a in attempt.answers:
            if a.exam_question.frozen_question_data.get("type") == "essay" and a.grading_result:
                total_essay += max(Decimal("0.00"), a.grading_result.teacher_final_score)

        attempt.essay_score = max(Decimal("0.00"), total_essay)
        attempt.final_score = max(Decimal("0.00"), attempt.objective_score + total_essay)

        await db.commit()
        await db.refresh(gr)
        return gr

    @staticmethod
    async def finalize_attempt(
        db: AsyncSession,
        attempt_id: str,
        teacher_id: str
    ) -> Attempt:
        query = select(Attempt).where(Attempt.id == attempt_id)
        res = await db.execute(query)
        attempt = res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        attempt.status = AttemptStatus.FINALIZED.value
        await db.commit()
        await db.refresh(attempt)
        return attempt

    @staticmethod
    async def get_student_result(
        db: AsyncSession,
        attempt_id: str,
        student_id: str
    ) -> StudentResultResponse:
        query = select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id
        ).options(
            selectinload(Attempt.assignment).selectinload(ExamAssignment.exam),
            selectinload(Attempt.answers).selectinload(Answer.grading_result).selectinload(GradingResult.reviews),
            selectinload(Attempt.answers).selectinload(Answer.ai_analyses)
        )
        res = await db.execute(query)
        attempt = res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        is_published = attempt.status in [AttemptStatus.FINALIZED.value, AttemptStatus.PENDING_REVIEW.value]
        if not is_published:
            # Mask sensitive points until finalized or AI evaluation completed
            return StudentResultResponse(
                attempt_id=attempt.id,
                exam_title=attempt.assignment.exam.title,
                is_published=False,
                status=attempt.status,
                objective_score=None,
                essay_score=None,
                final_score=None,
                teacher_feedback=None,
                ai_feedback=None,
                ai_essay_score=None,
                is_teacher_reviewed=False,
                grade_source="ai"
            )

        # Aggregate teacher feedback and allowed AI feedback
        feedbacks = []
        ai_pedagogy = None
        total_ai_essay = Decimal("0.00")
        has_teacher_review = (attempt.status == AttemptStatus.FINALIZED.value)

        for a in attempt.answers:
            if a.grading_result:
                if a.grading_result.teacher_feedback:
                    feedbacks.append(a.grading_result.teacher_feedback)
                if a.grading_result.ai_suggested_score is not None:
                    total_ai_essay += a.grading_result.ai_suggested_score
                if a.grading_result.reviews and len(a.grading_result.reviews) > 0:
                    has_teacher_review = True
                if a.grading_result.graded_by is not None:
                    has_teacher_review = True

            if a.ai_analyses:
                latest = a.ai_analyses[0]
                ai_pedagogy = {
                    "three_roots": latest.three_roots_analysis,
                    "three_poisons": latest.three_poisons_analysis,
                    "overall_reflection": latest.pedagogical_feedback.get("overall_reflection") if isinstance(latest.pedagogical_feedback, dict) else None,
                    "transformative_advice": latest.pedagogical_feedback.get("transformative_advice") if isinstance(latest.pedagogical_feedback, dict) else None,
                    "practical_action_plan": latest.pedagogical_feedback.get("practical_action_plan") if isinstance(latest.pedagogical_feedback, dict) else None
                }

        combined_feedback = "\n".join(feedbacks) if feedbacks else ("Đã được giáo viên duyệt" if has_teacher_review else "")

        return StudentResultResponse(
            attempt_id=attempt.id,
            exam_title=attempt.assignment.exam.title,
            is_published=True,
            status=attempt.status,
            objective_score=attempt.objective_score,
            essay_score=attempt.essay_score,
            final_score=attempt.final_score,
            teacher_feedback=combined_feedback if combined_feedback else None,
            ai_feedback=ai_pedagogy,
            ai_essay_score=total_ai_essay,
            is_teacher_reviewed=has_teacher_review,
            grade_source="teacher" if has_teacher_review else "ai"
        )
