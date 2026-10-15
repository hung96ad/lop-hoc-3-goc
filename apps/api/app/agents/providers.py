from decimal import Decimal
from typing import List, Dict, Any, Protocol
from app.schemas.ai_output import (
    AIAssessmentOutput,
    CriterionEvaluation,
    ThreeRootsManifestation,
    ThreePoisonsManifestation,
    PedagogicalFeedback
)


class BaseAIProvider(Protocol):
    async def evaluate_essay(
        self,
        question_content: str,
        student_essay: str,
        rubrics: List[Dict[str, Any]],
        max_score: Decimal
    ) -> AIAssessmentOutput:
        ...

    async def generate_rubrics(
        self,
        question_content: str,
        total_points: Decimal
    ) -> List[Dict[str, Any]]:
        ...


class MockAIProvider:
    """Deterministic Mock AI Provider for offline testing, dev, and CI."""
    async def evaluate_essay(
        self,
        question_content: str,
        student_essay: str,
        rubrics: List[Dict[str, Any]],
        max_score: Decimal
    ) -> AIAssessmentOutput:
        essay_len = len(student_essay.strip())
        
        # Guard: Check for empty / near-empty
        if essay_len < 10:
            evaluations = [
                CriterionEvaluation(
                    criterion_name=r.get("criterion_name", "Tiêu chí"),
                    max_points=Decimal(str(r.get("max_points", 0))),
                    awarded_points=Decimal("0.00"),
                    direct_quotes=[],
                    reasoning="Bài viết quá ngắn hoặc chưa có nội dung trả lời câu hỏi."
                )
                for r in rubrics
            ]
            return AIAssessmentOutput(
                rubric_evaluations=evaluations,
                three_roots=ThreeRootsManifestation(
                    dao_duc="Chưa thể hiện nội dung",
                    tri_tue="Chưa thể hiện nội dung",
                    nghi_luc="Chưa thể hiện nỗ lực hoàn thành bài viết"
                ),
                three_poisons=ThreePoisonsManifestation(
                    tham="Không có căn cứ",
                    san="Không có căn cứ",
                    si="Thiếu sự đầu tư vào nội dung"
                ),
                feedback=PedagogicalFeedback(
                    strengths=[],
                    areas_for_improvement=["Cần viết câu trả lời đầy đủ và diễn đạt rõ ý."],
                    transformative_advice="Rèn luyện tính kiên nhẫn và trách nhiệm bằng cách dành thời gian suy nghĩ và trình bày bài làm trọn vẹn.",
                    practical_action_plan=["Đọc kỹ câu hỏi và viết ít nhất một đoạn văn hoàn chỉnh."]
                ),
                total_suggested_score=Decimal("0.00"),
                confidence_score=0.9,
                requires_manual_audit=True,
                audit_reason="Bài viết dưới 10 ký tự, cần giáo viên kiểm tra trực tiếp."
            )

        # Standard deterministic evaluation
        evaluations = []
        total_awarded = Decimal("0.00")
        sample_quote = student_essay[:min(60, essay_len)]

        for r in rubrics:
            crit_max = Decimal(str(r.get("max_points", 0)))
            # Default mock gives 80% of max points
            awarded = (crit_max * Decimal("0.80")).quantize(Decimal("0.01"))
            total_awarded += awarded
            evaluations.append(CriterionEvaluation(
                criterion_name=r.get("criterion_name", "Tiêu chí"),
                max_points=crit_max,
                awarded_points=awarded,
                direct_quotes=[sample_quote],
                reasoning=f"Học viên thể hiện hiểu biết tốt về tiêu chuẩn {r.get('criterion_name')} thông qua ví dụ thực tế."
            ))

        return AIAssessmentOutput(
            rubric_evaluations=evaluations,
            three_roots=ThreeRootsManifestation(
                dao_duc=f"Bài viết thể hiện tinh thần sẻ chia và trách nhiệm cộng đồng qua cách tiếp cận nhân ái: '{sample_quote}...'",
                tri_tue="Lập luận có cấu trúc mạch lạc, phân tích rõ nguyên nhân - kết quả của hành động.",
                nghi_luc="Thể hiện tinh thần sẵn sàng vượt qua khó khăn để giúp đỡ người khác."
            ),
            three_poisons=ThreePoisonsManifestation(
                tham="Không phát hiện biểu hiện mưu cầu lợi ích cá nhân trong nội dung.",
                san="Văn phong điềm tĩnh, không có dấu hiệu công kích hay bức xúc tiêu cực.",
                si="Nhận định khách quan, không sa đà vào thành kiến một chiều."
            ),
            feedback=PedagogicalFeedback(
                strengths=[
                    "Tinh thần thấu cảm và trách nhiệm cao",
                    "Cách lập luận rõ ràng và dẫn chứng sinh động"
                ],
                areas_for_improvement=[
                    "Có thể phân tích sâu hơn các giải pháp mang tính bền vững lâu dài"
                ],
                transformative_advice="Tiếp tục nuôi dưỡng tâm vị tha và mở rộng tư duy hệ thống để giải quyết các vấn đề phức tạp hơn.",
                practical_action_plan=[
                    "Tham gia thêm các hoạt động thiện nguyện thực tế",
                    "Đọc thêm sách tư duy phản biện"
                ]
            ),
            total_suggested_score=total_awarded,
            confidence_score=0.95,
            requires_manual_audit=False
        )

    async def generate_rubrics(
        self,
        question_content: str,
        total_points: Decimal
    ) -> List[Dict[str, Any]]:
        # Phân bổ điểm cho 3 Gốc rễ: Đạo đức (35%), Trí tuệ (35%), Nghị lực (30%)
        p1 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
        p2 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
        p3 = total_points - p1 - p2

        return [
            {
                "criterion_name": "Đạo đức (Tâm vị tha & Trách nhiệm)",
                "description": "Thể hiện sự trung thực, lòng trắc ẩn, tính phụng sự và tinh thần trách nhiệm với xã hội trong cách tiếp cận vấn đề.",
                "max_points": p1,
                "level_descriptors": {
                    "xuat_sac": float(p1),
                    "dat": float((p1 * Decimal("0.60")).quantize(Decimal("0.01"))),
                    "chua_dat": 0.0
                }
            },
            {
                "criterion_name": "Trí tuệ (Tư duy Nhân Quả & Giải pháp)",
                "description": "Hiểu đúng bản chất sự việc, phân tích rõ ràng mối quan hệ nhân quả (nguyên nhân - kết quả), lập luận logic và đề xuất giải pháp khả thi.",
                "max_points": p2,
                "level_descriptors": {
                    "xuat_sac": float(p2),
                    "dat": float((p2 * Decimal("0.60")).quantize(Decimal("0.01"))),
                    "chua_dat": 0.0
                }
            },
            {
                "criterion_name": "Nghị lực (Dũng - Nhẫn - Tĩnh)",
                "description": "Thể hiện ý chí kiên định vượt khó, dũng cảm đối diện sự thật, bền bỉ theo đuổi mục tiêu và thái độ điềm tĩnh trước áp lực.",
                "max_points": p3,
                "level_descriptors": {
                    "xuat_sac": float(p3),
                    "dat": float((p3 * Decimal("0.60")).quantize(Decimal("0.01"))),
                    "chua_dat": 0.0
                }
            }
        ]
