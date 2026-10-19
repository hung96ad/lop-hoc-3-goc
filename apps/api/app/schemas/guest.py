from pydantic import BaseModel, Field


class GuestEntryRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=8, max_length=20, pattern=r"^[+0-9() .-]+$")
    class_id: str


class GuestEntryResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    role: str
    assignment_id: str
