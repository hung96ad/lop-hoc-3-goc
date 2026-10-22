"use client";

import { useEffect, useState } from "react";
import { 
  Library, 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Send, 
  X, 
  Loader2, 
  AlertCircle,
  FileText,
  BookOpen,
  CheckSquare,
  Square
} from "lucide-react";
import { apiFetch } from "../../../lib/api";
import Pagination from "../../../components/Pagination";

interface QuestionItem {
  id: string;
  type: string;
  content: string;
  default_points: string;
  subject_id?: string;
}

interface ExamQuestionItem {
  id?: string;
  question_id?: string;
  points: string;
  order_index: number;
}

interface ExamItem {
  id: string;
  title: string;
  description?: string;
  status: "draft" | "published" | "archived";
  duration_minutes: number;
  total_score: string;
  shuffle_questions: boolean;
  questions?: ExamQuestionItem[];
  created_at: string;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
  student_count: number;
}

interface SubjectItem {
  id: string;
  name: string;
  code: string;
  question_count: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [examTotal, setExamTotal] = useState(0);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create exam modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [filteredQuestions, setFilteredQuestions] = useState<QuestionItem[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<{ [qId: string]: string }>({});
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState<string | null>(null);

  // Assign exam modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningExam, setAssigningExam] = useState<ExamItem | null>(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadData = async (page = currentPage, size = pageSize) => {
    try {
      setLoading(true);
      const [examData, questionList, classList, subjectList] = await Promise.all([
        apiFetch<PaginatedResponse<ExamItem>>(`/exams?page=${page}&page_size=${size}`),
        apiFetch<PaginatedResponse<QuestionItem>>("/questions?page=1&page_size=200").catch(() => ({ items: [] as QuestionItem[], total: 0, page: 1, page_size: 200, total_pages: 1 })),
        apiFetch<PaginatedResponse<ClassItem>>("/classes?page=1&page_size=200").catch(() => ({ items: [] as ClassItem[], total: 0, page: 1, page_size: 200, total_pages: 1 })),
        apiFetch<SubjectItem[]>("/subjects").catch(() => []),
      ]);
      setExams(examData.items);
      setExamTotal(examData.total);
      setQuestions(questionList.items);
      setClasses(classList.items);
      setSubjects(subjectList);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentPage, pageSize);
  }, [currentPage, pageSize]);

  // Filter questions when subject changes
  useEffect(() => {
    if (!selectedSubjectId) {
      setFilteredQuestions(questions);
    } else {
      setFilteredQuestions(questions.filter((q) => q.subject_id === selectedSubjectId));
    }
    // Clear selections that are no longer in filtered list
    setSelectedQuestions((prev) => {
      const validIds = new Set(
        (!selectedSubjectId ? questions : questions.filter((q) => q.subject_id === selectedSubjectId)).map((q) => q.id)
      );
      const next: { [qId: string]: string } = {};
      for (const id of Object.keys(prev)) {
        if (validIds.has(id)) next[id] = prev[id];
      }
      return next;
    });
  }, [selectedSubjectId, questions]);

  const handleToggleQuestion = (q: QuestionItem) => {
    const updated = { ...selectedQuestions };
    if (updated[q.id]) {
      delete updated[q.id];
    } else {
      updated[q.id] = q.default_points;
    }
    setSelectedQuestions(updated);
  };

  const handleSelectAll = () => {
    const updated: { [qId: string]: string } = { ...selectedQuestions };
    for (const q of filteredQuestions) {
      if (!updated[q.id]) updated[q.id] = q.default_points;
    }
    setSelectedQuestions(updated);
  };

  const handleDeselectAll = () => {
    const idsToRemove = new Set(filteredQuestions.map((q) => q.id));
    const updated: { [qId: string]: string } = {};
    for (const [id, pts] of Object.entries(selectedQuestions)) {
      if (!idsToRemove.has(id)) updated[id] = pts;
    }
    setSelectedQuestions(updated);
  };

  const allFilteredSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => !!selectedQuestions[q.id]);

  const handlePointChange = (qId: string, pts: string) => {
    setSelectedQuestions({
      ...selectedQuestions,
      [qId]: pts,
    });
  };

  const calculateTotalScore = () => {
    let sum = 0;
    Object.values(selectedQuestions).forEach((p) => {
      sum += parseFloat(p) || 0;
    });
    return sum.toFixed(2);
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const qKeys = Object.keys(selectedQuestions);
    if (qKeys.length === 0) {
      setCreateError("Vui lòng chọn ít nhất 1 câu hỏi cho đề thi.");
      return;
    }

    setCreateSubmitting(true);
    try {
      const qPayload = qKeys.map((qId, idx) => ({
        question_id: qId,
        points: selectedQuestions[qId],
        order_index: idx,
      }));

      await apiFetch("/exams", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          duration_minutes: durationMinutes,
          total_score: calculateTotalScore(),
          subject_id: selectedSubjectId || null,
          questions: qPayload,
          shuffle_questions: shuffleQuestions,
        }),
      });

      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setSelectedSubjectId("");
      setSelectedQuestions({});
      setShuffleQuestions(false);
      setCurrentPage(1);
      loadData(1, pageSize);
    } catch (err: any) {
      setCreateError(err.message || "Tạo đề thi thất bại.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handlePublishExam = async (examId: string) => {
    try {
      await apiFetch(`/exams/${examId}/publish`, { method: "POST" });
      loadData(currentPage, pageSize);
    } catch (err: any) {
      alert("Lỗi khi xuất bản đề thi: " + err.message);
    }
  };

  const handleToggleShuffle = async (exam: ExamItem) => {
    setShuffleLoading(exam.id);
    try {
      const updated = await apiFetch<ExamItem>(`/exams/${exam.id}/shuffle`, {
        method: "PATCH",
        body: JSON.stringify({ shuffle: !exam.shuffle_questions }),
      });
      setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err: any) {
      alert("Lỗi khi cập nhật trộn câu: " + err.message);
    } finally {
      setShuffleLoading(null);
    }
  };

  const openAssign = (exam: ExamItem) => {
    setAssigningExam(exam);
    if (classes.length > 0) {
      setAssignClassId(classes[0].id);
    }
    const now = new Date();
    const plusDays = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    // Format YYYY-MM-DDThh:mm
    const toInputString = (d: Date) => d.toISOString().slice(0, 16);
    setOpenAt(toInputString(now));
    setCloseAt(toInputString(plusDays));
    setShowAssignModal(true);
  };

  const handleAssignExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningExam || !assignClassId) return;
    setAssignError(null);
    setAssignSubmitting(true);

    try {
      await apiFetch("/exams/assignments", {
        method: "POST",
        body: JSON.stringify({
          exam_id: assigningExam.id,
          class_id: assignClassId,
          open_at: new Date(openAt).toISOString(),
          close_at: new Date(closeAt).toISOString(),
          max_attempts: maxAttempts,
        }),
      });

      setShowAssignModal(false);
      alert("Đã giao đề thi cho lớp học thành công!");
    } catch (err: any) {
      setAssignError(err.message || "Giao đề thi thất bại.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Đề thi</h1>
          <p className="text-sm text-slate-500 mt-1">
            Soạn thảo đề thi, cấu hình thời gian làm bài, xuất bản và giao đề cho các lớp học
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo đề thi mới</span>
        </button>
      </div>

      {/* Exam List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
          <p className="text-sm">Đang tải danh sách đề thi...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Library className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700">Chưa có đề thi nào</p>
          <p className="text-sm text-slate-500 mt-1">
            Nhấn "Tạo đề thi mới" để kết hợp các câu hỏi từ ngân hàng thành đề kiểm tra hoàn chỉnh.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      exam.status === "published"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {exam.status === "published" ? "Đã xuất bản" : "Bản nháp (Draft)"}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{exam.duration_minutes} phút</span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900 line-clamp-2">{exam.title}</h3>
                {exam.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{exam.description}</p>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Tổng điểm: <strong className="text-slate-900">{exam.total_score} pts</strong></span>
                  <span>{exam.questions?.length || 0} câu hỏi</span>
                </div>

                {/* Shuffle toggle */}
                <div className="mt-3">
                  <button
                    onClick={() => handleToggleShuffle(exam)}
                    disabled={shuffleLoading === exam.id}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition ${
                      exam.shuffle_questions
                        ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    } disabled:opacity-50`}
                  >
                    <span>Trộn câu hỏi ngẫu nhiên</span>
                    {shuffleLoading === exam.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${exam.shuffle_questions ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-600"}`}>
                        {exam.shuffle_questions ? "BẬT" : "TẮT"}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2">
                {exam.status === "draft" ? (
                  <button
                    onClick={() => handlePublishExam(exam.id)}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Xuất bản đề</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openAssign(exam)}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Giao cho lớp học</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={examTotal}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          />
        </>
      )}

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Tạo đề thi mới</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExam} className="space-y-4 mt-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề đề thi</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Đề khảo sát phẩm chất 3 Gốc - Kỳ I"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Subject selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-slate-500" />
                  Môn học
                </label>
                {subjects.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Chưa có môn học nào. Vui lòng tạo môn học trước.
                  </p>
                ) : (
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Tất cả môn học --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) — {s.question_count} câu hỏi
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian làm bài (Phút)</label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tổng điểm đề thi</label>
                  <input
                    type="text"
                    disabled
                    value={`${calculateTotalScore()} điểm`}
                    className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-700 rounded-lg text-sm font-bold"
                  />
                </div>
              </div>

              {/* Shuffle questions toggle */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition select-none">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800">Trộn câu hỏi ngẫu nhiên</span>
                  <p className="text-xs text-slate-500 mt-0.5">Mỗi học viên sẽ nhận được thứ tự câu hỏi khác nhau</p>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả / Hướng dẫn làm bài</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ghi chú thêm về quy chế thi hoặc dặn dò thí sinh..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Select questions section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-800">
                    Chọn câu hỏi từ Ngân hàng ({Object.keys(selectedQuestions).length} đã chọn
                    {selectedSubjectId ? ` / ${filteredQuestions.length} câu trong môn` : ""})
                  </label>
                  {filteredQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={allFilteredSelected ? handleDeselectAll : handleSelectAll}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
                    >
                      {allFilteredSelected ? (
                        <>
                          <CheckSquare className="h-3.5 w-3.5" />
                          Bỏ chọn tất cả
                        </>
                      ) : (
                        <>
                          <Square className="h-3.5 w-3.5" />
                          Chọn tất cả ({filteredQuestions.length})
                        </>
                      )}
                    </button>
                  )}
                </div>

                {questions.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    Ngân hàng câu hỏi đang trống. Vui lòng vào trang "Ngân hàng câu hỏi" tạo câu hỏi trước.
                  </p>
                ) : filteredQuestions.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    Môn học này chưa có câu hỏi nào. Hãy chọn môn học khác hoặc thêm câu hỏi vào môn học.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y max-h-64 overflow-y-auto">
                    {filteredQuestions.map((q) => {
                      const isSelected = !!selectedQuestions[q.id];
                      return (
                        <div
                          key={q.id}
                          className={`p-3 flex items-center justify-between gap-3 text-xs transition ${
                            isSelected ? "bg-blue-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleQuestion(q)}
                              className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="truncate">
                              <span
                                className={`font-semibold mr-1.5 ${
                                  q.type === "essay" ? "text-purple-600" : "text-blue-600"
                                }`}
                              >
                                [{q.type === "essay" ? "Tự luận" : "Trắc nghiệm"}]
                              </span>
                              <span className="text-slate-700 font-medium">{q.content}</span>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-slate-500">Điểm:</span>
                              <input
                                type="number"
                                step="0.5"
                                value={selectedQuestions[q.id]}
                                onChange={(e) => handlePointChange(q.id, e.target.value)}
                                className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {createSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Tạo đề thi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Exam Modal */}
      {showAssignModal && assigningExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Giao đề thi cho lớp học</h2>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {assignError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{assignError}</span>
              </div>
            )}

            <form onSubmit={handleAssignExam} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Đề thi được chọn
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800">
                  {assigningExam.title} ({assigningExam.duration_minutes} phút - {assigningExam.total_score} điểm)
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chọn lớp học</label>
                {classes.length === 0 ? (
                  <p className="text-xs text-rose-600">Bạn chưa tạo lớp học nào. Hãy tạo lớp học trước.</p>
                ) : (
                  <select
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Mã: {c.code} - {c.student_count} học viên)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian mở đề</label>
                  <input
                    type="datetime-local"
                    required
                    value={openAt}
                    onChange={(e) => setOpenAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian đóng đề</label>
                  <input
                    type="datetime-local"
                    required
                    value={closeAt}
                    onChange={(e) => setCloseAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số lượt làm bài tối đa</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting || classes.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {assignSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Xác nhận giao đề</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
