import { NextResponse } from "next/server";

type Institution = "boa" | "chase";
type AccountType = "checking" | "savings" | "credit_card";

type CsvPreview = {
  headers: string[];
  rows: string[][];
  detection: {
    institution: Institution;
    accountType: AccountType;
    accountId: string;
    accountName: string;
  };
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

function normalizeCell(value: string): string {
  return value.trim().toLowerCase();
}

function hasRequiredColumns(headers: string[]): boolean {
  const normalized = new Set(headers.map(normalizeCell));
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

function buildMetadataMap(linesBeforeHeader: string[]): Map<string, string> {
  const metadata = new Map<string, string>();

  for (const line of linesBeforeHeader) {
    const [key, ...rest] = parseCsvLine(line);
    const normalizedKey = normalizeCell(key ?? "");
    const value = rest.join(",").trim();

    if (normalizedKey && value) {
      metadata.set(normalizedKey, value);
    }
  }

  return metadata;
}

function detectInstitution(csvText: string, filename: string, metadata: Map<string, string>): Institution {
  const metadataText = Array.from(metadata.entries())
    .map(([key, value]) => `${key} ${value}`)
    .join(" ");
  const combined = `${csvText} ${filename} ${metadataText}`.toLowerCase();

  if (combined.includes("chase")) {
    return "chase";
  }

  return "boa";
}

function detectAccountType(headers: string[], metadata: Map<string, string>): AccountType {
  const normalizedHeaders = headers.map(normalizeCell);

  if (normalizedHeaders.includes("reference number") || metadata.has("card number")) {
    return "credit_card";
  }

  const accountLabel = normalizeCell(metadata.get("account type") ?? metadata.get("account") ?? "");
  if (accountLabel.includes("saving")) {
    return "savings";
  }

  return "checking";
}

function detectAccountNumber(metadata: Map<string, string>): string {
  return (
    metadata.get("account number") ??
    metadata.get("account #") ??
    metadata.get("card number") ??
    metadata.get("account") ??
    ""
  ).trim();
}

function detectAccountName(metadata: Map<string, string>, accountType: AccountType): string {
  const explicitName = (metadata.get("account name") ?? metadata.get("account") ?? "").trim();
  if (explicitName) {
    return explicitName;
  }

  if (accountType === "credit_card") {
    return "Credit card";
  }

  if (accountType === "savings") {
    return "Savings";
  }

  return "Checking";
}

function buildAccountId(institution: Institution, accountType: AccountType, accountNumber: string): string {
  const digitsOnly = accountNumber.replace(/\D/g, "");
  if (digitsOnly) {
    const suffix = digitsOnly.slice(-4);
    return `${institution}-${accountType}-${suffix}`;
  }

  return `${institution}-${accountType}`;
}

function parseCsvPreview(csvText: string, filename: string): CsvPreview {
  const lines = csvText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }

  const headerLineIndex = detectHeaderLineIndex(lines);
  const linesBeforeHeader = lines.slice(0, headerLineIndex);
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

  const metadata = buildMetadataMap(linesBeforeHeader);
  const institution = detectInstitution(csvText, filename, metadata);
  const accountType = detectAccountType(headers, metadata);
  const accountNumber = detectAccountNumber(metadata);

  return {
    headers,
    rows,
    detection: {
      institution,
      accountType,
      accountId: buildAccountId(institution, accountType, accountNumber),
      accountName: detectAccountName(metadata, accountType),
    },
  };
}

function runParserInlineTests() {
  const bofaLikeCsv = [
    "Account Number,123456789",
    "Statement Period,01/01/2026 - 01/31/2026",
    "Date,Description,Amount,Running Bal.",
    "01/02/2026,COFFEE SHOP,-5.75,994.25",
    "01/03/2026,PAYROLL,1200.00,2194.25",
  ].join("\n");

  const bofaPreview = parseCsvPreview(bofaLikeCsv, "boa-checking.csv");
  if (
    bofaPreview.headers[0] !== "Date" ||
    bofaPreview.headers[1] !== "Description" ||
    bofaPreview.rows[0]?.[1] !== "COFFEE SHOP" ||
    bofaPreview.detection.accountType !== "checking" ||
    bofaPreview.detection.accountId !== "boa-checking-6789"
  ) {
    throw new Error("Inline parser test failed for Date/Description/Amount");
  }

  const creditCardCsv = [
    "Card Number,****1234",
    "Date,Description,Amount,Reference Number",
    "01/01/2026,ONLINE PURCHASE,-10.00,ABC123",
  ].join("\n");
  const creditCardPreview = parseCsvPreview(creditCardCsv, "boa-credit.csv");
  if (creditCardPreview.detection.accountType !== "credit_card") {
    throw new Error("Inline parser test failed for credit card detection");
  }

  const postedDateCsv = [
    "Report Generated,2026-02-13",
    "Posted Date,Payee,Amount",
    "02/01/2026,UTILITY BILL,-89.21",
  ].join("\n");
  const postedDatePreview = parseCsvPreview(postedDateCsv, "chase.csv");
  if (
    postedDatePreview.headers[0] !== "Posted Date" ||
    postedDatePreview.headers[1] !== "Payee" ||
    postedDatePreview.detection.institution !== "chase"
  ) {
    throw new Error("Inline parser test failed for Posted Date/Payee/Amount");
  }

  let threwNoHeader = false;
  try {
    parseCsvPreview("foo,bar\n1,2", "bad.csv");
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
    const preview = parseCsvPreview(text, file.name);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      size: file.size,
      headers: preview.headers,
      rows: preview.rows,
      rowCount: preview.rows.length,
      detection: preview.detection,
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
