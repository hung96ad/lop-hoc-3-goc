from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.exam import ExamCreate, ExamRead, ExamAssignmentCreate, ExamAssignmentRead, PaginatedResponse
from app.services.exam_service import ExamService
from app.api.deps import get_current_teacher
from pydantic import BaseModel

router = APIRouter(prefix="/exams", tags=["Exams"])


class ShuffleUpdate(BaseModel):
    shuffle: bool


@router.get("", response_model=PaginatedResponse[ExamRead])
async def list_exams(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200),
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.list_exams(db=db, user_id=current_teacher.id, page=page, page_size=page_size)


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


@router.patch("/{exam_id}/shuffle", response_model=ExamRead)
async def set_shuffle(
    exam_id: str,
    data: ShuffleUpdate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.set_shuffle(db=db, exam_id=exam_id, user_id=current_teacher.id, shuffle=data.shuffle)


@router.post("/assignments", response_model=ExamAssignmentRead)
async def assign_exam(
    data: ExamAssignmentCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await ExamService.assign_exam(db=db, data=data, user_id=current_teacher.id)
