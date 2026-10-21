"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { 
  Bot, 
  Send, 
  User, 
  CheckCircle2, 
  Clock, 
  Award, 
  School, 
  BookOpen, 
  Sparkles, 
  RefreshCw, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  AlertCircle,
  HelpCircle,
  GraduationCap,
  Heart,
  Lightbulb,
  ShieldAlert,
  Compass
} from "lucide-react";
import { apiFetch, saveAuth, getSavedAuth, clearAuth, AuthTokens, UserProfile } from "../../lib/api";
import { validateEssayAnswer } from "../../lib/essayValidator";
import { validateVietnamesePhoneNumber } from "../../lib/phoneValidator";

interface PublicClass {
  id: string;
  name: string;
  code: string;
}

interface QuestionOption {
  id: string;
  content: string;
}

interface QuestionItem {
  exam_question_id: string;
  order_index: number;
  points: number;
  type: "single_choice" | "multiple_select" | "essay" | string;
  content: string;
  options?: QuestionOption[];
}

interface StartAttemptData {
  attempt_id: string;
  exam_assignment_id: string;
  duration_minutes: number;
  exam_title: string;
  max_allowed_submit_at: string;
  questions: QuestionItem[];
}

interface StudentResultData {
  attempt_id: string;
  exam_title: string;
  is_published: boolean;
  status: string;
  objective_score: number | null;
  essay_score: number | null;
  final_score: number | null;
  teacher_feedback: string | null;
  ai_essay_score: number | null;
  ai_feedback?: {
    three_roots?: {
      dao_duc?: { score?: number; evidence?: string; direct_quotes?: string[] };
      tri_tue?: { score?: number; evidence?: string; direct_quotes?: string[] };
      nghi_luc?: { score?: number; evidence?: string; direct_quotes?: string[] };
    };
    three_poisons?: {
      tham?: { detected?: boolean; manifestation?: string } | string;
      san?: { detected?: boolean; manifestation?: string } | string;
      si?: { detected?: boolean; manifestation?: string } | string;
      points_deducted?: number;
      tham_deduction?: number;
      san_deduction?: number;
      si_deduction?: number;
    } | any;
    overall_reflection?: string;
    transformative_advice?: string;
    practical_action_plan?: string[];
  } | null;
}

type ChatStep = 
  | "GREETING_NAME"
  | "ASK_PHONE"
  | "SELECT_CLASS"
  | "READY_CONFIRM"
  | "EXAM_IN_PROGRESS"
  | "CONFIRM_SUBMIT"
  | "GRADING"
  | "SHOW_RESULTS";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text?: string;
  timestamp: string;
  type?: "text" | "class_picker" | "ready_card" | "question_card" | "confirm_submit" | "grading_loader" | "result_card";
  questionIndex?: number;
  resultData?: StudentResultData;
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [currentStep, setCurrentStep] = useState<ChatStep>("GREETING_NAME");
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState("");

  // Student Info
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [publicClasses, setPublicClasses] = useState<PublicClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<PublicClass | null>(null);

  // Exam Data
  const [attempt, setAttempt] = useState<StartAttemptData | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<{
    [qId: string]: {
      selected_option_ids: string[];
      text_response: string;
      version: number;
    };
  }>({});
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [result, setResult] = useState<StudentResultData | null>(null);

  // Timer
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStep, currentQuestionIdx]);

  // Initial authentication check & greeting
  useEffect(() => {
    const saved = getSavedAuth();
    const isGuest = !saved || !saved.email || saved.email.endsWith("@guest.local");

    if (saved && !isGuest && saved.access_token) {
      // User is logged in: skip asking name and phone!
      setIsLoggedIn(true);
      setUserRole(saved.role || "");
      const name = saved.full_name || "Bạn";
      setFullName(name);
      setPhone(saved.phone || "");
      setCurrentStep("SELECT_CLASS");

      const greetingMsg: ChatMessage = {
        id: "greet-user",
        sender: "bot",
        text: `Xin chào **${name}**! Mình là AI Trợ Lý Khảo Thí 3 Gốc 🤖.\n\nHệ thống nhận diện bạn đã đăng nhập tài khoản. Bạn **không cần nhập lại họ tên hay số điện thoại**.\n\nDưới đây là danh sách các lớp học đang mở bài thi. Bạn hãy chọn lớp để bắt đầu làm bài nhé:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "class_picker"
      };
      setMessages([greetingMsg]);

      // Verify token and fetch profile
      apiFetch<UserProfile>("/auth/me")
        .then((profile) => {
          if (profile?.full_name) {
            setFullName(profile.full_name);
          }
          if (profile?.phone) {
            setPhone(profile.phone);
          }
        })
        .catch(() => {
          // Token expired or invalid
          clearAuth();
          setIsLoggedIn(false);
          setCurrentStep("GREETING_NAME");
          setMessages([
            {
              id: "greet-expired",
              sender: "bot",
              text: "Phiên đăng nhập đã hết hạn. Bạn có thể tham gia làm bài trực tiếp mà không cần đăng nhập.\n\nĐể bắt đầu, bạn hãy nhập Họ và tên của mình nhé:",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: "text"
            }
          ]);
        });
    } else {
      // User is NOT logged in: ask for name & phone
      if (saved && isGuest) {
        clearAuth();
      }
      setIsLoggedIn(false);
      setCurrentStep("GREETING_NAME");
      const greetingMsg: ChatMessage = {
        id: "greet-1",
        sender: "bot",
        text: "Xin chào bạn! Mình là AI Trợ Lý Khảo Thí 3 Gốc 🤖.\n\nBạn có thể tham gia làm bài khảo sát/thi trực tiếp ngay tại đây mà không cần đăng nhập hay nhớ tài khoản. Sau khi nộp bài, AI sẽ chấm điểm và phân tích 3 Gốc ngay lập tức!\n\nĐể bắt đầu, bạn hãy nhập Họ và tên của mình nhé:",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      };
      setMessages([greetingMsg]);
    }

    // Load available public classes
    apiFetch<PublicClass[]>("/classes/public")
      .then((data) => setPublicClasses(data || []))
      .catch((err) => console.error("Could not fetch classes", err));
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!attempt?.max_allowed_submit_at || currentStep === "SHOW_RESULTS" || currentStep === "GRADING") return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(attempt.max_allowed_submit_at).getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        handleAutoSubmitOnTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [attempt, currentStep]);

  const addMessage = (sender: "bot" | "user", text?: string, type: ChatMessage["type"] = "text", extra?: Partial<ChatMessage>) => {
    const newMsg: ChatMessage = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      ...extra
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  // Handle Text Submission from Chat Input
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Step 1: Input Name
    if (currentStep === "GREETING_NAME") {
      addMessage("user", trimmed);
      setFullName(trimmed);
      setInputText("");
      setCurrentStep("ASK_PHONE");

      setTimeout(() => {
        addMessage(
          "bot",
          `Rất vui được gặp bạn, ${trimmed}! 🎉\n\nTiếp theo, bạn vui lòng nhập **Số điện thoại di động (10 số)** của bạn để hệ thống ghi nhận thông tin làm bài (VD: 0987654321):`
        );
      }, 500);
      return;
    }

    // Step 2: Input Phone
    if (currentStep === "ASK_PHONE") {
      const phoneValidation = validateVietnamesePhoneNumber(trimmed);
      if (!phoneValidation.isValid) {
        addMessage("user", trimmed);
        setInputText("");
        setTimeout(() => {
          addMessage(
            "bot",
            `⚠️ **Số điện thoại chưa hợp lệ:** ${phoneValidation.reason}\n\n👉 Bạn vui lòng kiểm tra và nhập lại **Số điện thoại di động 10 số của Việt Nam** (bắt đầu bằng 03, 05, 07, 08 hoặc 09, ví dụ: 0912345678, 0987654321) nhé!`
          );
        }, 300);
        return;
      }

      const validPhone = phoneValidation.normalizedPhone || trimmed;
      addMessage("user", trimmed);
      setPhone(validPhone);
      setInputText("");
      setCurrentStep("SELECT_CLASS");

      setTimeout(() => {
        addMessage(
          "bot",
          "Cảm ơn bạn! Dưới đây là danh sách các lớp học đang mở bài thi. Bạn chỉ cần chọn lớp học của mình (không cần nhập mã lớp):",
          "class_picker"
        );
      }, 500);
      return;
    }

    // Step: Essay Question in exam
    if (currentStep === "EXAM_IN_PROGRESS" && attempt) {
      const q = attempt.questions[currentQuestionIdx];
      if (q.type === "essay") {
        addMessage("user", trimmed);
        setInputText("");

        const essayValidation = validateEssayAnswer(trimmed);
        if (!essayValidation.isValid) {
          setTimeout(() => {
            addMessage(
              "bot",
              `⚠️ **Câu trả lời tự luận chưa hợp lệ:** ${essayValidation.reason}.\n\n👉 Để rèn luyện phẩm chất và tư duy 3 Gốc, bạn hãy dành chút thời gian suy ngẫm và **nhập lại câu trả lời đầy đủ, nghiêm túc** cho Câu ${currentQuestionIdx + 1} nhé! ✍️`
            );
          }, 400);
          return;
        }

        // Save essay answer
        await saveAnswerData(q.exam_question_id, [], trimmed);

        setTimeout(() => {
          addMessage("bot", `✓ Đã lưu câu trả lời tự luận của bạn cho Câu ${currentQuestionIdx + 1}.`);
          if (currentQuestionIdx < attempt.questions.length - 1) {
            handleGoToQuestion(currentQuestionIdx + 1);
          } else {
            promptConfirmSubmit();
          }
        }, 400);
        return;
      }
    }

    // General chat fallback
    addMessage("user", trimmed);
    setInputText("");
    setTimeout(() => {
      addMessage("bot", "Bạn hãy chọn các tương tác trực tiếp trên bài thi hoặc nhập câu trả lời tương ứng nhé!");
    }, 400);
  };

  // Step: Student selects Class
  const handleSelectClass = async (cls: PublicClass) => {
    setSelectedClass(cls);
    addMessage("user", `Tôi chọn lớp: ${cls.name}`);

    try {
      addMessage("bot", `Đang ghi danh bạn vào lớp "${cls.name}" và chuẩn bị bài thi...`);
      
      let assignmentId = "";

      if (isLoggedIn) {
        // Logged-in student: Enter class exam directly with account
        const enterRes = await apiFetch<{ assignment_id: string; class_id: string; class_name: string; exam_title: string }>(
          `/student/classes/${cls.id}/enter`,
          { method: "POST" }
        );
        assignmentId = enterRes.assignment_id;
      } else {
        // Guest: Call guest-entry API
        const guestRes = await apiFetch<AuthTokens & { assignment_id: string }>("/auth/guest-entry", {
          method: "POST",
          body: JSON.stringify({
            full_name: fullName,
            phone: phone,
            class_id: cls.id,
          }),
        });

        // Save auth tokens
        saveAuth(guestRes);
        assignmentId = guestRes.assignment_id;
      }

      // Start attempt
      const attemptRes = await apiFetch<StartAttemptData>(
        `/student/assignments/${assignmentId}/start`,
        { method: "POST" }
      );

      setAttempt(attemptRes);
      setCurrentStep("READY_CONFIRM");

      setTimeout(() => {
        addMessage(
          "bot",
          `Tuyệt vời! Bạn đã được ghi danh thành công vào lớp "${cls.name}".\n\n📋 Thông tin bài thi:\n• Tên bài thi: ${attemptRes.exam_title}\n• Thời gian làm bài: ${attemptRes.duration_minutes} phút\n• Tổng số câu hỏi: ${attemptRes.questions.length} câu\n\nBạn có thể trả lời trắc nghiệm bằng cách bấm nút hoặc gõ tự luận trực tiếp trong khung chat. Khi đã sẵn sàng, hãy nhấn nút bên dưới!`,
          "ready_card"
        );
      }, 500);

    } catch (err: any) {
      addMessage("bot", `⚠️ Không thể vào bài thi: ${err.message || "Vui lòng thử lại sau"}`);
    }
  };

  // Step 4: Start Exam
  const handleStartExam = () => {
    if (!attempt || !attempt.questions.length) return;
    setCurrentStep("EXAM_IN_PROGRESS");
    setCurrentQuestionIdx(0);

    addMessage("user", "🚀 Tôi đã sẵn sàng, bắt đầu làm bài!");
    setTimeout(() => {
      showQuestionInChat(0);
    }, 400);
  };

  // Show a question in chat
  const showQuestionInChat = (index: number) => {
    if (!attempt) return;
    const q = attempt.questions[index];
    const typeLabel = q.type === "essay" ? "Tự luận" : q.type === "multiple_select" ? "Chọn nhiều đáp án" : "Trắc nghiệm 1 đáp án";
    
    addMessage(
      "bot",
      `📝 Câu hỏi ${index + 1}/${attempt.questions.length} [${typeLabel} - ${q.points} điểm]:\n\n${q.content}`,
      "question_card",
      { questionIndex: index }
    );
  };

  // Save answer to API
  const saveAnswerData = async (exam_question_id: string, selected_option_ids: string[], text_response: string) => {
    if (!attempt) return;
    setSavingAnswer(true);

    const prevVer = answers[exam_question_id]?.version || 0;
    const newVer = prevVer + 1;

    setAnswers((prev) => ({
      ...prev,
      [exam_question_id]: {
        selected_option_ids,
        text_response,
        version: newVer
      }
    }));

    try {
      await apiFetch(`/student/attempts/${attempt.attempt_id}/answers`, {
        method: "PUT",
        body: JSON.stringify({
          exam_question_id,
          selected_option_ids,
          text_response,
          client_version: newVer
        })
      });
    } catch (err) {
      console.error("Save answer error:", err);
    } finally {
      setSavingAnswer(false);
    }
  };

  // Click option for single_choice
  const handleSelectSingleOption = async (q: QuestionItem, optionId: string) => {
    const selectedOpt = q.options?.find((o) => o.id === optionId);
    await saveAnswerData(q.exam_question_id, [optionId], "");

    addMessage("user", `Đã chọn: ${selectedOpt?.content || optionId}`);

    setTimeout(() => {
      if (currentQuestionIdx < (attempt?.questions.length || 0) - 1) {
        handleGoToQuestion(currentQuestionIdx + 1);
      } else {
        promptConfirmSubmit();
      }
    }, 400);
  };

  // Toggle option for multiple_select
  const handleToggleMultipleOption = (q: QuestionItem, optionId: string) => {
    const currentSelected = answers[q.exam_question_id]?.selected_option_ids || [];
    let updated: string[];
    if (currentSelected.includes(optionId)) {
      updated = currentSelected.filter((id) => id !== optionId);
    } else {
      updated = [...currentSelected, optionId];
    }

    setAnswers((prev) => ({
      ...prev,
      [q.exam_question_id]: {
        selected_option_ids: updated,
        text_response: "",
        version: (prev[q.exam_question_id]?.version || 0) + 1
      }
    }));
  };

  // Confirm multiple_select answer
  const handleConfirmMultipleSelect = async (q: QuestionItem) => {
    const selected = answers[q.exam_question_id]?.selected_option_ids || [];
    await saveAnswerData(q.exam_question_id, selected, "");

    const labels = q.options
      ?.filter((o) => selected.includes(o.id))
      .map((o) => o.content)
      .join(", ") || "Không chọn";

    addMessage("user", `Đã chọn (${selected.length} đáp án): ${labels}`);

    setTimeout(() => {
      if (currentQuestionIdx < (attempt?.questions.length || 0) - 1) {
        handleGoToQuestion(currentQuestionIdx + 1);
      } else {
        promptConfirmSubmit();
      }
    }, 400);
  };

  // Navigate to Question
  const handleGoToQuestion = (targetIdx: number) => {
    if (!attempt || targetIdx < 0 || targetIdx >= attempt.questions.length) return;
    setCurrentQuestionIdx(targetIdx);
    showQuestionInChat(targetIdx);
  };

  // Prompt confirmation to submit
  const promptConfirmSubmit = () => {
    if (!attempt) return;
    setCurrentStep("CONFIRM_SUBMIT");
    
    // Count answered
    const answeredCount = attempt.questions.filter((q) => {
      const a = answers[q.exam_question_id];
      if (!a) return false;
      return a.selected_option_ids.length > 0 || (a.text_response && a.text_response.trim().length > 0);
    }).length;

    addMessage(
      "bot",
      `Bạn đã trả lời ${answeredCount} / ${attempt.questions.length} câu hỏi.\n\nBạn có muốn nộp bài ngay bây giờ để AI Agent chấm điểm và nhận xét 3 Gốc không?`,
      "confirm_submit"
    );
  };

  // Auto submit on timer expired
  const handleAutoSubmitOnTimeout = () => {
    addMessage("bot", "⏰ Hết giờ làm bài! Hệ thống đang tự động thu bài và chuyển cho AI chấm điểm...");
    handleSubmitExam();
  };

  // Submit Exam & Poll AI Results
  const handleSubmitExam = async () => {
    if (!attempt) return;

    // Validate all essay questions before submitting
    for (let idx = 0; idx < attempt.questions.length; idx++) {
      const q = attempt.questions[idx];
      if (q.type === "essay") {
        const text = answers[q.exam_question_id]?.text_response || "";
        const val = validateEssayAnswer(text);
        if (!val.isValid) {
          setCurrentStep("EXAM_IN_PROGRESS");
          setCurrentQuestionIdx(idx);
          addMessage(
            "bot",
            `⚠️ Không thể nộp bài vì Câu ${idx + 1} (Tự luận) chưa có câu trả lời hợp lệ:\n"${val.reason}".\n\n👉 Bạn vui lòng **nhập lại câu trả lời đầy đủ, nghiêm túc** cho Câu ${idx + 1} trước khi nộp bài nhé! ✍️`,
            "question_card",
            { questionIndex: idx }
          );
          return;
        }
      }
    }

    setCurrentStep("GRADING");

    addMessage("user", "✅ Nộp bài thi");
    addMessage(
      "bot",
      "Đang nộp bài thi của bạn...\n🤖 AI Agent đang phân tích bài làm và chấm điểm theo triết lý 3 Gốc (Đạo đức - Trí tuệ - Nghị lực) và 3 Độc (Tham - Sân - Si)...\nVui lòng đợi vài giây nhé!",
      "grading_loader"
    );

    try {
      await apiFetch(`/student/attempts/${attempt.attempt_id}/submit`, {
        method: "POST"
      });

      // Poll for AI results (up to 15 seconds)
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const res = await apiFetch<StudentResultData>(`/student/attempts/${attempt.attempt_id}/results`);
          if (res && res.is_published) {
            clearInterval(pollInterval);
            setResult(res);
            setCurrentStep("SHOW_RESULTS");
            displayResultsInChat(res);
          } else if (pollCount >= 10) {
            clearInterval(pollInterval);
            // Show whatever preliminary scores exist
            if (res) {
              setResult(res);
              setCurrentStep("SHOW_RESULTS");
              displayResultsInChat(res);
            }
          }
        } catch (e) {
          console.error("Polling result error:", e);
        }
      }, 1500);

    } catch (err: any) {
      addMessage("bot", `⚠️ Lỗi khi nộp bài: ${err.message || "Vui lòng thử lại"}`);
      setCurrentStep("CONFIRM_SUBMIT");
    }
  };

  // Display Result Card
  const displayResultsInChat = (res: StudentResultData) => {
    const finalSc = res.final_score !== null ? Number(res.final_score).toFixed(1) : "Đang tính";
    const objSc = res.objective_score !== null ? Number(res.objective_score).toFixed(1) : "0";
    const essaySc = res.essay_score !== null ? Number(res.essay_score).toFixed(1) : (res.ai_essay_score !== null ? Number(res.ai_essay_score).toFixed(1) : "0");

    addMessage(
      "bot",
      `🎉 Chúc mừng bạn ${fullName} đã hoàn thành bài thi!\n\n🏆 TỔNG ĐIỂM CỦA BẠN: ${finalSc} điểm\n• Điểm trắc nghiệm: ${objSc}\n• Điểm tự luận (AI chấm): ${essaySc}\n\nDưới đây là chi tiết nhận xét và phân tích 3 Gốc từ AI Agent:`,
      "result_card",
      { resultData: res }
    );
  };

  // Format timer
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Restart chat
  const handleRestart = () => {
    setSelectedClass(null);
    setAttempt(null);
    setAnswers({});
    setResult(null);
    setSecondsRemaining(null);
    setCurrentQuestionIdx(0);

    if (isLoggedIn) {
      setCurrentStep("SELECT_CLASS");
      setMessages([
        {
          id: "greet-restart-" + Date.now(),
          sender: "bot",
          text: `Chào mừng bạn **${fullName}** quay lại! 🤖\n\nDưới đây là danh sách các lớp học đang mở bài thi. Bạn hãy chọn lớp để làm bài nhé:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: "class_picker"
        }
      ]);
    } else {
      setCurrentStep("GREETING_NAME");
      setFullName("");
      setPhone("");
      setMessages([
        {
          id: "greet-restart-" + Date.now(),
          sender: "bot",
          text: "Chào mừng bạn trở lại! Mình là AI Trợ Lý Khảo Thí 3 Gốc 🤖.\n\nHãy nhập Họ và tên của bạn để bắt đầu bài thi mới nhé:",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: "text"
        }
      ]);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-100">
      {/* Chatbot Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-xs">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 text-sm sm:text-base">AI Trợ Lý Khảo Thí 3 Gốc</h1>
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Trực tuyến
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {attempt 
                ? `Đang thi: ${attempt.exam_title}` 
                : isLoggedIn 
                ? `Đã đăng nhập: ${fullName}${userRole ? ` (${userRole === "teacher" ? "Giáo viên" : "Học sinh"})` : ""}` 
                : "Khảo thí thông minh không cần đăng nhập"}
            </p>
          </div>
        </div>

        {/* Right Header Status / Timer */}
        <div className="flex items-center gap-2 sm:gap-3">
          {attempt && secondsRemaining !== null && currentStep !== "SHOW_RESULTS" && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs sm:text-sm font-bold shadow-2xs border ${
              secondsRemaining <= 180 
                ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse" 
                : "bg-indigo-50 text-indigo-700 border-indigo-200"
            }`}>
              <Clock className="h-4 w-4" />
              <span>{formatTime(secondsRemaining)}</span>
            </div>
          )}

          {attempt && currentStep === "EXAM_IN_PROGRESS" && (
            <button
              onClick={promptConfirmSubmit}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <span>Nộp bài</span>
            </button>
          )}

          {isLoggedIn ? (
            <Link
              href={userRole === "teacher" ? "/teacher/dashboard" : "/student/dashboard"}
              className="px-3 py-1.5 text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition font-medium flex items-center gap-1"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>Bảng điều khiển</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition font-medium"
            >
              Đăng nhập
            </Link>
          )}

          <Link
            href="/"
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          >
            Trang chủ
          </Link>
        </div>
      </header>

      {/* Quick Question Pills for in-progress exam */}
      {attempt && currentStep === "EXAM_IN_PROGRESS" && (
        <div className="bg-white/80 backdrop-blur px-4 py-2 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs shrink-0 scrollbar-none">
          <span className="text-slate-500 font-medium shrink-0">Câu hỏi:</span>
          {attempt.questions.map((q, idx) => {
            const isAnswered = answers[q.exam_question_id] && (
              answers[q.exam_question_id].selected_option_ids.length > 0 ||
              answers[q.exam_question_id].text_response.trim().length > 0
            );
            const isCurrent = idx === currentQuestionIdx;
            return (
              <button
                key={q.exam_question_id}
                onClick={() => handleGoToQuestion(idx)}
                className={`w-7 h-7 rounded-md font-bold transition flex items-center justify-center shrink-0 ${
                  isCurrent
                    ? "bg-indigo-600 text-white shadow-xs"
                    : isAnswered
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat Messages Stream */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* Bot Avatar */}
            {msg.sender === "bot" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                <Bot className="h-4 w-4" />
              </div>
            )}

            {/* Bubble Container */}
            <div className={`max-w-[85%] sm:max-w-[75%] space-y-2`}>
              {/* Text Bubble */}
              {msg.text && (
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-2xs ${
                    msg.sender === "user"
                      ? "bg-indigo-600 text-white rounded-br-xs"
                      : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {/* Interactive Widget: Class Picker */}
              {msg.type === "class_picker" && currentStep === "SELECT_CLASS" && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <School className="h-4 w-4 text-indigo-600" />
                    <span>Chọn lớp học để vào làm bài:</span>
                  </p>
                  {publicClasses.length === 0 ? (
                    <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-xl">
                      Đang tìm kiếm lớp học có bài thi mở... Nếu không thấy lớp, bạn vui lòng liên hệ giáo viên!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {publicClasses.map((cls) => (
                        <button
                          key={cls.id}
                          onClick={() => handleSelectClass(cls)}
                          className="p-3 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition group flex flex-col justify-between"
                        >
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-indigo-700 text-sm">
                              {cls.name}
                            </span>
                          </div>
                          <span className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold">
                            <span>Vào làm bài ngay</span>
                            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Interactive Widget: Ready Card */}
              {msg.type === "ready_card" && currentStep === "READY_CONFIRM" && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-center space-y-3 shadow-2xs">
                  <p className="text-xs text-indigo-700 font-medium">
                    Hệ thống sẽ bấm giờ khi bạn nhấn nút bắt đầu. Bạn có thể làm từng câu và đổi đáp án bất kỳ lúc nào.
                  </p>
                  <button
                    onClick={handleStartExam}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-sm transition flex items-center justify-center gap-2 text-sm"
                  >
                    <span>🚀 Bắt đầu làm bài thi</span>
                  </button>
                </div>
              )}

              {/* Interactive Widget: Question Card */}
              {msg.type === "question_card" && typeof msg.questionIndex === "number" && attempt && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  {(() => {
                    const q = attempt.questions[msg.questionIndex];
                    if (!q) return null;
                    const ans = answers[q.exam_question_id];

                    return (
                      <div className="space-y-3">
                        {/* Single Choice Options */}
                        {q.type === "single_choice" && q.options && (
                          <div className="space-y-2">
                            {q.options.map((opt, oIdx) => {
                              const isSelected = ans?.selected_option_ids?.includes(opt.id);
                              const letter = String.fromCharCode(65 + oIdx);
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => handleSelectSingleOption(q, opt.id)}
                                  className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 ${
                                    isSelected
                                      ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-medium shadow-xs"
                                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800"
                                  }`}
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                      isSelected
                                        ? "bg-indigo-600 text-white"
                                        : "bg-white border border-slate-300 text-slate-600"
                                    }`}
                                  >
                                    {letter}
                                  </span>
                                  <span className="text-sm">{opt.content}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Multiple Select Options */}
                        {q.type === "multiple_select" && q.options && (
                          <div className="space-y-3">
                            <p className="text-xs text-slate-500 italic">Chọn các đáp án đúng và bấm "Xác nhận đáp án":</p>
                            <div className="space-y-2">
                              {q.options.map((opt, oIdx) => {
                                const isSelected = ans?.selected_option_ids?.includes(opt.id);
                                const letter = String.fromCharCode(65 + oIdx);
                                return (
                                  <button
                                    key={opt.id}
                                    onClick={() => handleToggleMultipleOption(q, opt.id)}
                                    className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 ${
                                      isSelected
                                        ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-medium"
                                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800"
                                    }`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                        isSelected
                                          ? "bg-indigo-600 text-white"
                                          : "bg-white border border-slate-300 text-slate-400"
                                      }`}
                                    >
                                      {isSelected ? <Check className="h-3.5 w-3.5" /> : letter}
                                    </span>
                                    <span className="text-sm">{opt.content}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => handleConfirmMultipleSelect(q)}
                              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition"
                            >
                              Xác nhận đáp án ({ans?.selected_option_ids?.length || 0} đã chọn)
                            </button>
                          </div>
                        )}

                        {/* Essay Hint */}
                        {q.type === "essay" && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                            <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              Hãy gõ câu trả lời của bạn vào <strong>khung chat bên dưới</strong> và bấm nút Gửi (hoặc Enter). AI sẽ tự động lưu và đánh giá theo 3 Gốc.
                            </span>
                          </div>
                        )}

                        {/* Quick Navigation Footer */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <button
                            disabled={msg.questionIndex <= 0}
                            onClick={() => handleGoToQuestion(msg.questionIndex! - 1)}
                            className="hover:text-indigo-600 font-medium disabled:opacity-30 disabled:hover:text-slate-500 flex items-center gap-1"
                          >
                            <ArrowLeft className="h-3 w-3" />
                            <span>Câu trước</span>
                          </button>

                          {msg.questionIndex < attempt.questions.length - 1 ? (
                            <button
                              onClick={() => handleGoToQuestion(msg.questionIndex! + 1)}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                            >
                              <span>Câu tiếp theo</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <button
                              onClick={promptConfirmSubmit}
                              className="text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1"
                            >
                              <span>Hoàn thành & Nộp bài</span>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Interactive Widget: Confirm Submit */}
              {msg.type === "confirm_submit" && currentStep === "CONFIRM_SUBMIT" && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitExam}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Xác nhận nộp bài</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentStep("EXAM_IN_PROGRESS");
                        handleGoToQuestion(0);
                      }}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                    >
                      Xem lại bài
                    </button>
                  </div>
                </div>
              )}

              {/* Interactive Widget: Grading Loader */}
              {msg.type === "grading_loader" && currentStep === "GRADING" && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin shrink-0" />
                  <div className="text-xs text-indigo-900">
                    <p className="font-bold">AI Agent đang chấm điểm bài làm...</p>
                    <p className="text-indigo-700 text-[11px] mt-0.5">
                      Tự động tính điểm trắc nghiệm và đánh giá tự luận theo Đạo đức - Trí tuệ - Nghị lực.
                    </p>
                  </div>
                </div>
              )}

              {/* Interactive Widget: Result Card */}
              {msg.type === "result_card" && msg.resultData && (
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md space-y-4 text-slate-800">
                  {/* Score Highlight Header */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-700 to-blue-700 text-white flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-indigo-200 font-semibold">
                        Kết Quả Đánh Giá AI
                      </span>
                      <h3 className="text-lg font-extrabold mt-0.5">{msg.resultData.exam_title}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-amber-300">
                        {msg.resultData.final_score !== null ? Number(msg.resultData.final_score).toFixed(1) : "--"}
                      </div>
                      <div className="text-[11px] text-indigo-200">Điểm tổng kết</div>
                    </div>
                  </div>

                  {/* Score Breakdown Pills */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500 font-medium">Trắc nghiệm</div>
                      <div className="text-lg font-bold text-slate-800 mt-0.5">
                        {msg.resultData.objective_score !== null ? Number(msg.resultData.objective_score).toFixed(1) : "0"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs text-slate-500 font-medium">Tự luận (AI chấm)</div>
                      <div className="text-lg font-bold text-indigo-600 mt-0.5">
                        {msg.resultData.essay_score !== null
                          ? Number(msg.resultData.essay_score).toFixed(1)
                          : (msg.resultData.ai_essay_score !== null ? Number(msg.resultData.ai_essay_score).toFixed(1) : "0")}
                      </div>
                    </div>
                  </div>

                  {/* 3 Roots Analysis */}
                  {msg.resultData.ai_feedback?.three_roots && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4 text-emerald-600" />
                        <span>Phân Tích 3 Gốc (Đạo Đức - Trí Tuệ - Nghị Lực)</span>
                      </h4>

                      <div className="space-y-2 text-xs">
                        {/* Dao Duc */}
                        {msg.resultData.ai_feedback.three_roots.dao_duc && (
                          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                            <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-1">
                              <Heart className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Đạo Đức</span>
                            </div>
                            <p className="text-emerald-950 leading-relaxed">
                              {typeof msg.resultData.ai_feedback.three_roots.dao_duc === "string"
                                ? msg.resultData.ai_feedback.three_roots.dao_duc
                                : (msg.resultData.ai_feedback.three_roots.dao_duc.evidence || "Có ý thức hướng thiện và tinh thần trách nhiệm.")}
                            </p>
                          </div>
                        )}

                        {/* Tri Tue */}
                        {msg.resultData.ai_feedback.three_roots.tri_tue && (
                          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl">
                            <div className="font-bold text-blue-800 flex items-center gap-1.5 mb-1">
                              <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
                              <span>Trí Tuệ</span>
                            </div>
                            <p className="text-blue-950 leading-relaxed">
                              {typeof msg.resultData.ai_feedback.three_roots.tri_tue === "string"
                                ? msg.resultData.ai_feedback.three_roots.tri_tue
                                : (msg.resultData.ai_feedback.three_roots.tri_tue.evidence || "Tư duy mạch lạc, có sự đúc kết đa chiều.")}
                            </p>
                          </div>
                        )}

                        {/* Nghi Luc */}
                        {msg.resultData.ai_feedback.three_roots.nghi_luc && (
                          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                            <div className="font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                              <Compass className="h-3.5 w-3.5 text-amber-600" />
                              <span>Nghị Lực (Dũng - Nhẫn - Tĩnh)</span>
                            </div>
                            <p className="text-amber-950 leading-relaxed">
                              {typeof msg.resultData.ai_feedback.three_roots.nghi_luc === "string"
                                ? msg.resultData.ai_feedback.three_roots.nghi_luc
                                : (msg.resultData.ai_feedback.three_roots.nghi_luc.evidence || "Thể hiện tinh thần dám nghĩ, dám làm và vượt khó.")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3 Poisons Warning */}
                  {msg.resultData.ai_feedback?.three_poisons && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                      <div className="font-bold flex items-center justify-between text-rose-700">
                        <span className="flex items-center gap-1.5">
                          <ShieldAlert className="h-4 w-4" />
                          <span>Nhận Diện & Trừ Điểm 3 Độc (Tham - Sân - Si)</span>
                        </span>
                        {msg.resultData.ai_feedback.three_poisons.points_deducted !== undefined &&
                          Number(msg.resultData.ai_feedback.three_poisons.points_deducted) > 0 && (
                            <span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded text-[10px] font-bold">
                              Trừ {Number(msg.resultData.ai_feedback.three_poisons.points_deducted).toFixed(2)}đ (Min: 0đ)
                            </span>
                          )}
                      </div>
                      {typeof msg.resultData.ai_feedback.three_poisons.tham === "string" ? (
                        <p>• <strong>Tham:</strong> {msg.resultData.ai_feedback.three_poisons.tham}</p>
                      ) : msg.resultData.ai_feedback.three_poisons.tham?.detected && (
                        <p>• <strong>Tham:</strong> {msg.resultData.ai_feedback.three_poisons.tham.manifestation}</p>
                      )}
                      {typeof msg.resultData.ai_feedback.three_poisons.san === "string" ? (
                        <p>• <strong>Sân:</strong> {msg.resultData.ai_feedback.three_poisons.san}</p>
                      ) : msg.resultData.ai_feedback.three_poisons.san?.detected && (
                        <p>• <strong>Sân:</strong> {msg.resultData.ai_feedback.three_poisons.san.manifestation}</p>
                      )}
                      {typeof msg.resultData.ai_feedback.three_poisons.si === "string" ? (
                        <p>• <strong>Si:</strong> {msg.resultData.ai_feedback.three_poisons.si}</p>
                      ) : msg.resultData.ai_feedback.three_poisons.si?.detected && (
                        <p>• <strong>Si:</strong> {msg.resultData.ai_feedback.three_poisons.si.manifestation}</p>
                      )}
                    </div>
                  )}

                  {/* Transformative Advice */}
                  {msg.resultData.ai_feedback?.transformative_advice && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900">
                      <div className="font-bold text-purple-800 mb-1 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                        <span>Lời Khuyên Sư Phạm & Hành Động Thực Tế:</span>
                      </div>
                      <p className="leading-relaxed">{msg.resultData.ai_feedback.transformative_advice}</p>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleRestart}
                      className="flex-1 min-w-[140px] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Làm bài thi khác</span>
                    </button>
                    {isLoggedIn && (
                      <Link
                        href={userRole === "teacher" ? "/teacher/dashboard" : "/student/dashboard"}
                        className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                      >
                        <Award className="h-3.5 w-3.5" />
                        <span>Bảng điểm cá nhân</span>
                      </Link>
                    )}
                    <Link
                      href="/"
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                    >
                      Trang chủ
                    </Link>
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div
                className={`text-[10px] text-slate-400 px-1 ${
                  msg.sender === "user" ? "text-right" : "text-left"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>

            {/* User Avatar */}
            {msg.sender === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center shrink-0 mt-1">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Chat Input Bar */}
      <footer className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={currentStep === "GRADING" || currentStep === "SHOW_RESULTS"}
            placeholder={
              currentStep === "GREETING_NAME"
                ? "Nhập họ và tên của bạn..."
                : currentStep === "ASK_PHONE"
                ? "Nhập số điện thoại di động 10 số (VD: 0987654321)..."
                : currentStep === "EXAM_IN_PROGRESS" && attempt?.questions[currentQuestionIdx]?.type === "essay"
                ? "Nhập câu trả lời tự luận rồi nhấn Gửi..."
                : currentStep === "SELECT_CLASS"
                ? "Chọn một lớp học ở trên để tiếp tục..."
                : currentStep === "SHOW_RESULTS"
                ? "Bài thi đã hoàn tất! Bấm 'Làm bài thi khác' để thi lại."
                : "Nhập tin nhắn..."
            }
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || currentStep === "GRADING" || currentStep === "SHOW_RESULTS"}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl shadow-xs transition shrink-0"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
