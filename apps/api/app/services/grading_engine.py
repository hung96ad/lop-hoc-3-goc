from decimal import Decimal
from typing import List, Dict, Any, Tuple
from app.models.questions import QuestionType


class ObjectiveGradingEngine:
    @staticmethod
    def grade_answer(
        question_type: str,
        points: Decimal,
        frozen_question_data: Dict[str, Any],
        selected_option_ids: List[str]
    ) -> Decimal:
        options = frozen_question_data.get("options", [])
        correct_option_ids = {o["id"] for o in options if o.get("is_correct")}
        student_option_ids = set(selected_option_ids)

        if question_type == QuestionType.SINGLE_CHOICE.value:
            if student_option_ids == correct_option_ids and len(student_option_ids) == 1:
                return points
            return Decimal("0.00")

        elif question_type == QuestionType.MULTIPLE_SELECT.value:
            # All or nothing mode (standard and robust)
            if student_option_ids == correct_option_ids:
                return points
            
            # Partial credit mode (if no incorrect options were chosen)
            incorrect_option_ids = {o["id"] for o in options if not o.get("is_correct")}
            selected_incorrect = student_option_ids.intersection(incorrect_option_ids)
            if selected_incorrect or not correct_option_ids:
                return Decimal("0.00")
            
            selected_correct = student_option_ids.intersection(correct_option_ids)
            ratio = Decimal(len(selected_correct)) / Decimal(len(correct_option_ids))
            earned = (points * ratio).quantize(Decimal("0.01"))
            return earned

        return Decimal("0.00")
