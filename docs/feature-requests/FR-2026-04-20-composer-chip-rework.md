# Feature Request: Composer Rework (Chip-based Positive/Negative Lists)

- **Date:** 2026-04-20
- **Requested by:** Product/User feedback
- **Status:** Proposed
- **Priority:** Medium
- **Area:** Composer UI (Positive/Negative phrase lists)

## Summary
Refactor the Composer phrase list UX to a cleaner, chip-based interaction model with drag-and-drop sorting/removal and simplified metadata visibility.

## Problem Statement
The current positive/negative list presentation is too dense and exposes controls/metadata that are not needed in the default flow. Users need a more direct, lightweight editing model.

## Requested Changes

### 1) Clean up phrase item presentation
- Remove **"important"** and **"recurring"** controls from the positive/negative lists for now.

### 2) Remove category display
- Do not show category labels in the positive/negative list items.

### 3) Remove LoRA display from list view
- Do not display LoRA info inline in the positive/negative list chips.

### 4) Represent phrases as chips with drag-and-drop behavior
- Render each phrase as a chip.
- Chips must be draggable for manual reordering.
- If a chip is dragged outside the list/drop-zone and released, treat this as removal from the list.

### 5) Show weight in-chip
- Display the phrase weight in parentheses directly in the chip text, e.g.:
  - `cinematic lighting (1.0)`

### 6) Chip click opens details popup
- Clicking a chip should open a popup/modal.
- In that popup, user can set/edit the phrase LoRA value.

### 7) Keep remove fallback in chip
- Include an `x` remove action on each chip as a backup to drag-out removal.

## Acceptance Criteria
1. Positive and negative sections render phrase entries as chips.
2. Chips can be reordered via drag-and-drop.
3. Dragging a chip outside the list removes it.
4. Each chip shows phrase text plus weight in parentheses.
5. Category, important, recurring, and inline LoRA indicators are not shown in list view.
6. Clicking a chip opens popup with LoRA input/edit.
7. Chip `x` reliably removes the phrase.
8. No regression in prompt generation output.

## UX Notes
- Keep chip spacing consistent and touch-friendly.
- Use clear hover/drag visual states.
- Removal by drag-out should have clear affordance/feedback to avoid accidental deletion.

## Technical Notes (suggested)
- Consider DnD with pointer events and explicit drop-zones for robust behavior.
- Keep source-of-truth in existing `positiveParts` / `negativeParts` arrays.
- Add a dedicated chip-details modal for focused per-phrase edits (LoRA now, extensible later).
- Preserve keyboard-accessible remove/edit actions.
