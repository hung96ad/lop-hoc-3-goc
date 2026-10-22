from datetime import datetime
from typing import Optional, List, Generic, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ClassBase(BaseModel):
    name: str


class ClassCreate(ClassBase):
    code: Optional[str] = None


class ClassRead(ClassBase):
    id: str
    code: str
    teacher_id: str
    created_at: datetime
    student_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class EnrollRequest(BaseModel):
    code: str
