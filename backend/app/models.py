from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, min_length=1)
    sort_order: int = 0
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Phrase(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(index=True)
    text: str = Field(index=True, min_length=1)
    default_weight: Optional[float] = None
    is_negative_default: bool = False
    notes: Optional[str] = None
    sort_order: int = 0
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class CategoryCreate(SQLModel):
    name: str
    sort_order: int = 0


class CategoryUpdate(SQLModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class PhraseCreate(SQLModel):
    category_id: int
    text: str
    default_weight: Optional[float] = None
    is_negative_default: bool = False
    notes: Optional[str] = None
    sort_order: int = 0


class PhraseUpdate(SQLModel):
    category_id: Optional[int] = None
    text: Optional[str] = None
    default_weight: Optional[float] = None
    is_negative_default: Optional[bool] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None
