from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.question import (
    QuestionCreate, 
    QuestionUpdate, 
    QuestionRead, 
    GenerateRubricRequest, 
    GenerateRubricResponse,
    QuestionImportResult
)
from app.services.question_service import QuestionService
from app.api.deps import get_current_teacher

router = APIRouter(prefix="/questions", tags=["Questions"])


@router.post("/generate-rubric", response_model=GenerateRubricResponse)
async def generate_rubric(
    data: GenerateRubricRequest,
    current_teacher: User = Depends(get_current_teacher),
):
    rubrics = await QuestionService.generate_rubrics(
        content=data.content,
        total_points=data.total_points
    )
    return GenerateRubricResponse(rubrics=rubrics)


@router.get("/import-template")
async def download_import_template(
    current_teacher: User = Depends(get_current_teacher),
):
    excel_bytes = QuestionService.generate_excel_template()
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="mau_nhap_cau_hoi.xlsx"'
        }
    )


@router.post("/import-excel", response_model=QuestionImportResult)
async def import_questions_excel(
    file: UploadFile = File(...),
    subject_id: Optional[str] = Form(None),
    class_id: Optional[str] = Form(None),
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File không hợp lệ. Vui lòng tải lên file Excel (.xlsx hoặc .xls)."
        )
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File rỗng, vui lòng chọn file chứa dữ liệu câu hỏi."
        )
    return await QuestionService.import_questions_from_excel(
        db=db,
        file_bytes=content,
        user_id=current_teacher.id,
        default_subject_id=subject_id,
        default_class_id=class_id
    )


@router.get("", response_model=List[QuestionRead])
async def list_questions(
    question_type: Optional[str] = None,
    category_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    class_id: Optional[str] = None,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.list_questions(
        db=db,
        user_id=current_teacher.id,
        question_type=question_type,
        category_id=category_id,
        subject_id=subject_id,
        class_id=class_id
    )


@router.post("", response_model=QuestionRead)
async def create_question(
    data: QuestionCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.create_question(
        db=db,
        data=data,
        user_id=current_teacher.id
    )


@router.get("/{question_id}", response_model=QuestionRead)
async def get_question(
    question_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.get_question(
        db=db,
        question_id=question_id,
        user_id=current_teacher.id
    )


@router.post("/{question_id}/duplicate", response_model=QuestionRead)
async def duplicate_question(
    question_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.duplicate_question(
        db=db,
        question_id=question_id,
        user_id=current_teacher.id
    )
