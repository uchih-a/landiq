"""Unit tests for authentication service."""

import time

import pytest
from fastapi import HTTPException

from app.services.auth import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestHashAndVerifyPassword:
    """Test password hashing and verification."""

    def test_hash_and_verify_correct_password(self):
        """Test hashing and verifying a correct password."""
        password = "TestPass123"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password_returns_false(self):
        """Test verifying an incorrect password returns False."""
        password = "TestPass123"
        wrong_password = "WrongPass123"
        hashed = hash_password(password)
        assert verify_password(wrong_password, hashed) is False


class TestTokenOperations:
    """Test JWT token operations."""

    def test_create_token_has_correct_user_id_in_sub(self):
        """Test token contains correct user ID."""
        user_id = 42
        token = create_access_token(user_id)
        decoded_id = decode_token(token)
        assert decoded_id == user_id

    def test_decode_valid_token_returns_integer_user_id(self):
        """Test decoding returns integer user ID."""
        token = create_access_token(123)
        decoded = decode_token(token)
        assert isinstance(decoded, int)
        assert decoded == 123

    def test_expired_token_raises_401(self):
        """Test expired token raises 401."""
        # Create a token with very short expiry by manipulating
        # This is a simplified test - in reality you'd need to mock time
        import jwt
        from app.core.config import get_settings

        settings = get_settings()
        expired_payload = {"sub": "1", "exp": time.time() - 1000}
        expired_token = jwt.encode(
            expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )

        with pytest.raises(HTTPException) as exc_info:
            decode_token(expired_token)
        assert exc_info.value.status_code == 401

    def test_tampered_token_signature_raises_401(self):
        """Test tampered token raises 401."""
        token = create_access_token(1)
        tampered = token[:-5] + "XXXXX"

        with pytest.raises(HTTPException) as exc_info:
            decode_token(tampered)
        assert exc_info.value.status_code == 401

    def test_missing_sub_field_raises_401(self):
        """Test token without sub field raises 401."""
        import jwt
        from app.core.config import get_settings

        settings = get_settings()
        payload = {"exp": time.time() + 3600}  # No sub field
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )

        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401
