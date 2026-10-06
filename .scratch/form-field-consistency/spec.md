# Consistent invoicing form fields

Status: agreed

## Scope

Improve the Invoice and Business Profile forms, using shared feature-level components composed from existing UI primitives. Do not modify `src/components/ui/` primitives. Preserve domain validation, persistence, PDF generation, and ordinary-field validation timing unless explicitly noted below.

## Acceptance criteria

1. The invoice date picker matches text inputs in background, border, height, padding, typography, and left alignment in light and dark themes. Retain the calendar icon and calendar selection behavior.
2. Required indicators reflect existing validation. Individually mandatory fields have a decorative `*` and accessible required status. Optional fields remain optional. Mark the required invoice date and VAT choice, and explain the asterisk convention.
3. Recipient identity is a required either/or group: “Unternehmen oder Name * — mindestens eine Angabe”. Do not imply that both inputs are individually mandatory.
4. Business Profile tax identifiers receive equivalent group-level indication: USt-IdNr. or Steuernummer, at least one. Neither input becomes individually mandatory. A supplied invalid VAT ID remains invalid even if a tax number is supplied.
5. Once either member of an either/or group is touched, show the missing-group error in the group's reserved error space. Associate that error with both controls accessibly. Preserve field-specific errors separately.
6. Reserve responsive space for inline errors in both forms, including existing Invoice Positions and the new-position fields. Existing messages must remain fully visible at supported desktop/mobile widths. Showing or clearing errors must not move fields, following rows, or adjacent controls. No truncation or clipping.
7. Mark description and gross amount as required per Invoice Position, including table headers and new-position labels; explain the per-position scope. Keep existing handling of entirely empty rows. At least one complete position remains necessary for an invoice.
8. New-position inputs are their own independent form. Ordinary typing/blur shows no errors before an add attempt. Clicking “Position hinzufügen” or pressing Enter in either input submits only this form, validates both inputs, and does not download the invoice PDF.
9. After a failed add attempt, update errors while the user corrects inputs. After successful addition, clear inputs and reset errors/submission state. Preserve the 16-position limit and new-invoice reset behavior. Empty or invalid new-position inputs do not block an otherwise-valid invoice download.
10. Existing-position editing retains its current touched/blur feedback; the submit-only rule applies only to new positions.

## Verification

Confirmed seams: existing page-level interaction tests for Invoice/Business Profile behavior and Playwright browser tests for date-picker appearance and layout stability.

Run the required package checks: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:coverage`, and `pnpm test:e2e`.

Review the finished changes against starting commit `e54c905ccac09df3819d978288159843c814a84f` on separate Standards and Spec axes. Commit the work to the current branch as requested.
