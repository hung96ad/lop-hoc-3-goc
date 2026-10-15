from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field


class CriterionEvaluation(BaseModel):
    criterion_name: str
    max_points: Decimal = Field(..., ge=0)
    awarded_points: Decimal = Field(..., ge=0)
    direct_quotes: List[str] = Field(default_factory=list, description="Dẫn chứng trích dẫn nguyên văn từ bài viết")
    reasoning: str = Field(..., description="Lập luận chấm điểm dựa trên mức rubric")


class ThreeRootsManifestation(BaseModel):
    dao_duc: str = Field(..., description="Biểu hiện về tinh thần vị tha, sự quan tâm, trách nhiệm được thể hiện trong bài viết")
    tri_tue: str = Field(..., description="Biểu hiện về tư duy logic, sự hiểu biết quy luật nhân quả, khả năng phân tích vấn đề")
    nghi_luc: str = Field(..., description="Biểu hiện về lòng dũng cảm, sự kiên trì, dám đối diện khó khăn thể hiện qua ngôn từ")


class ThreePoisonsManifestation(BaseModel):
    tham: str = Field(..., description="Dấu hiệu tư tưởng chiếm hữu, ích kỷ, mong cầu quá mức nếu có biểu hiện trong ngữ cảnh")
    san: str = Field(..., description="Dấu hiệu cảm xúc tức giận, chống đối, bất mãn gay gắt nếu có biểu hiện")
    si: str = Field(..., description="Dấu hiệu ngộ nhận, thiếu thông tin xác thực, nhìn nhận phiến diện nếu có biểu hiện")


class PedagogicalFeedback(BaseModel):
    strengths: List[str] = Field(default_factory=list)
    areas_for_improvement: List[str] = Field(default_factory=list)
    transformative_advice: str = Field(..., description="Lời khuyên thực tế giúp chuyển hóa từ biểu hiện 3 độc sang rèn luyện 3 gốc")
    practical_action_plan: List[str] = Field(default_factory=list, description="1-3 mục tiêu rèn luyện cụ thể cho học viên")


class AIAssessmentOutput(BaseModel):
    rubric_evaluations: List[CriterionEvaluation]
    three_roots: ThreeRootsManifestation
    three_poisons: ThreePoisonsManifestation
    feedback: PedagogicalFeedback
    total_suggested_score: Decimal = Field(..., ge=0)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    requires_manual_audit: bool = Field(default=False, description="Đánh dấu True nếu bài viết mập mờ, có dấu hiệu gian lận hoặc AI không đủ dữ liệu đánh giá")
    audit_reason: Optional[str] = None
