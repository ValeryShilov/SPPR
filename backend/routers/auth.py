from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile
from backend.models.user import User
from backend.schemas.athlete import AthleteProfileRead
from backend.schemas.auth import ChangePasswordRequest, CreateAthleteRequest, LoginRequest, RegisterRequest, TokenResponse, UpdateProfileRequest, UserRead

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    if data.role not in ("athlete", "coach", "admin"):
        raise HTTPException(status_code=400, detail="Недопустимая роль")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        full_name=data.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверные email или пароль",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Аккаунт деактивирован")

    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/coaches", response_model=list[UserRead])
async def list_coaches(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.role == "coach", User.is_active == True).order_by(User.full_name)
    )
    return result.scalars().all()


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.full_name = data.full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=200)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"message": "Пароль изменён"}


@router.post("/create-athlete", response_model=AthleteProfileRead, status_code=status.HTTP_201_CREATED)
async def create_athlete_for_coach(
    data: CreateAthleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Только тренер может создавать профили атлетов")

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email уже зарегистрирован")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role="athlete",
        full_name=data.full_name,
    )
    db.add(user)
    await db.flush()

    profile = AthleteProfile(
        user_id=user.id,
        first_name=data.first_name,
        last_name=data.last_name,
        birth_date=data.birth_date,
        gender=data.gender,
        qualification=data.qualification,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return profile
