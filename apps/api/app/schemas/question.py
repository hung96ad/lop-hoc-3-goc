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


class QuestionOptionBase(BaseModel):
    content: str
    is_correct: bool = False
    order_index: int = 0
    explanation: Optional[str] = None


class QuestionOptionCreate(QuestionOptionBase):
    pass


class QuestionOptionRead(QuestionOptionBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


class QuestionRubricBase(BaseModel):
    criterion_name: str
    description: Optional[str] = None
    max_points: Decimal = Field(..., ge=0)
    level_descriptors: Dict[str, Any] = Field(default_factory=dict)
    is_deduction: bool = Field(default=False, description="Đánh dấu True nếu là tiêu chí trừ điểm (3 Độc: Tham, Sân, Si)")


class QuestionRubricCreate(QuestionRubricBase):
    pass


class GenerateRubricRequest(BaseModel):
    content: str
    total_points: Optional[Decimal] = Field(default=Decimal("10.00"), ge=0)


class GenerateRubricResponse(BaseModel):
    rubrics: List[QuestionRubricCreate]


class QuestionRubricRead(QuestionRubricBase):
    id: str
    version: int

    model_config = ConfigDict(from_attributes=True)


class QuestionBase(BaseModel):
    type: str  # "single_choice", "multiple_select", "essay"
    content: str
    default_points: Decimal = Field(default=Decimal("1.00"), ge=0)
    category_id: Optional[str] = None
    subject_id: Optional[str] = None
    class_id: Optional[str] = None


class QuestionCreate(QuestionBase):
    options: Optional[List[QuestionOptionCreate]] = None
    rubrics: Optional[List[QuestionRubricCreate]] = None


class QuestionUpdate(BaseModel):
    content: Optional[str] = None
    default_points: Optional[Decimal] = None
    category_id: Optional[str] = None
    subject_id: Optional[str] = None
    class_id: Optional[str] = None
    options: Optional[List[QuestionOptionCreate]] = None
    rubrics: Optional[List[QuestionRubricCreate]] = None


class QuestionRead(QuestionBase):
    id: str
    created_by: str
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    subject_name: Optional[str] = None
    class_name: Optional[str] = None
    options: List[QuestionOptionRead] = []
    rubrics: List[QuestionRubricRead] = []

    model_config = ConfigDict(from_attributes=True)


class QuestionImportError(BaseModel):
    row: int
    error: str


class QuestionImportResult(BaseModel):
    total: int
    success_count: int
    failed_count: int
    imported_questions: List[QuestionRead]
    errors: List[QuestionImportError]


class GenerateFromPDFRequest(BaseModel):
    single_choice_count: int = Field(default=0, ge=0, description="Số câu trắc nghiệm chọn 1 đáp án")
    multiple_select_count: int = Field(default=0, ge=0, description="Số câu trắc nghiệm chọn nhiều đáp án")
    essay_count: int = Field(default=0, ge=0, description="Số câu tự luận")
    subject_id: Optional[str] = None
    class_id: Optional[str] = None
    default_points_single: Decimal = Field(default=Decimal("1.00"), ge=0)
    default_points_multiple: Decimal = Field(default=Decimal("1.00"), ge=0)
    default_points_essay: Decimal = Field(default=Decimal("10.00"), ge=0)


class GenerateFromPDFResult(BaseModel):
    total_generated: int
    saved_count: int
    questions: List[QuestionRead]
    message: str


class BulkDeleteRequest(BaseModel):
    question_ids: List[str] = Field(..., min_length=1)
