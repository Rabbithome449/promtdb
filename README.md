# promtdb

Pragmatic MVP for managing Stable Diffusion prompt tags/phrases and composing positive/negative prompts.

## Stack
- Backend: FastAPI + SQLModel
- Frontend: React + TypeScript + Vite
- Database: PostgreSQL
- Local test deployment: Docker Compose

## Quick start with Docker Compose / Portainer Stack

```bash
docker compose up --build
```

Portainer (ohne Schnickschnack):
- Stack aus dem Git-Repo erstellen
- Branch: `main`
- Compose path: `docker-compose.yml`

Services:
- Web UI: `http://localhost:8080`
- API: `http://localhost:18000`
- API health: `http://localhost:18000/health`
- Postgres: `localhost:5432` (db/user/pass: `promtdb`)

Stop stack:
```bash
docker compose down
```

Reset DB volume:
```bash
docker compose down -v
```

## Development without Docker

### Backend
```bash
cd backend
pip3 install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb"
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# default API base is /api for reverse-proxy mode
# set direct API URL for vite dev server:
VITE_API_URL=http://localhost:8000 npm run dev
```

## Environment variables

### Backend
- `DATABASE_URL` (default: `postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb`)
- `CORS_ORIGINS` (comma-separated, default: `*`)

### Frontend
- `VITE_API_URL` (default: `/api`)

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
- `GET /characters`
- `POST /characters`
- `PATCH /characters/{id}`
- `DELETE /characters/{id}`
- `POST /characters/{id}/duplicate-version`
