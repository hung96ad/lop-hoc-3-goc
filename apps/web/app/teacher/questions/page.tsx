"use client";

import { useEffect, useState } from "react";
import { 
  FileQuestion, 
  Plus, 
  Copy, 
  CheckCircle2, 
  X, 
  Loader2, 
  AlertCircle,
  HelpCircle,
  BookOpen,
  Sparkles,
  Trash2,
  FileSpreadsheet,
  Download,
  Upload,
  GraduationCap,
  Filter,
  Check,
  Pencil
} from "lucide-react";
import { apiFetch, apiUpload, apiDownloadBlob } from "../../../lib/api";
import Pagination from "../../../components/Pagination";

interface OptionItem {
  id?: string;
  content: string;
  is_correct: boolean;
  order_index: number;
}

interface RubricItem {
  criterion_name: string;
  description: string;
  max_points: string;
  is_deduction?: boolean;
  level_descriptors?: Record<string, number>;
}

interface QuestionItem {
  id: string;
  type: "single_choice" | "multiple_select" | "essay";
  content: string;
  default_points: string;
  subject_id?: string | null;
  subject_name?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  options: OptionItem[];
  rubrics: RubricItem[];
  created_at: string;
}

interface SubjectItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  question_count: number;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
  student_count: number;
}

interface ImportErrorItem {
  row: number;
  error: string;
}

interface ImportResultItem {
  total: number;
  success_count: number;
  failed_count: number;
  imported_questions: QuestionItem[];
  errors: ImportErrorItem[];
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");

  // Create Question Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New question form state
  const [qType, setQType] = useState<"single_choice" | "multiple_select" | "essay">("single_choice");
  const [qSubjectId, setQSubjectId] = useState<string>("");
  const [content, setContent] = useState("");
  const [defaultPoints, setDefaultPoints] = useState("2.00");
  const [options, setOptions] = useState<OptionItem[]>([
    { content: "", is_correct: true, order_index: 0 },
    { content: "", is_correct: false, order_index: 1 },
  ]);
  const [rubrics, setRubrics] = useState<RubricItem[]>([
    {
      criterion_name: "Đạo đức (Tâm vị tha & Trách nhiệm)",
      description: "Thể hiện tư duy trung thực, tinh thần tương trợ và trách nhiệm cộng đồng",
      max_points: "3.50",
      is_deduction: false,
      level_descriptors: { dat: 2, xuat_sac: 3.5 },
    },
    {
      criterion_name: "Trí tuệ (Tư duy Nhân Quả & Giải pháp)",
      description: "Phân tích nguyên nhân gốc rễ, lập luận logic và đề xuất giải pháp đúng đắn",
      max_points: "3.50",
      is_deduction: false,
      level_descriptors: { dat: 2, xuat_sac: 3.5 },
    },
    {
      criterion_name: "Nghị lực (Dũng - Nhẫn - Tĩnh)",
      description: "Ý chí vượt khó, dũng cảm nhận lỗi và kiên trì rèn luyện bản thân",
      max_points: "3.00",
      is_deduction: false,
      level_descriptors: { dat: 1.5, xuat_sac: 3 },
    },
    {
      criterion_name: "Trừ điểm: Tham (Vị kỷ & Trục lợi)",
      description: "Trừ điểm nếu bài viết thể hiện tư tưởng mưu cầu lợi ích cá nhân ích kỷ hoặc tham lam",
      max_points: "2.00",
      is_deduction: true,
      level_descriptors: { dat: 1, xuat_sac: 2 },
    },
    {
      criterion_name: "Trừ điểm: Sân (Công kích & Giận dữ)",
      description: "Trừ điểm nếu bài viết thể hiện cảm xúc giận dữ, oán trách, công kích tiêu cực",
      max_points: "2.00",
      is_deduction: true,
      level_descriptors: { dat: 1, xuat_sac: 2 },
    },
    {
      criterion_name: "Trừ điểm: Si (Định kiến & Mê muội)",
      description: "Trừ điểm nếu bài viết thể hiện cái nhìn phiến diện, ngụy biện, mê tín, thiếu căn cứ",
      max_points: "2.00",
      is_deduction: true,
      level_descriptors: { dat: 1, xuat_sac: 2 },
    },
  ]);

  // Quick Create Subject Modal state
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjName, setNewSubjName] = useState("");
  const [newSubjCode, setNewSubjCode] = useState("");
  const [newSubjDesc, setNewSubjDesc] = useState("");
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Excel Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSubjectId, setImportSubjectId] = useState<string>("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultItem | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // PDF AI Import Modal state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfSubjectId, setPdfSubjectId] = useState<string>("");
  const [pdfSingleCount, setPdfSingleCount] = useState<number>(5);
  const [pdfMultipleCount, setPdfMultipleCount] = useState<number>(3);
  const [pdfEssayCount, setPdfEssayCount] = useState<number>(2);
  const [pdfPointsSingle, setPdfPointsSingle] = useState<string>("1.00");
  const [pdfPointsMultiple, setPdfPointsMultiple] = useState<string>("1.00");
  const [pdfPointsEssay, setPdfPointsEssay] = useState<string>("10.00");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{ total_generated: number; saved_count: number; message: string } | null>(null);

  // Edit Question Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDefaultPoints, setEditDefaultPoints] = useState("2.00");
  const [editSubjectId, setEditSubjectId] = useState("");
  const [editOptions, setEditOptions] = useState<OptionItem[]>([]);
  const [editRubrics, setEditRubrics] = useState<RubricItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadQuestions = async (subjectId = selectedSubjectId, page = currentPage, size = pageSize, type = filterType) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(size));
      if (subjectId && subjectId !== "all") params.set("subject_id", subjectId);
      if (type && type !== "all") params.set("question_type", type);
      const data = await apiFetch<PaginatedResponse<QuestionItem>>(`/questions?${params.toString()}`);
      setQuestions(data.items);
      setQuestionTotal(data.total);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjects = async () => {
    try {
      const data = await apiFetch<SubjectItem[]>("/subjects");
      setSubjects(data);
    } catch (err: any) {
      console.error("Lỗi khi tải danh sách môn học:", err);
    }
  };

  const loadClasses = async () => {
    try {
      const data = await apiFetch<PaginatedResponse<ClassItem>>("/classes?page=1&page_size=200");
      setClasses(data.items);
    } catch (err: any) {
      console.error("Lỗi khi tải danh sách lớp học:", err);
    }
  };

  useEffect(() => {
    loadSubjects();
    loadClasses();
    loadQuestions("all", 1, pageSize, "all");
  }, []);

  const handleSubjectFilterChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setCurrentPage(1);
    loadQuestions(subjectId, 1, pageSize, filterType);
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjName.trim() || !newSubjCode.trim()) {
      setSubjectError("Vui lòng nhập tên môn học và mã môn học.");
      return;
    }
    setSubjectError(null);
    setCreatingSubject(true);
    try {
      const created = await apiFetch<SubjectItem>("/subjects", {
        method: "POST",
        body: JSON.stringify({
          name: newSubjName.trim(),
          code: newSubjCode.trim().toUpperCase(),
          description: newSubjDesc.trim() || null,
        }),
      });
      await loadSubjects();
      setNewSubjName("");
      setNewSubjCode("");
      setNewSubjDesc("");
      setShowSubjectModal(false);
      setSelectedSubjectId(created.id);
      loadQuestions(created.id);
    } catch (err: any) {
      setSubjectError(err.message || "Tạo môn học thất bại.");
    } finally {
      setCreatingSubject(false);
    }
  };

  const handleAddOption = () => {
    setOptions([
      ...options,
      { content: "", is_correct: false, order_index: options.length },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, text: string) => {
    const updated = [...options];
    updated[index].content = text;
    setOptions(updated);
  };

  const handleToggleCorrect = (index: number) => {
    if (qType === "single_choice") {
      setOptions(
        options.map((opt, i) => ({
          ...opt,
          is_correct: i === index,
        }))
      );
    } else {
      const updated = [...options];
      updated[index].is_correct = !updated[index].is_correct;
      setOptions(updated);
    }
  };

  const handleAddRubric = (isDeduction = false) => {
    setRubrics([
      ...rubrics,
      {
        criterion_name: isDeduction ? "Trừ điểm: " : "",
        description: "",
        max_points: "2.00",
        is_deduction: isDeduction,
        level_descriptors: { dat: 1, xuat_sac: 2 },
      },
    ]);
  };

  const handleRemoveRubric = (index: number) => {
    if (rubrics.length <= 1) return;
    setRubrics(rubrics.filter((_, i) => i !== index));
  };

  const handleRubricChange = (
    index: number,
    field: "criterion_name" | "description" | "max_points" | "is_deduction",
    value: any
  ) => {
    const updated = [...rubrics];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setRubrics(updated);
  };

  const handleGenerateRubric = async () => {
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung câu hỏi trước khi tạo Rubric bằng AI.");
      return;
    }
    setError(null);
    setGeneratingRubric(true);
    try {
      const res = await apiFetch<{ rubrics: RubricItem[] }>("/questions/generate-rubric", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          total_points: defaultPoints || "10.00",
        }),
      });

      if (res.rubrics && res.rubrics.length > 0) {
        const formatted = res.rubrics.map((r) => ({
          criterion_name: r.criterion_name,
          description: r.description || "",
          max_points: String(r.max_points),
          is_deduction: Boolean(r.is_deduction),
          level_descriptors: r.level_descriptors || {},
        }));
        setRubrics(formatted);
        const posTotal = formatted
          .filter((r) => !r.is_deduction)
          .reduce((acc, cur) => acc + (parseFloat(cur.max_points) || 0), 0);
        setDefaultPoints(posTotal.toFixed(2));
      }
    } catch (err: any) {
      setError(err.message || "Tạo Rubric 3 Gốc & 3 Độc bằng AI thất bại.");
    } finally {
      setGeneratingRubric(false);
    }
  };

  const positiveRubricPoints = rubrics
    .filter((r) => !r.is_deduction)
    .reduce((acc, cur) => acc + (parseFloat(cur.max_points) || 0), 0);

  const deductionRubricPoints = rubrics
    .filter((r) => r.is_deduction)
    .reduce((acc, cur) => acc + (parseFloat(cur.max_points) || 0), 0);

  const handleSyncPoints = () => {
    setDefaultPoints(positiveRubricPoints.toFixed(2));
  };

  const handleQTypeChange = (newType: "single_choice" | "multiple_select" | "essay") => {
    setQType(newType);
    if (newType === "essay") {
      if (defaultPoints === "2.00") {
        setDefaultPoints(positiveRubricPoints > 0 ? positiveRubricPoints.toFixed(2) : "10.00");
      }
    } else {
      if (defaultPoints === "10.00") {
        setDefaultPoints("2.00");
      }
    }
  };

  const currentDefaultPoints = parseFloat(defaultPoints) || 0;
  const isPointsMatched = Math.abs(positiveRubricPoints - currentDefaultPoints) < 0.01;

  const handleDuplicate = async (id: string) => {
    try {
      await apiFetch(`/questions/${id}/duplicate`, { method: "POST" });
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: any) {
      alert("Lỗi khi nhân bản câu hỏi: " + err.message);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: any = {
        type: qType,
        content,
        default_points: defaultPoints,
        subject_id: qSubjectId ? qSubjectId : null,
      };

      if (qType === "single_choice" || qType === "multiple_select") {
        const hasCorrect = options.some((o) => o.is_correct);
        if (!hasCorrect) {
          throw new Error("Vui lòng chọn ít nhất một đáp án đúng cho câu trắc nghiệm.");
        }
        payload.options = options.map((opt, idx) => ({
          content: opt.content,
          is_correct: opt.is_correct,
          order_index: idx,
        }));
      } else {
        if (rubrics.length === 0) {
          throw new Error("Câu hỏi tự luận phải có ít nhất 1 tiêu chí Rubric.");
        }
        const positiveRubrics = rubrics.filter((r) => !r.is_deduction);
        if (positiveRubrics.length === 0) {
          throw new Error("Phải có ít nhất 1 tiêu chí cộng điểm (3 Gốc) cho câu tự luận.");
        }
        const emptyCriterion = rubrics.some((r) => !r.criterion_name.trim());
        if (emptyCriterion) {
          throw new Error("Vui lòng nhập đầy đủ tên tiêu chí cho tất cả các tiêu chí Rubric.");
        }
        const invalidPoints = rubrics.some((r) => (parseFloat(r.max_points) || 0) <= 0);
        if (invalidPoints) {
          throw new Error("Thang điểm của từng tiêu chí Rubric phải lớn hơn 0.");
        }
        if (!isPointsMatched) {
          throw new Error(
            `Tổng điểm các tiêu chí cộng điểm 3 Gốc (${positiveRubricPoints.toFixed(2)}) phải bằng điểm mặc định câu hỏi (${currentDefaultPoints.toFixed(2)}). Vui lòng bấm 'Đồng bộ điểm câu hỏi' hoặc điều chỉnh lại.`
          );
        }
        payload.rubrics = rubrics.map((r) => ({
          criterion_name: r.criterion_name.trim(),
          description: r.description.trim(),
          max_points: r.max_points,
          is_deduction: Boolean(r.is_deduction),
          level_descriptors: r.level_descriptors || {},
        }));
      }

      await apiFetch("/questions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setShowModal(false);
      setContent("");
      setDefaultPoints("2.00");
      setQSubjectId(selectedSubjectId !== "all" && selectedSubjectId !== "unassigned" ? selectedSubjectId : "");
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: any) {
      setError(err.message || "Tạo câu hỏi thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      await apiDownloadBlob("/questions/import-template", "mau_nhap_cau_hoi.xlsx");
    } catch (err: any) {
      alert("Lỗi khi tải file mẫu: " + err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      setImportError("Vui lòng chọn file Excel để tải lên.");
      return;
    }
    if (!importSubjectId) {
      setImportError("Vui lòng chọn môn học trước khi nhập câu hỏi từ Excel.");
      return;
    }
    setImportError(null);
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", excelFile);
      if (importSubjectId && importSubjectId !== "unassigned") {
        formData.append("subject_id", importSubjectId);
      }

      const res = await apiUpload<ImportResultItem>("/questions/import-excel", formData);
      setImportResult(res);
      // Reload danh sách môn học và câu hỏi
      loadSubjects();
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: any) {
      setImportError(err.message || "Nhập câu hỏi từ Excel thất bại.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) { setPdfError("Vui lòng chọn file PDF."); return; }
    const total = pdfSingleCount + pdfMultipleCount + pdfEssayCount;
    if (total === 0) { setPdfError("Vui lòng nhập số lượng câu hỏi cần tạo (ít nhất 1 câu)."); return; }
    setPdfError(null);
    setPdfResult(null);
    setPdfLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("single_choice_count", String(pdfSingleCount));
      formData.append("multiple_select_count", String(pdfMultipleCount));
      formData.append("essay_count", String(pdfEssayCount));
      formData.append("default_points_single", pdfPointsSingle);
      formData.append("default_points_multiple", pdfPointsMultiple);
      formData.append("default_points_essay", pdfPointsEssay);
      if (pdfSubjectId && pdfSubjectId !== "unassigned") {
        formData.append("subject_id", pdfSubjectId);
      }
      const res = await apiUpload<{ total_generated: number; saved_count: number; message: string }>(
        "/questions/generate-from-pdf",
        formData
      );
      setPdfResult(res);
      setShowPdfModal(false);
      loadSubjects();
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : "Tạo câu hỏi từ PDF thất bại.");
    } finally {
      setPdfLoading(false);
    }
  };

  // Filtering is handled server-side; questions already contains the filtered page
  const filteredQuestions = questions;

  const openEditModal = (q: QuestionItem) => {
    setEditingQuestion(q);
    setEditContent(q.content);
    setEditDefaultPoints(q.default_points);
    setEditSubjectId(q.subject_id || "");
    setEditOptions(q.options.length > 0 ? [...q.options] : [
      { content: "", is_correct: true, order_index: 0 },
      { content: "", is_correct: false, order_index: 1 },
    ]);
    setEditRubrics(q.rubrics.length > 0 ? [...q.rubrics] : []);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditOptionChange = (index: number, text: string) => {
    const updated = [...editOptions];
    updated[index].content = text;
    setEditOptions(updated);
  };

  const handleEditToggleCorrect = (index: number) => {
    if (editingQuestion?.type === "single_choice") {
      setEditOptions(editOptions.map((opt, i) => ({ ...opt, is_correct: i === index })));
    } else {
      const updated = [...editOptions];
      updated[index].is_correct = !updated[index].is_correct;
      setEditOptions(updated);
    }
  };

  const handleEditRubricChange = (
    index: number,
    field: "criterion_name" | "description" | "max_points",
    value: string
  ) => {
    const updated = [...editRubrics];
    updated[index] = { ...updated[index], [field]: value };
    setEditRubrics(updated);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        content: editContent,
        default_points: editDefaultPoints,
        subject_id: editSubjectId || "",
      };
      if (editingQuestion.type === "single_choice" || editingQuestion.type === "multiple_select") {
        payload.options = editOptions.map((opt, idx) => ({
          content: opt.content,
          is_correct: opt.is_correct,
          order_index: idx,
        }));
      } else {
        payload.rubrics = editRubrics.map((r) => ({
          criterion_name: r.criterion_name.trim(),
          description: r.description.trim(),
          max_points: r.max_points,
          is_deduction: Boolean(r.is_deduction),
          level_descriptors: r.level_descriptors || {},
        }));
      }
      await apiFetch(`/questions/${editingQuestion.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setShowEditModal(false);
      setEditingQuestion(null);
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Cập nhật câu hỏi thất bại.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xóa câu hỏi này không?")) return;
    try {
      await apiFetch(`/questions/${id}`, { method: "DELETE" });
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: unknown) {
      alert("Lỗi khi xóa câu hỏi: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.size} câu hỏi đã chọn không?`)) return;
    setBulkDeleting(true);
    try {
      await apiFetch("/questions/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ question_ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      loadQuestions(selectedSubjectId, currentPage, pageSize, filterType);
    } catch (err: unknown) {
      alert("Lỗi khi xóa hàng loạt: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuestions.map((q) => q.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ngân hàng câu hỏi</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý kho câu hỏi theo Môn học, trắc nghiệm và tự luận tích hợp Rubric 3 Gốc
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSubjectError(null);
              setShowSubjectModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg border border-slate-300 transition"
          >
            <BookOpen className="h-4 w-4 text-purple-600" />
            <span>+ Tạo môn học</span>
          </button>

          <button
            onClick={() => {
              setPdfError(null);
              setPdfResult(null);
              setPdfFile(null);
              setPdfSubjectId(
                selectedSubjectId !== "all" && selectedSubjectId !== "unassigned" ? selectedSubjectId : ""
              );
              setShowPdfModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm rounded-lg shadow-sm transition"
          >
            <Sparkles className="h-4 w-4" />
            <span>AI từ PDF</span>
          </button>

          <button
            onClick={() => {
              if (subjects.length === 0) {
                alert("Vui lòng tạo môn học trước khi nhập câu hỏi từ Excel.");
                setShowSubjectModal(true);
                return;
              }
              setImportResult(null);
              setImportError(null);
              setExcelFile(null);
              setImportSubjectId(
                selectedSubjectId !== "all" && selectedSubjectId !== "unassigned" ? selectedSubjectId : ""
              );
              setShowImportModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-lg shadow-sm transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Nhập từ Excel</span>
          </button>

          <button
            onClick={() => {
              if (subjects.length === 0) {
                alert("Vui lòng tạo môn học trước khi thêm câu hỏi.");
                setShowSubjectModal(true);
                return;
              }
              setQSubjectId(
                selectedSubjectId !== "all" && selectedSubjectId !== "unassigned" ? selectedSubjectId : ""
              );
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm câu hỏi mới</span>
          </button>
        </div>
      </div>

      {/* Subject Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
              Quản lý theo Môn học
            </label>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={selectedSubjectId}
                onChange={(e) => handleSubjectFilterChange(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">📚 Tất cả môn học ({questions.length} câu)</option>
                <option value="unassigned">🌐 Ngân hàng chung (Chưa phân môn)</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    📖 {s.name} ({s.code}) - {s.question_count} câu
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Filter Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => { setFilterType("all"); setCurrentPage(1); loadQuestions(selectedSubjectId, 1, pageSize, "all"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
              filterType === "all"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Tất cả ({questions.length})
          </button>
          <button
            onClick={() => { setFilterType("single_choice"); setCurrentPage(1); loadQuestions(selectedSubjectId, 1, pageSize, "single_choice"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
              filterType === "single_choice"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Trắc nghiệm 1 đáp án ({questions.filter((q) => q.type === "single_choice").length})
          </button>
          <button
            onClick={() => { setFilterType("multiple_select"); setCurrentPage(1); loadQuestions(selectedSubjectId, 1, pageSize, "multiple_select"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
              filterType === "multiple_select"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Nhiều đáp án ({questions.filter((q) => q.type === "multiple_select").length})
          </button>
          <button
            onClick={() => { setFilterType("essay"); setCurrentPage(1); loadQuestions(selectedSubjectId, 1, pageSize, "essay"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
              filterType === "essay"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Tự luận Rubric ({questions.filter((q) => q.type === "essay").length})
          </button>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
          <p className="text-sm">Đang tải danh sách câu hỏi...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileQuestion className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700">Chưa có câu hỏi nào</p>
          <p className="text-sm text-slate-500 mt-1">
            Bấm &quot;Thêm câu hỏi mới&quot; hoặc &quot;Nhập từ Excel&quot; để bắt đầu xây dựng ngân hàng đề thi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bulk action toolbar */}
          <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              title="Chọn tất cả"
            />
            <span className="text-sm text-slate-600">
              {selectedIds.size > 0
                ? `Đã chọn ${selectedIds.size}/${filteredQuestions.length} câu hỏi`
                : `${filteredQuestions.length} câu hỏi`}
            </span>
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
              >
                {bulkDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Xóa {selectedIds.size} câu đã chọn
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredQuestions.map((q, idx) => (
              <div
                key={q.id}
                className={`bg-white rounded-xl border p-5 shadow-sm transition ${
                  selectedIds.has(q.id) ? "border-blue-400 ring-1 ring-blue-300" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleSelect(q.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                        q.type === "essay"
                          ? "bg-purple-100 text-purple-700"
                          : q.type === "multiple_select"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {q.type === "essay"
                        ? "Tự luận (AI Rubric)"
                        : q.type === "multiple_select"
                        ? "Trắc nghiệm nhiều đáp án"
                        : "Trắc nghiệm 1 đáp án"}
                    </span>
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                      {q.default_points} điểm
                    </span>

                    {/* Subject Badge */}
                    {q.subject_name ? (
                      <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        <span>{q.subject_name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        Chung
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(q)}
                      title="Sửa câu hỏi"
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(q.id)}
                      title="Nhân bản câu hỏi"
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      title="Xóa câu hỏi"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="text-base font-medium text-slate-900 mt-3">{q.content}</p>

                {/* MCQ Options */}
                {q.options && q.options.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2.5 rounded-lg border flex items-center gap-2 ${
                          opt.is_correct
                            ? "bg-emerald-50/70 border-emerald-300 text-emerald-800 font-medium"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {opt.is_correct && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                        <span>{opt.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Essay Rubrics */}
                {q.type === "essay" && q.rubrics && q.rubrics.length > 0 && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1.5">
                    <div className="font-semibold text-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-purple-600" />
                        <span>Tiêu chí Rubric đánh giá (3 Gốc &amp; 3 Độc):</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal">Min điểm: 0.00</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {q.rubrics.map((r, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg border text-[11px] leading-relaxed ${
                            r.is_deduction || r.criterion_name.toLowerCase().includes("trừ")
                              ? "bg-rose-50/60 border-rose-200 text-rose-950"
                              : "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold mb-0.5">
                            <span>{r.criterion_name}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                r.is_deduction || r.criterion_name.toLowerCase().includes("trừ")
                                  ? "bg-rose-200 text-rose-800"
                                  : "bg-emerald-200 text-emerald-800"
                              }`}
                            >
                              {r.is_deduction || r.criterion_name.toLowerCase().includes("trừ")
                                ? `- Tối đa ${r.max_points}đ`
                                : `+${r.max_points}đ`}
                            </span>
                          </div>
                          {r.description && <p className="text-[10px] text-slate-600 line-clamp-2">{r.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={questionTotal}
            pageSize={pageSize}
            onPageChange={(p) => { setCurrentPage(p); loadQuestions(selectedSubjectId, p, pageSize, filterType); }}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); loadQuestions(selectedSubjectId, 1, s, filterType); }}
          />
        </div>
      )}

      {/* Modal: Thêm câu hỏi mới */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Thêm câu hỏi mới</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateQuestion} className="space-y-4 mt-4">
              {/* Môn học áp dụng */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <span>Môn học áp dụng</span>
                </label>
                <select
                  value={qSubjectId}
                  onChange={(e) => setQSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">🌐 Ngân hàng chung (Không phân môn)</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      📖 {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Chọn môn học cụ thể (ví dụ: Chánh Kiến 1) hoặc để ở ngân hàng chung.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Loại câu hỏi</label>
                <select
                  value={qType}
                  onChange={(e: any) => handleQTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="single_choice">Trắc nghiệm một đáp án đúng (Single Choice)</option>
                  <option value="multiple_select">Trắc nghiệm nhiều đáp án đúng (Multiple Select)</option>
                  <option value="essay">Tự luận kèm Rubric 3 Gốc (Essay with Rubric)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung câu hỏi</label>
                <textarea
                  required
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Ví dụ: Nêu khái niệm về Nghị Lực trong học tập và rèn luyện..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Điểm mặc định câu hỏi</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={defaultPoints}
                  onChange={(e) => setDefaultPoints(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Options for MCQ */}
              {(qType === "single_choice" || qType === "multiple_select") && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Các lựa chọn đáp án</label>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      + Thêm lựa chọn
                    </button>
                  </div>
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type={qType === "single_choice" ? "radio" : "checkbox"}
                        name="correct_option"
                        checked={opt.is_correct}
                        onChange={() => handleToggleCorrect(idx)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Đánh dấu đáp án đúng"
                      />
                      <input
                        type="text"
                        required
                        value={opt.content}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Lựa chọn ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">
                    * Tích vào nút tròn/vuông để đánh dấu đáp án đúng.
                  </p>
                </div>
              )}

              {/* Rubric for Essay */}
              {qType === "essay" && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4 text-purple-600" />
                        <span>Rubric Chấm điểm AI 3 Gốc</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Thiết lập các tiêu chí Đạo đức - Trí tuệ - Nghị lực với thang điểm riêng biệt
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateRubric}
                        disabled={generatingRubric}
                        title="Tự động phân tích câu hỏi và sinh Rubric 3 Gốc & 3 Độc bằng AI"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                      >
                        {generatingRubric ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span>{generatingRubric ? "AI đang tạo..." : "✨ Tạo Rubric AI (3 Gốc & 3 Độc)"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddRubric(false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition border border-emerald-300"
                        title="Thêm tiêu chí cộng điểm (3 Gốc hoặc Phân tích 3 Độc)"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>+ Tiêu chí Cộng (+)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddRubric(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition border border-rose-300"
                        title="Thêm tiêu chí trừ điểm (3 Độc hoặc Vi phạm)"
                      >
                        <Plus className="h-3.5 w-3.5 text-rose-600" />
                        <span>- Tiêu chí Trừ (-)</span>
                      </button>
                    </div>
                  </div>

                  {/* Rubric Rules & Points Status Bar */}
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-2">
                    <div className="flex items-start gap-2 text-blue-900 leading-relaxed">
                      <BookOpen className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Tùy chọn chấm tự luận 3 Gốc & 3 Độc:</strong> Giáo viên có toàn quyền chọn <strong>CỘNG (+)</strong> hoặc <strong>TRỪ (-)</strong> cho từng tiêu chí. Mặc định 3 Gốc cộng điểm, 3 Độc trừ điểm. Với câu hỏi yêu cầu <em>phân tích 3 Độc</em>, tiêu chí phân tích 3 Độc sẽ được <strong>Cộng điểm (+)</strong> khi học sinh làm đúng. Điểm câu tự luận sau khi trừ luôn <strong>tối thiểu là 0.00đ</strong>.
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/80">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-medium">
                          {isPointsMatched ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          )}
                          <span>
                            Điểm tiêu chí Cộng (+): <strong>{positiveRubricPoints.toFixed(2)}</strong> /{" "}
                            <strong>{currentDefaultPoints.toFixed(2)}</strong> đ
                            {!isPointsMatched && <span className="text-amber-700 font-semibold"> (Chưa khớp)</span>}
                          </span>
                        </span>

                        {deductionRubricPoints > 0 && (
                          <span className="text-rose-700 font-medium">
                            • Trừ tối đa (-): <strong>{deductionRubricPoints.toFixed(2)}</strong> đ
                          </span>
                        )}
                      </div>

                      {!isPointsMatched && (
                        <button
                          type="button"
                          onClick={handleSyncPoints}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded text-xs transition shrink-0"
                          title="Tự động cập nhật điểm câu hỏi bằng tổng điểm các tiêu chí cộng"
                        >
                          Đồng bộ điểm câu hỏi ({positiveRubricPoints.toFixed(2)})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rubric Criteria List */}
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {rubrics.map((rubric, idx) => {
                      const isDeduct = Boolean(rubric.is_deduction);

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border space-y-2.5 relative transition ${
                            isDeduct
                              ? "bg-rose-50/50 border-rose-200 hover:border-rose-300"
                              : "bg-slate-50/90 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded border ${
                                  isDeduct
                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                    : "bg-white text-slate-700 border-slate-200"
                                }`}
                              >
                                #{idx + 1}
                              </span>

                              {/* Toggle Type: 3 Gốc vs 3 Độc */}
                              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
                                <button
                                  type="button"
                                  onClick={() => handleRubricChange(idx, "is_deduction", false)}
                                  className={`px-2 py-0.5 rounded-md transition ${
                                    !isDeduct
                                      ? "bg-emerald-600 text-white shadow-2xs"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  🌱 3 Gốc (+ Cộng điểm)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRubricChange(idx, "is_deduction", true)}
                                  className={`px-2 py-0.5 rounded-md transition ${
                                    isDeduct
                                      ? "bg-rose-600 text-white shadow-2xs"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  ⚠️ 3 Độc (- Trừ điểm)
                                </button>
                              </div>
                            </div>

                            {rubrics.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRubric(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                title="Xóa tiêu chí này"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Tên tiêu chí <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={rubric.criterion_name}
                                onChange={(e) =>
                                  handleRubricChange(idx, "criterion_name", e.target.value)
                                }
                                placeholder={
                                  isDeduct
                                    ? "VD: Trừ điểm: Tham (Vị kỷ & Trục lợi)"
                                    : "VD: Đạo đức (Tâm vị tha & Trách nhiệm)"
                                }
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {isDeduct ? "Điểm trừ tối đa" : "Thang điểm cộng"}{" "}
                                <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                step="0.25"
                                min="0.1"
                                required
                                value={rubric.max_points}
                                onChange={(e) =>
                                  handleRubricChange(idx, "max_points", e.target.value)
                                }
                                placeholder="VD: 2.00"
                                className={`w-full px-2.5 py-1.5 border rounded-lg bg-white text-xs focus:outline-none focus:ring-2 font-semibold ${
                                  isDeduct
                                    ? "border-rose-300 text-rose-700 focus:ring-rose-500"
                                    : "border-slate-300 text-slate-800 focus:ring-blue-500"
                                }`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              {isDeduct ? "Quy tắc trừ điểm khi có biểu hiện" : "Mô tả yêu cầu cần đạt"}
                            </label>
                            <textarea
                              rows={2}
                              value={rubric.description}
                              onChange={(e) =>
                                handleRubricChange(idx, "description", e.target.value)
                              }
                              placeholder={
                                isDeduct
                                  ? "Mô tả dấu hiệu tiêu cực khiến học sinh bị trừ điểm..."
                                  : "Mô tả những gì học sinh cần thể hiện để đạt điểm..."
                              }
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Rubric Button (Bottom) */}
                  <button
                    type="button"
                    onClick={() => handleAddRubric(false)}
                    className="w-full py-2 border border-dashed border-slate-300 hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50/40 transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Thêm tiêu chí chấm điểm khác</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Lưu câu hỏi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nhập câu hỏi hàng loạt từ Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Nhập câu hỏi từ Excel</h2>
                  <p className="text-xs text-slate-500">
                    Tải lên hàng loạt câu hỏi trắc nghiệm và tự luận kèm Rubric
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Template Download Banner */}
            <div className="mt-4 p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-blue-900">Chưa có file mẫu chuẩn?</p>
                <p className="text-xs text-blue-700">
                  Tải file mẫu Excel có sẵn định dạng và ví dụ chuẩn để điền câu hỏi nhanh nhất.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 transition disabled:opacity-50 shadow-sm"
              >
                {downloadingTemplate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>Tải file mẫu .xlsx</span>
              </button>
            </div>

            {importError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {/* Import Result Notification */}
            {importResult && (
              <div className="mt-4 space-y-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Đã nhập thành công <strong>{importResult.success_count}</strong> / <strong>{importResult.total}</strong> câu hỏi vào ngân hàng!
                  </span>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1 max-h-36 overflow-y-auto">
                    <p className="font-semibold text-amber-800">
                      Có {importResult.errors.length} dòng gặp lỗi không thể nhập:
                    </p>
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-amber-700 pl-2">
                        • Dòng {err.row}: {err.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleImportExcel} className="space-y-4 mt-4">
              {/* Select target subject */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-emerald-600" />
                  <span>Môn học áp dụng <span className="text-rose-500">*</span></span>
                </label>
                <select
                  required
                  value={importSubjectId}
                  onChange={(e) => setImportSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">-- Chọn môn học --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      📖 {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Bắt buộc chọn môn học trước khi nhập. Nếu file Excel có cột 'Mã môn học' (VD: CK1), hệ thống sẽ tự động gán đúng theo từng dòng.
                </p>
              </div>

              {/* File upload drag drop / input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Chọn file Excel (.xlsx / .xls)
                </label>
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-5 text-center transition bg-slate-50/50">
                  <input
                    type="file"
                    id="excel_file_input"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setExcelFile(e.target.files[0]);
                        setImportResult(null);
                        setImportError(null);
                      }
                    }}
                  />
                  <label htmlFor="excel_file_input" className="cursor-pointer block">
                    <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    {excelFile ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-emerald-700">
                          {excelFile.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(excelFile.size / 1024).toFixed(1)} KB - Bấm để chọn file khác
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-700">
                          Bấm vào đây để chọn file từ máy tính
                        </p>
                        <p className="text-xs text-slate-500">Hỗ trợ định dạng .xlsx, .xls</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  {importResult ? "Đóng" : "Hủy"}
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !excelFile || !importSubjectId}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {importLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{importLoading ? "Đang xử lý..." : "Bắt đầu tải lên & Nhập"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tạo môn học mới */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Tạo môn học mới</h2>
              <button
                onClick={() => setShowSubjectModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {subjectError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{subjectError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubject} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tên môn học <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  placeholder="Ví dụ: Chánh Kiến 1 - Đánh thức ý nghĩa cuộc đời"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mã môn học (Viết tắt/Code) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSubjCode}
                  onChange={(e) => setNewSubjCode(e.target.value)}
                  placeholder="Ví dụ: CK1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mô tả môn học
                </label>
                <textarea
                  rows={2}
                  value={newSubjDesc}
                  onChange={(e) => setNewSubjDesc(e.target.value)}
                  placeholder="Mô tả nội dung, mục tiêu của môn học..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingSubject}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {creatingSubject && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Lưu môn học</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: AI Tạo câu hỏi từ PDF */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b p-6 pb-4 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-600" />
                  AI Tạo câu hỏi từ PDF
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload file PDF, AI sẽ đọc nội dung và tạo ngân hàng câu hỏi tự động.
                </p>
              </div>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleImportPdf} className="p-6 space-y-5">
              {pdfError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{pdfError}</span>
                </div>
              )}

              {pdfResult && (
                <div className="p-4 bg-violet-50 border border-violet-200 rounded-lg">
                  <div className="flex items-center gap-2 text-violet-700 font-semibold mb-1">
                    <CheckCircle2 className="h-5 w-5" />
                    Hoàn thành!
                  </div>
                  <p className="text-sm text-violet-600">{pdfResult.message}</p>
                  <p className="text-xs text-violet-500 mt-1">
                    Đã tạo {pdfResult.total_generated} câu hỏi, lưu thành công {pdfResult.saved_count} câu.
                  </p>
                </div>
              )}

              {/* File PDF */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File PDF <span className="text-rose-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-violet-400 transition cursor-pointer"
                  onClick={() => document.getElementById("pdf-upload-input")?.click()}
                >
                  <input
                    id="pdf-upload-input"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                  {pdfFile ? (
                    <div className="flex items-center justify-center gap-2 text-violet-700">
                      <Upload className="h-5 w-5" />
                      <span className="font-medium text-sm">{pdfFile.name}</span>
                      <span className="text-xs text-slate-400">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
                    </div>
                  ) : (
                    <div className="text-slate-400">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">Nhấn để chọn file PDF</p>
                      <p className="text-xs mt-1">Chỉ hỗ trợ file .pdf có nội dung văn bản</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Môn học */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Môn học</label>
                <select
                  value={pdfSubjectId}
                  onChange={(e) => setPdfSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">-- Không phân môn --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              {/* Số lượng câu hỏi */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Số lượng câu hỏi cần tạo
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800">Trắc nghiệm chọn 1 đáp án</p>
                      <p className="text-xs text-blue-500">4 đáp án, 1 đáp án đúng</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={pdfSingleCount}
                        onChange={(e) => setPdfSingleCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 px-2 py-1.5 border border-blue-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">câu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pdfPointsSingle}
                        onChange={(e) => setPdfPointsSingle(e.target.value)}
                        className="w-16 px-2 py-1.5 border border-blue-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">đ/câu</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-800">Trắc nghiệm chọn nhiều đáp án</p>
                      <p className="text-xs text-emerald-500">4-5 đáp án, nhiều đáp án đúng</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={pdfMultipleCount}
                        onChange={(e) => setPdfMultipleCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 px-2 py-1.5 border border-emerald-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">câu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pdfPointsMultiple}
                        onChange={(e) => setPdfPointsMultiple(e.target.value)}
                        className="w-16 px-2 py-1.5 border border-emerald-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">đ/câu</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">Câu tự luận</p>
                      <p className="text-xs text-amber-500">Có rubric chấm điểm tự động</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={pdfEssayCount}
                        onChange={(e) => setPdfEssayCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 px-2 py-1.5 border border-amber-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-xs text-slate-500">câu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={pdfPointsEssay}
                        onChange={(e) => setPdfPointsEssay(e.target.value)}
                        className="w-16 px-2 py-1.5 border border-amber-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-xs text-slate-500">đ/câu</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-right text-xs text-slate-500">
                  Tổng: <span className="font-semibold text-violet-700">{pdfSingleCount + pdfMultipleCount + pdfEssayCount}</span> câu hỏi
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={pdfLoading || !pdfFile || (pdfSingleCount + pdfMultipleCount + pdfEssayCount) === 0}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {pdfLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI đang tạo câu hỏi...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Tạo câu hỏi bằng AI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Sửa câu hỏi */}
      {showEditModal && editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-500" />
                Sửa câu hỏi
              </h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingQuestion(null); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
              {/* Môn học */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <span>Môn học áp dụng</span>
                </label>
                <select
                  value={editSubjectId}
                  onChange={(e) => setEditSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="">🌐 Ngân hàng chung (Không phân môn)</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      📖 {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Loại câu hỏi (readonly) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Loại câu hỏi</label>
                <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">
                  {editingQuestion.type === "essay"
                    ? "Tự luận kèm Rubric 3 Gốc"
                    : editingQuestion.type === "multiple_select"
                    ? "Trắc nghiệm nhiều đáp án đúng"
                    : "Trắc nghiệm một đáp án đúng"}
                  <span className="ml-2 text-xs text-slate-400">(không thể thay đổi loại)</span>
                </div>
              </div>

              {/* Nội dung */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung câu hỏi</label>
                <textarea
                  required
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Điểm */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Điểm mặc định</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={editDefaultPoints}
                  onChange={(e) => setEditDefaultPoints(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Options for MCQ */}
              {(editingQuestion.type === "single_choice" || editingQuestion.type === "multiple_select") && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Các lựa chọn đáp án</label>
                    <button
                      type="button"
                      onClick={() => setEditOptions([...editOptions, { content: "", is_correct: false, order_index: editOptions.length }])}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      + Thêm lựa chọn
                    </button>
                  </div>
                  {editOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type={editingQuestion.type === "single_choice" ? "radio" : "checkbox"}
                        name="edit_correct_option"
                        checked={opt.is_correct}
                        onChange={() => handleEditToggleCorrect(idx)}
                        className="h-4 w-4 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        title="Đánh dấu đáp án đúng"
                      />
                      <input
                        type="text"
                        required
                        value={opt.content}
                        onChange={(e) => handleEditOptionChange(idx, e.target.value)}
                        placeholder={`Lựa chọn ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      {editOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setEditOptions(editOptions.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">* Tích vào nút tròn/vuông để đánh dấu đáp án đúng.</p>
                </div>
              )}

              {/* Rubrics for Essay */}
              {editingQuestion.type === "essay" && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-purple-600" />
                      Rubric chấm điểm
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditRubrics([...editRubrics, { criterion_name: "", description: "", max_points: "2.00", is_deduction: false, level_descriptors: {} }])}
                      className="text-xs text-purple-600 hover:underline font-semibold"
                    >
                      + Thêm tiêu chí
                    </button>
                  </div>
                  {editRubrics.map((r, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border space-y-2 ${r.is_deduction ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={r.criterion_name}
                          onChange={(e) => handleEditRubricChange(idx, "criterion_name", e.target.value)}
                          placeholder="Tên tiêu chí"
                          className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          required
                          value={r.max_points}
                          onChange={(e) => handleEditRubricChange(idx, "max_points", e.target.value)}
                          className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-xs text-slate-500">đ</span>
                        {editRubrics.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setEditRubrics(editRubrics.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={r.description}
                        onChange={(e) => handleEditRubricChange(idx, "description", e.target.value)}
                        placeholder="Mô tả tiêu chí (tùy chọn)"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingQuestion(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {editSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Lưu thay đổi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
