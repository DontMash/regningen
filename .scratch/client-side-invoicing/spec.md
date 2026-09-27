# Client-side invoicing

## Goal

Implement the invoice generator in the root React/TanStack Start application. Keep the generic `regningen` application branding; do not embed real business identity, address, contact, tax, or payment details in source code or fixtures.

## Privacy and runtime boundary

The app may serve or pre-render a generic shell. Business profile, recipient, and invoice data must remain in the browser and must not be sent to a backend, analytics, or third-party data service. Calculations, profile persistence, and PDF generation run client-side. Offline use is not required.

Use TanStack Form for forms, TanStack Store for live client state, and TanStack Query to load and save the profile through a local repository (not a network API).

## Business profile

- One profile per browser installation; start blank and require setup before invoicing.
- Persist profile edits locally, including incomplete setup. Clearly report storage failures and do not claim data was saved when persistence fails.
- Required: business name, owner's name, street, postal code, town, IBAN, and at least one of German USt-IdNr. or Steuernummer.
- Optional: service description, phone, mobile, and whichever of USt-IdNr./Steuernummer is not supplied.
- Treat owner as the owner of the business, distinct from the business name.
- Keep USt-IdNr. and Steuernummer as distinct fields. Validate a supplied German USt-IdNr. as `DE` followed by nine digits. Do not put personal Steuer-ID values in either field.
- Accept checksum-valid IBANs from any country. This version is for Germany-based issuing businesses.
- Use separate profile inputs for street, postal code, and town. Omit absent optional details in PDFs.
- Provide a dedicated profile settings screen that is accessible after setup. If another tab changes the profile, profile-editing tabs must warn about conflicting edits. Invoice tabs should receive profile changes without reload and preserve entered invoice data.

## Local profile lifecycle

- Offer local JSON export/import and profile deletion. Backups are unencrypted; warn users that they contain sensitive information.
- Allow export and import of partial profiles. A partial profile does not unlock invoicing.
- A malformed import must not change the current profile. Confirm before replacing an existing profile.
- Confirm before deleting the profile. Keep an in-progress invoice in memory, but block PDF generation until a valid profile is restored. Downloaded PDFs are outside app storage and are unaffected.
- If browser storage fails, stop with a clear error.

## Invoice workflow

Support the following invoice workflow:

- Manually entered invoice number and date; optional subject.
- Recipient organization and/or person, plus street and postal code/town.
- Up to 16 described line items, with positive amounts entered gross in EUR.
- One 7% or 19% VAT rate per invoice; calculate gross, net, and tax in integer cents.
- Show totals and download a one-page PDF generated in the browser.
- Reject invalid required input and explain when configured content cannot fit on one page.
- Keep invoice form values only in the current page session: no draft persistence, invoice history, or invoice-number tracking. A page reload discards these values.
- Apply current profile details to the next PDF; already-downloaded PDFs do not change. Block PDF creation if the profile is incomplete, retaining the invoice form values in memory.
- No claim that the output guarantees compliance with all German invoicing or tax requirements.

## Verification scope

Tests should cover profile validation and identifier checks, invoice calculations/validation, local profile import/export and storage failures, and end-to-end setup, profile persistence, invoice entry, and PDF download. Test seams will be confirmed before writing tests.
