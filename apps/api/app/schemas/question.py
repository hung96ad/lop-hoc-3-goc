from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


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
