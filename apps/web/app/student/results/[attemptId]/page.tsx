"use client";

import { useEffect, useState } from "react";
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
    transformative_advice?: string;
    practical_action_plan?: string[];
  } | null;
}

export default function StudentResultPage() {
  const params = useParams();
  const attemptId = params?.attemptId as string;

  const [result, setResult] = useState<StudentResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadResult = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch<StudentResultData>(
          `/student/attempts/${attemptId}/results`
        );
        setResult(data);
      } catch (err: any) {
        setError(err.message || "Không thể tải kết quả bài thi");
      } finally {
        setLoading(false);
      }
    };

    if (attemptId) {
      loadResult();
    }
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

  // Not yet published
  if (!result.is_published) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-lg mx-auto shadow-sm space-y-4 my-8">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Bài làm đang trong quá trình chấm duyệt</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Bài làm của bạn đang được AI Agent và Giáo viên đánh giá kỹ lưỡng theo thang chuẩn 3 Gốc. 
          Kết quả chính thức sẽ được công bố ngay sau khi giáo viên hoàn tất chấm điểm.
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
            Điểm tự luận thẩm định
          </p>
          <p className="text-3xl font-black text-purple-600">
            {result.essay_score !== null ? Number(result.essay_score).toFixed(2) : "0.00"}
          </p>
          <p className="text-xs text-slate-500">Giáo viên đã duyệt & chốt điểm</p>
        </div>

        {/* Final Total Score */}
        <div className="p-6 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-2xl border border-emerald-200 shadow-sm space-y-2">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
            Tổng điểm chính thức
          </p>
          <p className="text-4xl font-black text-emerald-600">
            {result.final_score !== null ? Number(result.final_score).toFixed(2) : "0.00"} pts
          </p>
          <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Đã công nhận kết quả
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
                  {result.ai_feedback.three_roots.dao_duc?.reasoning || "Tư tưởng hướng thiện, vì cộng đồng và lòng trung thực."}
                </p>
              </div>

              {/* Tri tue */}
              <div className="p-6 bg-white rounded-2xl border border-blue-200 shadow-2xs space-y-2">
                <span className="text-xs font-black text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full inline-block">
                  💡 Gốc Trí Tuệ
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {result.ai_feedback.three_roots.tri_tue?.reasoning || "Khả năng phân tích sâu sắc, hiểu rõ bản chất vấn đề."}
                </p>
              </div>

              {/* Nghi luc */}
              <div className="p-6 bg-white rounded-2xl border border-amber-200 shadow-2xs space-y-2">
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider bg-amber-50 px-2.5 py-1 rounded-full inline-block">
                  🛡️ Gốc Nghị Lực
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {result.ai_feedback.three_roots.nghi_luc?.reasoning || "Ý chí kiên cường, dũng cảm vượt khó khăn và cám dỗ."}
                </p>
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
