# promtdb

Pragmatic MVP for managing Stable Diffusion prompt tags/phrases and composing positive/negative prompts.

## Stack
- Backend: PHP (same webserver, route `/qpi`)
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
- Web UI: `http://localhost:17813`
- API (same host): `http://localhost:17813/qpi`
- API health: `http://localhost:17813/qpi/health`
- Postgres: `localhost:5432` (db/user/pass: `promtdb`)

Default login:
- username: `promptdb`
- password: `promptdb`

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
php -S 0.0.0.0:8000 -t public
```

### Frontend
```bash
cd frontend
npm install
# default API base is /qpi for same-host mode
# set direct API URL for vite dev server:
VITE_API_URL=http://localhost:8000 npm run dev
```

## Environment variables

### Backend
- `DATABASE_URL` (default: `postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb`)
- `CORS_ORIGINS` (comma-separated, default: `*`)
- `PROMPTDB_DEFAULT_ADMIN_USER` (default: `promptdb`)
- `PROMPTDB_DEFAULT_ADMIN_PASS` (default: `promptdb`)
- `PROMPTDB_TOKEN_TTL_HOURS` (default: `24`)

### Frontend
- `VITE_API_URL` (default: `/qpi`)

## API overview
- `POST /auth/login`
- `GET /auth/me`
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
