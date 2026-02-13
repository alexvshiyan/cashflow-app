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

  const isParenNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const sanitized = trimmed.replace(/[,$]/g, "").replace(/^\(/, "").replace(/\)$/, "");
  const parsed = Number(sanitized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isParenNegative ? -parsed : parsed;
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value.trim()));
}

export default function UploadPage() {
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<MappingField, string>>({
    date: "",
    amount: "",
    description: "",
    bankCategory: "",
  });
  const latestRequestRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSelectedFileName(file?.name ?? null);
    setError(null);
    setPreview(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setError(null);
    setPreview(null);
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
  const canContinue = hasAllRequiredMappings && !hasDuplicateMappings;

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

      if (!isValidDate(dateValue)) {
        invalidDateRows.push(rowIndex + 1);
      }

      if (parseAmount(amountValue) === null) {
        invalidAmountRows.push(rowIndex + 1);
      }
    });

    return { invalidDateRows, invalidAmountRows };
  }, [columnMapping.amount, columnMapping.date, preview]);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Upload CSV</h1>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded border p-4"
      >
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
              disabled={!canContinue}
            >
              Continue to normalization
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
        </section>
      ) : null}
    </main>
  );
}
