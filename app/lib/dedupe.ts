export type DedupableTransaction = {
  userId: string;
  accountId: string;
  institution: "boa" | "chase";
  source: "csv";
  source_ref?: string;
  fingerprint: string;
};

export type DedupResult<T extends DedupableTransaction> = {
  imported: T[];
  skippedDuplicates: T[];
  imported_count: number;
  skipped_duplicates_count: number;
};

function buildSourceRefKey(tx: DedupableTransaction): string | null {
  const sourceRef = tx.source_ref?.trim();
  if (!sourceRef) {
    return null;
  }

  return [tx.userId, tx.accountId, tx.institution, tx.source, sourceRef].join("|");
}

function buildFingerprintKey(tx: DedupableTransaction): string {
  return [tx.userId, tx.accountId, tx.fingerprint].join("|");
}

export function dedupeTransactions<T extends DedupableTransaction>(
  incoming: T[],
  persisted: T[],
): DedupResult<T> {
  const seenSourceRef = new Set<string>();
  const seenFingerprint = new Set<string>();

  for (const tx of persisted) {
    const sourceRefKey = buildSourceRefKey(tx);
    if (sourceRefKey) {
      seenSourceRef.add(sourceRefKey);
    }
    seenFingerprint.add(buildFingerprintKey(tx));
  }

  const imported: T[] = [];
  const skippedDuplicates: T[] = [];

  for (const tx of incoming) {
    const sourceRefKey = buildSourceRefKey(tx);
    const fingerprintKey = buildFingerprintKey(tx);

    const isDuplicateBySourceRef = sourceRefKey ? seenSourceRef.has(sourceRefKey) : false;
    const isDuplicateByFingerprint = seenFingerprint.has(fingerprintKey);

    if (isDuplicateBySourceRef || isDuplicateByFingerprint) {
      skippedDuplicates.push(tx);
      continue;
    }

    imported.push(tx);

    if (sourceRefKey) {
      seenSourceRef.add(sourceRefKey);
    }
    seenFingerprint.add(fingerprintKey);
  }

  return {
    imported,
    skippedDuplicates,
    imported_count: imported.length,
    skipped_duplicates_count: skippedDuplicates.length,
  };
}
