import { NextResponse } from "next/server";

type CsvPreview = {
  headers: string[];
  rows: string[][];
};

const HEADER_SETS: string[][] = [
  ["date", "description", "amount"],
  ["posted date", "payee", "amount"],
];

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field");
  }

  values.push(current);
  return values;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function hasRequiredColumns(headers: string[]): boolean {
  const normalized = new Set(headers.map(normalizeHeader));
  return HEADER_SETS.some((requiredSet) =>
    requiredSet.every((required) => normalized.has(required)),
  );
}

function detectHeaderLineIndex(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const columns = parseCsvLine(lines[index]);
    if (hasRequiredColumns(columns)) {
      return index;
    }
  }

  throw new Error(
    "No valid transactions header found. Expected columns like Date/Description/Amount or Posted Date/Payee/Amount.",
  );
}

function parseCsvPreview(csvText: string): CsvPreview {
  const lines = csvText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }

  const headerLineIndex = detectHeaderLineIndex(lines);
  const rawHeaders = parseCsvLine(lines[headerLineIndex]);
  const dataRows = lines.slice(headerLineIndex + 1).map(parseCsvLine);
  const maxColumns = Math.max(
    rawHeaders.length,
    ...dataRows.map((row) => row.length),
  );

  const headers = Array.from({ length: maxColumns }, (_, index) => {
    const value = rawHeaders[index]?.trim();
    return value ? value : `Column ${index + 1}`;
  });

  const rows = dataRows.slice(0, 20).map((row) =>
    Array.from({ length: headers.length }, (_, index) => row[index] ?? ""),
  );

  return { headers, rows };
}

function runParserInlineTests() {
  const bofaLikeCsv = [
    "Account Number,123456789",
    "Statement Period,01/01/2026 - 01/31/2026",
    "Beginning Balance,1000.00",
    "Date,Description,Amount,Running Bal.",
    "01/02/2026,COFFEE SHOP,-5.75,994.25",
    "01/03/2026,PAYROLL,1200.00,2194.25",
  ].join("\n");

  const bofaPreview = parseCsvPreview(bofaLikeCsv);
  if (
    bofaPreview.headers[0] !== "Date" ||
    bofaPreview.headers[1] !== "Description" ||
    bofaPreview.rows[0]?.[1] !== "COFFEE SHOP"
  ) {
    throw new Error("Inline parser test failed for Date/Description/Amount");
  }

  const postedDateCsv = [
    "Report Generated,2026-02-13",
    "Posted Date,Payee,Amount",
    "02/01/2026,UTILITY BILL,-89.21",
  ].join("\n");
  const postedDatePreview = parseCsvPreview(postedDateCsv);
  if (
    postedDatePreview.headers[0] !== "Posted Date" ||
    postedDatePreview.headers[1] !== "Payee"
  ) {
    throw new Error("Inline parser test failed for Posted Date/Payee/Amount");
  }

  let threwNoHeader = false;
  try {
    parseCsvPreview("foo,bar\n1,2");
  } catch {
    threwNoHeader = true;
  }

  if (!threwNoHeader) {
    throw new Error("Inline parser test failed: expected no-header error");
  }
}

if (process.env.NODE_ENV !== "production") {
  runParserInlineTests();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only CSV files are allowed" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const preview = parseCsvPreview(text);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      size: file.size,
      headers: preview.headers,
      rows: preview.rows,
      rowCount: preview.rows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid or empty CSV file";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
