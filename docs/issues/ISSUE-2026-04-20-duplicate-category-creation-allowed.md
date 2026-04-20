# Bug Report: Duplicate Category Creation Is Allowed

- **Date:** 2026-04-20
- **Status:** Open
- **Type:** Bug
- **Severity:** Medium
- **Suggested Labels:** `bug`, `library`, `validation`, `backend`, `frontend`
- **Area:** Library page, Category card

## Summary
The Library category form currently allows creating a category with a name that already exists.

## Expected Behavior
When a user tries to create a category with a duplicate name, creation should be rejected with a clear error message.

## Actual Behavior
A category with the same name can be created again, resulting in duplicate category entries.

## Steps to Reproduce
1. Open the Library tab.
2. In the category card, create a category (for example: `Portrait`).
3. Enter the same category name again.
4. Submit the form.

## Result
A second category with the same name is created.

## Impact
- Causes ambiguous category selection.
- Increases UI clutter and data inconsistency.
- Can lead to user confusion and accidental misclassification.

## Proposed Fix
1. **Backend validation (required):**
   - Enforce uniqueness for category names (case-insensitive, trimmed).
   - Return a conflict/validation error when duplicate is attempted.
2. **Frontend validation (recommended):**
   - Pre-check against loaded categories using normalized comparison.
   - Show a user-friendly inline error and prevent submit.
3. **Data model hardening (recommended):**
   - Add/confirm DB unique constraint on normalized category name.

## Acceptance Criteria
1. Duplicate category creation is rejected.
2. Error feedback is shown to the user in Library UI.
3. Validation works for case/whitespace variants (e.g., `Portrait`, ` portrait `, `PORTRAIT`).
4. Existing create flow works unchanged for valid unique names.
