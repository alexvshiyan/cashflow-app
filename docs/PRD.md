# Cashflow App MVP PRD

## 1) Product vision
Build a web app that gives users a reliable, actionable view of near-term cashflow by combining:
- imported bank/credit card transactions (CSV import first),
- planned and recurring future transactions,
- alerts and simple decision support for avoiding low/negative balances.

The MVP prioritizes **upload/on-demand sync workflows** and **forecasting confidence** over fully automated institution connectivity.

## 2) MVP scope summary
### In scope
- Web app MVP.
- CSV import-first for **Chase** and **Bank of America**.
- Upload + on-demand sync model (user-triggered imports/refresh).
- 6-month forecast horizon.
- Global cashflow timeline with account filtering.
- Alerts for projected negative/low balances.
- Account support: checking, savings, credit cards.
- Credit cards represented as separate accounts with balances + transactions.
- Credit card payment planning with defaults + overrides.
- Planned transactions and recurring rules as top MVP priorities.
- Hierarchical user-defined categories (seed from BoA categories, user override allowed).
- Recurrence semantics captured via `RecFlag`.

### Out of scope (initial MVP)
- Full bank API aggregation / always-on sync.
- Complex investment modeling.
- Household multi-user collaboration.
- Advanced ML categorization.

## 3) Target users and jobs-to-be-done
- Individuals who need confidence they will not overdraw accounts.
- Users managing multiple checking/savings + credit cards.
- Users needing upcoming payment planning (especially credit card statements).

Primary jobs:
1. Import latest transactions quickly.
2. See expected cashflow over the next 6 months.
3. Detect periods of risk (negative/low balances).
4. Add/edit planned/recurring transactions to test scenarios.

## 4) Core user outcomes
- Understand projected balances by account and globally.
- Identify and resolve cashflow gaps before they happen.
- Keep categories organized in a way that matches personal budgeting mental models.

## 5) Functional requirements

### 5.1 Data ingestion: CSV import-first + on-demand sync
- Users can upload CSVs from Chase and Bank of America formats.
- Import workflow includes preview, column mapping, validation, and normalization.
- User can trigger sync/import on demand.
- Later imports should safely coexist with prior data (dedupe/version behavior defined in SPEC).

### 5.2 Forecasting
- Forecast horizon is fixed to the next **6 months** from current date.
- Forecast includes:
  - historical imported transactions (for baseline),
  - planned one-time future transactions,
  - recurring rules materialized into future occurrences,
  - credit card payment plans.

### 5.3 Cashflow views and filtering
- Global cashflow view across all accounts.
- Account-level filtering (single and multi-account selections).
- Ability to inspect timeline entries driving projected balance changes.

### 5.4 Alerts
- Alert when projected balance drops below zero (negative).
- Alert when projected balance drops below configurable low-balance threshold.
- Alerts visible in-app for forecast window.

### 5.5 Account model
- Supported account types: `checking`, `savings`, `credit_card`.
- Credit cards are independent accounts with:
  - current balance,
  - imported transactions,
  - planned payment transactions.

### 5.6 Credit card payment planning
- Default planned payment target is **statement balance**.
- User can override payment strategy:
  - fixed payment amount,
  - amortized promotional balance over **N months**.
- Scheduling support in MVP:
  - fixed calendar date is required now,
  - due-date-driven scheduling explicitly deferred (“later”).

### 5.7 Planned transactions + recurring rules (MVP priority)
- Users can create planned one-time transactions.
- Users can create recurring rules that generate future transactions.
- Planned and recurring flows are first-class in UI and forecast computations.

### 5.8 Categories
- Seed category taxonomy from Bank of America category set.
- Users can create hierarchical custom categories (parent/child).
- Users can override imported category assignments.

### 5.9 RecFlag meaning
`RecFlag` indicates recurrence behavior of a transaction/rule:
- `none`: non-recurring transaction.
- `planned_once`: one-time planned future transaction.
- `recurring_rule_instance`: occurrence generated from a recurring rule.
- `credit_payment_plan`: transaction created by credit card payment planning logic.

(Exact enum naming can vary in implementation if semantics remain equivalent.)

## 6) Non-functional requirements
- UX should keep import and forecast workflows understandable for non-technical users.
- Validation errors should be explicit and recoverable.
- Deterministic forecasting behavior given same inputs.
- MVP performance target: responsive timeline and forecast interactions for typical personal-finance data sizes.

## 7) Success criteria (MVP)
- User can import Chase/BoA CSV, map columns, and see normalized preview without blocking errors.
- User can create planned + recurring items and see them reflected in 6-month forecast.
- User can identify projected negative/low periods via alerts.
- User can plan credit card payments and observe effect on projected balances.
