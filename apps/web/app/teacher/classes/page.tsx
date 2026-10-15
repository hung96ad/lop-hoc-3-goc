"use client";

import { useEffect, useState } from "react";
import { School, Plus, Copy, Check, Users, Loader2, AlertCircle, X } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface ClassItem {
  id: string;
  name: string;
  code: string;
  teacher_id: string;
  created_at: string;
  student_count: number;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<ClassItem[]>("/classes");
      setClasses(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await apiFetch("/classes", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      setShowModal(false);
      setName("");
      loadClasses();
    } catch (err: any) {
      setError(err.message || "Tạo lớp học thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Lớp học</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tạo lớp học và chia sẻ mã lớp để học viên tham gia kỳ thi
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo lớp học mới</span>
        </button>
      </div>

      {/* Class List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
          <p className="text-sm">Đang tải danh sách lớp học...</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <School className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700">Chưa có lớp học nào</p>
          <p className="text-sm text-slate-500 mt-1">
            Nhấn "Tạo lớp học mới" để tạo lớp và nhận mã mời học viên tham gia.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:border-blue-300 transition flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                  <School className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{cls.name}</h3>

                {/* Class Code Box */}
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 block">Mã tham gia lớp:</span>
                    <span className="text-base font-mono font-bold text-blue-700 tracking-wider">
                      {cls.code}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(cls.code)}
                    title="Sao chép mã lớp"
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition"
                  >
                    {copiedCode === cls.code ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span>{cls.student_count} học viên đã tham gia</span>
                </span>
                <span>Ngày tạo: {new Date(cls.created_at).toLocaleDateString("vi-VN")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Class Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900">Tạo lớp học mới</h2>
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

            <form onSubmit={handleCreateClass} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên lớp học</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Lớp 12A1 - Chuyên đề Đạo Đức"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

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
                  <span>Tạo lớp</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
