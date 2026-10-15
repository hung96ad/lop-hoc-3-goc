from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class TeacherOverrideRequest(BaseModel):
    score: Decimal = Field(..., ge=0)
    teacher_feedback: Optional[str] = ""
    reason: str = Field(..., min_length=2, description="Lý do điều chỉnh điểm để lưu audit")
    expected_version: int = Field(..., description="Optimistic locking version")


class GradeReviewRead(BaseModel):
    id: str
    reviewer_id: str
    reviewer_name: Optional[str] = None
    previous_score: Decimal
    new_score: Decimal
    reason: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GradingResultRead(BaseModel):
    id: str
    answer_id: str
    score: Decimal
    auto_graded_score: Decimal
    ai_suggested_score: Decimal
    teacher_final_score: Decimal
    teacher_feedback: str
    graded_by: Optional[str] = None
    finalized_at: Optional[datetime] = None
    version: int
    reviews: List[GradeReviewRead] = []

    model_config = ConfigDict(from_attributes=True)


class EssayGradingDetail(BaseModel):
    answer_id: str
    question_content: str
    points: Decimal
    student_response: str
    rubrics: List[Dict[str, Any]]
    grading_result: Optional[GradingResultRead] = None
    ai_analysis: Optional[Dict[str, Any]] = None


class AttemptGradingOverview(BaseModel):
    attempt_id: str
    student_id: str
    student_name: str
    student_email: str
    exam_title: str
    status: str
    started_at: datetime
    submitted_at: Optional[datetime] = None
    objective_score: Decimal
    essay_score: Decimal
    final_score: Decimal
    essay_details: List[EssayGradingDetail] = []


class StudentResultResponse(BaseModel):
    attempt_id: str
    exam_title: str
    is_published: bool
    status: str
    objective_score: Optional[Decimal] = None
    essay_score: Optional[Decimal] = None
    final_score: Optional[Decimal] = None
    teacher_feedback: Optional[str] = None
    ai_feedback: Optional[Dict[str, Any]] = None
