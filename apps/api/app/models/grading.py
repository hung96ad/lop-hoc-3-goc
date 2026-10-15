import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, Float, ForeignKey, JSON, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base, TimestampMixin


class GradingResult(Base, TimestampMixin):
    __tablename__ = "grading_results"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    answer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("answers.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )
    score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    auto_graded_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    ai_suggested_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    teacher_final_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    teacher_feedback: Mapped[str] = mapped_column(Text, default="", nullable=False)
    graded_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    finalized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    answer = relationship("Answer", back_populates="grading_result")
    grader = relationship("User", foreign_keys=[graded_by])
    reviews = relationship("GradeReview", back_populates="grading_result", cascade="all, delete-orphan", order_by="GradeReview.changed_at.desc()")


class AIAnalysis(Base, TimestampMixin):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    answer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("answers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    job_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    model_provider: Mapped[str] = mapped_column(String(50), default="mock", nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(20), default="v1.0", nullable=False)
    
    # 3 Gốc & 3 Độc structured results
    three_roots_analysis: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    three_poisons_analysis: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    pedagogical_feedback: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    rubric_evaluations: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    
    proposed_total_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    requires_manual_audit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    audit_reason: Mapped[str] = mapped_column(Text, nullable=True)
    
    execution_status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    error_trace: Mapped[str] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    answer = relationship("Answer", back_populates="ai_analyses")


class GradeReview(Base):
    __tablename__ = "grade_reviews"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    grading_result_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("grading_results.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    reviewer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False
    )
    previous_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    new_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    grading_result = relationship("GradingResult", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
