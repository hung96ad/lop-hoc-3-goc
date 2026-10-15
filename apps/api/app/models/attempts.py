import uuid
import enum
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, ForeignKey, JSON, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base, TimestampMixin


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    GRADING = "grading"
    PENDING_REVIEW = "pending_review"
    FINALIZED = "finalized"


class Attempt(Base, TimestampMixin):
    __tablename__ = "attempts"
    __table_args__ = (
        UniqueConstraint("exam_assignment_id", "student_id", "attempt_number", name="uq_attempt_assignment_student_num"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_assignment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(
        String(25),
        default=AttemptStatus.IN_PROGRESS.value,
        nullable=False,
        index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    max_allowed_submit_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    objective_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    essay_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    final_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    assignment = relationship("ExamAssignment", back_populates="attempts")
    student = relationship("User", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "exam_question_id", name="uq_answer_attempt_question"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    selected_option_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    text_response: Mapped[str] = mapped_column(Text, default="", nullable=False)
    last_saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    client_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    attempt = relationship("Attempt", back_populates="answers")
    exam_question = relationship("ExamQuestion", back_populates="answers")
    grading_result = relationship("GradingResult", back_populates="answer", uselist=False, cascade="all, delete-orphan")
    ai_analyses = relationship("AIAnalysis", back_populates="answer", cascade="all, delete-orphan", order_by="AIAnalysis.job_version.desc()")
