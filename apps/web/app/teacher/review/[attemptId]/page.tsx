"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  BrainCircuit, 
  CheckCircle2, 
  AlertCircle, 
  Award, 
  User, 
  Clock, 
  History, 
  Send, 
  Save, 
  Loader2,
  Sparkles,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  Scale
} from "lucide-react";
import { apiFetch } from "../../../../lib/api";

interface ReviewData {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  exam_title: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  objective_score: number;
  essay_score: number;
  final_score: number;
  essay_details: {
    answer_id: string;
    question_content: string;
    points: number;
    student_response: string;
    rubrics: any[];
    grading_result: {
      id: string;
      answer_id: string;
      score: number;
      auto_graded_score: number;
      ai_suggested_score: number;
      teacher_final_score: number;
      teacher_feedback: string;
      graded_by: string | null;
      version: number;
      reviews: {
        id: string;
        reviewer_name: string | null;
        previous_score: number;
        new_score: number;
        reason: string;
        changed_at: string;
      }[];
    } | null;
    ai_analysis: {
      model_provider?: string;
      three_roots?: any;
      three_poisons?: any;
      feedback?: any;
      rubric_evaluations?: any[];
      proposed_total_score?: number;
      confidence_score?: number;
      requires_manual_audit?: boolean;
      audit_reason?: string;
    } | null;
  }[];
}

export default function AttemptReviewPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params?.attemptId as string;

  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Override form states per essay detail
  const [overrideScores, setOverrideScores] = useState<{ [grId: string]: string }>({});
  const [feedbacks, setFeedbacks] = useState<{ [grId: string]: string }>({});
  const [reasons, setReasons] = useState<{ [grId: string]: string }>({});
  const [savingGrId, setSavingGrId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadReview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<ReviewData>(`/teacher/attempts/${attemptId}/review`);
      setReview(data);

      // Pre-fill override form states
      const sc: Record<string, string> = {};
      const fb: Record<string, string> = {};
      const rs: Record<string, string> = {};

      data.essay_details.forEach((item) => {
        if (item.grading_result) {
          const grId = item.grading_result.id;
          sc[grId] = item.grading_result.teacher_final_score?.toString() || 
                     item.ai_analysis?.proposed_total_score?.toString() || "0";
          fb[grId] = item.grading_result.teacher_feedback || "";
          rs[grId] = "";
        }
      });

      setOverrideScores(sc);
      setFeedbacks(fb);
      setReasons(rs);
    } catch (err: any) {
      setError(err.message || "Không thể tải dữ liệu bài thi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (attemptId) {
      loadReview();
    }
  }, [attemptId]);

  const handleSaveOverride = async (grId: string, expectedVersion: number) => {
    const scoreVal = overrideScores[grId];
    const fbVal = feedbacks[grId];
    const rsVal = reasons[grId] || "Giáo viên thẩm định và duyệt điểm";

    setSavingGrId(grId);
    setSuccessMsg(null);
    try {
      await apiFetch(`/teacher/grading-results/${grId}/override`, {
        method: "PUT",
        body: JSON.stringify({
          score: scoreVal,
          teacher_feedback: fbVal,
          reason: rsVal,
          expected_version: expectedVersion,
        }),
      });

      setSuccessMsg("Đã cập nhật điểm và nhận xét của giáo viên thành công!");
      await loadReview();
    } catch (err: any) {
      alert("Lỗi khi lưu điểm: " + err.message);
    } finally {
      setSavingGrId(null);
    }
  };

  const handleFinalize = async () => {
    if (!confirm("Bạn có chắc chắn muốn chốt điểm chính thức? Sau khi chốt, học sinh sẽ xem được điểm số và nhận xét.")) {
      return;
    }

    setFinalizing(true);
    setSuccessMsg(null);
    try {
      await apiFetch(`/teacher/attempts/${attemptId}/finalize`, {
        method: "POST",
      });
      setSuccessMsg("Bài làm đã được duyệt và chốt điểm chính thức thành công!");
      await loadReview();
    } catch (err: any) {
      alert("Lỗi khi chốt điểm: " + err.message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
        <p className="text-sm">Đang tải chi tiết bài làm & phân tích AI...</p>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-xl">
        <div className="flex items-center gap-2 font-bold mb-2">
          <AlertCircle className="h-5 w-5" />
          <span>Không tìm thấy bài thi</span>
        </div>
        <p className="text-sm">{error || "Bài thi không tồn tại hoặc bạn không có quyền truy cập."}</p>
        <Link
          href="/teacher/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/teacher/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 mb-2 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Trở về Tổng quan
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            Thẩm định & Điều chỉnh điểm thi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Đề thi: <strong className="text-slate-800">{review.exam_title}</strong> • Mã bài làm: {review.attempt_id}
          </p>
          <p className="text-2xs text-blue-600 font-medium mt-0.5">
            * Điểm số đã được AI tự động chấm và công bố cho học viên. Giáo viên có quyền chỉnh sửa lại điểm số và nhận xét.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {review.status === "finalized" ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Đã chốt điểm chính thức
              </span>
              <span className="text-2xs text-slate-400">
                (Vẫn có thể điều chỉnh lại điểm nếu cần)
              </span>
            </div>
          ) : (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
            >
              {finalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>Chốt điểm & Xác nhận kết quả</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Candidate Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs text-slate-500 font-semibold uppercase">Thí sinh</p>
          <p className="text-base font-bold text-slate-900">{review.student_name}</p>
          <p className="text-xs text-slate-400">{review.student_email}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 font-semibold uppercase">Điểm trắc nghiệm (Tự động)</p>
          <p className="text-2xl font-black text-blue-600">{Number(review.objective_score).toFixed(2)} pts</p>
          <p className="text-xs text-slate-400">Khách quan từ hệ thống</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 font-semibold uppercase">Điểm tự luận (Thẩm định)</p>
          <p className="text-2xl font-black text-purple-600">{Number(review.essay_score).toFixed(2)} pts</p>
          <p className="text-xs text-slate-400">AI đề xuất + GV điều chỉnh</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 font-semibold uppercase">Tổng điểm hiện tại</p>
          <p className="text-2xl font-black text-emerald-600">{Number(review.final_score).toFixed(2)} pts</p>
          <p className="text-xs text-slate-400">Trạng thái: {review.status}</p>
        </div>
      </div>

      {/* Essay Answers Review List */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Scale className="h-5 w-5 text-blue-600" />
          <span>Chi tiết các câu tự luận & Đề xuất AI Agent 3 Gốc</span>
        </h2>

        {review.essay_details.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border text-center text-slate-500 text-sm">
            Bài thi này không có câu hỏi tự luận. Toàn bộ điểm trắc nghiệm đã được chấm tự động.
          </div>
        ) : (
          review.essay_details.map((item, index) => {
            const gr = item.grading_result;
            const ai = item.ai_analysis;
            const grId = gr ? gr.id : "";

            return (
              <div
                key={item.answer_id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Question & Student Response */}
                <div className="p-6 border-b bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Câu hỏi tự luận #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      Tối đa: {item.points} điểm
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-4">
                    {item.question_content}
                  </h3>

                  {/* Student text response */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200">
                    <p className="text-xs font-bold uppercase text-slate-400 mb-1.5">
                      Bài làm của học sinh:
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {item.student_response || <em className="text-slate-400">Không có câu trả lời</em>}
                    </p>
                  </div>
                </div>

                {/* AI Analysis 3 Roots - 3 Poisons Section */}
                {ai && (
                  <div className="p-6 border-b bg-blue-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                        <BrainCircuit className="h-5 w-5 text-blue-600" />
                        <span>AI Agent Đánh Giá 3 Gốc - 3 Độc (Mô hình: {ai.model_provider || "AI Expert"})</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-bold">
                          Điểm AI đề xuất: {ai.proposed_total_score} / {item.points}
                        </span>
                        {ai.confidence_score !== undefined && (
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
                            Độ tin cậy: {(ai.confidence_score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3 Roots cards */}
                    {ai.three_roots && (
                      <div className="mb-4 space-y-1.5">
                        <p className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                          🌱 Phân Tích 3 Gốc Rễ (Cộng Điểm)
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="p-3.5 rounded-xl bg-white border border-emerald-100 shadow-2xs">
                            <p className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                              🌱 Đạo Đức (Moral)
                            </p>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_roots.dao_duc === "string"
                                ? ai.three_roots.dao_duc
                                : ai.three_roots.dao_duc?.reasoning || "Không phát hiện yếu tố tiêu cực."}
                            </p>
                          </div>
                          <div className="p-3.5 rounded-xl bg-white border border-blue-100 shadow-2xs">
                            <p className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
                              💡 Trí Tuệ (Wisdom)
                            </p>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_roots.tri_tue === "string"
                                ? ai.three_roots.tri_tue
                                : ai.three_roots.tri_tue?.reasoning || "Thể hiện tư duy logic và hiểu bài."}
                            </p>
                          </div>
                          <div className="p-3.5 rounded-xl bg-white border border-amber-100 shadow-2xs">
                            <p className="text-xs font-bold text-amber-800 uppercase flex items-center gap-1">
                              🛡️ Nghị Lực (Courage)
                            </p>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_roots.nghi_luc === "string"
                                ? ai.three_roots.nghi_luc
                                : ai.three_roots.nghi_luc?.reasoning || "Thể hiện tinh thần vượt khó, bền bỉ."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3 Poisons cards (Tham - Sân - Si) with deductions */}
                    {ai.three_poisons && (
                      <div className="mb-4 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-rose-800 uppercase flex items-center gap-1.5">
                            <ShieldAlert className="h-4 w-4 text-rose-600" />
                            <span>Phân Tích 3 Độc & Trừ Điểm (Tham - Sân - Si)</span>
                          </p>
                          {ai.three_poisons.points_deducted !== undefined && Number(ai.three_poisons.points_deducted) > 0 ? (
                            <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                              Tổng điểm trừ: -{Number(ai.three_poisons.points_deducted).toFixed(2)}đ (Min điểm: 0.00đ)
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Không phát hiện vi phạm 3 Độc (-0.00đ)
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Tham */}
                          <div className="p-3.5 rounded-xl bg-white border border-rose-100 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-rose-800 uppercase">🐍 Tham (Greed)</p>
                              {ai.three_poisons.tham_deduction && Number(ai.three_poisons.tham_deduction) > 0 && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                  -{Number(ai.three_poisons.tham_deduction).toFixed(2)}đ
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_poisons.tham === "string"
                                ? ai.three_poisons.tham
                                : ai.three_poisons.tham?.reasoning || "Không có biểu hiện mưu cầu vị kỷ."}
                            </p>
                          </div>

                          {/* San */}
                          <div className="p-3.5 rounded-xl bg-white border border-rose-100 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-rose-800 uppercase">⚡ Sân (Anger)</p>
                              {ai.three_poisons.san_deduction && Number(ai.three_poisons.san_deduction) > 0 && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                  -{Number(ai.three_poisons.san_deduction).toFixed(2)}đ
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_poisons.san === "string"
                                ? ai.three_poisons.san
                                : ai.three_poisons.san?.reasoning || "Văn phong điềm tĩnh, không công kích."}
                            </p>
                          </div>

                          {/* Si */}
                          <div className="p-3.5 rounded-xl bg-white border border-rose-100 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-rose-800 uppercase">🌀 Si (Delusion)</p>
                              {ai.three_poisons.si_deduction && Number(ai.three_poisons.si_deduction) > 0 && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                  -{Number(ai.three_poisons.si_deduction).toFixed(2)}đ
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 leading-normal">
                              {typeof ai.three_poisons.si === "string"
                                ? ai.three_poisons.si
                                : ai.three_poisons.si?.reasoning || "Tư duy sáng suốt, có căn cứ logic."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rubric Criteria Evaluation Breakdown */}
                    {ai.rubric_evaluations && ai.rubric_evaluations.length > 0 && (
                      <div className="mb-4 p-3.5 rounded-xl bg-white border border-slate-200">
                        <p className="text-xs font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4 text-indigo-600" />
                          <span>Chi Tiết Đánh Giá Theo Khung Rubric (3 Gốc & 3 Độc)</span>
                        </p>
                        <div className="space-y-2">
                          {ai.rubric_evaluations.map((rev: any, rIdx: number) => {
                            const isDeduct = rev.is_deduction || rev.criterion_name.toLowerCase().includes("trừ");
                            const deductedVal = Number(rev.points_deducted || (isDeduct ? rev.awarded_points : 0));

                            return (
                              <div
                                key={rIdx}
                                className={`p-2.5 rounded-lg border text-xs ${
                                  isDeduct
                                    ? "bg-rose-50/40 border-rose-200 text-rose-950"
                                    : "bg-slate-50 border-slate-200 text-slate-800"
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span>{rev.criterion_name}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      isDeduct
                                        ? deductedVal > 0
                                          ? "bg-rose-200 text-rose-900"
                                          : "bg-slate-100 text-slate-600"
                                        : "bg-emerald-100 text-emerald-800"
                                    }`}
                                  >
                                    {isDeduct
                                      ? deductedVal > 0
                                        ? `- Trừ ${deductedVal.toFixed(2)} / Tối đa ${rev.max_points}đ`
                                        : `Không trừ điểm (0.00 / ${rev.max_points}đ)`
                                      : `+ ${Number(rev.awarded_points).toFixed(2)} / ${rev.max_points}đ`}
                                  </span>
                                </div>
                                <p className="text-slate-600 mt-1 leading-normal">{rev.reasoning}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Pedagogical feedback */}
                    {ai.feedback && (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-2">
                        {ai.feedback.transformative_advice && (
                          <p>
                            <strong className="text-blue-700">Lời khuyên chuyển hóa:</strong>{" "}
                            {ai.feedback.transformative_advice}
                          </p>
                        )}
                        {ai.feedback.practical_action_plan && Array.isArray(ai.feedback.practical_action_plan) && (
                          <div>
                            <strong className="text-emerald-700">Kế hoạch rèn luyện:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
                              {ai.feedback.practical_action_plan.map((act: string, aIdx: number) => (
                                <li key={aIdx}>{act}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Teacher Override Grading Section */}
                {gr && (
                  <div className="p-6 bg-white space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Award className="h-4 w-4 text-purple-600" />
                        <span>Bảng So Sánh & Chấm Điểm Chính Thức Của Giáo Viên</span>
                      </h4>
                      <span className="text-xs text-slate-400">
                        Phiên bản dữ liệu: v{gr.version}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Score override input */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Điểm số giáo viên chốt (Tối đa: {item.points})
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max={item.points}
                          value={overrideScores[grId] || ""}
                          onChange={(e) =>
                            setOverrideScores({ ...overrideScores, [grId]: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-2xs text-slate-400 mt-1">
                          AI đề xuất: {ai?.proposed_total_score ?? "N/A"} pts
                        </p>
                      </div>

                      {/* Reason */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lý do điều chỉnh (Kiểm toán điểm)
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Học sinh thể hiện nghị lực tốt"
                          value={reasons[grId] || ""}
                          onChange={(e) =>
                            setReasons({ ...reasons, [grId]: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Teacher feedback to student */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lời nhận xét gửi đến học sinh
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Thầy khen ngợi tinh thần tự giác của em..."
                          value={feedbacks[grId] || ""}
                          onChange={(e) =>
                            setFeedbacks({ ...feedbacks, [grId]: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="text-xs text-slate-500">
                        {gr.reviews && gr.reviews.length > 0 && (
                          <span className="flex items-center gap-1 text-slate-500">
                            <History className="h-3.5 w-3.5" />
                            <span>Đã có {gr.reviews.length} lần điều chỉnh điểm trước đó</span>
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSaveOverride(grId, gr.version)}
                        disabled={savingGrId === grId}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                      >
                        {savingGrId === grId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        <span>Lưu điểm & Nhận xét câu này</span>
                      </button>
                    </div>

                    {/* Audit History Log */}
                    {gr.reviews && gr.reviews.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Nhật ký thay đổi điểm (Audit Trail):
                        </p>
                        <div className="space-y-1 text-2xs text-slate-600">
                          {gr.reviews.map((r) => (
                            <div key={r.id} className="flex items-center gap-2">
                              <span className="text-slate-400">
                                {new Date(r.changed_at).toLocaleString("vi-VN")}:
                              </span>
                              <span className="font-semibold text-slate-700">
                                {r.reviewer_name || "Giáo viên"}
                              </span>
                              <span>
                                đổi từ <strong>{r.previous_score}</strong> &rarr;{" "}
                                <strong className="text-blue-600">{r.new_score}</strong>
                              </span>
                              <span className="text-slate-500 italic">({r.reason})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
