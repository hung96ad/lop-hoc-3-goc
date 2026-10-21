export interface PhoneValidationResult {
  isValid: boolean;
  reason: string;
  normalizedPhone?: string;
}

/**
 * Validates whether the input string is a valid 10-digit Vietnamese mobile phone number.
 * Supports numbers formatted with spaces, dashes, dots, parentheses, or with +84 / 84 country code.
 * Rejects arbitrary inputs, wrong prefixes, incorrect lengths, and repeated fake patterns.
 */
export function validateVietnamesePhoneNumber(rawInput: string): PhoneValidationResult {
  const text = (rawInput || "").trim();

  if (!text) {
    return {
      isValid: false,
      reason: "Vui lòng nhập số điện thoại của bạn.",
    };
  }

  // 1. Check for alphabetical characters
  if (/[a-zA-Z]/.test(text)) {
    return {
      isValid: false,
      reason: "Số điện thoại chỉ được chứa các chữ số, không được chứa chữ cái.",
    };
  }

  // 2. Check for invalid symbols (only allow digits, spaces, +, -, ., (, ))
  if (/[^0-9\s+\-.()]/.test(text)) {
    return {
      isValid: false,
      reason: "Số điện thoại chứa ký tự đặc biệt không hợp lệ.",
    };
  }

  // 3. Remove common separators
  let clean = text.replace(/[\s\-.()]/g, "");

  // 4. Normalize international dialing codes (+84, 0084, 84) to leading 0
  if (clean.startsWith("+84")) {
    clean = "0" + clean.slice(3);
  } else if (clean.startsWith("0084")) {
    clean = "0" + clean.slice(4);
  } else if (clean.startsWith("84") && clean.length === 11) {
    clean = "0" + clean.slice(2);
  }

  // 5. Must consist entirely of digits
  if (!/^\d+$/.test(clean)) {
    return {
      isValid: false,
      reason: "Số điện thoại chỉ được bao gồm các chữ số.",
    };
  }

  // 6. Must start with 0
  if (!clean.startsWith("0")) {
    return {
      isValid: false,
      reason: "Số điện thoại di động Việt Nam phải bắt đầu bằng chữ số 0 (hoặc mã quốc gia +84).",
    };
  }

  // 7. Check length: exactly 10 digits
  if (clean.length < 10) {
    return {
      isValid: false,
      reason: `Số điện thoại còn thiếu chữ số (${clean.length}/10 số). Số điện thoại di động Việt Nam phải gồm đúng 10 số.`,
    };
  }

  if (clean.length > 10) {
    return {
      isValid: false,
      reason: `Số điện thoại bị thừa (${clean.length}/10 số). Số điện thoại di động Việt Nam chỉ gồm đúng 10 số.`,
    };
  }

  // 8. Reject fake / arbitrary numbers with all identical digits (e.g., 0000000000) or all 9 trailing digits identical (e.g., 0999999999, 0888888888, 0777777777, 0333333333, 0555555555, 0111111111)
  if (/^(\d)\1{9}$/.test(clean)) {
    return {
      isValid: false,
      reason: "Số điện thoại không hợp lệ (tất cả các chữ số đều giống nhau).",
    };
  }
  if (/^0(\d)\1{8}$/.test(clean)) {
    return {
      isValid: false,
      reason: "Số điện thoại không hợp lệ (chuỗi số bị lặp lại vô nghĩa). Vui lòng nhập số thật của bạn.",
    };
  }

  // 9. Validate mobile network prefixes in Vietnam:
  // - 03: 032, 033, 034, 035, 036, 037, 038, 039 (Viettel)
  // - 05: 052, 055, 056, 058, 059 (Vietnamobile, Wintel, Gmobile)
  // - 07: 070, 076, 077, 078, 079 (Mobifone, FPT)
  // - 08: 081, 082, 083, 084, 085, 086, 087, 088, 089 (Vinaphone, Viettel, Itelecom, Mobifone)
  // - 09: 090, 091, 092, 093, 094, 096, 097, 098, 099 (All carriers)
  const vnMobilePattern = /^0(3[2-9]|5[2-9]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
  if (!vnMobilePattern.test(clean)) {
    return {
      isValid: false,
      reason: "Đầu số không thuộc các nhà mạng di động Việt Nam (đầu số hợp lệ: 03x, 05x, 07x, 08x, 09x).",
    };
  }

  return {
    isValid: true,
    reason: "",
    normalizedPhone: clean,
  };
}
