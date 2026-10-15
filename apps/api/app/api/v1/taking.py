from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.attempt import AnswerSaveRequest, AttemptStartResponse, SubmitAttemptResponse
from app.services.taking_service import ExamTakingService
from app.api.deps import get_current_student

router = APIRouter(prefix="/student", tags=["Student Exam Taking"])


@router.get("/assignments", response_model=List[Dict[str, Any]])
async def get_assignments(
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    return await ExamTakingService.get_student_assignments(db, current_student.id)


@router.post("/assignments/{assignment_id}/start", response_model=AttemptStartResponse)
async def start_attempt(
    assignment_id: str,
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    return await ExamTakingService.start_attempt(db, assignment_id, current_student.id)


@router.put("/attempts/{attempt_id}/answers")
async def save_answer(
    attempt_id: str,
    data: AnswerSaveRequest,
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    return await ExamTakingService.save_answer(db, attempt_id, current_student.id, data)


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptResponse)
async def submit_attempt(
    attempt_id: str,
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    return await ExamTakingService.submit_attempt(db, attempt_id, current_student.id)
