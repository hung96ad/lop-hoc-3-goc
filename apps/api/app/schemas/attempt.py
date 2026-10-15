from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class AnswerSaveRequest(BaseModel):
    exam_question_id: str
    selected_option_ids: List[str] = Field(default_factory=list)
    text_response: str = ""
    client_version: int = Field(default=1, ge=1)


class AnswerRead(BaseModel):
    id: str
    exam_question_id: str
    selected_option_ids: List[str]
    text_response: str
    last_saved_at: datetime
    client_version: int

    model_config = ConfigDict(from_attributes=True)


class AttemptStartResponse(BaseModel):
    attempt_id: str
    exam_assignment_id: str
    attempt_number: int
    status: str
    started_at: datetime
    max_allowed_submit_at: datetime
    duration_minutes: int
    exam_title: str
    questions: List[Dict[str, Any]]
    answers: List[AnswerRead] = []


class AttemptRead(BaseModel):
    id: str
    exam_assignment_id: str
    student_id: str
    attempt_number: int
    status: str
    started_at: datetime
    max_allowed_submit_at: datetime
    submitted_at: Optional[datetime] = None
    objective_score: Decimal
    essay_score: Decimal
    final_score: Decimal
    answers: List[AnswerRead] = []

    model_config = ConfigDict(from_attributes=True)


class SubmitAttemptResponse(BaseModel):
    attempt_id: str
    status: str
    submitted_at: datetime
    objective_score: Decimal
    is_fully_graded: bool
    message: str
