"""Authentication schemas."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str = Field(..., min_length=8, pattern=r".*\d.*")


class UserResponse(BaseModel):
    """User data response."""

    id: int
    email: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Authentication token response."""

    access_token: str
    token_type: str = "bearer"
