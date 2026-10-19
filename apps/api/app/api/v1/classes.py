import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.classes import Class, Enrollment
from app.models.exams import ExamAssignment
from app.models.users import User, UserRole
from app.schemas.class_schema import ClassCreate, ClassRead, EnrollRequest
from app.api.deps import get_current_user, get_current_teacher, get_current_student

router = APIRouter(prefix="/classes", tags=["Classes"])


@router.get("/public", response_model=List[ClassRead])
async def list_public_classes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Class).order_by(Class.name))
    classes = result.scalars().all()
    output = []
    for class_obj in classes:
        asg_res = await db.execute(
            select(ExamAssignment).where(ExamAssignment.class_id == class_obj.id).limit(1)
        )
        if asg_res.scalar_one_or_none():
            output.append(ClassRead(
                id=class_obj.id,
                name=class_obj.name,
                code=class_obj.code,
                teacher_id=class_obj.teacher_id,
                created_at=class_obj.created_at,
                student_count=0
            ))
    return output


@router.get("", response_model=List[ClassRead])
async def list_classes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == UserRole.TEACHER.value:
        query = select(Class).where(Class.teacher_id == current_user.id)
    else:
        query = select(Class).join(Enrollment, Class.id == Enrollment.class_id).where(Enrollment.student_id == current_user.id)
    
    result = await db.execute(query)
    classes = result.scalars().all()
    
    output = []
    for c in classes:
        cnt_res = await db.execute(select(func.count(Enrollment.id)).where(Enrollment.class_id == c.id))
        count = cnt_res.scalar() or 0
        output.append(ClassRead(
            id=c.id,
            name=c.name,
            code=c.code,
            teacher_id=c.teacher_id,
            created_at=c.created_at,
            student_count=count
        ))
    return output


@router.post("", response_model=ClassRead)
async def create_class(
    request: ClassCreate,
    current_teacher: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    code = request.code or secrets.token_hex(3).upper()
    
    # Check code unique
    existing = await db.execute(select(Class).where(Class.code == code))
    if existing.scalar_one_or_none():
        code = secrets.token_hex(4).upper()

    new_class = Class(
        name=request.name,
        code=code,
        teacher_id=current_teacher.id
    )
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)

    return ClassRead(
        id=new_class.id,
        name=new_class.name,
        code=new_class.code,
        teacher_id=new_class.teacher_id,
        created_at=new_class.created_at,
        student_count=0
    )


@router.post("/enroll", response_model=ClassRead)
async def enroll_class(
    request: EnrollRequest,
    current_student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Class).where(Class.code == request.code.strip().upper()))
    class_obj = result.scalar_one_or_none()
    if not class_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class with specified code not found"
        )
    
    # Check already enrolled
    existing_enr = await db.execute(
        select(Enrollment).where(
            Enrollment.class_id == class_obj.id,
            Enrollment.student_id == current_student.id
        )
    )
    if existing_enr.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student already enrolled in this class"
        )

    enrollment = Enrollment(
        class_id=class_obj.id,
        student_id=current_student.id
    )
    db.add(enrollment)
    await db.commit()

    cnt_res = await db.execute(select(func.count(Enrollment.id)).where(Enrollment.class_id == class_obj.id))
    count = cnt_res.scalar() or 0

    return ClassRead(
        id=class_obj.id,
        name=class_obj.name,
        code=class_obj.code,
        teacher_id=class_obj.teacher_id,
        created_at=class_obj.created_at,
        student_count=count
    )
