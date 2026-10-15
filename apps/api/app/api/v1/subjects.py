from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.subjects import Subject
from app.models.questions import Question
from app.models.users import User
from app.schemas.subject import SubjectCreate, SubjectRead
from app.api.deps import get_current_teacher

router = APIRouter(prefix="/subjects", tags=["Subjects"])


@router.get("", response_model=List[SubjectRead])
async def list_subjects(
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    query = select(Subject).where(Subject.created_by == current_teacher.id).order_by(Subject.name)
    result = await db.execute(query)
    subjects = result.scalars().all()

    output = []
    for s in subjects:
        cnt_res = await db.execute(
            select(func.count(Question.id)).where(
                Question.subject_id == s.id,
                Question.is_active == True
            )
        )
        q_count = cnt_res.scalar() or 0
        output.append(SubjectRead(
            id=s.id,
            name=s.name,
            code=s.code,
            description=s.description,
            created_by=s.created_by,
            created_at=s.created_at,
            question_count=q_count
        ))
    return output


@router.post("", response_model=SubjectRead)
async def create_subject(
    data: SubjectCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    # Check if subject code already exists for this teacher
    code_clean = data.code.strip().upper()
    existing = await db.execute(
        select(Subject).where(
            Subject.code == code_clean,
            Subject.created_by == current_teacher.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã môn học '{code_clean}' đã tồn tại."
        )

    new_subject = Subject(
        name=data.name.strip(),
        code=code_clean,
        description=data.description,
        created_by=current_teacher.id
    )
    db.add(new_subject)
    await db.commit()
    await db.refresh(new_subject)

    return SubjectRead(
        id=new_subject.id,
        name=new_subject.name,
        code=new_subject.code,
        description=new_subject.description,
        created_by=new_subject.created_by,
        created_at=new_subject.created_at,
        question_count=0
    )
