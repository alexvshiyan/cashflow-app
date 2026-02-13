# CODEx Tasks (MVP)

Requirement baseline:
- Product requirements: `docs/PRD.md`
- Technical specification: `docs/SPEC.md`
- Any task acceptance criteria should be interpreted in alignment with these docs.


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
- Canonical identity fields are present for imported rows: `institution` (`boa|chase`), `source` (`csv`), `source_ref` (nullable), `fingerprint` (required), and include `user_id` in identity design for future multi-user support.
- Parsed CSV rows plus mapping config are transformed into canonical transactions.
- Date and amount are normalized to predictable formats/types.
- Missing required mapped values are handled deterministically (skip with reason, or collect validation errors).
- No database writes are introduced in this step.

Definition of Done:
- Normalization function(s) produce canonical transaction objects from sample mapped input.
- Edge cases (invalid date/amount, blank lines) are handled per documented behavior.
- Output is consumable by downstream deduplication and dedupe-on-insert logic.

## 5. Implement deduplication strategy (hash key)
Status: TODO

Acceptance Criteria:
- Source-ref-first dedupe rule: if `source_ref` exists, treat `(user_id, account_id, institution, source, source_ref)` as unique and skip duplicates on insert/import.
- A deterministic fingerprint is always generated using:
  - `hash(user_id + account_id + posted_date + amount + normalized_description)`.
- Fallback dedupe uniqueness is enforced on `(user_id, account_id, fingerprint)`.
- Duplicate detection identifies repeated rows within a single upload batch and against persisted rows.
- Import result returns stats: `imported_count` and `skipped_duplicates_count`.
- DB-level unique constraints exist for both dedupe keys.

Definition of Done:
- Dedup module/function exists and is integrated after normalization with dedupe-on-insert behavior.
- At least one sample dataset with intentional duplicates confirms duplicates are detected and skipped.
- Hash key construction, unique constraints, and import stats behavior are documented in code comments or task notes.
