from decimal import Decimal
from typing import List, Dict, Any, Protocol, Tuple
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
                    is_deduction=r.get("is_deduction", False),
                    points_deducted=Decimal("0.00"),
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
                    si="Thiếu sự đầu tư vào nội dung",
                    points_deducted=Decimal("0.00"),
                    tham_deduction=Decimal("0.00"),
                    san_deduction=Decimal("0.00"),
                    si_deduction=Decimal("0.00")
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
        positive_awarded = Decimal("0.00")
        sample_quote = student_essay[:min(60, essay_len)]
        text_lower = student_essay.lower()

        # Helper to check keywords ignoring common negations like "thay vì ...", "không ..."
        def detect_poison_keyword(keywords: List[str]) -> Tuple[bool, str]:
            for kw in keywords:
                idx = text_lower.find(kw)
                if idx != -1:
                    preceding = text_lower[max(0, idx - 20):idx]
                    if any(neg in preceding for neg in ["thay vì", "thay vi", "không", "khong", "tránh", "chống", "loại bỏ"]):
                        continue
                    # Extract a snippet around the match
                    start = max(0, idx - 10)
                    end = min(len(student_essay), idx + len(kw) + 30)
                    return True, student_essay[start:end].strip()
            return False, ""

        # 3 Poisons Analysis
        tham_detected, tham_quote = detect_poison_keyword([
            "tham lam", "vụ lợi", "trục lợi", "lợi ích riêng", "chiếm đoạt",
            "chỉ cần tôi giàu", "chỉ nghĩ đến mình", "ích kỷ", "mưu cầu riêng"
        ])
        san_detected, san_quote = detect_poison_keyword([
            "sân hận", "hận thù", "trả thù", "tức giận", "đánh chết",
            "chửi bới", "tiêu diệt", "tẩy chay", "bất mãn gay gắt", "căm ghét"
        ])
        si_detected, si_quote = detect_poison_keyword([
            "mê tín", "ngụy biện", "ảo tưởng", "không cần học", "may rủi",
            "bảo thủ", "không cần nhân quả", "phiến diện một chiều", "u mê"
        ])

        poison_unit_penalty = (max_score * Decimal("0.20")).quantize(Decimal("0.01"))
        tham_deduct = poison_unit_penalty if tham_detected else Decimal("0.00")
        san_deduct = poison_unit_penalty if san_detected else Decimal("0.00")
        si_deduct = poison_unit_penalty if si_detected else Decimal("0.00")

        tham_text = (
            f"Phát hiện dấu hiệu vụ lợi, vị kỷ trong bài viết: '{tham_quote}' (Trừ {tham_deduct} điểm)."
            if tham_detected
            else "Không phát hiện biểu hiện mưu cầu lợi ích cá nhân trong nội dung."
        )
        san_text = (
            f"Phát hiện cảm xúc bức xúc, công kích hoặc giận dữ: '{san_quote}' (Trừ {san_deduct} điểm)."
            if san_detected
            else "Văn phong điềm tĩnh, không có dấu hiệu công kích hay bức xúc tiêu cực."
        )
        si_text = (
            f"Phát hiện nhận định thiếu cơ sở thực tế hoặc tư duy phiến diện: '{si_quote}' (Trừ {si_deduct} điểm)."
            if si_detected
            else "Nhận định khách quan, không sa đà vào thành kiến một chiều."
        )

        rubric_deductions = Decimal("0.00")
        has_deduction_rubric = any(
            r.get("is_deduction", False) or "trừ" in r.get("criterion_name", "").lower()
            for r in rubrics
        )

        for r in rubrics:
            crit_max = Decimal(str(r.get("max_points", 0)))
            crit_name = r.get("criterion_name", "Tiêu chí")
            crit_name_lower = crit_name.lower()
            is_deduct = r.get("is_deduction", False) or "trừ" in crit_name_lower

            if is_deduct:
                deducted = Decimal("0.00")
                reason = "Không phát hiện vi phạm tiêu chí này (không trừ điểm)."
                quotes = []

                if "tham" in crit_name_lower:
                    if tham_detected:
                        deducted = min(crit_max, tham_deduct or crit_max)
                        reason = f"Trừ {deducted} điểm do có biểu hiện Tham (vị kỷ, trục lợi)."
                        quotes = [tham_quote]
                elif "sân" in crit_name_lower or "san" in crit_name_lower:
                    if san_detected:
                        deducted = min(crit_max, san_deduct or crit_max)
                        reason = f"Trừ {deducted} điểm do có biểu hiện Sân (công kích, giận dữ)."
                        quotes = [san_quote]
                elif "si" in crit_name_lower:
                    if si_detected:
                        deducted = min(crit_max, si_deduct or crit_max)
                        reason = f"Trừ {deducted} điểm do có biểu hiện Si (định kiến, ngụy biện)."
                        quotes = [si_quote]
                else:
                    if tham_detected or san_detected or si_detected:
                        deducted = (crit_max * Decimal("0.50")).quantize(Decimal("0.01"))
                        reason = f"Trừ {deducted} điểm do phát hiện biểu hiện 3 Độc."

                rubric_deductions += deducted
                evaluations.append(CriterionEvaluation(
                    criterion_name=crit_name,
                    max_points=crit_max,
                    awarded_points=deducted,
                    is_deduction=True,
                    points_deducted=deducted,
                    direct_quotes=quotes,
                    reasoning=reason
                ))
            else:
                # Positive 3 Roots criteria: 80% default mock score
                awarded = (crit_max * Decimal("0.80")).quantize(Decimal("0.01"))
                positive_awarded += awarded
                evaluations.append(CriterionEvaluation(
                    criterion_name=crit_name,
                    max_points=crit_max,
                    awarded_points=awarded,
                    is_deduction=False,
                    points_deducted=Decimal("0.00"),
                    direct_quotes=[sample_quote],
                    reasoning=f"Học viên thể hiện hiểu biết tốt về tiêu chuẩn {crit_name} thông qua ví dụ thực tế."
                ))

        # Total points deducted by 3 Poisons
        if has_deduction_rubric:
            total_deductions = rubric_deductions
        else:
            total_deductions = tham_deduct + san_deduct + si_deduct

        # Minimum score is 0.00 for essay questions
        final_suggested = max(Decimal("0.00"), min(positive_awarded - total_deductions, max_score))

        return AIAssessmentOutput(
            rubric_evaluations=evaluations,
            three_roots=ThreeRootsManifestation(
                dao_duc=f"Bài viết thể hiện tinh thần sẻ chia và trách nhiệm cộng đồng qua cách tiếp cận nhân ái: '{sample_quote}...'",
                tri_tue="Lập luận có cấu trúc mạch lạc, phân tích rõ nguyên nhân - kết quả của hành động.",
                nghi_luc="Thể hiện tinh thần sẵn sàng vượt qua khó khăn để giúp đỡ người khác."
            ),
            three_poisons=ThreePoisonsManifestation(
                tham=tham_text,
                san=san_text,
                si=si_text,
                points_deducted=total_deductions,
                tham_deduction=tham_deduct,
                san_deduction=san_deduct,
                si_deduction=si_deduct
            ),
            feedback=PedagogicalFeedback(
                strengths=[
                    "Tinh thần thấu cảm và trách nhiệm cao",
                    "Cách lập luận rõ ràng và dẫn chứng sinh động"
                ],
                areas_for_improvement=[
                    "Có thể phân tích sâu hơn các giải pháp mang tính bền vững lâu dài"
                ] if not (tham_detected or san_detected or si_detected) else [
                    "Cần thanh lọc các biểu hiện 3 Độc (vị kỷ, công kích, định kiến) để bài làm khách quan và nhân văn hơn."
                ],
                transformative_advice="Tiếp tục nuôi dưỡng tâm vị tha và mở rộng tư duy hệ thống để giải quyết các vấn đề phức tạp hơn.",
                practical_action_plan=[
                    "Tham gia thêm các hoạt động thiện nguyện thực tế",
                    "Đọc thêm sách tư duy phản biện"
                ]
            ),
            total_suggested_score=final_suggested,
            confidence_score=0.95,
            requires_manual_audit=False
        )

    async def generate_rubrics(
        self,
        question_content: str,
        total_points: Decimal
    ) -> List[Dict[str, Any]]:
        content_lower = question_content.lower()
        # Kiểm tra xem câu hỏi có yêu cầu học sinh phân tích / nhận diện 3 Độc không
        is_analyzing_poisons = any(k in content_lower for k in [
            "3 độc", "ba độc", "tham, sân, si", "tham sân si", "tâm tham", "tâm sân", "tâm si",
            "nhận diện 3 độc", "phân tích 3 độc", "chuyển hóa 3 độc"
        ])

        if is_analyzing_poisons:
            # Câu hỏi yêu cầu phân tích 3 Độc -> Tiêu chí phân tích 3 Độc là TIÊU CHÍ CỘNG ĐIỂM (+)
            p1 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
            p2 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
            p3 = total_points - p1 - p2
            pen = max(Decimal("1.00"), (total_points * Decimal("0.20")).quantize(Decimal("0.01")))

            return [
                {
                    "criterion_name": "Nhận diện & Phân tích 3 Độc (Tham - Sân - Si)",
                    "description": "Nhận diện chính xác và phân tích rõ nguồn gốc của tâm Tham, Sân hoặc Si giật dây trong tình huống theo yêu cầu câu hỏi.",
                    "max_points": p1,
                    "is_deduction": False,
                    "level_descriptors": {
                        "xuat_sac": float(p1),
                        "dat": float((p1 * Decimal("0.60")).quantize(Decimal("0.01"))),
                        "chua_dat": 0.0
                    }
                },
                {
                    "criterion_name": "Trí tuệ (Tư duy Nhân Quả & Giải pháp Chuyển hóa)",
                    "description": "Hiểu đúng bản chất sự việc, phân tích rõ ràng nguyên nhân - kết quả và đề xuất giải pháp chuyển hóa từ 3 Độc sang 3 Gốc khả thi.",
                    "max_points": p2,
                    "is_deduction": False,
                    "level_descriptors": {
                        "xuat_sac": float(p2),
                        "dat": float((p2 * Decimal("0.60")).quantize(Decimal("0.01"))),
                        "chua_dat": 0.0
                    }
                },
                {
                    "criterion_name": "Đạo đức & Nghị lực trong hành xử",
                    "description": "Thể hiện lòng vị tha, bao dung, ý chí kiên định vượt khó, dũng cảm đối diện sự thật và thái độ điềm tĩnh.",
                    "max_points": p3,
                    "is_deduction": False,
                    "level_descriptors": {
                        "xuat_sac": float(p3),
                        "dat": float((p3 * Decimal("0.60")).quantize(Decimal("0.01"))),
                        "chua_dat": 0.0
                    }
                },
                {
                    "criterion_name": "Trừ điểm: Biểu hiện 3 Độc cá nhân (Vị kỷ & Công kích)",
                    "description": "Trừ điểm nếu bài viết của học viên bộc lộ tư tưởng vụ lợi, giận dữ công kích đối phương hoặc ngụy biện phiến diện.",
                    "max_points": pen,
                    "is_deduction": True,
                    "level_descriptors": {
                        "vi_pham_nang": float(pen),
                        "vi_pham_nhe": float((pen * Decimal("0.50")).quantize(Decimal("0.01"))),
                        "khong_vi_pham": 0.0
                    }
                }
            ]

        # Phân bổ điểm cho 3 Gốc rễ: Đạo đức (35%), Trí tuệ (35%), Nghị lực (30%)
        p1 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
        p2 = (total_points * Decimal("0.35")).quantize(Decimal("0.01"))
        p3 = total_points - p1 - p2

        # Phân bổ điểm trừ cho 3 Độc (Tham: 20%, Sân: 20%, Si: 20% tổng điểm)
        pen_tham = max(Decimal("1.00"), (total_points * Decimal("0.20")).quantize(Decimal("0.01")))
        pen_san = max(Decimal("1.00"), (total_points * Decimal("0.20")).quantize(Decimal("0.01")))
        pen_si = max(Decimal("1.00"), (total_points * Decimal("0.20")).quantize(Decimal("0.01")))

        return [
            # 3 Gốc rễ (Tiêu chí cộng điểm)
            {
                "criterion_name": "Đạo đức (Tâm vị tha & Trách nhiệm)",
                "description": "Thể hiện sự trung thực, lòng trắc ẩn, tính phụng sự và tinh thần trách nhiệm với xã hội trong cách tiếp cận vấn đề.",
                "max_points": p1,
                "is_deduction": False,
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
                "is_deduction": False,
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
                "is_deduction": False,
                "level_descriptors": {
                    "xuat_sac": float(p3),
                    "dat": float((p3 * Decimal("0.60")).quantize(Decimal("0.01"))),
                    "chua_dat": 0.0
                }
            },
            # 3 Độc (Tiêu chí trừ điểm khi có biểu hiện tiêu cực)
            {
                "criterion_name": "Trừ điểm: Tham (Vị kỷ & Trục lợi)",
                "description": "Trừ điểm nếu bài viết thể hiện mưu cầu lợi ích cá nhân ích kỷ, tham lam, vụ lợi, đòi hỏi quá mức hoặc coi thường lợi ích cộng đồng.",
                "max_points": pen_tham,
                "is_deduction": True,
                "level_descriptors": {
                    "vi_pham_nang": float(pen_tham),
                    "vi_pham_nhe": float((pen_tham * Decimal("0.50")).quantize(Decimal("0.01"))),
                    "khong_vi_pham": 0.0
                }
            },
            {
                "criterion_name": "Trừ điểm: Sân (Công kích & Giận dữ)",
                "description": "Trừ điểm nếu bài viết thể hiện sự giận dữ, bất mãn, oán trách, công kích thù hận cá nhân, ngôn từ tiêu cực hoặc hiếu thắng.",
                "max_points": pen_san,
                "is_deduction": True,
                "level_descriptors": {
                    "vi_pham_nang": float(pen_san),
                    "vi_pham_nhe": float((pen_san * Decimal("0.50")).quantize(Decimal("0.01"))),
                    "khong_vi_pham": 0.0
                }
            },
            {
                "criterion_name": "Trừ điểm: Si (Định kiến & Mê muội)",
                "description": "Trừ điểm nếu bài viết thể hiện cái nhìn phiến diện, ngụy biện, mê tín, bảo thủ, ảo tưởng hoặc phủ nhận quy luật nhân quả.",
                "max_points": pen_si,
                "is_deduction": True,
                "level_descriptors": {
                    "vi_pham_nang": float(pen_si),
                    "vi_pham_nhe": float((pen_si * Decimal("0.50")).quantize(Decimal("0.01"))),
                    "khong_vi_pham": 0.0
                }
            }
        ]
