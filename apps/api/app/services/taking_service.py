from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List, Optional, Dict, Any
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.exams import Exam, ExamAssignment, ExamQuestion, ExamStatus
from app.models.attempts import Attempt, AttemptStatus, Answer
from app.models.classes import Enrollment
from app.models.grading import GradingResult
from app.models.questions import QuestionType
from app.schemas.attempt import AnswerSaveRequest, AttemptStartResponse, SubmitAttemptResponse
from app.services.grading_engine import ObjectiveGradingEngine
from app.core.queue import enqueue_job


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class ExamTakingService:
    @staticmethod
    async def get_student_assignments(db: AsyncSession, student_id: str) -> List[Dict[str, Any]]:
        # Find all classes student is enrolled in
        enr_query = select(Enrollment.class_id).where(Enrollment.student_id == student_id)
        res = await db.execute(enr_query)
        class_ids = res.scalars().all()
        if not class_ids:
            return []

        # Find assignments for these classes
        asg_query = select(ExamAssignment).where(
            ExamAssignment.class_id.in_(class_ids)
        ).options(
            selectinload(ExamAssignment.exam),
            selectinload(ExamAssignment.class_obj),
            selectinload(ExamAssignment.attempts)
        )
        asg_res = await db.execute(asg_query)
        assignments = asg_res.scalars().all()

        output = []
        now = datetime.now(timezone.utc)
        for a in assignments:
            # Check user attempts
            student_attempts = [att for att in a.attempts if att.student_id == student_id]
            active_attempt = next((att for att in student_attempts if att.status == AttemptStatus.IN_PROGRESS.value), None)
            
            open_at = _ensure_utc(a.open_at)
            close_at = _ensure_utc(a.close_at)
            
            output.append({
                "assignment_id": a.id,
                "exam_id": a.exam_id,
                "exam_title": a.exam.title,
                "class_name": a.class_obj.name,
                "duration_minutes": a.exam.duration_minutes,
                "total_score": float(a.exam.total_score),
                "open_at": open_at,
                "close_at": close_at,
                "max_attempts": a.max_attempts,
                "attempts_count": len(student_attempts),
                "can_start": (open_at <= now <= close_at) and (len(student_attempts) < a.max_attempts or active_attempt is not None),
                "active_attempt_id": active_attempt.id if active_attempt else None,
                "auto_publish_results": a.auto_publish_results,
                "attempts": [
                    {
                        "id": att.id,
                        "attempt_number": att.attempt_number,
                        "status": att.status,
                        "started_at": _ensure_utc(att.started_at),
                        "submitted_at": _ensure_utc(att.submitted_at),
                        "final_score": float(att.final_score) if att.status in ["finalized", "pending_review"] else None
                    }
                    for att in student_attempts
                ]
            })
        return output

    @staticmethod
    async def start_attempt(db: AsyncSession, assignment_id: str, student_id: str) -> AttemptStartResponse:
        # Load assignment and exam
        query = select(ExamAssignment).where(ExamAssignment.id == assignment_id).options(
            selectinload(ExamAssignment.exam).selectinload(Exam.questions)
        )
        res = await db.execute(query)
        assignment = res.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam assignment not found")

        now = datetime.now(timezone.utc)
        open_at = _ensure_utc(assignment.open_at)
        close_at = _ensure_utc(assignment.close_at)

        if now < open_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam is not yet open")
        if now > close_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam has already closed")

        # Check existing attempts
        att_query = select(Attempt).where(
            Attempt.exam_assignment_id == assignment_id,
            Attempt.student_id == student_id
        ).options(
            selectinload(Attempt.answers)
        ).order_by(Attempt.attempt_number.desc())
        att_res = await db.execute(att_query)
        attempts = att_res.scalars().all()

        # If there's an ongoing attempt and within deadline, return it
        for existing in attempts:
            if existing.status == AttemptStatus.IN_PROGRESS.value:
                deadline = _ensure_utc(existing.max_allowed_submit_at)
                if now <= deadline:
                    return await ExamTakingService._build_start_response(existing, assignment.exam)
                else:
                    # Timeout - auto finalize
                    existing.status = AttemptStatus.SUBMITTED.value
                    await db.commit()

        # Check maximum attempts allowed
        if len(attempts) >= assignment.max_attempts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum allowed attempts ({assignment.max_attempts}) reached"
            )

        # Create new attempt
        next_attempt_number = len(attempts) + 1
        duration_delta = timedelta(minutes=assignment.exam.duration_minutes)
        # Server authority on timeout (+ 30s network buffer)
        calculated_deadline = now + duration_delta + timedelta(seconds=30)
        max_allowed = min(calculated_deadline, close_at + timedelta(seconds=30))

        attempt = Attempt(
            exam_assignment_id=assignment.id,
            student_id=student_id,
            attempt_number=next_attempt_number,
            status=AttemptStatus.IN_PROGRESS.value,
            started_at=now,
            max_allowed_submit_at=max_allowed,
            objective_score=Decimal("0.00"),
            essay_score=Decimal("0.00"),
            final_score=Decimal("0.00"),
            version=1
        )
        db.add(attempt)
        await db.commit()

        # Re-fetch with selectinload(Attempt.answers)
        reloaded_query = select(Attempt).where(Attempt.id == attempt.id).options(
            selectinload(Attempt.answers)
        )
        reloaded_res = await db.execute(reloaded_query)
        reloaded_attempt = reloaded_res.scalar_one()

        return await ExamTakingService._build_start_response(reloaded_attempt, assignment.exam)

    @staticmethod
    async def _build_start_response(attempt: Attempt, exam: Exam) -> AttemptStartResponse:
        # Strip correct answers and internal rubrics before sending to student
        sanitized_questions = []
        for q in exam.questions:
            orig = q.frozen_question_data
            options = []
            for opt in orig.get("options", []):
                options.append({
                    "id": opt["id"],
                    "content": opt["content"],
                    "order_index": opt.get("order_index", 0)
                })
            
            sanitized_questions.append({
                "exam_question_id": q.id,
                "order_index": q.order_index,
                "points": float(q.points),
                "type": orig.get("type"),
                "content": orig.get("content"),
                "options": options
            })

        answers_list = [
            {
                "id": a.id,
                "exam_question_id": a.exam_question_id,
                "selected_option_ids": a.selected_option_ids,
                "text_response": a.text_response,
                "last_saved_at": a.last_saved_at,
                "client_version": a.client_version
            }
            for a in getattr(attempt, "answers", [])
        ]

        return AttemptStartResponse(
            attempt_id=attempt.id,
            exam_assignment_id=attempt.exam_assignment_id,
            attempt_number=attempt.attempt_number,
            status=attempt.status,
            started_at=attempt.started_at,
            max_allowed_submit_at=attempt.max_allowed_submit_at,
            duration_minutes=exam.duration_minutes,
            exam_title=exam.title,
            questions=sanitized_questions,
            answers=answers_list
        )

    @staticmethod
    async def save_answer(db: AsyncSession, attempt_id: str, student_id: str, data: AnswerSaveRequest):
        # Verify attempt exists, belongs to student and is in_progress
        att_query = select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id
        )
        res = await db.execute(att_query)
        attempt = res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        
        if attempt.status != AttemptStatus.IN_PROGRESS.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already completed")

        now = datetime.now(timezone.utc)
        deadline = _ensure_utc(attempt.max_allowed_submit_at)
        if deadline and now > deadline:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt time expired")

        # Atomic upsert — avoids race-condition IntegrityError on concurrent clicks
        stmt = pg_insert(Answer).values(
            id=str(uuid.uuid4()),
            attempt_id=attempt_id,
            exam_question_id=data.exam_question_id,
            selected_option_ids=data.selected_option_ids,
            text_response=data.text_response,
            last_saved_at=now,
            client_version=data.client_version,
        ).on_conflict_do_update(
            index_elements=["attempt_id", "exam_question_id"],
            set_=dict(
                selected_option_ids=data.selected_option_ids,
                text_response=data.text_response,
                last_saved_at=now,
                client_version=data.client_version,
            ),
            where=Answer.__table__.c.client_version <= data.client_version,
        )
        await db.execute(stmt)

        await db.commit()
        return {"status": "saved", "last_saved_at": now}

    @staticmethod
    async def submit_attempt(db: AsyncSession, attempt_id: str, student_id: str) -> SubmitAttemptResponse:
        att_query = select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id
        ).options(
            selectinload(Attempt.assignment).selectinload(ExamAssignment.exam).selectinload(Exam.questions),
            selectinload(Attempt.answers)
        )
        res = await db.execute(att_query)
        attempt = res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        # Idempotent submit
        if attempt.status != AttemptStatus.IN_PROGRESS.value:
            return SubmitAttemptResponse(
                attempt_id=attempt.id,
                status=attempt.status,
                submitted_at=attempt.submitted_at or datetime.now(timezone.utc),
                objective_score=attempt.objective_score,
                is_fully_graded=(attempt.status == AttemptStatus.FINALIZED.value),
                message="Attempt was already submitted"
            )

        now = datetime.now(timezone.utc)
        attempt.submitted_at = now

        exam = attempt.assignment.exam
        answers_by_qid = {a.exam_question_id: a for a in attempt.answers}

        total_objective = Decimal("0.00")
        has_essay = False
        essay_answer_ids = []

        for eq in exam.questions:
            q_type = eq.frozen_question_data.get("type")
            student_ans = answers_by_qid.get(eq.id)

            if q_type in [QuestionType.SINGLE_CHOICE.value, QuestionType.MULTIPLE_SELECT.value]:
                selected = student_ans.selected_option_ids if student_ans else []
                pts = ObjectiveGradingEngine.grade_answer(
                    question_type=q_type,
                    points=eq.points,
                    frozen_question_data=eq.frozen_question_data,
                    selected_option_ids=selected
                )
                total_objective += pts

                # Record grading result if answer exists
                if student_ans:
                    gr = GradingResult(
                        answer_id=student_ans.id,
                        score=pts,
                        auto_graded_score=pts,
                        ai_suggested_score=Decimal("0.00"),
                        teacher_final_score=pts,
                        finalized_at=now,
                        version=1
                    )
                    db.add(gr)

            elif q_type == QuestionType.ESSAY.value:
                has_essay = True
                if student_ans:
                    essay_answer_ids.append(student_ans.id)
                    # Init grading result for essay
                    gr = GradingResult(
                        answer_id=student_ans.id,
                        score=Decimal("0.00"),
                        auto_graded_score=Decimal("0.00"),
                        ai_suggested_score=Decimal("0.00"),
                        teacher_final_score=Decimal("0.00"),
                        teacher_feedback="",
                        version=1
                    )
                    db.add(gr)

        attempt.objective_score = total_objective
        attempt.final_score = total_objective

        if not has_essay:
            # 100% objective questions -> Can finalize immediately and auto-publish
            attempt.status = AttemptStatus.FINALIZED.value
            await db.commit()
            return SubmitAttemptResponse(
                attempt_id=attempt.id,
                status=attempt.status,
                submitted_at=now,
                objective_score=total_objective,
                is_fully_graded=True,
                message="Đã tự động chấm điểm và công bố kết quả."
            )
        else:
            # Contains essay questions -> Move to GRADING and dispatch AI background task
            attempt.status = AttemptStatus.GRADING.value
            await db.commit()

            # Trigger AI worker background evaluation for each essay answer
            for ans_id in essay_answer_ids:
                await enqueue_job("evaluate_essay_answer", answer_id=ans_id)

            if not essay_answer_ids:
                await db.refresh(attempt)
                attempt.status = AttemptStatus.FINALIZED.value
                await db.commit()
                return SubmitAttemptResponse(
                    attempt_id=attempt.id,
                    status=attempt.status,
                    submitted_at=now,
                    objective_score=total_objective,
                    is_fully_graded=True,
                    message="Đã tự động chấm điểm và công bố kết quả."
                )

            return SubmitAttemptResponse(
                attempt_id=attempt.id,
                status=attempt.status,
                submitted_at=now,
                objective_score=total_objective,
                is_fully_graded=False,
                message="Bài thi đã được nộp. Hệ thống AI đang tự động chấm điểm tự luận và sẽ công bố kết quả ngay khi hoàn tất."
            )
