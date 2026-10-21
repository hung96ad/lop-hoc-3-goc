import re
from typing import Tuple

VIETNAMESE_VOWELS = set(
    "aeiouy"
    "àáảãạâầấẩẫậăằắẳẵặ"
    "èéẻẽẹêềếểễệ"
    "ìíỉĩị"
    "òóỏõọôồốổỗộơờớởỡợ"
    "ùúủũụưừứửữự"
    "ỳýỷỹỵ"
)

EVASIVE_PATTERNS = [
    r"\b(không|khong|ko|k|hổng|cha|chả)\s+(biết|biet|bít|rõ|hieu|hiểu)\b",
    r"\b(chịu|chiu|bó\s+tay|bo\s+tay|chịu\s+thôi|chiu\s+thoi)\b",
    r"\b(chưa|chua)\s+(nghĩ|nghi|biết|học)\b",
    r"\b(linh\s+tinh|tào\s+lao|tao\s+lao|vớ\s+vẩn|vo\s+van|nhảm\s+nhí|nham\s+nhi)\b",
    r"\b(test|testing|thử\s+thôi|thu\s+thoi|test\s+thôi)\b",
    r"\b(bla\s*bla|abc\s*xyz|ahihi|haha|hehe|hihi|hoho|kaka)\b",
    r"\b(qua\s+môn|cho\s+em\s+điểm|xin\s+điểm)\b",
    r"^(chấm|\.|\?|!)+$",
]


def validate_essay_response(text: str) -> Tuple[bool, str]:
    """
    Validates if an essay response is thoughtful and not gibberish/nonsense/evasive.
    Returns (is_valid: bool, reason: str).
    """
    clean_text = (text or "").strip()

    # 1. Minimum character length
    if len(clean_text) < 15:
        return False, "Câu trả lời quá ngắn (cần tối thiểu 15 ký tự)"

    # 2. Minimum word count
    words = clean_text.split()
    if len(words) < 4:
        return False, "Câu trả lời quá ngắn (cần ít nhất 4 từ hoàn chỉnh)"

    # 3. Repeated single character 4+ times (e.g., 'aaaa', '.....', '1111')
    if re.search(r"(.)\1{3,}", clean_text):
        return False, "Chứa ký tự lặp lại vô nghĩa"

    # 4. Repeated short syllable/pattern 3+ times (e.g., 'abcabcabc', 'hahahaha')
    if re.search(r"(.{2,6})\1{2,}", clean_text, re.IGNORECASE):
        return False, "Chứa âm tiết hoặc chuỗi ký tự lặp lại vô nghĩa"

    # 5. Consecutive repeated words (e.g., 'không không không', 'bla bla bla')
    if re.search(r"\b(\w+)\s+\1\s+\1\b", clean_text, re.IGNORECASE):
        return False, "Có từ ngữ bị lặp lại nhiều lần liên tiếp"

    # 6. Character diversity check: must contain at least 5 unique alphabetic letters
    alpha_chars = [c.lower() for c in clean_text if c.isalpha()]
    if len(alpha_chars) < 10 or len(set(alpha_chars)) < 5:
        return False, "Nội dung quá đơn điệu hoặc gõ phím lặp lại"

    # 7. Words without vowels (keyboard mash detection)
    for w in words:
        clean_w = re.sub(
            r"[^a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]",
            "",
            w,
            flags=re.IGNORECASE,
        ).lower()
        if len(clean_w) >= 5 and not any(c in VIETNAMESE_VOWELS for c in clean_w):
            return False, f"Chứa từ không có nguyên âm hợp lệ '{w}' (nghi vấn gõ phím vô nghĩa)"

    # 8. Evasive phrases (e.g., 'không biết làm', 'chịu thôi', 'linh tinh')
    lowered = clean_text.lower()
    for pat in EVASIVE_PATTERNS:
        if re.search(pat, lowered):
            return False, "Nội dung mang tính đối phó hoặc không nghiêm túc"

    return True, ""
