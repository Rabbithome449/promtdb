# Feature Request: Pack Management and Coverage in Composer

- **Date:** 2026-04-20
- **Requested by:** Product/User feedback
- **Status:** Proposed
- **Priority:** Medium
- **Area:** Composer (Positive/Negative phrase workflow)

## Summary
Introduce reusable “packs” for Composer so users can save current positive/negative phrase sets, add packs via selection controls, and track pack coverage/progress directly in the UI.

## Problem Statement
Users currently have no first-class way to reuse and manage recurring phrase bundles as a single unit. This slows down composition, increases manual repetition, and makes it hard to see how complete a known pack is in the current prompt.

## Requested Changes

### 1) Save current positive/negative phrases as a pack
- Allow saving the current Composer state (positive + negative phrases) as a named pack.
- A pack should preserve phrase text and relevant metadata needed to re-apply it.

### 2) Add packs via dropdown + button (with duplicate replacement)
- Provide a dropdown to select an existing pack.
- Provide an explicit “Add pack” action/button.
- On add, duplicates must be handled automatically by replacement logic (existing duplicate phrases are replaced/merged rather than duplicated).

### 3) Pack usage/coverage indicator with quick actions
Show an indicator area below the positive/negative cards (chips or buttons) where each pack displays:
- Coverage percentage: how many phrases from that pack are already present in current composer state.
- Completed state: if all pack phrases are present, show a green checkmark.

Pack chip/button interactions:
- **Click on pack chip/button:** add all currently missing phrases from that pack.
- **`x` action:** remove the full pack contribution, or at minimum remove the currently used phrases that belong to that pack.

## Acceptance Criteria
1. User can save current positive/negative phrases as a named pack.
2. User can select a pack from dropdown and add it via button.
3. Duplicate phrases are not duplicated; replacement/merge behavior is applied automatically.
4. Pack indicator list is visible under composer positive/negative cards.
5. Each pack indicator shows a correct coverage percentage.
6. Fully covered packs show a green checkmark.
7. Clicking a pack indicator adds all missing phrases from that pack.
8. `x` on a pack removes that pack (or its currently used pack phrases) from composer.
9. No regression in prompt generation output.

## UX Notes
- Keep the pack indicators compact and scannable (chip style recommended).
- Coverage should update immediately on composer changes.
- Completed packs should be visually distinct (green check state).
- Removal action should be explicit and hard to trigger accidentally.

## Technical Notes (suggested)
- Define a stable pack schema with positive/negative arrays.
- Track pack membership/applications so “remove pack” can target only contributed phrases.
- Use normalized text keys for duplicate handling and coverage computation.
- Keep add/remove idempotent where possible.
