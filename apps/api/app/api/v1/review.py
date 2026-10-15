from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.grading import (
    TeacherOverrideRequest,
    AttemptGradingOverview,
    GradingResultRead,
    StudentResultResponse
)
from app.services.review_service import ReviewService
from app.api.deps import get_current_teacher, get_current_student

router = APIRouter(tags=["Grading & Review"])


@router.get("/teacher/attempts", response_model=List[Dict[str, Any]])
async def list_teacher_attempts(
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ReviewService.list_teacher_attempts(db, current_teacher.id)


@router.get("/teacher/attempts/{attempt_id}/review", response_model=AttemptGradingOverview)
async def get_attempt_for_review(
    attempt_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ReviewService.get_attempt_grading_overview(db, attempt_id, current_teacher.id)


@router.put("/teacher/grading-results/{grading_result_id}/override")
async def override_grade(
    grading_result_id: str,
    data: TeacherOverrideRequest,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    gr = await ReviewService.override_grade(db, grading_result_id, current_teacher.id, data)
    return {
        "status": "success",
        "grading_result_id": gr.id,
        "score": float(gr.score),
        "teacher_final_score": float(gr.teacher_final_score),
        "teacher_feedback": gr.teacher_feedback,
        "version": gr.version,
        "message": "Điểm và nhận xét đã được cập nhật thành công."
    }


@router.post("/teacher/attempts/{attempt_id}/finalize")
async def finalize_attempt(
    attempt_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    await ReviewService.finalize_attempt(db, attempt_id, current_teacher.id)
    return {"status": "finalized", "message": "Bài làm đã được duyệt và chốt điểm chính thức."}


@router.get("/student/attempts/{attempt_id}/results", response_model=StudentResultResponse)
async def get_student_results(
    attempt_id: str,
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    return await ReviewService.get_student_result(db, attempt_id, current_student.id)
