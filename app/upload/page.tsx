"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";

type UploadResponse = {
  ok: true;
  filename: string;
  size: number;
  headers: string[];
  rows: string[][];
  rowCount: number;
};

export default function UploadPage() {
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const latestRequestRef = useRef(0);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Upload CSV</h1>
      <form
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
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Preview (first 20 rows)</h2>
          <p className="text-sm text-zinc-600">
            File: {preview.filename} | Rows shown: {preview.rowCount}
          </p>
          <p className="text-sm">
            Detected headers: {preview.headers.join(", ")}
          </p>
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
        </section>
      ) : null}
    </main>
  );
}
