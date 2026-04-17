# promtdb – MVP Spec

## Ziel
Webapp zur Verwaltung und Komposition von Stable-Diffusion-Prompts.

## Kernbereiche

### 1) Prompt-Baustein-Verwaltung (Tags/Phrases)
- Bausteine (z. B. `long hair`)
- Kategorisierung (z. B. Hair, Face, Outfit, Lighting, Style, Quality, Camera)
- CRUD für:
  - Category
n  - Phrase/Tag
- Optional pro Phrase:
  - Gewicht/Strength (z. B. `(long hair:1.2)`)
  - Notiz
  - Synonyme
  - negative-only Flag

### 2) Prompt Composer (Frontend)
- Tags/Phrases aus Kategorien auswählen
- Reihenfolge anpassen (drag/drop später, erstmal up/down)
- Prompt live zusammenbauen
- Positive und Negative Prompt getrennt
- Ergebnis kopieren
- Preset/Template speichern

## Datenmodell (MVP)

### Category
- id
- name
- sort_order
- created_at
- updated_at

### Phrase
- id
- category_id
- text
- default_weight (nullable)
- is_negative_default (bool)
- notes (nullable)
- sort_order
- created_at
- updated_at

### PromptPreset
- id
- name
- positive_parts (json)
- negative_parts (json)
- created_at
- updated_at

## Prompt-Regeln (MVP)
- Join mit `, `
- Wenn weight gesetzt: `({text}:{weight})`
- Negative Prompt separat
- Output:
  - `positive_prompt`
  - `negative_prompt`

## UX-Flow
1. Kategorie wählen
2. Tags klicken (wandern in Composer)
3. Gewichte bei Bedarf anpassen
4. Reihenfolge prüfen
5. Copy Positive / Copy Negative
6. Optional als Preset speichern

## Tech-Vorschlag (MVP)
- Frontend: React + TypeScript
- Backend: FastAPI (Python)
- DB: SQLite (später Postgres möglich)
- Auth: vorerst aus

## API (MVP)
- `GET /categories`
- `POST /categories`
- `PATCH /categories/:id`
- `DELETE /categories/:id`
- `GET /phrases?category_id=`
- `POST /phrases`
- `PATCH /phrases/:id`
- `DELETE /phrases/:id`
- `POST /compose` (optional, kann auch client-side)
- `GET /presets`
- `POST /presets`
- `PATCH /presets/:id`
- `DELETE /presets/:id`

## Nächste Umsetzungsschritte
1. Projekt-Scaffold (frontend/backend)
2. SQLite Schema + Migration
3. Category/Phrase CRUD
4. Composer UI mit Copy
5. Presets
