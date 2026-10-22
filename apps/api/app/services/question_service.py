import io
import re
import math
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.models.questions import Question, QuestionType, QuestionOption, QuestionRubric
from app.models.classes import Class
from app.models.subjects import Subject
from app.schemas.question import (
    QuestionCreate,
    QuestionUpdate,
    QuestionRubricCreate,
    QuestionOptionCreate,
    QuestionImportResult,
    QuestionImportError,
    QuestionRead,
    GenerateFromPDFResult,
)
from app.agents.workflow import ai_workflow


class QuestionService:
    @staticmethod
    async def list_questions(
        db: AsyncSession,
        user_id: str,
        question_type: Optional[str] = None,
        category_id: Optional[str] = None,
        class_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict:
        base_query = select(Question).where(
            Question.created_by == user_id,
            Question.is_active == True
        )
        if question_type and question_type != "all":
            base_query = base_query.where(Question.type == question_type)
        if category_id:
            base_query = base_query.where(Question.category_id == category_id)
        if subject_id:
            if subject_id == "unassigned":
                base_query = base_query.where(Question.subject_id.is_(None))
            else:
                base_query = base_query.where(Question.subject_id == subject_id)
        if class_id:
            if class_id == "unassigned":
                base_query = base_query.where(Question.class_id.is_(None))
            else:
                base_query = base_query.where(Question.class_id == class_id)

        # Count total
        count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
        total = count_result.scalar() or 0

        # Fetch page
        offset = (page - 1) * page_size
        query = base_query.options(
            selectinload(Question.options),
            selectinload(Question.rubrics),
            selectinload(Question.class_obj),
            selectinload(Question.subject),
        ).order_by(Question.created_at.desc()).offset(offset).limit(page_size)

        result = await db.execute(query)
        items = list(result.scalars().all())

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": math.ceil(total / page_size) if total > 0 else 1,
        }

    @staticmethod
    async def get_question(db: AsyncSession, question_id: str, user_id: str) -> Question:
        query = select(Question).where(
            Question.id == question_id,
            Question.created_by == user_id,
            Question.is_active == True
        ).options(
            selectinload(Question.options),
            selectinload(Question.rubrics),
            selectinload(Question.class_obj),
            selectinload(Question.subject)
        )
        result = await db.execute(query)
        question = result.scalar_one_or_none()
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found"
            )
        return question

    @staticmethod
    async def create_question(db: AsyncSession, data: QuestionCreate, user_id: str) -> Question:
        # Validate question type
        valid_types = [t.value for t in QuestionType]
        if data.type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid question type. Allowed: {valid_types}"
            )

        # Validate subject if provided
        if data.subject_id:
            subj_res = await db.execute(
                select(Subject).where(Subject.id == data.subject_id, Subject.created_by == user_id)
            )
            if not subj_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Môn học được chọn không hợp lệ hoặc bạn không có quyền quản lý."
                )

        # Validate class if provided
        if data.class_id:
            cls_res = await db.execute(
                select(Class).where(Class.id == data.class_id, Class.teacher_id == user_id)
            )
            if not cls_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lớp học được chọn không hợp lệ hoặc bạn không có quyền quản lý."
                )

        # Validate options for choice types
        if data.type in [QuestionType.SINGLE_CHOICE.value, QuestionType.MULTIPLE_SELECT.value]:
            if not data.options or len(data.options) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Choice questions must have at least 2 options"
                )
            correct_count = sum(1 for o in data.options if o.is_correct)
            if data.type == QuestionType.SINGLE_CHOICE.value and correct_count != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Single choice question must have exactly 1 correct option"
                )
            if data.type == QuestionType.MULTIPLE_SELECT.value and correct_count < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple select question must have at least 1 correct option"
                )

        # Validate rubrics for essay
        if data.type == QuestionType.ESSAY.value:
            if not data.rubrics or len(data.rubrics) < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Essay question must have at least 1 rubric criterion"
                )
            positive_rubrics = [r for r in data.rubrics if not getattr(r, "is_deduction", False)]
            if not positive_rubrics:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phải có ít nhất 1 tiêu chí cộng điểm (3 Gốc) cho câu tự luận"
                )
            rubric_sum = sum(r.max_points for r in positive_rubrics)
            if rubric_sum != data.default_points:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tổng điểm các tiêu chí cộng điểm ({rubric_sum}) phải bằng điểm mặc định của câu hỏi ({data.default_points})"
                )

        question = Question(
            category_id=data.category_id,
            subject_id=data.subject_id,
            class_id=data.class_id,
            created_by=user_id,
            type=data.type,
            content=data.content,
            default_points=data.default_points,
            version=1,
            is_active=True
        )
        db.add(question)
        await db.flush()

        if data.options:
            for idx, opt in enumerate(data.options):
                option_obj = QuestionOption(
                    question_id=question.id,
                    content=opt.content,
                    is_correct=opt.is_correct,
                    order_index=opt.order_index if opt.order_index else idx,
                    explanation=opt.explanation or ""
                )
                db.add(option_obj)

        if data.rubrics:
            for rub in data.rubrics:
                rubric_obj = QuestionRubric(
                    question_id=question.id,
                    criterion_name=rub.criterion_name,
                    description=rub.description or "",
                    max_points=rub.max_points,
                    is_deduction=getattr(rub, "is_deduction", False),
                    level_descriptors=rub.level_descriptors,
                    version=1
                )
                db.add(rubric_obj)

        await db.commit()
        return await QuestionService.get_question(db, question.id, user_id)

    @staticmethod
    async def duplicate_question(db: AsyncSession, question_id: str, user_id: str) -> Question:
        orig = await QuestionService.get_question(db, question_id, user_id)
        dup = Question(
            category_id=orig.category_id,
            subject_id=orig.subject_id,
            class_id=orig.class_id,
            created_by=user_id,
            type=orig.type,
            content=f"[Bản sao] {orig.content}",
            default_points=orig.default_points,
            version=1,
            is_active=True
        )
        db.add(dup)
        await db.flush()

        for opt in orig.options:
            db.add(QuestionOption(
                question_id=dup.id,
                content=opt.content,
                is_correct=opt.is_correct,
                order_index=opt.order_index,
                explanation=opt.explanation
            ))

        for rub in orig.rubrics:
            db.add(QuestionRubric(
                question_id=dup.id,
                criterion_name=rub.criterion_name,
                description=rub.description,
                max_points=rub.max_points,
                is_deduction=getattr(rub, "is_deduction", False),
                level_descriptors=rub.level_descriptors,
                version=1
            ))

        await db.commit()
        return await QuestionService.get_question(db, dup.id, user_id)

    @staticmethod
    async def update_question(db: AsyncSession, question_id: str, data: QuestionUpdate, user_id: str) -> Question:
        question = await QuestionService.get_question(db, question_id, user_id)

        if data.content is not None:
            question.content = data.content
        if data.default_points is not None:
            question.default_points = data.default_points
        if data.category_id is not None:
            question.category_id = data.category_id
        if data.subject_id is not None:
            if data.subject_id == "":
                question.subject_id = None
            else:
                subj_res = await db.execute(
                    select(Subject).where(Subject.id == data.subject_id, Subject.created_by == user_id)
                )
                if not subj_res.scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Môn học được chọn không hợp lệ hoặc bạn không có quyền quản lý."
                    )
                question.subject_id = data.subject_id
        if data.class_id is not None:
            if data.class_id == "":
                question.class_id = None
            else:
                cls_res = await db.execute(
                    select(Class).where(Class.id == data.class_id, Class.teacher_id == user_id)
                )
                if not cls_res.scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Lớp học được chọn không hợp lệ hoặc bạn không có quyền quản lý."
                    )
                question.class_id = data.class_id

        # Replace options if provided
        if data.options is not None:
            for opt in question.options:
                await db.delete(opt)
            await db.flush()
            for idx, opt in enumerate(data.options):
                db.add(QuestionOption(
                    question_id=question.id,
                    content=opt.content,
                    is_correct=opt.is_correct,
                    order_index=opt.order_index if opt.order_index else idx,
                    explanation=opt.explanation or ""
                ))

        # Replace rubrics if provided
        if data.rubrics is not None:
            for rub in question.rubrics:
                await db.delete(rub)
            await db.flush()
            for rub in data.rubrics:
                db.add(QuestionRubric(
                    question_id=question.id,
                    criterion_name=rub.criterion_name,
                    description=rub.description or "",
                    max_points=rub.max_points,
                    is_deduction=getattr(rub, "is_deduction", False),
                    level_descriptors=rub.level_descriptors,
                    version=1
                ))

        question.version = question.version + 1
        await db.commit()
        return await QuestionService.get_question(db, question.id, user_id)

    @staticmethod
    async def delete_question(db: AsyncSession, question_id: str, user_id: str) -> None:
        question = await QuestionService.get_question(db, question_id, user_id)
        question.is_active = False
        await db.commit()

    @staticmethod
    async def bulk_delete_questions(db: AsyncSession, question_ids: List[str], user_id: str) -> int:
        from sqlalchemy import update as sa_update
        result = await db.execute(
            sa_update(Question)
            .where(
                Question.id.in_(question_ids),
                Question.created_by == user_id,
                Question.is_active == True
            )
            .values(is_active=False)
        )
        await db.commit()
        return result.rowcount

    @staticmethod
    async def generate_rubrics(content: str, total_points: Optional[Decimal] = None) -> List[QuestionRubricCreate]:
        if not content or not content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nội dung câu hỏi không được để trống khi tạo Rubric."
            )
        pts = total_points if (total_points and total_points > Decimal("0.00")) else Decimal("10.00")
        rubrics_dict = await ai_workflow.generate_rubrics(question_content=content.strip(), total_points=pts)
        return [
            QuestionRubricCreate(
                criterion_name=r["criterion_name"],
                description=r.get("description", ""),
                max_points=Decimal(str(r["max_points"])),
                is_deduction=r.get("is_deduction", False),
                level_descriptors=r.get("level_descriptors", {})
            )
            for r in rubrics_dict
        ]

    @staticmethod
    async def generate_questions_from_pdf(
        db: AsyncSession,
        pdf_bytes: bytes,
        user_id: str,
        single_choice_count: int,
        multiple_select_count: int,
        essay_count: int,
        subject_id: Optional[str],
        class_id: Optional[str],
        default_points_single: float,
        default_points_multiple: float,
        default_points_essay: float,
    ) -> GenerateFromPDFResult:
        # Extract text from PDF
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(pdf_bytes))
            pdf_text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể đọc file PDF: {str(e)}"
            )

        if not pdf_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File PDF không có nội dung văn bản có thể đọc được (có thể là PDF dạng ảnh scan)."
            )

        # Validate subject/class ownership
        if subject_id:
            subj_res = await db.execute(
                select(Subject).where(Subject.id == subject_id, Subject.created_by == user_id)
            )
            if not subj_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Môn học được chọn không hợp lệ."
                )
        if class_id:
            cls_res = await db.execute(
                select(Class).where(Class.id == class_id, Class.teacher_id == user_id)
            )
            if not cls_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lớp học được chọn không hợp lệ."
                )

        # Generate questions via AI
        try:
            generated = await ai_workflow.generate_questions_from_pdf(
                pdf_text=pdf_text,
                single_choice_count=single_choice_count,
                multiple_select_count=multiple_select_count,
                essay_count=essay_count,
                default_points_single=Decimal(str(default_points_single)),
                default_points_multiple=Decimal(str(default_points_multiple)),
                default_points_essay=Decimal(str(default_points_essay)),
            )
        except Exception as ai_err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Lỗi AI khi đọc PDF và tạo câu hỏi: {str(ai_err)}"
            )

        # Save generated questions to DB
        saved_questions = []
        for q_data in generated:
            q_type = q_data["type"]
            pts = Decimal(str(q_data["default_points"]))

            question = Question(
                subject_id=subject_id,
                class_id=class_id,
                created_by=user_id,
                type=q_type,
                content=q_data["content"],
                default_points=pts,
                version=1,
                is_active=True,
            )
            db.add(question)
            await db.flush()

            for idx, opt in enumerate(q_data.get("options", [])):
                db.add(QuestionOption(
                    question_id=question.id,
                    content=opt["content"],
                    is_correct=opt["is_correct"],
                    order_index=opt.get("order_index", idx),
                    explanation="",
                ))

            for rub in q_data.get("rubrics", []):
                db.add(QuestionRubric(
                    question_id=question.id,
                    criterion_name=rub["criterion_name"],
                    description=rub.get("description", ""),
                    max_points=Decimal(str(rub["max_points"])),
                    is_deduction=rub.get("is_deduction", False),
                    level_descriptors=rub.get("level_descriptors", {}),
                    version=1,
                ))

            saved_questions.append(question)

        await db.commit()

        # Reload with relationships
        result_questions = []
        for q in saved_questions:
            loaded = await QuestionService.get_question(db, q.id, user_id)
            result_questions.append(loaded)

        total_requested = single_choice_count + multiple_select_count + essay_count
        return GenerateFromPDFResult(
            total_generated=len(generated),
            saved_count=len(result_questions),
            questions=result_questions,
            message=f"Đã tạo thành công {len(result_questions)}/{total_requested} câu hỏi từ PDF."
        )

    @staticmethod
    def generate_excel_template() -> bytes:
        """
        Tạo file Excel mẫu để giáo viên nhập câu hỏi hàng loạt
        Bao gồm 2 sheet: 'Ngân hàng câu hỏi' và 'Hướng dẫn'
        """
        wb = openpyxl.Workbook()

        # --- Sheet 1: Danh sách câu hỏi ---
        ws = wb.active
        ws.title = "Ngân hàng câu hỏi"

        # Định nghĩa màu sắc và font chuẩn
        header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid") # Dark blue
        header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1")
        )

        headers = [
            "STT",
            "Loại câu hỏi",
            "Nội dung câu hỏi",
            "Điểm",
            "Đáp án A",
            "Đáp án B",
            "Đáp án C",
            "Đáp án D",
            "Đáp án đúng",
            "Giải thích",
            "Rubric tự luận",
            "Mã môn học",
            "Mã lớp"
        ]

        ws.append(headers)
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border

        ws.row_dimensions[1].height = 28

        # Mẫu dữ liệu
        sample_rows = [
            [
                1,
                "single_choice",
                "Thủ đô của nước Cộng hòa Xã hội Chủ nghĩa Việt Nam là thành phố nào?",
                2.00,
                "Hà Nội",
                "Hồ Chí Minh",
                "Đà Nẵng",
                "Hải Phòng",
                "A",
                "Hà Nội là thủ đô của Việt Nam theo Hiến pháp.",
                "",
                "CK1",
                ""
            ],
            [
                2,
                "multiple_select",
                "Những phẩm chất nào sau đây thể hiện tinh thần Nghị Lực (3 Gốc: Dũng - Nhẫn - Tĩnh)?",
                2.00,
                "Dũng cảm nhận lỗi và chịu trách nhiệm khi làm sai",
                "Kiên trì vượt qua khó khăn để hoàn thành mục tiêu",
                "Trốn tránh trách nhiệm và đổ lỗi cho hoàn cảnh",
                "Giữ bình tĩnh, tỉnh táo trước áp lực",
                "A, B, D",
                "Dũng, Nhẫn, Tĩnh là 3 yếu tố cốt lõi của Nghị Lực.",
                "",
                "CK1",
                ""
            ],
            [
                3,
                "essay",
                "Trình bày cách nhận diện 3 Độc (Tham - Sân - Si) trong một tình huống xung đột thực tế và đề xuất giải pháp chuyển hóa sang 3 Gốc rễ.",
                10.00,
                "",
                "",
                "",
                "",
                "",
                "Bài làm cần nhận diện chính xác 3 Độc và vận dụng 3 Gốc để chuyển hóa giải quyết vấn đề.",
                "(+) Nhận diện & Phân tích 3 Độc: 3.50: Nhận diện chính xác và phân tích rõ nguồn gốc của tâm Tham, Sân hoặc Si giật dây trong tình huống | (+) Trí tuệ & Giải pháp Chuyển hóa: 3.50: Phân tích nhân quả và đề xuất giải pháp đúng đắn, thấu đáo | (+) Đạo đức & Nghị lực trong hành xử: 3.00: Thể hiện tâm vị tha, dũng cảm nhận lỗi, nhẫn nại lắng nghe và giữ tâm tĩnh | (-) Trừ điểm nếu bộc lộ 3 Độc (Vị kỷ/Công kích): 2.00: Trừ điểm nếu người viết bộc lộ tư tưởng vụ lợi, giận dữ công kích hoặc ngụy biện",
                "CK1",
                ""
            ]
        ]

        data_font = Font(name="Arial", size=10)
        for row_idx, row_data in enumerate(sample_rows, start=2):
            ws.append(row_data)
            ws.row_dimensions[row_idx].height = 24
            for col_idx in range(1, len(row_data) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center", wrap_text=True)

        # Căn độ rộng cột tối ưu
        col_widths = {
            1: 8,   # STT
            2: 18,  # Loại câu hỏi
            3: 45,  # Nội dung
            4: 10,  # Điểm
            5: 22,  # Đáp án A
            6: 22,  # Đáp án B
            7: 22,  # Đáp án C
            8: 22,  # Đáp án D
            9: 15,  # Đáp án đúng
            10: 25, # Giải thích
            11: 40, # Rubric
            12: 15, # Mã môn học
            13: 14  # Mã lớp
        }
        for col_idx, width in col_widths.items():
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        # --- Sheet 2: Hướng dẫn nhập ---
        ws_guide = wb.create_sheet(title="Hướng dẫn nhập")
        guide_headers = ["Tên cột", "Bắt buộc", "Định dạng / Giá trị chấp nhận", "Ghi chú & Ví dụ"]
        ws_guide.append(guide_headers)
        for col_idx in range(1, len(guide_headers) + 1):
            cell = ws_guide.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border
        ws_guide.row_dimensions[1].height = 26

        guides = [
            ("Loại câu hỏi", "Có", "single_choice / multiple_select / essay\n(Hoặc: Trắc nghiệm đơn / Nhiều lựa chọn / Tự luận)", "single_choice: 1 đáp án đúng\nmultiple_select: nhiều đáp án đúng\nessay: tự luận"),
            ("Nội dung câu hỏi", "Có", "Văn bản nội dung câu hỏi", "Nhập rõ ràng câu hỏi cần kiểm tra"),
            ("Điểm", "Có", "Số thực dương (VD: 1.0, 2.0, 10.0)", "Mặc định 2.0 cho trắc nghiệm, 10.0 cho tự luận"),
            ("Đáp án A, B, C, D", "Tuỳ loại", "Văn bản các lựa chọn", "Bắt buộc tối thiểu 2 đáp án đối với câu hỏi trắc nghiệm"),
            ("Đáp án đúng", "Tuỳ loại", "A, B, C, D (hoặc A, B hoặc A,C,D)", "Đối với single_choice: chỉ 1 đáp án (VD: A)\nĐối với multiple_select: các đáp án cách nhau dấu phẩy (VD: A, B, D)"),
            ("Giải thích", "Không", "Văn bản giải thích đáp án", "Hiển thị cho học sinh sau khi hoàn thành bài thi"),
            ("Rubric tự luận", "Không", "[+/-] Tên tiêu chí: Điểm: Mô tả | [+/-] Tên tiêu chí: Điểm: Mô tả", "Dành cho câu tự luận. Tùy chọn CỘNG (+) hoặc TRỪ (-) điểm cho từng tiêu chí:\n• Mặc định: 3 Gốc cộng điểm (+), 3 Độc trừ điểm (-).\n• Với câu hỏi yêu cầu PHÂN TÍCH 3 ĐỘC: Tiêu chí phân tích 3 Độc sẽ được CỘNG ĐIỂM (ghi ký hiệu (+) hoặc có chữ 'Phân tích/Nhận diện', VD: '(+) Nhận diện 3 Độc: 3.50: Mô tả...').\n• Tiêu chí trừ điểm: Ghi (-) hoặc chữ 'Trừ điểm' (VD: '(-) Trừ điểm: Tham: 2.00: Mô tả...').\n• Tổng điểm các tiêu chí (+) bằng đúng điểm câu hỏi. Min điểm câu tự luận luôn là 0.00."),
            ("Mã môn học", "Không", "Mã code của môn học (VD: CK1)", "Nếu để trống, câu hỏi sẽ được gán cho môn học bạn chọn trên giao diện hoặc ngân hàng chung."),
            ("Mã lớp", "Không", "Mã code của lớp học (VD: LOP10A1)", "Tuỳ chọn nếu muốn gán cụ thể cho lớp học.")
        ]

        for r_idx, (cname, req, val, note) in enumerate(guides, start=2):
            ws_guide.append([cname, req, val, note])
            ws_guide.row_dimensions[r_idx].height = 36
            for c_idx in range(1, 5):
                cell = ws_guide.cell(row=r_idx, column=c_idx)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center", wrap_text=True)

        ws_guide.column_dimensions["A"].width = 20
        ws_guide.column_dimensions["B"].width = 12
        ws_guide.column_dimensions["C"].width = 40
        ws_guide.column_dimensions["D"].width = 50

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream.getvalue()

    @staticmethod
    async def import_questions_from_excel(
        db: AsyncSession,
        file_bytes: bytes,
        user_id: str,
        default_subject_id: Optional[str] = None,
        default_class_id: Optional[str] = None
    ) -> QuestionImportResult:
        """
        Nhập câu hỏi hàng loạt từ file Excel (.xlsx / .xls)
        """
        # Kiểm tra default_subject_id nếu có
        if default_subject_id and default_subject_id != "unassigned":
            subj_chk = await db.execute(
                select(Subject).where(Subject.id == default_subject_id, Subject.created_by == user_id)
            )
            if not subj_chk.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Môn học mặc định được chọn không tồn tại hoặc bạn không có quyền."
                )
        else:
            default_subject_id = None

        # Kiểm tra default_class_id nếu có
        if default_class_id and default_class_id != "unassigned":
            cls_chk = await db.execute(
                select(Class).where(Class.id == default_class_id, Class.teacher_id == user_id)
            )
            if not cls_chk.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lớp học mặc định được chọn không tồn tại hoặc bạn không có quyền."
                )
        else:
            default_class_id = None

        # Load danh sách môn học của giáo viên
        subjects_res = await db.execute(select(Subject).where(Subject.created_by == user_id))
        teacher_subjects = subjects_res.scalars().all()
        subject_lookup: Dict[str, str] = {}
        for s in teacher_subjects:
            subject_lookup[s.id.lower()] = s.id
            subject_lookup[s.code.strip().lower()] = s.id
            subject_lookup[s.name.strip().lower()] = s.id

        # Load danh sách lớp của giáo viên để tra cứu theo mã/tên
        classes_res = await db.execute(select(Class).where(Class.teacher_id == user_id))
        teacher_classes = classes_res.scalars().all()
        class_lookup: Dict[str, str] = {}
        for c in teacher_classes:
            class_lookup[c.id.lower()] = c.id
            class_lookup[c.code.strip().lower()] = c.id
            class_lookup[c.name.strip().lower()] = c.id

        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể đọc file Excel. Vui lòng đảm bảo file định dạng .xlsx hợp lệ: {str(e)}"
            )

        # Chọn sheet đầu tiên hoặc sheet tên 'Ngân hàng câu hỏi'
        ws = None
        for name in wb.sheetnames:
            if "câu hỏi" in name.lower() or "question" in name.lower():
                ws = wb[name]
                break
        if not ws:
            ws = wb.active

        if not ws:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File Excel không có dữ liệu."
            )

        # Hàm nhận diện tên cột chuẩn xác
        def match_header(val: str) -> Optional[str]:
            v = val.strip().lower()
            if not v:
                return None
            if "rubric" in v or "tiêu chí" in v:
                return "rubric"
            if any(k in v for k in ["giải thích", "explanation", "ghi chú", "note"]):
                return "explanation"
            if any(k in v for k in ["mã môn", "môn học", "subject"]):
                return "subject"
            if any(k in v for k in ["mã lớp", "lớp", "class"]):
                return "class"
            if any(k in v for k in ["loại", "type"]):
                return "type"
            if any(k in v for k in ["nội dung", "content", "câu hỏi", "question"]):
                return "content"
            if any(k in v for k in ["điểm", "point", "score"]):
                return "points"
            if "đáp án đúng" in v or "correct" in v or v == "đáp án":
                return "correct"
            if v in ["a", "đáp án a", "lựa chọn a", "option a", "lựa chọn 1", "opt a"]:
                return "opt_a"
            if v in ["b", "đáp án b", "lựa chọn b", "option b", "lựa chọn 2", "opt b"]:
                return "opt_b"
            if v in ["c", "đáp án c", "lựa chọn c", "option c", "lựa chọn 3", "opt c"]:
                return "opt_c"
            if v in ["d", "đáp án d", "lựa chọn d", "option d", "lựa chọn 4", "opt d"]:
                return "opt_d"
            if v in ["e", "đáp án e", "lựa chọn e", "option e", "opt e"]:
                return "opt_e"
            if v in ["f", "đáp án f", "lựa chọn f", "option f", "opt f"]:
                return "opt_f"
            return None

        # Tìm dòng tiêu đề (quét 5 dòng đầu)
        header_row_idx = None
        header_map: Dict[str, int] = {}
        
        for row in range(1, min(ws.max_row + 1, 10)):
            row_vals = [str(ws.cell(row=row, column=c).value or "").strip().lower() for c in range(1, ws.max_column + 1)]
            for col_idx, val in enumerate(row_vals, start=1):
                if any(k in val for k in ["nội dung", "content", "câu hỏi", "question"]):
                    header_row_idx = row
                    break
            if header_row_idx:
                for col_idx, val in enumerate(row_vals, start=1):
                    h_key = match_header(val)
                    if h_key and h_key not in header_map:
                        header_map[h_key] = col_idx
                break
                break

        if not header_row_idx or "content" not in header_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không tìm thấy tiêu đề cột 'Nội dung câu hỏi' trong file Excel. Vui lòng sử dụng file mẫu chuẩn."
            )

        imported_questions: List[Question] = []
        errors: List[QuestionImportError] = []
        total_rows = 0

        # Duyệt từng dòng dữ liệu
        for r in range(header_row_idx + 1, ws.max_row + 1):
            row_cells = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
            # Nếu dòng hoàn toàn rỗng thì bỏ qua
            if not any(v is not None and str(v).strip() != "" for v in row_cells):
                continue

            total_rows += 1
            row_content_val = ws.cell(row=r, column=header_map["content"]).value
            content = str(row_content_val).strip() if row_content_val is not None else ""

            if not content:
                errors.append(QuestionImportError(row=r, error="Nội dung câu hỏi không được để trống."))
                continue

            # 1. Phân tích loại câu hỏi
            type_raw = str(ws.cell(row=r, column=header_map["type"]).value or "").strip().lower() if "type" in header_map else ""
            
            # Thu thập các lựa chọn A, B, C, D...
            options_text: List[str] = []
            for opt_key in ["opt_a", "opt_b", "opt_c", "opt_d"]:
                if opt_key in header_map:
                    v = ws.cell(row=r, column=header_map[opt_key]).value
                    if v is not None and str(v).strip():
                        options_text.append(str(v).strip())

            # Xác định type
            if any(k in type_raw for k in ["essay", "tự luận", "tu luan"]):
                q_type = QuestionType.ESSAY.value
            elif any(k in type_raw for k in ["multiple_select", "nhiều", "nhieu", "multi"]):
                q_type = QuestionType.MULTIPLE_SELECT.value
            elif any(k in type_raw for k in ["single_choice", "đơn", "don", "single", "mcq"]):
                q_type = QuestionType.SINGLE_CHOICE.value
            else:
                # Tự suy luận
                if len(options_text) >= 2:
                    q_type = QuestionType.SINGLE_CHOICE.value
                else:
                    q_type = QuestionType.ESSAY.value

            # 2. Điểm mặc định
            points_val = ws.cell(row=r, column=header_map["points"]).value if "points" in header_map else None
            try:
                if points_val is not None:
                    default_points = Decimal(str(points_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    if default_points <= Decimal("0.00"):
                        default_points = Decimal("2.00") if q_type != QuestionType.ESSAY.value else Decimal("10.00")
                else:
                    default_points = Decimal("2.00") if q_type != QuestionType.ESSAY.value else Decimal("10.00")
            except Exception:
                default_points = Decimal("2.00") if q_type != QuestionType.ESSAY.value else Decimal("10.00")

            # 3. Môn học & Lớp học áp dụng
            target_subject_id = default_subject_id
            if "subject" in header_map:
                subject_val = str(ws.cell(row=r, column=header_map["subject"]).value or "").strip()
                if subject_val:
                    s_key = subject_val.lower()
                    if s_key in subject_lookup:
                        target_subject_id = subject_lookup[s_key]
                    else:
                        code_cand = subject_val.upper() if len(subject_val) <= 15 and " " not in subject_val else (subject_val[:6].upper())
                        new_s = Subject(
                            name=subject_val,
                            code=code_cand,
                            created_by=user_id
                        )
                        db.add(new_s)
                        await db.flush()
                        subject_lookup[new_s.id.lower()] = new_s.id
                        subject_lookup[new_s.code.strip().lower()] = new_s.id
                        subject_lookup[new_s.name.strip().lower()] = new_s.id
                        target_subject_id = new_s.id

            target_class_id = default_class_id
            if "class" in header_map:
                class_val = str(ws.cell(row=r, column=header_map["class"]).value or "").strip().lower()
                if class_val:
                    if class_val in class_lookup:
                        target_class_id = class_lookup[class_val]

            # 4. Giải thích
            explanation_val = str(ws.cell(row=r, column=header_map["explanation"]).value or "").strip() if "explanation" in header_map else ""

            # 5. Xử lý Trắc nghiệm
            question_options: List[QuestionOption] = []
            question_rubrics: List[QuestionRubric] = []

            if q_type in [QuestionType.SINGLE_CHOICE.value, QuestionType.MULTIPLE_SELECT.value]:
                if len(options_text) < 2:
                    errors.append(QuestionImportError(
                        row=r,
                        error=f"Câu hỏi trắc nghiệm cần ít nhất 2 đáp án lựa chọn (Hiện có {len(options_text)})."
                    ))
                    continue

                # Phân tích đáp án đúng
                correct_raw = str(ws.cell(row=r, column=header_map["correct"]).value or "").strip() if "correct" in header_map else ""
                tokens = [t.strip().upper() for t in re.split(r'[,;/\s]+', correct_raw) if t.strip()]
                letter_map = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
                correct_indices = set()

                for tok in tokens:
                    if tok in letter_map and letter_map[tok] < len(options_text):
                        correct_indices.add(letter_map[tok])
                    elif tok.isdigit():
                        idx = int(tok) - 1
                        if 0 <= idx < len(options_text):
                            correct_indices.add(idx)
                    else:
                        for idx, opt_txt in enumerate(options_text):
                            if tok.lower() in opt_txt.lower():
                                correct_indices.add(idx)

                # Nếu không xác định được đáp án đúng
                if not correct_indices:
                    # Mặc định lấy lựa chọn A (0)
                    correct_indices.add(0)

                # Nếu là single_choice mà có nhiều hơn 1 đáp án đúng -> chuyển sang multiple_select
                if q_type == QuestionType.SINGLE_CHOICE.value and len(correct_indices) > 1:
                    q_type = QuestionType.MULTIPLE_SELECT.value

                for idx, opt_txt in enumerate(options_text):
                    is_correct = idx in correct_indices
                    question_options.append(QuestionOption(
                        content=opt_txt,
                        is_correct=is_correct,
                        order_index=idx,
                        explanation=explanation_val if is_correct else ""
                    ))

            # 6. Xử lý Tự luận & Rubric
            elif q_type == QuestionType.ESSAY.value:
                rubric_raw = str(ws.cell(row=r, column=header_map["rubric"]).value or "").strip() if "rubric" in header_map else ""
                parsed_rubrics = []

                if rubric_raw:
                    # Tách các tiêu chí bằng | hoặc xuống dòng
                    rubric_tokens = [rb.strip() for rb in re.split(r'[|\n]+', rubric_raw) if rb.strip()]
                    for r_tok in rubric_tokens:
                        parts = [p.strip() for p in r_tok.split(":") if p.strip()]
                        if len(parts) >= 2:
                            raw_c_name = parts[0]
                            try:
                                pts = Decimal(str(parts[1])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                            except Exception:
                                pts = Decimal("1.00")
                            desc = parts[2] if len(parts) > 2 else ""

                            # Xác định tiêu chí CỘNG (+) hay TRỪ (-)
                            c_clean = raw_c_name
                            c_lower = raw_c_name.lower()

                            # 1. Ký hiệu rõ ràng (+/-)
                            if c_clean.startswith("(+)") or c_clean.startswith("[+]") or c_clean.startswith("+"):
                                is_deduct = False
                                c_clean = re.sub(r'^[(\[]?\+[)\]]?\s*', '', c_clean).strip()
                            elif c_clean.startswith("(-)") or c_clean.startswith("[-]") or c_clean.startswith("-"):
                                is_deduct = True
                                c_clean = re.sub(r'^[(\[]?\-[)\]]?\s*', '', c_clean).strip()
                            elif "(+)" in c_clean or "[+]" in c_clean or "(cộng)" in c_lower or "[cộng]" in c_lower:
                                is_deduct = False
                                c_clean = re.sub(r'\s*[(\[]?(\+|cộng)[)\]]?', '', c_clean, flags=re.IGNORECASE).strip()
                            elif "(-)" in c_clean or "[-]" in c_clean or "(trừ)" in c_lower or "[trừ]" in c_lower:
                                is_deduct = True
                                c_clean = re.sub(r'\s*[(\[]?(\-|trừ)[)\]]?', '', c_clean, flags=re.IGNORECASE).strip()
                            else:
                                # 2. Phân tích ngữ cảnh mặc định:
                                # Nếu câu hỏi/tiêu chí là PHÂN TÍCH, NHẬN DIỆN, CHUYỂN HÓA 3 độc -> CỘNG ĐIỂM
                                if any(k in c_lower for k in ["phân tích", "nhận diện", "chỉ ra", "chuyển hóa", "giải pháp", "đối chiếu", "hiểu biết"]):
                                    is_deduct = False
                                # Nếu tiêu chí ghi rõ trừ/phạt/vi phạm -> TRỪ ĐIỂM
                                elif any(k in c_lower for k in ["trừ", "phạt", "vi phạm", "khuyết điểm"]):
                                    is_deduct = True
                                # Nếu chứa tham, sân, si mà không phải phân tích -> TRỪ ĐIỂM
                                elif any(k in c_lower for k in ["tham", "sân", "san", "si", "3 độc"]):
                                    is_deduct = True
                                else:
                                    is_deduct = False

                            parsed_rubrics.append((c_clean, pts, desc, is_deduct))

                # Nếu không có rubric hợp lệ -> Tự động sinh Rubric 3 Gốc chuẩn cân đối theo tổng điểm
                if not parsed_rubrics:
                    # 35% Đạo đức, 35% Trí tuệ, 30% Nghị lực
                    pt1 = (default_points * Decimal("0.35")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    pt2 = (default_points * Decimal("0.35")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    pt3 = default_points - pt1 - pt2
                    parsed_rubrics = [
                        ("Đạo đức (Tâm vị tha & Trách nhiệm)", pt1, "Thể hiện tư duy trung thực, tinh thần tương trợ và trách nhiệm", False),
                        ("Trí tuệ (Tư duy Nhân Quả & Giải pháp)", pt2, "Phân tích nguyên nhân gốc rễ, lập luận logic và đề xuất giải pháp đúng đắn", False),
                        ("Nghị lực (Dũng - Nhẫn - Tĩnh)", pt3, "Ý chí vượt khó, dũng cảm nhận lỗi và kiên trì rèn luyện bản thân", False)
                    ]
                else:
                    # Đảm bảo tổng điểm các tiêu chí cộng điểm bằng default_points
                    positive_items = [p for p in parsed_rubrics if not p[3]]
                    if positive_items:
                        sum_pts = sum(p[1] for p in positive_items)
                        if sum_pts != default_points:
                            diff = default_points - sum_pts
                            # Adjust last positive item
                            for p_i in range(len(parsed_rubrics) - 1, -1, -1):
                                if not parsed_rubrics[p_i][3]:
                                    last_c, last_pts, last_desc, last_deduct = parsed_rubrics[p_i]
                                    adjusted_pts = last_pts + diff
                                    if adjusted_pts > Decimal("0"):
                                        parsed_rubrics[p_i] = (last_c, adjusted_pts, last_desc, last_deduct)
                                    break

                for c_name, pts, desc, is_deduct in parsed_rubrics:
                    question_rubrics.append(QuestionRubric(
                        criterion_name=c_name,
                        description=desc,
                        max_points=pts,
                        is_deduction=is_deduct,
                        level_descriptors={"dat": float(pts * Decimal("0.6")), "xuat_sac": float(pts)},
                        version=1
                    ))

            # 7. Thêm câu hỏi vào Database
            try:
                question = Question(
                    subject_id=target_subject_id,
                    class_id=target_class_id,
                    created_by=user_id,
                    type=q_type,
                    content=content,
                    default_points=default_points,
                    version=1,
                    is_active=True
                )
                db.add(question)
                await db.flush()

                for opt in question_options:
                    opt.question_id = question.id
                    db.add(opt)

                for rub in question_rubrics:
                    rub.question_id = question.id
                    db.add(rub)

                await db.flush()
                imported_questions.append(question)
            except Exception as ex:
                errors.append(QuestionImportError(row=r, error=f"Lỗi khi lưu câu hỏi: {str(ex)}"))

        await db.commit()

        # Eager load lại đầy đủ dữ liệu để trả về
        result_items: List[QuestionRead] = []
        for q in imported_questions:
            fresh_q = await QuestionService.get_question(db, q.id, user_id)
            result_items.append(QuestionRead.model_validate(fresh_q))

        return QuestionImportResult(
            total=total_rows,
            success_count=len(imported_questions),
            failed_count=len(errors),
            imported_questions=result_items,
            errors=errors
        )
