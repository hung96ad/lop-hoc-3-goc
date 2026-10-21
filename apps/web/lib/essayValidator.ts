const VIETNAMESE_VOWELS = new Set(
  "aeiouy" +
  "àáảãạâầấẩẫậăằắẳẵặ" +
  "èéẻẽẹêềếểễệ" +
  "ìíỉĩị" +
  "òóỏõọôồốổỗộơờớởỡợ" +
  "ùúủũụưừứửữự" +
  "ỳýỷỹỵ"
);

const EVASIVE_PATTERNS = [
  /\b(không|khong|ko|k|hổng|cha|chả)\s+(biết|biet|bít|rõ|hieu|hiểu)\b/i,
  /\b(chịu|chiu|bó\s+tay|bo\s+tay|chịu\s+thôi|chiu\s+thoi)\b/i,
  /\b(chưa|chua)\s+(nghĩ|nghi|biết|học)\b/i,
  /\b(linh\s+tinh|tào\s+lao|tao\s+lao|vớ\s+vẩn|vo\s+van|nhảm\s+nhí|nham\s+nhi)\b/i,
  /\b(test|testing|thử\s+thôi|thu\s+thoi|test\s+thôi)\b/i,
  /\b(bla\s*bla|abc\s*xyz|ahihi|haha|hehe|hihi|hoho|kaka)\b/i,
  /\b(qua\s+môn|cho\s+em\s+điểm|xin\s+điểm)\b/i,
  /^(chấm|\.|\?|!)+$/i,
];

export interface EssayValidationResult {
  isValid: boolean;
  reason: string;
}

/**
 * Validates whether an essay answer is genuine/thoughtful or nonsense/gibberish/evasive.
 */
export function validateEssayAnswer(text: string): EssayValidationResult {
  const cleanText = (text || "").trim();

  // 1. Minimum character length
  if (cleanText.length < 15) {
    return {
      isValid: false,
      reason: "Câu trả lời quá ngắn (cần tối thiểu 15 ký tự)",
    };
  }

  // 2. Minimum word count
  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    return {
      isValid: false,
      reason: "Câu trả lời quá ngắn (cần ít nhất 4 từ hoàn chỉnh)",
    };
  }

  // 3. Repeated single character 4+ times (e.g., 'aaaa', '.....', '1111')
  if (/(.)\1{3,}/.test(cleanText)) {
    return {
      isValid: false,
      reason: "Chứa ký tự lặp lại vô nghĩa",
    };
  }

  // 4. Repeated short syllable/pattern 3+ times (e.g., 'abcabcabc', 'hahahaha')
  if (/(.{2,6})\1{2,}/i.test(cleanText)) {
    return {
      isValid: false,
      reason: "Chứa âm tiết hoặc chuỗi ký tự lặp lại vô nghĩa",
    };
  }

  // 5. Consecutive repeated words (e.g., 'không không không', 'bla bla bla')
  if (/\b(\w+)\s+\1\s+\1\b/i.test(cleanText)) {
    return {
      isValid: false,
      reason: "Có từ ngữ bị lặp lại nhiều lần liên tiếp",
    };
  }

  // 6. Character diversity check: must contain at least 5 unique alphabetic letters
  const letters = cleanText
    .toLowerCase()
    .split("")
    .filter((c) => /[a-zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(c));

  const uniqueLetters = new Set(letters);
  if (letters.length < 10 || uniqueLetters.size < 5) {
    return {
      isValid: false,
      reason: "Nội dung quá đơn điệu hoặc gõ phím lặp lại",
    };
  }

  // 7. Words without vowels (keyboard mash detection)
  for (const w of words) {
    const cleanW = w
      .replace(/[^a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/gi, "")
      .toLowerCase();
    if (cleanW.length >= 5) {
      const hasVowel = cleanW.split("").some((c) => VIETNAMESE_VOWELS.has(c));
      if (!hasVowel) {
        return {
          isValid: false,
          reason: `Chứa từ không có nguyên âm hợp lệ "${w}" (nghi vấn gõ phím vô nghĩa)`,
        };
      }
    }
  }

  // 8. Evasive phrases (e.g., 'không biết làm', 'chịu thôi', 'linh tinh')
  for (const pat of EVASIVE_PATTERNS) {
    if (pat.test(cleanText)) {
      return {
        isValid: false,
        reason: "Nội dung mang tính đối phó hoặc không nghiêm túc",
      };
    }
  }

  return { isValid: true, reason: "" };
}
