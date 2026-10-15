import uuid
import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, ForeignKey, JSON, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base, TimestampMixin


class ExamStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Exam(Base, TimestampMixin):
    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        default=ExamStatus.DRAFT.value,
        nullable=False,
        index=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    total_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("10.00"), nullable=False)

    # Relationships
    creator = relationship("User", back_populates="created_exams")
    questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan", order_by="ExamQuestion.order_index")
    assignments = relationship("ExamAssignment", back_populates="exam", cascade="all, delete-orphan")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    original_question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    points: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    
    # Immutable frozen snapshot of question, options, and rubrics taken at publish time
    frozen_question_data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    frozen_rubric_data: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    # Relationships
    exam = relationship("Exam", back_populates="questions")
    answers = relationship("Answer", back_populates="exam_question")


class ExamAssignment(Base, TimestampMixin):
    __tablename__ = "exam_assignments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    class_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    open_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    close_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    allow_review_before_publish: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_publish_results: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    exam = relationship("Exam", back_populates="assignments")
    class_obj = relationship("Class", back_populates="assignments")
    attempts = relationship("Attempt", back_populates="assignment", cascade="all, delete-orphan")
