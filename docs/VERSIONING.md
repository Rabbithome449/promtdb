# VERSIONING POLICY (promtdb)

## Scheme
- Semantic versioning: `MAJOR.MINOR.PATCH`
- Tag format:
  - Release candidate: `vMAJOR.MINOR.PATCH-rc.N`
  - Final release: `vMAJOR.MINOR.PATCH`

## Bump rules
- `PATCH`: bugfixes and small refactors
- `MINOR`: new features
- `MAJOR`: set explicitly by Tyan

## Branch and merge model
1. Implement on test branch (issue/feature/refactor naming rules stay unchanged).
2. After approval, merge into the **current RC branch** (not directly as a release).
3. RC accumulates approved changes.
4. When RC is approved as a whole, create final release from RC and tag it.

## RC lifecycle
- A new RC line is created when at least one included change requires a `MINOR` bump.
- RCs are versioned incrementally with `-rc.N` tags.
- Example:
  - Current release: `v0.5.2`
  - Next RC line (feature included): `v0.6.0-rc.1`, `v0.6.0-rc.2`, ...
  - Final after approval: `v0.6.0`

## Tagging commands
- RC tag:
  - `git tag -a vX.Y.Z-rc.N -m "RC vX.Y.Z-rc.N"`
  - `git push origin vX.Y.Z-rc.N`
- Release tag:
  - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
  - `git push origin vX.Y.Z`

## Operational note
- Deployments for testing can use RC/test branches.
- Production release deploys should use final release tags.

