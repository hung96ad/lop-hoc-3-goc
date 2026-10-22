from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any, Generic, TypeVar
from pydantic import BaseModel, Field, ConfigDict

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExamQuestionItem(BaseModel):
    question_id: str
    points: Optional[Decimal] = None
    order_index: Optional[int] = 0


class ExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: int = Field(default=45, ge=1)
    total_score: Decimal = Field(default=Decimal("10.00"), ge=0)
    subject_id: Optional[str] = None
    questions: Optional[List[ExamQuestionItem]] = None
    shuffle_questions: bool = False


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    total_score: Optional[Decimal] = None
    questions: Optional[List[ExamQuestionItem]] = None
    shuffle_questions: Optional[bool] = None


class ExamQuestionRead(BaseModel):
    id: str
    original_question_id: Optional[str] = None
    order_index: int
    points: Decimal
    frozen_question_data: Dict[str, Any]
    frozen_rubric_data: List[Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)


class ExamRead(BaseModel):
    id: str
    created_by: str
    title: str
    description: Optional[str] = None
    status: str
    duration_minutes: int
    total_score: Decimal
    shuffle_questions: bool
    created_at: datetime
    questions: List[ExamQuestionRead] = []

    model_config = ConfigDict(from_attributes=True)


class ExamAssignmentCreate(BaseModel):
    exam_id: str
    class_id: str
    open_at: datetime
    close_at: datetime
    max_attempts: int = Field(default=1, ge=1)
    allow_review_before_publish: bool = False
    auto_publish_results: bool = False


class ExamAssignmentRead(BaseModel):
    id: str
    exam_id: str
    class_id: str
    open_at: datetime
    close_at: datetime
    max_attempts: int
    allow_review_before_publish: bool
    auto_publish_results: bool
    exam_title: Optional[str] = None
    class_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
