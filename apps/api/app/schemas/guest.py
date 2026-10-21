import re
from pydantic import BaseModel, Field, field_validator

VN_MOBILE_PATTERN = re.compile(r"^0(3[2-9]|5[2-9]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$")


def validate_and_normalize_vn_phone(raw_phone: str) -> str:
    text = (raw_phone or "").strip()
    if not text:
        raise ValueError("Số điện thoại không được để trống")

    if re.search(r"[a-zA-Z]", text):
        raise ValueError("Số điện thoại chỉ được chứa các chữ số, không chứa chữ cái")

    if re.search(r"[^0-9\s+\-.()]", text):
        raise ValueError("Số điện thoại chứa ký tự đặc biệt không hợp lệ")

    # Clean common separators
    clean = re.sub(r"[\s\-.()]", "", text)

    # Normalize international prefix
    if clean.startswith("+84"):
        clean = "0" + clean[3:]
    elif clean.startswith("0084"):
        clean = "0" + clean[4:]
    elif clean.startswith("84") and len(clean) == 11:
        clean = "0" + clean[2:]

    if not clean.isdigit():
        raise ValueError("Số điện thoại chỉ được chứa các chữ số")

    if not clean.startswith("0"):
        raise ValueError("Số điện thoại di động Việt Nam phải bắt đầu bằng chữ số 0")

    if len(clean) < 10:
        raise ValueError(f"Số điện thoại còn thiếu chữ số ({len(clean)}/10 số). Vui lòng nhập đúng 10 số")

    if len(clean) > 10:
        raise ValueError(f"Số điện thoại bị thừa chữ số ({len(clean)}/10 số). Vui lòng nhập đúng 10 số")

    if len(set(clean)) == 1 or len(set(clean[1:])) == 1:
        raise ValueError("Số điện thoại không hợp lệ (các chữ số bị lặp lại vô nghĩa)")

    if not VN_MOBILE_PATTERN.match(clean):
        raise ValueError("Đầu số không thuộc các nhà mạng di động Việt Nam (hợp lệ: 03x, 05x, 07x, 08x, 09x)")

    return clean


class GuestEntryRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=9, max_length=25)
    class_id: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_and_normalize_vn_phone(v)


class GuestEntryResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    role: str
    assignment_id: str
