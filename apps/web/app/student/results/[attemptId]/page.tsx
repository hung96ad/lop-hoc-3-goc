"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { 
  Award, 
  ArrowLeft, 
  BrainCircuit, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  BookOpen, 
  Sparkles,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Target
} from "lucide-react";
import { apiFetch } from "../../../../lib/api";

interface StudentResultData {
  attempt_id: string;
  exam_title: string;
  is_published: boolean;
  status: string;
  objective_score: number | null;
  essay_score: number | null;
  final_score: number | null;
  teacher_feedback: string | null;
  ai_feedback: {
    three_roots?: any;
    three_poisons?: any;
    transformative_advice?: string;
    practical_action_plan?: string[];
  } | null;
  ai_essay_score?: number | null;
  is_teacher_reviewed?: boolean;
  grade_source?: string;
}

export default function StudentResultPage() {
  const params = useParams();
  const attemptId = params?.attemptId as string;

  const [result, setResult] = useState<StudentResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadResult = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const data = await apiFetch<StudentResultData>(
        `/student/attempts/${attemptId}/results`
      );
      setResult(data);

      // If still in grading status, auto-poll after 1.5 seconds
      if (data.status === "grading" && !data.is_published) {
        pollTimerRef.current = setTimeout(() => {
          loadResult(false);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || "Không thể tải kết quả bài thi");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (attemptId) {
      loadResult(true);
    }
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [attemptId]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-2" />
        <p className="text-sm">Đang tải kết quả thi & phân tích 3 Gốc...</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl">
        <div className="flex items-center gap-2 font-bold mb-2">
          <AlertCircle className="h-5 w-5 text-rose-600" />
          <span>Không thể tải kết quả</span>
        </div>
        <p className="text-sm">{error || "Bài thi chưa có kết quả."}</p>
        <Link
          href="/student/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Về Không gian học tập
        </Link>
      </div>
    );
  }

  // Still being evaluated by AI
  if (!result.is_published && result.status === "grading") {
    return (
      <div className="bg-white p-8 rounded-3xl border border-indigo-200 text-center max-w-lg mx-auto shadow-sm space-y-4 my-8">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
          <BrainCircuit className="h-9 w-9" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">AI đang tự động chấm điểm bài làm</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Hệ thống AI Agent 3 Gốc đang phân tích câu trả lời tự luận của bạn theo các tiêu chí Đạo Đức - Trí Tuệ - Nghị Lực.
          Kết quả và điểm số sẽ được tự động công bố ngay...
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Đang phân tích dữ liệu bài làm...</span>
        </div>
      </div>
    );
  }

  // Not yet published (other status)
  if (!result.is_published) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-lg mx-auto shadow-sm space-y-4 my-8">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Bài làm đang trong quá trình chấm duyệt</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Bài làm của bạn đang được hoàn tất chấm điểm. Kết quả sẽ được công bố ngay sau khi xử lý xong.
        </p>
        <Link
          href="/student/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-2 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Trở về Dashboard
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Kết quả Khảo thí & Báo cáo 3 Gốc
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Kỳ thi: <strong className="text-slate-800">{result.exam_title}</strong>
        </p>
      </div>

      {/* Grading Source Notification Banner */}
      {result.is_teacher_reviewed ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-emerald-900">
              Điểm đã được Giáo viên thẩm định & cập nhật
            </p>
            <p className="text-emerald-700 text-xs mt-0.5 leading-relaxed">
              Thầy/Cô đã xem xét bài làm, tham khảo đánh giá từ AI và điều chỉnh/chốt điểm số chính thức cho bạn.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span>Điểm tự động do AI chấm điểm & công bố</span>
              <span className="text-2xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                Tức thì
              </span>
            </p>
            <p className="text-indigo-700 text-xs mt-0.5 leading-relaxed">
              Bài thi của bạn đã được hệ thống AI 3 Gốc tự động chấm điểm và công bố kết quả ngay khi nộp bài. Giáo viên có quyền thẩm định và điều chỉnh lại điểm số nếu cần.
            </p>
          </div>
        </div>
      )}

      {/* Score Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Objective Score */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Điểm trắc nghiệm khách quan
          </p>
          <p className="text-3xl font-black text-blue-600">
            {result.objective_score !== null ? Number(result.objective_score).toFixed(2) : "0.00"}
          </p>
          <p className="text-xs text-slate-500">Tự động chấm từ hệ thống</p>
        </div>

        {/* Essay Score */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {result.is_teacher_reviewed ? "Điểm tự luận (GV duyệt)" : "Điểm tự luận (AI chấm)"}
          </p>
          <p className="text-3xl font-black text-purple-600">
            {result.essay_score !== null ? Number(result.essay_score).toFixed(2) : "0.00"}
          </p>
          <p className="text-xs text-slate-500">
            {result.is_teacher_reviewed ? (
              result.ai_essay_score !== null && Number(result.ai_essay_score) !== Number(result.essay_score) ? (
                <span>Điểm AI ban đầu: <strong className="text-slate-700">{Number(result.ai_essay_score).toFixed(2)}</strong></span>
              ) : (
                "Giáo viên đã xác nhận"
              )
            ) : (
              "AI Agent chấm theo rubric 3 Gốc"
            )}
          </p>
        </div>

        {/* Final Total Score */}
        <div className="p-6 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-2xl border border-emerald-200 shadow-sm space-y-2">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
            Tổng điểm công bố
          </p>
          <p className="text-4xl font-black text-emerald-600">
            {result.final_score !== null ? Number(result.final_score).toFixed(2) : "0.00"} pts
          </p>
          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
            {result.is_teacher_reviewed ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Giáo viên đã duyệt chính thức</span>
              </>
            ) : (
              <>
                <BrainCircuit className="h-3.5 w-3.5 text-indigo-600" />
                <span>Điểm do AI chấm</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Teacher Feedback Card */}
      {result.teacher_feedback && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <MessageSquare className="h-5 w-5 text-indigo-600" />
            <span>Lời nhận xét & Động viên từ Thầy/Cô:</span>
          </div>
          <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-sm text-slate-800 leading-relaxed font-medium">
            "{result.teacher_feedback}"
          </div>
        </div>
      )}

      {/* AI 3 Roots Feedback */}
      {result.ai_feedback && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <BrainCircuit className="h-6 w-6 text-indigo-600" />
            <span>Báo cáo Phát triển Phẩm chất 3 Gốc từ AI Agent</span>
          </div>

          {/* 3 Roots Breakdown */}
          {result.ai_feedback.three_roots && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dao duc */}
              <div className="p-6 bg-white rounded-2xl border border-emerald-200 shadow-2xs space-y-2">
                <span className="text-xs font-black text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2.5 py-1 rounded-full inline-block">
                  🌱 Gốc Đạo Đức
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {typeof result.ai_feedback.three_roots.dao_duc === "string"
                    ? result.ai_feedback.three_roots.dao_duc
                    : (result.ai_feedback.three_roots.dao_duc?.reasoning || result.ai_feedback.three_roots.dao_duc?.evidence || "Tư tưởng hướng thiện, vì cộng đồng và lòng trung thực.")}
                </p>
              </div>

              {/* Tri tue */}
              <div className="p-6 bg-white rounded-2xl border border-blue-200 shadow-2xs space-y-2">
                <span className="text-xs font-black text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full inline-block">
                  💡 Gốc Trí Tuệ
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {typeof result.ai_feedback.three_roots.tri_tue === "string"
                    ? result.ai_feedback.three_roots.tri_tue
                    : (result.ai_feedback.three_roots.tri_tue?.reasoning || result.ai_feedback.three_roots.tri_tue?.evidence || "Khả năng phân tích sâu sắc, hiểu rõ bản chất vấn đề.")}
                </p>
              </div>

              {/* Nghi luc */}
              <div className="p-6 bg-white rounded-2xl border border-amber-200 shadow-2xs space-y-2">
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider bg-amber-50 px-2.5 py-1 rounded-full inline-block">
                  🛡️ Gốc Nghị Lực
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {typeof result.ai_feedback.three_roots.nghi_luc === "string"
                    ? result.ai_feedback.three_roots.nghi_luc
                    : (result.ai_feedback.three_roots.nghi_luc?.reasoning || result.ai_feedback.three_roots.nghi_luc?.evidence || "Ý chí kiên cường, dũng cảm vượt khó khăn và cám dỗ.")}
                </p>
              </div>
            </div>
          )}

          {/* 3 Poisons (Tham - Sân - Si) & Points Deduction */}
          {result.ai_feedback.three_poisons && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-rose-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  <span>Báo Cáo Nhận Diện & Trừ Điểm 3 Độc (Tham - Sân - Si)</span>
                </span>
                {result.ai_feedback.three_poisons.points_deducted !== undefined &&
                Number(result.ai_feedback.three_poisons.points_deducted) > 0 ? (
                  <span className="text-xs font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-200">
                    Tổng điểm trừ: -{Number(result.ai_feedback.three_poisons.points_deducted).toFixed(2)}đ (Điểm tối thiểu là 0)
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    Tâm thế trong sáng, không phát hiện vi phạm (-0.00đ)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Tham */}
                <div className="p-6 bg-white rounded-2xl border border-rose-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-rose-700 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full inline-block">
                      🐍 Tâm Tham (Vị kỷ)
                    </span>
                    {result.ai_feedback.three_poisons.tham_deduction &&
                      Number(result.ai_feedback.three_poisons.tham_deduction) > 0 && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">
                          -{Number(result.ai_feedback.three_poisons.tham_deduction).toFixed(2)}đ
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed mt-2">
                    {typeof result.ai_feedback.three_poisons.tham === "string"
                      ? result.ai_feedback.three_poisons.tham
                      : result.ai_feedback.three_poisons.tham?.reasoning || "Không có biểu hiện mưu cầu lợi ích cá nhân."}
                  </p>
                </div>

                {/* San */}
                <div className="p-6 bg-white rounded-2xl border border-rose-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-rose-700 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full inline-block">
                      ⚡ Tâm Sân (Giận dữ)
                    </span>
                    {result.ai_feedback.three_poisons.san_deduction &&
                      Number(result.ai_feedback.three_poisons.san_deduction) > 0 && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">
                          -{Number(result.ai_feedback.three_poisons.san_deduction).toFixed(2)}đ
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed mt-2">
                    {typeof result.ai_feedback.three_poisons.san === "string"
                      ? result.ai_feedback.three_poisons.san
                      : result.ai_feedback.three_poisons.san?.reasoning || "Văn phong điềm tĩnh, không công kích hay oán trách."}
                  </p>
                </div>

                {/* Si */}
                <div className="p-6 bg-white rounded-2xl border border-rose-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-rose-700 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full inline-block">
                      🌀 Tâm Si (Mê muội)
                    </span>
                    {result.ai_feedback.three_poisons.si_deduction &&
                      Number(result.ai_feedback.three_poisons.si_deduction) > 0 && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">
                          -{Number(result.ai_feedback.three_poisons.si_deduction).toFixed(2)}đ
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed mt-2">
                    {typeof result.ai_feedback.three_poisons.si === "string"
                      ? result.ai_feedback.three_poisons.si
                      : result.ai_feedback.three_poisons.si?.reasoning || "Nhìn nhận vấn đề khách quan, dựa trên căn cứ thực tế."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Transformative Advice & Practical Action Plan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {result.ai_feedback.transformative_advice && (
              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <span>Lời khuyên chuyển hóa bản thân:</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {result.ai_feedback.transformative_advice}
                </p>
              </div>
            )}

            {result.ai_feedback.practical_action_plan && Array.isArray(result.ai_feedback.practical_action_plan) && (
              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <Target className="h-5 w-5 text-emerald-600" />
                  <span>Kế hoạch hành động cụ thể:</span>
                </div>
                <ul className="space-y-2 text-sm text-slate-700">
                  {result.ai_feedback.practical_action_plan.map((act: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
