"""Authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError  # Added for safe concurrent registration

from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserResponse
from app.services.auth import (
    create_access_token,
    get_current_user,
    get_user_by_email,
    hash_password,
    verify_password,
)

router = APIRouter()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Register a new user."""
    # Check for duplicate email
    existing = await get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Create user
    hashed_pw = hash_password(user_data.password)
    user = User(email=user_data.email, hashed_password=hashed_pw)
    
    try:
        db.add(user)
        await db.commit()  # Explicitly commit to trigger any DB constraints immediately
        await db.refresh(user)
    except IntegrityError:
        # Handles race conditions where the email gets inserted by another request
        # in the milliseconds between our check above and our insert here.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Generate token
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Authenticate and get access token."""
    # Find user
    user = await get_user_by_email(db, user_data.email)

    # Verify credentials (same error for any failure - security requirement)
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check if active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated",
        )

    # Generate token
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Get current user information."""
    return current_user