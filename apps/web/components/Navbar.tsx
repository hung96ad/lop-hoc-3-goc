"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrainCircuit, LogOut, User, BookOpen, GraduationCap, LayoutDashboard, FileQuestion, Library, School, Bot } from "lucide-react";
import { getSavedAuth, clearAuth, AuthTokens } from "../lib/api";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthTokens | null>(null);

  useEffect(() => {
    setAuth(getSavedAuth());
  }, [pathname]);

  const handleLogout = () => {
    clearAuth();
    setAuth(null);
    router.push("/login");
  };

  const isTeacher = auth?.role === "teacher";
  const isStudent = auth?.role === "student";

  return (
    <header className="px-6 h-16 border-b flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-700 hover:opacity-90 transition">
          <BrainCircuit className="h-6 w-6 text-blue-600" />
          <span>EduAI 3G</span>
        </Link>

        {/* Role Specific Nav */}
        {isTeacher && (
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/teacher/dashboard"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                pathname === "/teacher/dashboard"
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Tổng quan
            </Link>
            <Link
              href="/teacher/questions"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                pathname.startsWith("/teacher/questions")
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
              }`}
            >
              <FileQuestion className="h-4 w-4" />
              Ngân hàng câu hỏi
            </Link>
            <Link
              href="/teacher/exams"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                pathname.startsWith("/teacher/exams")
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
              }`}
            >
              <Library className="h-4 w-4" />
              Quản lý đề thi
            </Link>
            <Link
              href="/teacher/classes"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                pathname.startsWith("/teacher/classes")
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
              }`}
            >
              <School className="h-4 w-4" />
              Lớp học
            </Link>
          </nav>
        )}

        {isStudent && (
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/student/dashboard"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                pathname.startsWith("/student")
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-slate-50"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Phòng thi & Lớp học
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/chatbot"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 border border-indigo-200 hover:from-indigo-100 hover:to-blue-100 transition shadow-2xs"
        >
          <Bot className="h-4 w-4 text-indigo-600" />
          <span className="hidden sm:inline">Chatbot Khảo Thí</span>
          <span className="sm:hidden">Chatbot</span>
          <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">AI</span>
        </Link>

        {auth ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <User className="h-4 w-4 text-slate-500" />
              <span className="font-medium text-slate-800">{auth.full_name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  auth.role === "teacher"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {auth.role === "teacher" ? "Giáo viên" : "Học viên"}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
            >
              Đăng ký
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
