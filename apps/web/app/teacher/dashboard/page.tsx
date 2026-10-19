"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FileQuestion, 
  Library, 
  School, 
  ClipboardCheck, 
  Plus, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Award,
  Sparkles,
  Loader2
} from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface StatData {
  questionsCount: number;
  examsCount: number;
  classesCount: number;
  attemptsCount: number;
}

interface AttemptItem {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  exam_title: string;
  class_name: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  objective_score: number;
  essay_score: number;
  final_score: number;
}

export default function TeacherDashboardPage() {
  const [stats, setStats] = useState<StatData>({
    questionsCount: 0,
    examsCount: 0,
    classesCount: 0,
    attemptsCount: 0,
  });
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [questions, exams, classes, attemptList] = await Promise.all([
        apiFetch<any[]>("/questions").catch(() => []),
        apiFetch<any[]>("/exams").catch(() => []),
        apiFetch<any[]>("/classes").catch(() => []),
        apiFetch<AttemptItem[]>("/teacher/attempts").catch(() => []),
      ]);

      setStats({
        questionsCount: questions.length,
        examsCount: exams.length,
        classesCount: classes.length,
        attemptsCount: attemptList.length,
      });
      setAttempts(attemptList);
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu dashboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-700 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Không gian Quản lý & Khảo thí</h1>
          <p className="mt-2 text-blue-100 text-sm max-w-xl">
            Tổ chức kỳ thi trực tuyến, quản lý ngân hàng câu hỏi và thẩm định kết quả phân tích tự luận từ AI Agent 3 Gốc.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition backdrop-blur"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
          <Link
            href="/teacher/exams"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-blue-700 hover:bg-blue-50 text-sm font-semibold shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>Tạo đề thi mới</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Link
          href="/teacher/questions"
          className="p-6 bg-white rounded-xl border border-slate-200 hover:border-blue-300 shadow-sm hover:shadow transition group flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-medium text-slate-500">Ngân hàng câu hỏi</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.questionsCount}</p>
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1 group-hover:underline">
              Quản lý câu hỏi &rarr;
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileQuestion className="h-6 w-6" />
          </div>
        </Link>

        <Link
          href="/teacher/exams"
          className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow transition group flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-medium text-slate-500">Đề thi đã tạo</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.examsCount}</p>
            <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1 group-hover:underline">
              Danh sách đề thi &rarr;
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Library className="h-6 w-6" />
          </div>
        </Link>

        <Link
          href="/teacher/classes"
          className="p-6 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 shadow-sm hover:shadow transition group flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-medium text-slate-500">Lớp học phụ trách</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.classesCount}</p>
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1 group-hover:underline">
              Mã lớp học sinh &rarr;
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <School className="h-6 w-6" />
          </div>
        </Link>

        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Lượt làm bài đã ghi nhận</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.attemptsCount}</p>
            <p className="text-xs text-amber-600 mt-1">Cần duyệt & đã công bố</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ClipboardCheck className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Review & Grading Queue Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Danh sách bài nộp cần chấm & thẩm định</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              So sánh điểm do AI Agent 3 Gốc đề xuất với điểm của giáo viên, điều chỉnh và chốt điểm chính thức
            </p>
          </div>
        </div>

        {attempts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ClipboardCheck className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-base font-medium text-slate-700">Chưa có bài nộp nào từ học viên</p>
            <p className="text-sm text-slate-500 mt-1">
              Khi học viên nộp bài làm trắc nghiệm & tự luận, danh sách sẽ xuất hiện tại đây để bạn duyệt điểm.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6">Học viên</th>
                  <th className="py-3 px-6">Đề thi</th>
                  <th className="py-3 px-6">Lớp</th>
                  <th className="py-3 px-6">Trạng thái</th>
                  <th className="py-3 px-6 text-right">Điểm TN</th>
                  <th className="py-3 px-6 text-right">Điểm TL</th>
                  <th className="py-3 px-6 text-right">Tổng điểm</th>
                  <th className="py-3 px-6 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((att) => {
                  let statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      <Clock className="h-3 w-3" /> {att.status}
                    </span>
                  );
                  if (att.status === "pending_review") {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Sparkles className="h-3 w-3" /> AI đã chấm (Chờ duyệt)
                      </span>
                    );
                  } else if (att.status === "grading") {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Loader2 className="h-3 w-3 animate-spin" /> Đang chấm AI
                      </span>
                    );
                  } else if (att.status === "finalized") {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Đã chốt điểm
                      </span>
                    );
                  }

                  return (
                    <tr key={att.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-6 font-medium text-slate-900">
                        <div>{att.student_name}</div>
                        <div className="text-xs text-slate-400 font-normal">{att.student_email}</div>
                      </td>
                      <td className="py-3.5 px-6 font-medium text-slate-800">{att.exam_title}</td>
                      <td className="py-3.5 px-6 text-slate-600">{att.class_name}</td>
                      <td className="py-3.5 px-6">{statusBadge}</td>
                      <td className="py-3.5 px-6 text-right font-medium text-slate-700">
                        {att.objective_score.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-medium text-slate-700">
                        {att.essay_score.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-blue-600">
                        {att.final_score.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <Link
                          href={`/teacher/review/${att.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-xs transition"
                        >
                          <Award className="h-3.5 w-3.5" />
                          <span>Chấm / Xem lại</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
