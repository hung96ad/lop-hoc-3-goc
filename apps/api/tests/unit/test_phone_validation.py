import pytest
from app.schemas.guest import GuestEntryRequest, validate_and_normalize_vn_phone
from pydantic import ValidationError


def test_valid_vietnamese_phone_numbers():
    # Standard 10-digit mobile numbers with various network prefixes
    assert validate_and_normalize_vn_phone("0987654321") == "0987654321"  # Viettel 098
    assert validate_and_normalize_vn_phone("0901234567") == "0901234567"  # Mobifone 090
    assert validate_and_normalize_vn_phone("0912345678") == "0912345678"  # Vinaphone 091
    assert validate_and_normalize_vn_phone("0923456789") == "0923456789"  # Vietnamobile 092
    assert validate_and_normalize_vn_phone("0993456789") == "0993456789"  # Gmobile 099
    assert validate_and_normalize_vn_phone("0321234567") == "0321234567"  # Viettel 032
    assert validate_and_normalize_vn_phone("0399876543") == "0399876543"  # Viettel 039
    assert validate_and_normalize_vn_phone("0561234567") == "0561234567"  # Vietnamobile 056
    assert validate_and_normalize_vn_phone("0581234567") == "0581234567"  # Vietnamobile 058
    assert validate_and_normalize_vn_phone("0701234567") == "0701234567"  # Mobifone 070
    assert validate_and_normalize_vn_phone("0791234567") == "0791234567"  # Mobifone 079
    assert validate_and_normalize_vn_phone("0861234567") == "0861234567"  # Viettel 086
    assert validate_and_normalize_vn_phone("0871234567") == "0871234567"  # Itelecom 087
    assert validate_and_normalize_vn_phone("0881234567") == "0881234567"  # Vinaphone 088
    assert validate_and_normalize_vn_phone("0891234567") == "0891234567"  # Mobifone 089


def test_phone_normalization():
    # Spacing, dots, dashes, parentheses
    assert validate_and_normalize_vn_phone(" 098 765 4321 ") == "0987654321"
    assert validate_and_normalize_vn_phone("098.765.4321") == "0987654321"
    assert validate_and_normalize_vn_phone("098-765-4321") == "0987654321"
    assert validate_and_normalize_vn_phone("(098) 765 4321") == "0987654321"

    # International prefixes
    assert validate_and_normalize_vn_phone("+84987654321") == "0987654321"
    assert validate_and_normalize_vn_phone("+84 987 654 321") == "0987654321"
    assert validate_and_normalize_vn_phone("84987654321") == "0987654321"
    assert validate_and_normalize_vn_phone("0084987654321") == "0987654321"


def test_invalid_arbitrary_phone_numbers():
    invalid_cases = [
        "",  # Empty
        "12345678",  # Too short, not 10 digits
        "09876543210",  # Too long, 11 digits
        "09876abcde",  # Contains letters
        "testphone1",  # Letters
        "0123456789",  # Invalid prefix 01
        "0241234567",  # Landline prefix 024, not 10-digit mobile
        "0481234567",  # Non-existent prefix 04
        "0681234567",  # Non-existent prefix 06
        "0301234567",  # Non-existent prefix 030
        "0801234567",  # 080 government net, not mobile
        "0000000000",  # All zeros
        "1111111111",  # All ones
        "0999999999",  # Repeated fake pattern
        "0888888888",  # Repeated fake pattern
        "0777777777",  # Repeated fake pattern
        "0333333333",  # Repeated fake pattern
        "098!@#4321",  # Invalid characters
    ]

    for raw in invalid_cases:
        with pytest.raises(ValueError):
            validate_and_normalize_vn_phone(raw)


def test_pydantic_schema_validation():
    # Valid schema entry
    req = GuestEntryRequest(
        full_name="Tran Thi B",
        phone="+84 912 345 678",
        class_id="class-123"
    )
    assert req.phone == "0912345678"

    # Invalid schema entry should raise ValidationError
    with pytest.raises(ValidationError):
        GuestEntryRequest(
            full_name="Tran Thi B",
            phone="12345678",  # Arbitrary short phone
            class_id="class-123"
        )

    with pytest.raises(ValidationError):
        GuestEntryRequest(
            full_name="Tran Thi B",
            phone="0999999999",  # Repeated fake number
            class_id="class-123"
        )
