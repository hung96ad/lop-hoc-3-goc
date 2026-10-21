import uuid
import enum
from typing import Optional
from decimal import Decimal
from sqlalchemy import String, Text, Boolean, Numeric, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base, TimestampMixin


class QuestionType(str, enum.Enum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_SELECT = "multiple_select"
    ESSAY = "essay"


class QuestionCategory(Base, TimestampMixin):
    __tablename__ = "question_categories"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    questions = relationship("Question", back_populates="category")


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    category_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("question_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    subject_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    class_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    default_points: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("1.00"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    category = relationship("QuestionCategory", back_populates="questions")
    subject = relationship("Subject", back_populates="questions")
    class_obj = relationship("Class", back_populates="questions")
    creator = relationship("User", back_populates="created_questions")
    options = relationship("QuestionOption", back_populates="question", cascade="all, delete-orphan", order_by="QuestionOption.order_index")
    rubrics = relationship("QuestionRubric", back_populates="question", cascade="all, delete-orphan")

    @property
    def class_name(self) -> Optional[str]:
        return self.class_obj.name if self.class_obj else None

    @property
    def subject_name(self) -> Optional[str]:
        return self.subject.name if self.subject else None


class QuestionOption(Base):
    __tablename__ = "question_options"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    question = relationship("Question", back_populates="options")


class QuestionRubric(Base):
    __tablename__ = "question_rubrics"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    criterion_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    max_points: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    is_deduction: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    level_descriptors: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    question = relationship("Question", back_populates="rubrics")
