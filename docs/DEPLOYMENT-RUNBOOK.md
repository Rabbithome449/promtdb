# DEPLOYMENT RUNBOOK (promtdb)

## Goal
Standard deployment path when asked to "deploy the project".

## Versioning mode (active)
- Project uses semantic versioning with release candidates:
  - RC tag: `vMAJOR.MINOR.PATCH-rc.N`
  - Release tag: `vMAJOR.MINOR.PATCH`
- Approved test branches are merged into the current RC line.
- Final release happens only when the full RC is approved.
- See `docs/VERSIONING.md` for full rules.

## Paths
- Repository: `/data/.openclaw/workspace/promtdb`
- Frontend: `/data/.openclaw/workspace/promtdb/frontend`
- Redeploy script: `/data/.openclaw/workspace/promtdb/.tmp_portainer_redeploy.js`

## Standard flow
1. Build frontend
   - `npm run build` (in `frontend`)
2. Commit and push changes (if any)
   - `git add ...`
   - `git commit -m "[YYYY-MM-DD HH:MM Europe/Vilnius] ..."`
   - `git push origin main`
3. Trigger stack redeploy
   - `node /data/.openclaw/workspace/promtdb/.tmp_portainer_redeploy.js`
4. Verify success
   - Result should include `ok: true`
   - Stack should be `promptdb`
   - Runtime status should be `1` (running)

## Known failure mode
- Cloudflare timeout (HTTP 524) may happen intermittently.
- Action: retry the same redeploy command 1-3 times.
- If persistent, report clearly: push succeeded, deploy blocked by tunnel timeout.

## Auth/config inputs
- `secrets/portainer.env`
  - `PORTAINER_URL`
  - `PORTAINER_USER`
  - `PORTAINER_PASSWORD`
- `secrets/cloudflare-tunnel.env`
  - `CF_ACCESS_CLIENT_ID`
  - `CF_ACCESS_CLIENT_SECRET`

## Target
- Portainer stack: `promptdb`
- Endpoint: `local` (ID `3`)
