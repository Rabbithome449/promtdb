# promtdb

Pragmatic MVP for managing Stable Diffusion prompt tags/phrases and composing positive/negative prompts.

## What is implemented

### Backend (FastAPI + SQLite)
- Category CRUD
- Phrase CRUD (with default weight, negative-default flag, notes)
- Preset CRUD (`positive_parts` and `negative_parts` JSON)
- Prompt composer endpoint (`POST /compose`)
- SQLite auto-init on startup
- Open CORS for local frontend development

### Frontend (React + TypeScript + Vite)
- Category management (create, select, rename, delete)
- Phrase management per category (create, list, delete)
- Add phrases to composer (auto-routed to positive/negative by default flag)
- Composer editing:
  - change text
  - optional weight
  - reorder with up/down
  - remove items
- Live prompt output for positive and negative strings
- Copy buttons for both outputs
- Presets:
  - save current composer
  - load preset
  - delete preset

## Project structure
- `backend/` FastAPI + SQLModel API
- `frontend/` React app
- `docs/mvp-spec.md` original MVP spec

## Run locally

### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend API: `http://localhost:8000`

> If your system does not provide `venv`, install `python3-venv` first (Debian/Ubuntu), or run with your existing Python environment.

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend app: `http://localhost:5173`

Optional API base override:
```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

## Basic checks

### Backend syntax check
```bash
cd backend
python3 -m py_compile app/*.py
```

### Frontend production build
```bash
cd frontend
npm run build
```

## API overview

- `GET /health`
- `GET /categories`
- `POST /categories`
- `PATCH /categories/{id}`
- `DELETE /categories/{id}`
- `GET /phrases?category_id=`
- `POST /phrases`
- `PATCH /phrases/{id}`
- `DELETE /phrases/{id}`
- `POST /compose`
- `GET /presets`
- `POST /presets`
- `PATCH /presets/{id}`
- `DELETE /presets/{id}`
