# Backend (FastAPI)

## Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Test
- `GET http://localhost:8000/health`

## Migrations (Alembic)
```bash
cd backend
source .venv/bin/activate

# apply migrations
alembic upgrade head

# create new migration after model changes
alembic revision --autogenerate -m "describe change"

# rollback one step
alembic downgrade -1
```

Notes:
- `DATABASE_URL` is used by Alembic when set.
- Runtime ad-hoc schema drift fixes were removed; use migrations for all schema changes.
