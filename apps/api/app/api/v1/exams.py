from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.exam import ExamCreate, ExamRead, ExamAssignmentCreate, ExamAssignmentRead
from app.services.exam_service import ExamService
from app.api.deps import get_current_teacher

router = APIRouter(prefix="/exams", tags=["Exams"])


@router.get("", response_model=List[ExamRead])
async def list_exams(
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.list_exams(db=db, user_id=current_teacher.id)


@router.post("", response_model=ExamRead)
async def create_exam(
    data: ExamCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.create_exam(db=db, data=data, user_id=current_teacher.id)


@router.get("/{exam_id}", response_model=ExamRead)
async def get_exam(
    exam_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.get_exam(db=db, exam_id=exam_id, user_id=current_teacher.id)


@router.post("/{exam_id}/publish", response_model=ExamRead)
async def publish_exam(
    exam_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.publish_exam(db=db, exam_id=exam_id, user_id=current_teacher.id)


@router.post("/assignments", response_model=ExamAssignmentRead)
async def assign_exam(
    data: ExamAssignmentCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.assign_exam(db=db, data=data, user_id=current_teacher.id)
