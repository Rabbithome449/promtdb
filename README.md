# promtdb

Prompt database web app for Stable Diffusion prompt building.

## Structure
- `backend/` FastAPI + SQLModel
- `frontend/` React + Vite + TypeScript
- `docs/` Product and implementation specs

## Quick start

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Current status
- MVP spec available (`docs/mvp-spec.md`)
- Backend scaffold with `/health`
- Frontend scaffold with initial app shell
