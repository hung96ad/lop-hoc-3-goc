"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, ShieldCheck, CheckCircle2, Bot, Sparkles } from "lucide-react";
import Navbar from "../components/Navbar";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">
          <ShieldCheck className="h-4 w-4" />
          <span>Phiên bản v1.0 • Tích hợp AI Agent Đánh Giá 3 Gốc - 3 Độc</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl">
          Nền tảng thi trực tuyến thông minh dành cho{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-orange-500">
            Giáo viên & Học viên
          </span>
        </h1>

        <p className="mt-6 text-lg text-slate-600 max-w-2xl">
          Quản lý ngân hàng câu hỏi, tạo đề thi linh hoạt, tự động chấm trắc nghiệm và sử dụng AI Agent 
          tiếng Việt phân tích bài tự luận theo triết lý 3 Gốc (Đạo đức - Trí tuệ - Nghị lực) và 3 Độc (Tham - Sân - Si).
        </p>

        {/* Chatbot CTA Banner */}
        <div className="mt-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 text-white shadow-lg w-full max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-6 text-left">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              <span>DÀNH CHO HỌC VIÊN • KHÔNG CẦN ĐĂNG NHẬP</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">Chatbot Khảo Thí 3 Gốc</h2>
            <p className="text-sm text-indigo-100 max-w-md">
              Chỉ cần điền tên, số điện thoại và chọn lớp học (không cần mã) là có thể tương tác trực tiếp qua khung chat để làm bài. Sau khi nộp bài, AI sẽ tự động chấm điểm và đánh giá ngay lập tức!
            </p>
          </div>
          <Link
            href="/chatbot"
            className="px-6 py-3.5 rounded-xl bg-white text-indigo-700 font-bold hover:bg-indigo-50 shadow-md hover:shadow-lg transition flex items-center gap-2 shrink-0 text-sm"
          >
            <Bot className="h-5 w-5 text-indigo-600" />
            <span>Mở Chatbot Làm Bài &rarr;</span>
          </Link>
        </div>

        {/* Portals CTA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mt-12">
          {/* Teacher Portal Card */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition text-left flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Teacher Portal</h2>
              <p className="text-sm text-slate-500 mt-2">
                Dành cho giáo viên: Soạn thảo câu hỏi, thiết lập rubric tự luận, xuất bản đề, theo dõi thi cử và duyệt đề xuất từ AI.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Ngân hàng câu hỏi MCQ & Tự luận
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Bảng so sánh điểm AI đề xuất vs Giáo viên
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Lịch sử kiểm toán điểm (Audit Log)
                </li>
              </ul>
            </div>
            <Link
              href="/teacher/dashboard"
              className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
            >
              Vào Không Gian Giáo Viên &rarr;
            </Link>
          </div>

          {/* Student Portal Card */}
          <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition text-left flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Student Portal</h2>
              <p className="text-sm text-slate-500 mt-2">
                Dành cho học sinh: Nhận đề thi, phòng thi tập trung có bộ đếm giờ chuẩn backend, tự động lưu đáp án và xem phản hồi 3 Gốc.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Phòng thi đếm ngược & Autosave an toàn
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Chấm trắc nghiệm khách quan tức thì
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nhận định 3 Gốc và mục tiêu rèn luyện
                </li>
              </ul>
            </div>
            <Link
              href="/student/dashboard"
              className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              Vào Không Gian Học Viên &rarr;
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-slate-500 bg-white">
        © 2026 EduAI Exam Platform • Kiến trúc chuẩn Modular Monolith & Micro-Agent Workflow
      </footer>
    </div>
  );
}
