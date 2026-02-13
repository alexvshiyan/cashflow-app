# CODEx Tasks (MVP)

## 1. Upload page + upload API (multipart)
Status: DONE

Acceptance Criteria:
- `/upload` page exists with a multipart form that allows selecting a CSV file.
- `POST /api/upload-csv` accepts multipart form data with `file`.
- API validates file presence and CSV extension.
- API returns success JSON with basic metadata (`filename`, `size`, `rowCount`) for valid CSV uploads.

Definition of Done:
- Endpoint and page are implemented and committed in the repo.
- Manual verification confirms `/upload` loads and upload request succeeds end-to-end.

## 2. Upload preview (first 20 rows + detected headers)
Status: TODO

Acceptance Criteria:
- After uploading a CSV, UI shows a preview table.
- Preview table displays detected headers.
- Preview table shows at most the first 20 parsed rows.
- If no headers are detected, UI shows a clear fallback (e.g., generated column names).
- Invalid or unreadable CSV surfaces a user-friendly error state.

Definition of Done:
- Upload flow transitions to preview state without page errors.
- Headers and up to 20 rows are rendered correctly for at least one representative sample CSV.
- Error and empty states are handled and manually verified.

## 3. Column mapping UI
Status: TODO

Acceptance Criteria:
- User can map CSV columns to required canonical fields: `Date`, `Amount`, `Description`, `BankCategory`.
- User can optionally map `AccountName`.
- UI prevents continuing until all required mappings are selected.
- UI detects and prevents duplicate assignment of the same CSV column to multiple required fields (unless explicitly allowed by design).
- Mapping choices are preserved in component state during the session.

Definition of Done:
- Mapping screen is reachable from preview step.
- Required validation is enforced in the UI.
- Mapping payload shape is ready for normalization step input.

## 4. Normalize parsed rows into canonical `Transaction` model (in memory)
Status: TODO

Acceptance Criteria:
- A canonical in-memory `Transaction` model is defined and used consistently.
- Parsed CSV rows plus mapping config are transformed into canonical transactions.
- Date and amount are normalized to predictable formats/types.
- Missing required mapped values are handled deterministically (skip with reason, or collect validation errors).
- No database writes are introduced in this step.

Definition of Done:
- Normalization function(s) produce canonical transaction objects from sample mapped input.
- Edge cases (invalid date/amount, blank lines) are handled per documented behavior.
- Output is consumable by downstream deduplication logic.

## 5. Implement deduplication strategy (hash key)
Status: TODO

Acceptance Criteria:
- A deterministic hash key is generated per normalized transaction using stable fields.
- Duplicate detection identifies repeated rows within a single upload batch.
- Dedup result clearly marks kept vs duplicate transactions.
- Hash logic is consistent regardless of row order and whitespace normalization.

Definition of Done:
- Dedup module/function exists and is integrated after normalization.
- At least one sample dataset with intentional duplicates confirms duplicates are detected.
- Hash key construction and dedup behavior are documented in code comments or task notes.
