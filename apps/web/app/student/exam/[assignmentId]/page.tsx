"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Loader2, 
  Check, 
  HelpCircle,
  Award,
  ArrowRight,
  BookOpen
} from "lucide-react";
import { apiFetch } from "../../../../lib/api";

interface QuestionOption {
  id: string;
  content: string;
}

interface QuestionData {
  exam_question_id: string;
  order_index: number;
  points: number;
  type: "single_choice" | "multiple_select" | "essay";
  content: string;
  options?: QuestionOption[];
}

interface AnswerRead {
  exam_question_id: string;
  selected_option_ids: string[];
  text_response: string;
  client_version: number;
}

interface StartAttemptData {
  attempt_id: string;
  exam_title: string;
  duration_minutes: number;
  max_allowed_submit_at: string;
  questions: QuestionData[];
  answers: AnswerRead[];
}

interface SubmitAttemptData {
  objective_score: number | string;
  status: string;
}

// Pseudo-random number generator seeded with a string (FNV-1a hash + Mulberry32)
function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    let t = (h += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic shuffle using Fisher-Yates algorithm seeded per attempt & question
function shuffleOptions<T>(options: T[], seedStr: string): T[] {
  if (options.length <= 1) return options;
  const result = [...options];
  const rand = createSeededRandom(seedStr);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  // Guarantee that if the shuffle produced the original sequence, rotate by 1
  const isIdentical = result.every((item, idx) => item === options[idx]);
  if (isIdentical && result.length > 1) {
    const first = result.shift()!;
    result.push(first);
  }
  return result;
}

export default function ExamTakingPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params?.assignmentId as string;

  const [attempt, setAttempt] = useState<StartAttemptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Answers state: mapped by exam_question_id
  const [answers, setAnswers] = useState<{
    [qId: string]: {
      selected_option_ids: string[];
      text_response: string;
      version: number;
    };
  }>({});

  // Autosave status: mapped by exam_question_id: "saved" | "saving" | "error"
  const [saveStatus, setSaveStatus] = useState<{ [qId: string]: "saved" | "saving" | "error" }>({});

  // Countdown timer
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    objective_score: number;
    status: string;
  } | null>(null);

  // Initialize and start attempt
  useEffect(() => {
    let mounted = true;
    const startExam = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch<StartAttemptData>(
          `/student/assignments/${assignmentId}/start`,
          { method: "POST" }
        );

        if (!mounted) return;

        // Shuffle options for multiple-choice questions (deterministic per student attempt and question)
        const shuffledQuestions = (data.questions || []).map((q) => {
          if (q.options && q.options.length > 1 && q.type !== "essay") {
            const seed = `${data.attempt_id || assignmentId}_${q.exam_question_id}`;
            return {
              ...q,
              options: shuffleOptions(q.options, seed),
            };
          }
          return q;
        });

        const formattedAttempt: StartAttemptData = {
          ...data,
          questions: shuffledQuestions,
        };

        setAttempt(formattedAttempt);

        // Pre-fill answers — map existing answers by question id
        const answersByQid: Record<string, AnswerRead> = {};
        (data.answers || []).forEach((a) => {
          answersByQid[a.exam_question_id] = a;
        });

        const initialAnswers: any = {};
        const initialStatus: any = {};
        formattedAttempt.questions.forEach((q) => {
          const existing = answersByQid[q.exam_question_id];
          initialAnswers[q.exam_question_id] = {
            selected_option_ids: existing?.selected_option_ids || [],
            text_response: existing?.text_response || "",
            version: existing?.client_version ?? 1,
          };
          initialStatus[q.exam_question_id] = "saved";
        });
        setAnswers(initialAnswers);
        setSaveStatus(initialStatus);

        // Compute remaining seconds
        const deadline = new Date(data.max_allowed_submit_at).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((deadline - now) / 1000));
        setSecondsRemaining(diff);
      } catch (err: any) {
        if (mounted) setError(err.message || "Không thể bắt đầu làm bài thi");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (assignmentId) {
      startExam();
    }

    return () => {
      mounted = false;
    };
  }, [assignmentId]);

  // Countdown Interval
  useEffect(() => {
    if (secondsRemaining === null || submitResult) return;

    if (secondsRemaining <= 0) {
      // Auto-submit when time expires
      handleSubmitExam();
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, submitResult]);

  // Autosave API helper
  const saveAnswerToServer = async (
    qId: string,
    selectedIds: string[],
    textResp: string,
    ver: number
  ) => {
    if (!attempt) return;
    setSaveStatus((prev) => ({ ...prev, [qId]: "saving" }));

    try {
      await apiFetch(`/student/attempts/${attempt.attempt_id}/answers`, {
        method: "PUT",
        body: JSON.stringify({
          exam_question_id: qId,
          selected_option_ids: selectedIds,
          text_response: textResp,
          client_version: ver,
        }),
      });
      setSaveStatus((prev) => ({ ...prev, [qId]: "saved" }));
    } catch (err) {
      console.error("Lỗi khi lưu đáp án:", err);
      setSaveStatus((prev) => ({ ...prev, [qId]: "error" }));
    }
  };

  // Debounced auto-save for essay text
  const typingTimeouts = useRef<{ [qId: string]: NodeJS.Timeout }>({});

  const handleSelectOption = (qId: string, optId: string, isSingleChoice: boolean) => {
    const cur = answers[qId] || { selected_option_ids: [], text_response: "", version: 1 };
    let newSelected: string[] = [];

    if (isSingleChoice) {
      newSelected = [optId];
    } else {
      if (cur.selected_option_ids.includes(optId)) {
        newSelected = cur.selected_option_ids.filter((id) => id !== optId);
      } else {
        newSelected = [...cur.selected_option_ids, optId];
      }
    }

    const nextVer = cur.version + 1;
    const updated = {
      ...cur,
      selected_option_ids: newSelected,
      version: nextVer,
    };

    setAnswers((prev) => ({ ...prev, [qId]: updated }));
    saveAnswerToServer(qId, newSelected, cur.text_response, nextVer);
  };

  const handleEssayChange = (qId: string, text: string) => {
    const cur = answers[qId] || { selected_option_ids: [], text_response: "", version: 1 };
    const nextVer = cur.version + 1;
    const updated = {
      ...cur,
      text_response: text,
      version: nextVer,
    };
    setAnswers((prev) => ({ ...prev, [qId]: updated }));
    setSaveStatus((prev) => ({ ...prev, [qId]: "saving" }));

    if (typingTimeouts.current[qId]) {
      clearTimeout(typingTimeouts.current[qId]);
    }

    typingTimeouts.current[qId] = setTimeout(() => {
      saveAnswerToServer(qId, cur.selected_option_ids, text, nextVer);
    }, 800);
  };

  const handleSubmitExam = async () => {
    if (!attempt || isSubmitting) return;

    if (!confirm("Bạn có chắc chắn muốn nộp bài thi ngay bây giờ? Sau khi nộp bạn sẽ không thể sửa đổi câu trả lời.")) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch<SubmitAttemptData>(`/student/attempts/${attempt.attempt_id}/submit`, {
        method: "POST",
      });
      const objectiveScore = Number(res.objective_score);
      if (!Number.isFinite(objectiveScore)) {
        throw new Error("Máy chủ trả về điểm trắc nghiệm không hợp lệ");
      }
      setSubmitResult({
        objective_score: objectiveScore,
        status: res.status,
      });
    } catch (err: any) {
      alert("Lỗi khi nộp bài: " + err.message);
      setIsSubmitting(false);
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Đang chuẩn bị phòng thi an toàn...</p>
        </div>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Không thể tham gia bài thi</h2>
          <p className="text-sm text-slate-600 mb-6">{error || "Kỳ thi không khả dụng hoặc đã hết thời gian."}</p>
          <Link
            href="/student/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
          >
            Quay lại Không gian học tập
          </Link>
        </div>
      </div>
    );
  }

  // Submitted Screen
  if (submitResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-lg w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-lg text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">Nộp bài thi thành công!</h1>
            <p className="text-sm text-slate-500 mt-1">Bài làm của bạn đã được hệ thống ghi nhận an toàn</p>
          </div>

          {/* Instant Objective Score Card */}
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Điểm trắc nghiệm khách quan tức thì:
            </p>
            <p className="text-4xl font-extrabold text-indigo-600">
              {submitResult.objective_score.toFixed(2)} pts
            </p>
            <p className="text-xs text-slate-500">
              * Phần câu hỏi tự luận đang được AI Agent 3 Gốc phân tích và gửi đến giáo viên thẩm định, chốt điểm chính thức.
            </p>
          </div>

          <Link
            href="/student/dashboard"
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
          >
            <span>Về Không gian Học viên</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Sticky Exam Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-2xs">
        <div>
          <span className="text-2xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            Phòng thi trực tuyến
          </span>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">{attempt.exam_title}</h2>
        </div>

        {/* Center Countdown Timer */}
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-base font-black shadow-inner border ${
            (secondsRemaining || 0) < 300
              ? "bg-rose-50 border-rose-300 text-rose-600 animate-pulse"
              : "bg-slate-900 border-slate-800 text-emerald-400"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>{secondsRemaining !== null ? formatTimer(secondsRemaining) : "--:--"}</span>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmitExam}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span>Nộp bài</span>
        </button>
      </header>

      {/* Questions Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {attempt.questions.map((q, idx) => {
          const ans = answers[q.exam_question_id] || { selected_option_ids: [], text_response: "" };
          const status = saveStatus[q.exam_question_id] || "saved";

          return (
            <div
              key={q.exam_question_id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-extrabold text-sm flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {q.type === "essay" ? "Tự luận" : q.type === "multiple_select" ? "Nhiều đáp án" : "1 đáp án"}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">({q.points} điểm)</span>
                </div>

                {/* Save status indicator */}
                <div className="text-2xs font-medium flex items-center gap-1">
                  {status === "saving" && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu...
                    </span>
                  )}
                  {status === "saved" && (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Đã lưu
                    </span>
                  )}
                  {status === "error" && (
                    <span className="text-rose-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Lỗi lưu
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <p className="text-base font-medium text-slate-900 leading-relaxed">
                {q.content}
              </p>

              {/* MCQ Options */}
              {q.options && q.options.length > 0 && (
                <div className="space-y-2 pt-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = ans.selected_option_ids.includes(opt.id);
                    const isSingle = q.type === "single_choice";
                    const optionLetter = String.fromCharCode(65 + optIdx);
                    const cleanContent = opt.content.replace(/^[A-Da-d][\.\)]\s+/, "");

                    return (
                      <label
                        key={opt.id}
                        className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition select-none ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type={isSingle ? "radio" : "checkbox"}
                          name={`q_${q.exam_question_id}`}
                          checked={isSelected}
                          onChange={() => handleSelectOption(q.exam_question_id, opt.id, isSingle)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 border transition ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {optionLetter}
                        </span>
                        <span className="text-sm">{cleanContent}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Essay textarea */}
              {q.type === "essay" && (
                <div className="space-y-2 pt-2">
                  <textarea
                    rows={6}
                    value={ans.text_response}
                    onChange={(e) => handleEssayChange(q.exam_question_id, e.target.value)}
                    placeholder="Nhập nội dung bài làm tự luận của bạn tại đây..."
                    className="w-full p-4 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                  />
                  <div className="flex items-center justify-between text-2xs text-slate-400">
                    <span>* Hệ thống tự động lưu sau mỗi lần gõ</span>
                    <span>{ans.text_response.length} ký tự</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom submit banner */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-slate-900">Hoàn thành bài thi?</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Kiểm tra lại tất cả các câu trả lời trước khi gửi bài làm chính thức.
            </p>
          </div>
          <button
            onClick={handleSubmitExam}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Nộp bài thi</span>
          </button>
        </div>
      </main>
    </div>
  );
}
