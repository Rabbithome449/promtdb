# Feature Request: Category List V2 (Dynamic Scroll, Imported Toggle, Drag-and-Drop) + Phrase List Alignment

- **Date:** 2026-04-20
- **Requested by:** Product/User feedback
- **Status:** Proposed
- **Priority:** Medium
- **Area:** Library UI (Category card + Phrase card)

## Summary
Refine the category and phrase list UX in the Library tab with better layout behavior, an explicit imported-category toggle, and drag-and-drop sorting consistency.

## Problem Statement
The current list behavior and layout create visual friction and do not scale cleanly with varying category counts. Additionally, imported content should be opt-in visible instead of always present in the main category list.

## Requested Changes

### 1) Keep category list scrollable with dynamic card-height behavior
- The category list must remain scrollable.
- The visible list area height should adapt dynamically to the category card/container size.
- Avoid fixed-height behavior that breaks alignment with surrounding card layout.

### 2) Hide `imported` category from main list and add explicit show button
- Remove the `imported` category from the default category list rendering.
- Add a button at the top of the category card to explicitly show/access imported items.
- Imported visibility should be user-controlled (toggle/button behavior).

### 3) Make category list sortable via drag-and-drop
- Users must be able to reorder categories by drag-and-drop.
- Persist the updated order (e.g., via `sort_order` updates).
- Sorting should remain stable after reload.

### 4) Align phrase list UX in phrase card to category-list style
- Rework the phrase list in the phrase card to follow the same interaction/presentation style as the category list.
- Remove the phrase list header/title above that list section.

## Acceptance Criteria
1. Category list is scrollable and visually adapts to card height.
2. `imported` is not shown in default category list.
3. A top-level button in category card allows showing/accessing imported items.
4. Categories can be reordered with drag-and-drop and order persists.
5. Phrase list uses the same list style/pattern as category list.
6. Phrase list header/title is removed.
7. No regression in category selection, phrase editing, and existing import flow.

## UX Notes
- Keep interactions compact and consistent with current chip/card language.
- Provide clear drag affordance and target feedback.
- Imported toggle/button should be obvious but non-intrusive.

## Technical Notes (suggested)
- Use a shared sortable-list pattern/component for categories and phrases.
- Filter logic: default category list excludes normalized name `imported` unless toggle active.
- Persist category order in batch-friendly updates where possible.
- Prefer measured container layout for dynamic scroll-region sizing instead of brittle magic numbers.
