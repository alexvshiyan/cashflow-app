"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type UploadResponse = {
  ok: true;
  filename: string;
  size: number;
  headers: string[];
  rows: string[][];
  rowCount: number;
};

type MappingField = "date" | "amount" | "description" | "bankCategory";
type Institution = "boa" | "chase";
type AccountType = "checking" | "savings" | "credit_card";

type CanonicalTransaction = {
  institution: Institution;
  source: "csv";
  accountType: AccountType;
  postedDateISO: string;
  amountNumber: number;
  description: string;
  bankCategory?: string;
  source_ref?: string;
  fingerprint: string;
};

const mappingFieldLabels: Record<MappingField, string> = {
  date: "Date *",
  amount: "Amount *",
  description: "Description / Payee *",
  bankCategory: "Category (optional)",
};

const requiredMappingFields: MappingField[] = ["date", "amount", "description"];

function normalizeHeaderName(header: string): string {
  return header.trim().toLowerCase();
}

function guessColumn(headers: string[], candidates: string[]): string {
  return (
    headers.find((header) =>
      candidates.some((candidate) => normalizeHeaderName(header).includes(candidate)),
    ) ?? ""
  );
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isParenNegative = /^\(.*\)$/.test(trimmed);
  const sanitized = trimmed.replace(/[,$]/g, "").replace(/^\(/, "").replace(/\)$/, "");
  const parsed = Number(sanitized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isParenNegative ? -parsed : parsed;
}

function parseMDYDateToISO(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeDescription(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBeginningBalanceRow(description: string): boolean {
  return /beginning\s+balance/i.test(description.trim());
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function UploadPage() {
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [institution, setInstitution] = useState<Institution>("boa");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [columnMapping, setColumnMapping] = useState<Record<MappingField, string>>({
    date: "",
    amount: "",
    description: "",
    bankCategory: "",
  });
  const [normalizeResult, setNormalizeResult] = useState<{
    normalized_count: number;
    skipped_invalid_count: number;
    preview: CanonicalTransaction[];
  } | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const latestRequestRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSelectedFileName(file?.name ?? null);
    setError(null);
    setPreview(null);
    setNormalizeResult(null);
    setNormalizeError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setError(null);
    setPreview(null);
    setNormalizeResult(null);
    setNormalizeError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (latestRequestRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      setPreview(data as UploadResponse);
      setSelectedFileName((data as UploadResponse).filename);
      formRef.current?.reset();
    } catch {
      if (latestRequestRef.current !== requestId) {
        return;
      }
      setError("Upload failed");
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsSubmitting(false);
      }
    }
  }

  useEffect(() => {
    if (!preview) {
      setColumnMapping({
        date: "",
        amount: "",
        description: "",
        bankCategory: "",
      });
      return;
    }

    setColumnMapping({
      date: guessColumn(preview.headers, ["date", "posted"]),
      amount: guessColumn(preview.headers, ["amount", "amt", "debit", "credit"]),
      description: guessColumn(preview.headers, ["description", "payee", "memo", "merchant"]),
      bankCategory: guessColumn(preview.headers, ["category", "bankcategory", "type"]),
    });
  }, [preview]);

  const selectedColumns = Object.values(columnMapping).filter((value) => value.length > 0);
  const hasDuplicateMappings = new Set(selectedColumns).size !== selectedColumns.length;
  const hasAllRequiredMappings = requiredMappingFields.every(
    (field) => columnMapping[field].length > 0,
  );
  const canNormalize = hasAllRequiredMappings && !hasDuplicateMappings;

  const validationSummary = useMemo(() => {
    if (!preview || !columnMapping.date || !columnMapping.amount) {
      return { invalidDateRows: [] as number[], invalidAmountRows: [] as number[] };
    }

    const dateIndex = preview.headers.indexOf(columnMapping.date);
    const amountIndex = preview.headers.indexOf(columnMapping.amount);

    if (dateIndex === -1 || amountIndex === -1) {
      return { invalidDateRows: [] as number[], invalidAmountRows: [] as number[] };
    }

    const invalidDateRows: number[] = [];
    const invalidAmountRows: number[] = [];

    preview.rows.forEach((row, rowIndex) => {
      const dateValue = row[dateIndex] ?? "";
      const amountValue = row[amountIndex] ?? "";
      const descriptionIndex =
        columnMapping.description.length > 0 ? preview.headers.indexOf(columnMapping.description) : -1;
      const descriptionValue = descriptionIndex >= 0 ? (row[descriptionIndex] ?? "") : "";

      if (isBeginningBalanceRow(descriptionValue)) {
        return;
      }

      if (!parseMDYDateToISO(dateValue)) {
        invalidDateRows.push(rowIndex + 1);
      }

      if (parseAmount(amountValue) === null) {
        invalidAmountRows.push(rowIndex + 1);
      }
    });

    return { invalidDateRows, invalidAmountRows };
  }, [columnMapping.amount, columnMapping.date, columnMapping.description, preview]);

  const mappingPayload = {
    required: {
      Date: columnMapping.date,
      Amount: columnMapping.amount,
      Description: columnMapping.description,
    },
    optional: {
      BankCategory: columnMapping.bankCategory,
    },
  };

  async function handleNormalize() {
    if (!preview || !canNormalize) {
      return;
    }

    setNormalizeError(null);

    try {
      const dateIndex = preview.headers.indexOf(columnMapping.date);
      const amountIndex = preview.headers.indexOf(columnMapping.amount);
      const descriptionIndex = preview.headers.indexOf(columnMapping.description);
      const categoryIndex = columnMapping.bankCategory
        ? preview.headers.indexOf(columnMapping.bankCategory)
        : -1;
      const sourceRefIndex =
        institution === "boa" && accountType === "credit_card"
          ? preview.headers.findIndex((header) => normalizeHeaderName(header) === "reference number")
          : -1;

      if (dateIndex < 0 || amountIndex < 0 || descriptionIndex < 0) {
        setNormalizeError("Invalid mapping selection.");
        return;
      }

      const userId = "mvp-user";
      const accountId = `${institution}-${accountType}`;

      const canonical: CanonicalTransaction[] = [];
      let skippedInvalidCount = 0;

      for (const row of preview.rows) {
        const amountRaw = row[amountIndex] ?? "";
        const descriptionRaw = (row[descriptionIndex] ?? "").trim();

        if (!amountRaw.trim() || isBeginningBalanceRow(descriptionRaw)) {
          skippedInvalidCount += 1;
          continue;
        }

        const postedDateISO = parseMDYDateToISO(row[dateIndex] ?? "");
        const amountNumber = parseAmount(amountRaw);

        if (!postedDateISO || amountNumber === null || !descriptionRaw) {
          skippedInvalidCount += 1;
          continue;
        }

        const normalizedDescription = normalizeDescription(descriptionRaw);
        const fingerprintInput =
          userId + accountId + postedDateISO + String(amountNumber) + normalizedDescription;
        const fingerprint = await sha256Hex(fingerprintInput);

        const tx: CanonicalTransaction = {
          institution,
          source: "csv",
          accountType,
          postedDateISO,
          amountNumber,
          description: descriptionRaw,
          fingerprint,
        };

        const bankCategoryValue = categoryIndex >= 0 ? (row[categoryIndex] ?? "").trim() : "";
        if (bankCategoryValue) {
          tx.bankCategory = bankCategoryValue;
        }

        const sourceRefValue = sourceRefIndex >= 0 ? (row[sourceRefIndex] ?? "").trim() : "";
        if (sourceRefValue) {
          tx.source_ref = sourceRefValue;
        }

        canonical.push(tx);
      }

      setNormalizeResult({
        normalized_count: canonical.length,
        skipped_invalid_count: skippedInvalidCount,
        preview: canonical.slice(0, 10),
      });
    } catch {
      setNormalizeError("Normalization failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Upload CSV</h1>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded border p-4"
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm">Institution</span>
          <select
            className="rounded border px-2 py-2"
            value={institution}
            onChange={(event) => setInstitution(event.target.value as Institution)}
          >
            <option value="boa">Bank of America</option>
            <option value="chase">Chase</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm">Account type</span>
          <select
            className="rounded border px-2 py-2"
            value={accountType}
            onChange={(event) => setAccountType(event.target.value as AccountType)}
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit_card">Credit card</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm">CSV file</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            required
          />
        </label>
        <button
          type="submit"
          className="w-fit rounded bg-black px-4 py-2 text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Uploading..." : "Upload"}
        </button>
        {isSubmitting ? (
          <p className="text-sm text-zinc-600" aria-live="polite">
            Uploading {selectedFileName ?? "file"}...
          </p>
        ) : null}
      </form>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {preview ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Preview (first 20 rows)</h2>
          <p className="text-sm text-zinc-600">
            File: {preview.filename} | Rows shown: {preview.rowCount}
          </p>
          <p className="text-sm">Detected headers: {preview.headers.join(", ")}</p>
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} className="border-b px-3 py-2 text-left">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.headers.map((_, colIndex) => (
                      <td key={colIndex} className="border-b px-3 py-2">
                        {row[colIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="rounded border p-4">
            <h3 className="mb-3 text-base font-medium">Column mapping</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(mappingFieldLabels) as MappingField[]).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span>{mappingFieldLabels[field]}</span>
                  <select
                    className="rounded border px-2 py-2"
                    value={columnMapping[field]}
                    onChange={(event) =>
                      setColumnMapping((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select CSV column</option>
                    {preview.headers.map((header) => (
                      <option key={`${field}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {!hasAllRequiredMappings ? (
              <p className="mt-3 text-sm text-red-700">
                Select all required mappings (Date, Amount, Description / Payee) to continue.
              </p>
            ) : null}
            {hasDuplicateMappings ? (
              <p className="mt-2 text-sm text-red-700">
                A CSV column can only be assigned to one mapping field.
              </p>
            ) : null}

            <button
              type="button"
              className="mt-4 rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canNormalize}
              onClick={handleNormalize}
            >
              Normalize
            </button>

            <p className="mt-3 text-xs text-zinc-600">Mapping payload (ready for normalization):</p>
            <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 text-xs">
              {JSON.stringify(mappingPayload, null, 2)}
            </pre>
          </section>

          <section className="rounded border p-4">
            <h3 className="text-base font-medium">Preview validation</h3>
            <ul className="mt-2 list-inside list-disc text-sm">
              <li>
                Invalid date rows: {validationSummary.invalidDateRows.length}
                {validationSummary.invalidDateRows.length > 0
                  ? ` (rows ${validationSummary.invalidDateRows.join(", ")})`
                  : ""}
              </li>
              <li>
                Invalid amount rows: {validationSummary.invalidAmountRows.length}
                {validationSummary.invalidAmountRows.length > 0
                  ? ` (rows ${validationSummary.invalidAmountRows.join(", ")})`
                  : ""}
              </li>
            </ul>
          </section>

          {normalizeError ? (
            <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {normalizeError}
            </p>
          ) : null}

          {normalizeResult ? (
            <section className="rounded border p-4">
              <h3 className="text-base font-medium">Normalization result</h3>
              <ul className="mt-2 list-inside list-disc text-sm">
                <li>normalized_count: {normalizeResult.normalized_count}</li>
                <li>skipped_invalid_count: {normalizeResult.skipped_invalid_count}</li>
              </ul>
              <p className="mt-3 text-xs text-zinc-600">Canonical preview (first 10):</p>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 text-xs">
                {JSON.stringify(normalizeResult.preview, null, 2)}
              </pre>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
