# Backend (PHP)

## Setup
```bash
cd backend
php -S 0.0.0.0:8000 -t public
```

Environment variables:
- `DATABASE_URL` (default: `postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb`)
- `PROMPTDB_DEFAULT_ADMIN_USER` (default: `promptdb`)
- `PROMPTDB_DEFAULT_ADMIN_PASS` (default: `promptdb`)
- `PROMPTDB_TOKEN_TTL_HOURS` (default: `24`)
- `CORS_ORIGINS` (default: `*`)

## Test
- `GET http://localhost:8000/health`
