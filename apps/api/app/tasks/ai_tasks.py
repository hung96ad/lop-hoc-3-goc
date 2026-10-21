from datetime import datetime, timezone
from decimal import Decimal
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import AsyncSessionLocal
from app.models.attempts import Answer, Attempt, AttemptStatus
from app.models.grading import GradingResult, AIAnalysis
from app.models.exams import ExamQuestion
from app.agents.workflow import ai_workflow
from app.core.queue import register_task

logger = logging.getLogger(__name__)


async def evaluate_essay_answer_task(answer_id: str):
    """Background task to evaluate an essay answer with AI Agent 3 Roots - 3 Poisons"""
    async with AsyncSessionLocal() as db:
        try:
            # 1. Load answer, exam question and attempt
            query = select(Answer).where(Answer.id == answer_id).options(
                selectinload(Answer.exam_question),
                selectinload(Answer.attempt),
                selectinload(Answer.grading_result)
            )
            res = await db.execute(query)
            answer = res.scalar_one_or_none()
            if not answer:
                logger.error(f"Answer {answer_id} not found for AI evaluation")
                return

            eq: ExamQuestion = answer.exam_question
            frozen_q = eq.frozen_question_data
            frozen_rubrics = eq.frozen_rubric_data
            student_text = answer.text_response
            question_content = frozen_q.get("content", "")
            max_score = eq.points

            # 2. Run AI Assessment Workflow
            ai_output = await ai_workflow.run_assessment(
                question_content=question_content,
                student_essay=student_text,
                rubrics=frozen_rubrics,
                max_score=max_score
            )

            # 3. Save AI Analysis record (audit trail & versioning)
            # Count previous job versions
            count_res = await db.execute(select(AIAnalysis).where(AIAnalysis.answer_id == answer_id))
            job_v = len(count_res.scalars().all()) + 1

            analysis = AIAnalysis(
                answer_id=answer.id,
                job_version=job_v,
                model_provider="mock" if ai_workflow.is_mock else "openai",
                prompt_version="v1.0",
                three_roots_analysis=ai_output.three_roots.model_dump(mode="json"),
                three_poisons_analysis=ai_output.three_poisons.model_dump(mode="json"),
                pedagogical_feedback=ai_output.feedback.model_dump(mode="json"),
                rubric_evaluations=[e.model_dump(mode="json") for e in ai_output.rubric_evaluations],
                proposed_total_score=ai_output.total_suggested_score,
                confidence_score=ai_output.confidence_score,
                requires_manual_audit=ai_output.requires_manual_audit,
                audit_reason=ai_output.audit_reason,
                execution_status="completed",
                completed_at=datetime.now(timezone.utc)
            )
            db.add(analysis)

            # 4. Update GradingResult with AI suggestion (AI DOES NOT overwrite official score)
            gr: GradingResult = answer.grading_result
            if gr:
                clean_score = max(Decimal("0.00"), ai_output.total_suggested_score)
                gr.ai_suggested_score = clean_score
                # Default teacher score initialized to AI proposal for teacher convenience
                gr.teacher_final_score = clean_score
                gr.score = clean_score
            
            # 5. Check if all essay answers in this attempt have been analyzed
            attempt_query = select(Attempt).where(Attempt.id == answer.attempt_id).options(
                selectinload(Attempt.answers).selectinload(Answer.grading_result),
                selectinload(Attempt.answers).selectinload(Answer.exam_question)
            )
            att_res = await db.execute(attempt_query)
            attempt = att_res.scalar_one()

            # Sum total essay score suggested (minimum score for each essay is 0)
            total_essay = Decimal("0.00")
            all_essays_analyzed = True

            for ans in attempt.answers:
                if ans.exam_question.frozen_question_data.get("type") == "essay":
                    if ans.grading_result and ans.grading_result.ai_suggested_score is not None:
                        total_essay += max(Decimal("0.00"), ans.grading_result.ai_suggested_score)
                    else:
                        all_essays_analyzed = False

            if all_essays_analyzed:
                attempt.essay_score = max(Decimal("0.00"), total_essay)
                attempt.final_score = max(Decimal("0.00"), attempt.objective_score + attempt.essay_score)
                attempt.status = AttemptStatus.PENDING_REVIEW.value

            await db.commit()
            logger.info(f"AI Assessment completed for answer {answer_id}")

        except Exception as e:
            logger.error(f"Failed to execute AI assessment task: {e}", exc_info=True)
            await db.rollback()


# Register in worker queue
register_task("evaluate_essay_answer", evaluate_essay_answer_task)
