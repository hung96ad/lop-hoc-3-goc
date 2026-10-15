"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  School, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Award, 
  Plus, 
  Loader2, 
  X,
  FileText
} from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface ClassItem {
  id: string;
  name: string;
  code: string;
  student_count: number;
}

interface AttemptRecord {
  id: string;
  attempt_number: number;
  status: string;
  started_at: string;
  submitted_at: string | null;
  final_score: number | null;
}

interface StudentAssignment {
  assignment_id: string;
  exam_id: string;
  exam_title: string;
  class_name: string;
  duration_minutes: number;
  total_score: number;
  open_at: string;
  close_at: string;
  max_attempts: number;
  attempts_count: number;
  can_start: boolean;
  active_attempt_id: string | null;
  auto_publish_results: boolean;
  attempts?: AttemptRecord[];
}

export default function StudentDashboardPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Enroll class modal
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classList, assignmentList] = await Promise.all([
        apiFetch<ClassItem[]>("/classes").catch(() => []),
        apiFetch<StudentAssignment[]>("/student/assignments").catch(() => []),
      ]);
      setClasses(classList);
      setAssignments(assignmentList);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);
    setEnrolling(true);

    try {
      await apiFetch("/classes/enroll", {
        method: "POST",
        body: JSON.stringify({ code: enrollCode.trim().toUpperCase() }),
      });

      setShowEnrollModal(false);
      setEnrollCode("");
      loadData();
    } catch (err: any) {
      setEnrollError(err.message || "Không thể tham gia lớp học. Vui lòng kiểm tra lại mã.");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-700 to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Không gian Học tập & Khảo thí</h1>
          <p className="mt-2 text-indigo-100 text-sm max-w-xl">
            Tham gia phòng thi trực tuyến, nhận phản hồi sư phạm tức thì và báo cáo đánh giá 3 Gốc từ AI Agent.
          </p>
        </div>
        <button
          onClick={() => setShowEnrollModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 font-semibold text-sm shadow-sm transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Tham gia lớp học mới</span>
        </button>
      </div>

      {/* Enrolled Classes summary */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <School className="h-4 w-4 text-indigo-600" />
          <span>Lớp học của bạn ({classes.length})</span>
        </h2>

        {classes.length === 0 ? (
          <div className="p-6 bg-white rounded-xl border border-slate-200 text-center text-sm text-slate-500">
            Bạn chưa tham gia lớp học nào. Hãy bấm "Tham gia lớp học mới" và nhập mã mời do giáo viên cung cấp!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between"
              >
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{cls.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Mã lớp: <strong className="text-indigo-600 font-mono">{cls.code}</strong></p>
                </div>
                <div className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                  {cls.student_count} thành viên
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Exams list */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <span>Danh sách Kỳ thi & Bài kiểm tra</span>
        </h2>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-2" />
            <p className="text-sm">Đang tải danh sách bài thi...</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-bold text-slate-700">Chưa có bài kiểm tra nào</p>
            <p className="text-sm text-slate-500 mt-1">
              Khi giáo viên giao bài thi cho lớp học của bạn, đề thi sẽ hiển thị ở đây.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignments.map((asg) => {
              const latestAttempt = asg.attempts && asg.attempts.length > 0 ? asg.attempts[asg.attempts.length - 1] : null;
              const hasFinalized = asg.attempts?.some((a) => a.status === "finalized");
              const finalizedAttempt = asg.attempts?.find((a) => a.status === "finalized");

              return (
                <div
                  key={asg.assignment_id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {asg.class_name}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{asg.duration_minutes} phút</span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">{asg.exam_title}</h3>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                      <div>
                        Tổng điểm: <strong className="text-slate-800">{asg.total_score} điểm</strong>
                      </div>
                      <div>
                        Thời gian mở: {new Date(asg.open_at).toLocaleString("vi-VN")}
                      </div>
                      <div>
                        Thời gian đóng: {new Date(asg.close_at).toLocaleString("vi-VN")}
                      </div>
                      <div>
                        Lượt làm bài: {asg.attempts_count} / {asg.max_attempts}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
                    {/* Action buttons */}
                    {asg.can_start ? (
                      <Link
                        href={`/student/exam/${asg.assignment_id}`}
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        <span>{asg.active_attempt_id ? "Tiếp tục làm bài" : "Vào phòng thi"}</span>
                      </Link>
                    ) : (
                      <div className="text-xs text-center text-slate-400 py-1 font-medium">
                        {asg.attempts_count >= asg.max_attempts
                          ? "Đã hết số lượt làm bài"
                          : "Chưa mở hoặc đã kết thúc"}
                      </div>
                    )}

                    {/* View results button if finalized */}
                    {hasFinalized && finalizedAttempt && (
                      <Link
                        href={`/student/results/${finalizedAttempt.id}`}
                        className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
                      >
                        <Award className="h-4 w-4 text-emerald-600" />
                        <span>Xem kết quả & Đánh giá 3 Gốc ({finalizedAttempt.final_score} pts)</span>
                      </Link>
                    )}

                    {latestAttempt && latestAttempt.status !== "finalized" && latestAttempt.status !== "in_progress" && (
                      <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs text-center font-medium">
                        Bài làm đã nộp • Đang chờ giáo viên duyệt & công bố điểm
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Tham gia lớp học</h2>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {enrollError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{enrollError}</span>
              </div>
            )}

            <form onSubmit={handleEnroll} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mã lớp học (Code)</label>
                <input
                  type="text"
                  required
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  placeholder="Nhập mã ví dụ: 4A7B9C"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase tracking-widest font-mono text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-400 mt-1.5 text-center">
                  Nhận mã mời trực tiếp từ giáo viên phụ trách lớp học của bạn
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={enrolling}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                >
                  {enrolling && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Tham gia</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
