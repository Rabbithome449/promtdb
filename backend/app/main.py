import os
import re
import secrets
from datetime import timedelta
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func
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

AUTH_USERNAME = os.getenv("PROMPTDB_USER", "promptdb")
AUTH_PASSWORD = os.getenv("PROMPTDB_PASS", "promptdb")
AUTH_TOKEN_TTL_HOURS = int(os.getenv("PROMPTDB_TOKEN_TTL_HOURS", "24"))
_TOKENS: dict[str, datetime] = {}

cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def infer_version_family(name: str) -> str:
    clean = name.strip().lower().replace(" ", "_")
    return re.sub(r"_v\d+$", "", clean)


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _issue_token() -> str:
    token = secrets.token_urlsafe(32)
    _TOKENS[token] = datetime.now(timezone.utc) + timedelta(hours=AUTH_TOKEN_TTL_HOURS)
    return token


def _is_token_valid(token: str) -> bool:
    exp = _TOKENS.get(token)
    if not exp:
        return False
    if exp < datetime.now(timezone.utc):
        _TOKENS.pop(token, None)
        return False
    return True


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    public_paths = {"/health", "/auth/login", "/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    if request.url.path in public_paths:
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else ""

    if not token or not _is_token_valid(token):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"ok": True, "service": "promtdb-backend"}


@app.post("/auth/login")
def auth_login(payload: dict):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if username != AUTH_USERNAME or password != AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _issue_token()
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in_seconds": AUTH_TOKEN_TTL_HOURS * 3600,
        "user": AUTH_USERNAME,
    }


@app.get("/auth/me")
def auth_me():
    return {"user": AUTH_USERNAME}


@app.get("/categories", response_model=list[Category])
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.sort_order, Category.id)).all()


@app.post("/categories", response_model=Category)
def create_category(payload: CategoryCreate, session: Session = Depends(get_session)):
    normalized = normalize_name(payload.name)
    if not normalized:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = session.exec(select(Category).where(func.lower(Category.name) == normalized)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")

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
        normalized = normalize_name(data["name"])
        if not normalized:
            raise HTTPException(status_code=400, detail="Category name is required")
        existing = session.exec(
            select(Category).where(func.lower(Category.name) == normalized, Category.id != category_id)
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Category already exists")
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
    family = (payload.version_family or "").strip() or infer_version_family(payload.name)
    version = payload.version if payload.version and payload.version > 0 else 1
    item = CharacterPreset(
        name=payload.name.strip(),
        version_family=family,
        version=version,
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
    if "version_family" in data and data["version_family"] is not None:
        data["version_family"] = data["version_family"].strip().lower().replace(" ", "_")
    if "version" in data and data["version"] is not None and data["version"] < 1:
        raise HTTPException(status_code=400, detail="version must be >= 1")
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


@app.post("/characters/{character_id}/duplicate-version", response_model=CharacterPreset)
def duplicate_character_version(character_id: int, session: Session = Depends(get_session)):
    src = session.get(CharacterPreset, character_id)
    if not src:
        raise HTTPException(status_code=404, detail="Character not found")

    family = src.version_family or infer_version_family(src.name)
    versions = session.exec(select(CharacterPreset.version).where(CharacterPreset.version_family == family)).all()
    next_version = (max(versions) if versions else 0) + 1

    dup = CharacterPreset(
        name=f"{family}_v{next_version}",
        version_family=family,
        version=next_version,
        description=src.description,
        required_sdxl_base_model=src.required_sdxl_base_model,
        recommended_sdxl_base_model=src.recommended_sdxl_base_model,
        positive_prompt=src.positive_prompt,
        negative_prompt=src.negative_prompt,
        positive_parts=src.positive_parts,
        negative_parts=src.negative_parts,
        required_loras=src.required_loras,
    )
    session.add(dup)
    session.commit()
    session.refresh(dup)
    return dup
