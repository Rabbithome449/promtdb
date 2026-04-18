import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .db import get_session, init_db
from .models import (
    Category,
    CategoryCreate,
    CategoryUpdate,
    CharacterPreset,
    CharacterPresetCreate,
    CharacterPresetUpdate,
    ComposeRequest,
    ComposeResponse,
    Phrase,
    PhraseCreate,
    PhraseUpdate,
    PromptPreset,
    PromptPresetCreate,
    PromptPresetUpdate,
)

app = FastAPI(title="promtdb API", version="0.4.0")

cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    item = Category(name=payload.name.strip(), sort_order=payload.sort_order)
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
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()

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

    phrases = session.exec(select(Phrase).where(Phrase.category_id == category_id)).all()
    for phrase in phrases:
        session.delete(phrase)
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
    item.text = item.text.strip()
    if item.required_lora is not None:
        item.required_lora = item.required_lora.strip() or None
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

    if "text" in data and data["text"] is not None:
        data["text"] = data["text"].strip()
    if "required_lora" in data and data["required_lora"] is not None:
        data["required_lora"] = data["required_lora"].strip() or None

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


@app.post("/compose", response_model=ComposeResponse)
def compose_prompt(payload: ComposeRequest):
    def render(parts):
        rendered: list[str] = []
        for part in parts:
            text = part.text.strip()
            if not text:
                continue
            if part.weight is None:
                rendered.append(text)
            else:
                rendered.append(f"({text}:{part.weight})")
        return ", ".join(rendered)

    return ComposeResponse(
        positive_prompt=render(payload.positive_parts),
        negative_prompt=render(payload.negative_parts),
    )


@app.get("/presets", response_model=list[PromptPreset])
def list_presets(session: Session = Depends(get_session)):
    return session.exec(select(PromptPreset).order_by(PromptPreset.id.desc())).all()


@app.post("/presets", response_model=PromptPreset)
def create_preset(payload: PromptPresetCreate, session: Session = Depends(get_session)):
    item = PromptPreset(
        name=payload.name.strip(),
        positive_parts=[part.model_dump() for part in payload.positive_parts],
        negative_parts=[part.model_dump() for part in payload.negative_parts],
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/presets/{preset_id}", response_model=PromptPreset)
def update_preset(preset_id: int, payload: PromptPresetUpdate, session: Session = Depends(get_session)):
    item = session.get(PromptPreset, preset_id)
    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()

    if "positive_parts" in data and data["positive_parts"] is not None:
        data["positive_parts"] = [part.model_dump() for part in data["positive_parts"]]

    if "negative_parts" in data and data["negative_parts"] is not None:
        data["negative_parts"] = [part.model_dump() for part in data["negative_parts"]]

    for key, value in data.items():
        setattr(item, key, value)
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/presets/{preset_id}")
def delete_preset(preset_id: int, session: Session = Depends(get_session)):
    item = session.get(PromptPreset, preset_id)
    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")
    session.delete(item)
    session.commit()
    return {"ok": True}


@app.get("/characters", response_model=list[CharacterPreset])
def list_characters(session: Session = Depends(get_session)):
    return session.exec(select(CharacterPreset).order_by(CharacterPreset.id.desc())).all()


@app.post("/characters", response_model=CharacterPreset)
def create_character(payload: CharacterPresetCreate, session: Session = Depends(get_session)):
    item = CharacterPreset(
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        required_sdxl_base_model=(payload.required_sdxl_base_model or "").strip() or None,
        recommended_sdxl_base_model=(payload.recommended_sdxl_base_model or "").strip() or None,
        positive_prompt=payload.positive_prompt.strip(),
        negative_prompt=payload.negative_prompt.strip(),
        positive_parts=[part.model_dump() for part in payload.positive_parts],
        negative_parts=[part.model_dump() for part in payload.negative_parts],
        required_loras=[l.strip() for l in payload.required_loras if l.strip()],
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/characters/{character_id}", response_model=CharacterPreset)
def update_character(character_id: int, payload: CharacterPresetUpdate, session: Session = Depends(get_session)):
    item = session.get(CharacterPreset, character_id)
    if not item:
        raise HTTPException(status_code=404, detail="Character not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "description" in data and data["description"] is not None:
        data["description"] = data["description"].strip() or None
    if "required_sdxl_base_model" in data and data["required_sdxl_base_model"] is not None:
        data["required_sdxl_base_model"] = data["required_sdxl_base_model"].strip() or None
    if "recommended_sdxl_base_model" in data and data["recommended_sdxl_base_model"] is not None:
        data["recommended_sdxl_base_model"] = data["recommended_sdxl_base_model"].strip() or None
    if "positive_prompt" in data and data["positive_prompt"] is not None:
        data["positive_prompt"] = data["positive_prompt"].strip()
    if "negative_prompt" in data and data["negative_prompt"] is not None:
        data["negative_prompt"] = data["negative_prompt"].strip()
    if "positive_parts" in data and data["positive_parts"] is not None:
        data["positive_parts"] = [part.model_dump() for part in data["positive_parts"]]
    if "negative_parts" in data and data["negative_parts"] is not None:
        data["negative_parts"] = [part.model_dump() for part in data["negative_parts"]]
    if "required_loras" in data and data["required_loras"] is not None:
        data["required_loras"] = [l.strip() for l in data["required_loras"] if l.strip()]

    for key, value in data.items():
        setattr(item, key, value)
    item.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/characters/{character_id}")
def delete_character(character_id: int, session: Session = Depends(get_session)):
    item = session.get(CharacterPreset, character_id)
    if not item:
        raise HTTPException(status_code=404, detail="Character not found")
    session.delete(item)
    session.commit()
    return {"ok": True}
