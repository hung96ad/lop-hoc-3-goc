from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.users import User
from app.schemas.question import (
    QuestionCreate, 
    QuestionUpdate, 
    QuestionRead, 
    GenerateRubricRequest, 
    GenerateRubricResponse,
    QuestionImportResult,
    GenerateFromPDFRequest,
    GenerateFromPDFResult,
    BulkDeleteRequest,
    PaginatedResponse,
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


@router.post("/generate-from-pdf", response_model=GenerateFromPDFResult)
async def generate_questions_from_pdf(
    file: UploadFile = File(...),
    single_choice_count: int = Form(default=0),
    multiple_select_count: int = Form(default=0),
    essay_count: int = Form(default=0),
    subject_id: Optional[str] = Form(default=None),
    class_id: Optional[str] = Form(default=None),
    default_points_single: float = Form(default=1.0),
    default_points_multiple: float = Form(default=1.0),
    default_points_essay: float = Form(default=10.0),
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File không hợp lệ. Vui lòng tải lên file PDF (.pdf)."
        )
    total_requested = single_choice_count + multiple_select_count + essay_count
    if total_requested == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng nhập số lượng câu hỏi cần tạo (ít nhất 1 câu)."
        )
    if total_requested > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tổng số câu hỏi không được vượt quá 50 câu mỗi lần."
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File PDF rỗng, vui lòng chọn file có nội dung."
        )

    return await QuestionService.generate_questions_from_pdf(
        db=db,
        pdf_bytes=content,
        user_id=current_teacher.id,
        single_choice_count=single_choice_count,
        multiple_select_count=multiple_select_count,
        essay_count=essay_count,
        subject_id=subject_id,
        class_id=class_id,
        default_points_single=default_points_single,
        default_points_multiple=default_points_multiple,
        default_points_essay=default_points_essay,
    )


@router.get("", response_model=PaginatedResponse[QuestionRead])
async def list_questions(
    question_type: Optional[str] = None,
    category_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    class_id: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200),
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.list_questions(
        db=db,
        user_id=current_teacher.id,
        question_type=question_type,
        category_id=category_id,
        subject_id=subject_id,
        class_id=class_id,
        page=page,
        page_size=page_size,
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


@router.put("/{question_id}", response_model=QuestionRead)
async def update_question(
    question_id: str,
    data: QuestionUpdate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    return await QuestionService.update_question(
        db=db,
        question_id=question_id,
        data=data,
        user_id=current_teacher.id
    )


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: str,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    await QuestionService.delete_question(
        db=db,
        question_id=question_id,
        user_id=current_teacher.id
    )


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_questions(
    data: BulkDeleteRequest,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    deleted_count = await QuestionService.bulk_delete_questions(
        db=db,
        question_ids=data.question_ids,
        user_id=current_teacher.id
    )
    return {"deleted_count": deleted_count}
