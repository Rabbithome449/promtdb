# Feature Request: Category List Rework

- **Date:** 2026-04-20
- **Requested by:** Product/User feedback
- **Status:** Proposed
- **Priority:** Medium
- **Area:** Library UI (Category List)

## Summary
Rework the category list interaction model to make category management more compact, intuitive, and informative.

## Problem Statement
The current category list separates selection, edit, and delete actions in a way that feels fragmented.
Also, users cannot quickly see category usage volume at a glance.

## Requested Changes

### 1) Inline editing inside the category chip
- Keep editing in-place, but move the editable behavior directly into the category chip.
- Integrate the edit affordance (pencil icon) within the same chip interaction model.
- Replace the current delete button with a chip-typical close action (`x`).
- When deleting a category, show a confirmation dialog (popup) before applying deletion.

### 2) Phrase count badge per category
- Show the number of phrases currently assigned to each category.
- The count should be visible directly in the category item/chip.
- Count must update after create/edit/delete/import actions affecting phrase assignment.

## Acceptance Criteria
1. A category can be renamed inline directly from its chip.
2. Edit affordance is integrated in the chip UX (not as a disconnected control).
3. Category deletion is triggered via chip `x` and always asks for confirmation in a popup.
4. Each category displays an accurate phrase count.
5. Counts refresh immediately after phrase/category mutations.
6. No regression in existing category selection behavior.

## UX Notes
- Keep the chip layout compact and scannable.
- Count should be visually secondary but always readable.
- Destructive actions must remain clearly distinguishable.

## Technical Notes (suggested)
- Derive counts from `phrases` grouped by `category_id` (memoized map).
- Reuse existing modal/confirm pattern for deletion confirmation.
- Ensure keyboard support for inline rename (Enter to save, Escape to cancel).
