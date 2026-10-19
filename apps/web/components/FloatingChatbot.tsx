"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";

export default function FloatingChatbot() {
  const pathname = usePathname();

  // Hide when already on the chatbot page
  if (pathname === "/chatbot") return null;

  return (
    <aside aria-label="Khảo thí AI" className="fixed bottom-6 right-6 z-50">
      <Link
        href="/chatbot"
        className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
        </span>
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <span className="text-xs sm:text-sm font-bold tracking-tight">Chatbot Làm Bài</span>
        <span className="text-[10px] bg-amber-400 text-indigo-950 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide">
          AI
        </span>
      </Link>
    </aside>
  );
}
