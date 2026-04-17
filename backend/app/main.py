from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlmodel import Session, select

from .db import get_session, init_db
from .models import (
    Category,
    CategoryCreate,
    CategoryUpdate,
    Phrase,
    PhraseCreate,
    PhraseUpdate,
)

app = FastAPI(title="promtdb API", version="0.2.0")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"ok": True, "service": "promtdb-backend"}


@app.get("/categories", response_model=list[Category])
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.sort_order, Category.id)).all()


@app.post("/categories", response_model=Category)
def create_category(payload: CategoryCreate, session: Session = Depends(get_session)):
    item = Category(name=payload.name, sort_order=payload.sort_order)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/categories/{category_id}", response_model=Category)
def update_category(category_id: int, payload: CategoryUpdate, session: Session = Depends(get_session)):
    item = session.get(Category, category_id)
    if not item:
        raise HTTPException(status_code=404, detail="Category not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(item, key, value)
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/categories/{category_id}")
def delete_category(category_id: int, session: Session = Depends(get_session)):
    item = session.get(Category, category_id)
    if not item:
        raise HTTPException(status_code=404, detail="Category not found")
    session.delete(item)
    session.commit()
    return {"ok": True}


@app.get("/phrases", response_model=list[Phrase])
def list_phrases(
    category_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    stmt = select(Phrase).order_by(Phrase.sort_order, Phrase.id)
    if category_id is not None:
        stmt = stmt.where(Phrase.category_id == category_id)
    return session.exec(stmt).all()


@app.post("/phrases", response_model=Phrase)
def create_phrase(payload: PhraseCreate, session: Session = Depends(get_session)):
    category = session.get(Category, payload.category_id)
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category_id")

    item = Phrase(**payload.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/phrases/{phrase_id}", response_model=Phrase)
def update_phrase(phrase_id: int, payload: PhraseUpdate, session: Session = Depends(get_session)):
    item = session.get(Phrase, phrase_id)
    if not item:
        raise HTTPException(status_code=404, detail="Phrase not found")

    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        category = session.get(Category, data["category_id"])
        if not category:
            raise HTTPException(status_code=400, detail="Invalid category_id")

    for key, value in data.items():
        setattr(item, key, value)
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/phrases/{phrase_id}")
def delete_phrase(phrase_id: int, session: Session = Depends(get_session)):
    item = session.get(Phrase, phrase_id)
    if not item:
        raise HTTPException(status_code=404, detail="Phrase not found")
    session.delete(item)
    session.commit()
    return {"ok": True}
