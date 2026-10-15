from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SubjectBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectRead(SubjectBase):
    id: str
    created_by: str
    created_at: datetime
    question_count: int = 0

    model_config = ConfigDict(from_attributes=True)
