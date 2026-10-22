from decimal import Decimal
import math
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.exams import Exam, ExamStatus, ExamQuestion, ExamAssignment
from app.models.questions import Question
from app.schemas.exam import ExamCreate, ExamUpdate, ExamAssignmentCreate


class ExamService:
    @staticmethod
    async def list_exams(db: AsyncSession, user_id: str, page: int = 1, page_size: int = 10) -> dict:
        base_query = select(Exam).where(Exam.created_by == user_id)

        count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
        total = count_result.scalar() or 0

        offset = (page - 1) * page_size
        query = base_query.options(
            selectinload(Exam.questions)
        ).order_by(Exam.created_at.desc()).offset(offset).limit(page_size)

        result = await db.execute(query)
        items = list(result.scalars().all())

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": math.ceil(total / page_size) if total > 0 else 1,
        }

    @staticmethod
    async def get_exam(db: AsyncSession, exam_id: str, user_id: Optional[str] = None) -> Exam:
        query = select(Exam).where(Exam.id == exam_id).options(
            selectinload(Exam.questions)
        )
        if user_id:
            query = query.where(Exam.created_by == user_id)
        result = await db.execute(query)
        exam = result.scalar_one_or_none()
        if not exam:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam not found"
            )
        return exam

    @staticmethod
    async def create_exam(db: AsyncSession, data: ExamCreate, user_id: str) -> Exam:
        exam = Exam(
            created_by=user_id,
            title=data.title,
            description=data.description,
            status=ExamStatus.DRAFT.value,
            duration_minutes=data.duration_minutes,
            total_score=data.total_score,
            shuffle_questions=data.shuffle_questions
        )
        db.add(exam)
        await db.flush()

        if data.questions:
            for idx, item in enumerate(data.questions):
                # Retrieve question to take snapshot
                q_res = await db.execute(
                    select(Question).where(Question.id == item.question_id).options(
                        selectinload(Question.options),
                        selectinload(Question.rubrics)
                    )
                )
                q = q_res.scalar_one_or_none()
                if not q:
                    continue

                pts = item.points or q.default_points
                
                # Snapshot structure
                frozen_q = {
                    "id": q.id,
                    "type": q.type,
                    "content": q.content,
                    "version": q.version,
                    "options": [
                        {
                            "id": o.id,
                            "content": o.content,
                            "is_correct": o.is_correct,
                            "order_index": o.order_index,
                            "explanation": o.explanation
                        }
                        for o in q.options
                    ]
                }
                frozen_r = [
                    {
                        "id": r.id,
                        "criterion_name": r.criterion_name,
                        "description": r.description,
                        "max_points": float(r.max_points),
                        "is_deduction": getattr(r, "is_deduction", False),
                        "level_descriptors": r.level_descriptors,
                        "version": r.version
                    }
                    for r in q.rubrics
                ]

                eq = ExamQuestion(
                    exam_id=exam.id,
                    original_question_id=q.id,
                    order_index=item.order_index if item.order_index else idx,
                    points=pts,
                    frozen_question_data=frozen_q,
                    frozen_rubric_data=frozen_r
                )
                db.add(eq)

        await db.commit()
        return await ExamService.get_exam(db, exam.id, user_id)

    @staticmethod
    async def publish_exam(db: AsyncSession, exam_id: str, user_id: str) -> Exam:
        exam = await ExamService.get_exam(db, exam_id, user_id)
        if not exam.questions or len(exam.questions) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish an exam with no questions"
            )
        
        # Verify sum of points equals total_score
        points_sum = sum(q.points for q in exam.questions)
        if points_sum != exam.total_score:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sum of question points ({points_sum}) does not match exam total score ({exam.total_score})"
            )

        exam.status = ExamStatus.PUBLISHED.value
        await db.commit()
        return exam

    @staticmethod
    async def set_shuffle(db: AsyncSession, exam_id: str, user_id: str, shuffle: bool) -> Exam:
        exam = await ExamService.get_exam(db, exam_id, user_id)
        exam.shuffle_questions = shuffle
        await db.commit()
        return await ExamService.get_exam(db, exam_id, user_id)

    @staticmethod
    async def assign_exam(db: AsyncSession, data: ExamAssignmentCreate, user_id: str) -> ExamAssignment:
        exam = await ExamService.get_exam(db, data.exam_id, user_id)
        if exam.status != ExamStatus.PUBLISHED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exam must be published before assigning to classes"
            )

        if data.close_at <= data.open_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="close_at must be strictly after open_at"
            )

        assignment = ExamAssignment(
            exam_id=data.exam_id,
            class_id=data.class_id,
            open_at=data.open_at,
            close_at=data.close_at,
            max_attempts=data.max_attempts,
            allow_review_before_publish=data.allow_review_before_publish,
            auto_publish_results=data.auto_publish_results
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)
        return assignment
