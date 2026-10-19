"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function GuestEntryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/chatbot");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm">Đang chuyển đến Chatbot Khảo Thí...</p>
      </div>
    </div>
  );
}
