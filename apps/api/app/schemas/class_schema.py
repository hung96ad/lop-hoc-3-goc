from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


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
