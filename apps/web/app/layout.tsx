import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduAI - Nền tảng thi trực tuyến tích hợp AI Agent 3 Gốc 3 Độc",
  description: "Teacher & Student Examination Platform with Vietnamese AI Assessment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
