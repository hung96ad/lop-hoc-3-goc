from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.users import User, UserRole
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, RefreshTokenRequest
from app.schemas.guest import GuestEntryRequest, GuestEntryResponse
from app.models.classes import Class, Enrollment
from app.models.exams import ExamAssignment
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
import secrets
import uuid
from app.schemas.user import UserRead
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/guest-entry", response_model=GuestEntryResponse)
async def guest_entry(request: GuestEntryRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Class).where(Class.id == request.class_id))
    class_obj = result.scalar_one_or_none()
    if not class_obj:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học")
    now = datetime.now(timezone.utc)
    assignment_result = await db.execute(
        select(ExamAssignment).where(
            ExamAssignment.class_id == class_obj.id,
            ExamAssignment.open_at <= now,
            ExamAssignment.close_at >= now
        ).options(selectinload(ExamAssignment.exam)).order_by(ExamAssignment.created_at.desc())
    )
    assignment = assignment_result.scalars().first()
    if not assignment:
        # Fallback to latest assignment for this class and ensure valid window
        fallback_res = await db.execute(
            select(ExamAssignment).where(
                ExamAssignment.class_id == class_obj.id
            ).options(selectinload(ExamAssignment.exam)).order_by(ExamAssignment.created_at.desc())
        )
        assignment = fallback_res.scalars().first()
        if assignment:
            from datetime import timedelta
            if assignment.open_at > now or assignment.close_at < now:
                assignment.open_at = now - timedelta(minutes=10)
                assignment.close_at = now + timedelta(days=7)
                await db.commit()

    if not assignment:
        raise HTTPException(status_code=404, detail="Lớp hiện chưa có bài thi nào được giao.")

    email = f"guest-{__import__('uuid').uuid4().hex}@guest.local"
    user = User(
        email=email,
        hashed_password=get_password_hash(__import__('secrets').token_urlsafe(32)),
        full_name=request.full_name.strip(),
        phone=request.phone.strip(),
        role=UserRole.STUDENT.value,
        is_active=True
    )
    db.add(user)
    await db.flush()
    db.add(Enrollment(class_id=class_obj.id, student_id=user.id))
    await db.commit()
    return GuestEntryResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        email=email,
        full_name=user.full_name,
        role=user.role,
        assignment_id=assignment.id
    )


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    role = request.role if request.role in [UserRole.TEACHER.value, UserRole.STUDENT.value] else UserRole.STUDENT.value
    
    user = User(
        email=request.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name,
        role=role,
        is_active=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone or ""
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone or ""
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(request.refresh_token)
    token_type = payload.get("type")
    user_id = payload.get("sub")
    
    if token_type != "refresh" or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone or ""
    )


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
