const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface TimestampCursor {
  createdAt: string;
  id: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function normalizePageSize(
  requested: number | undefined,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  maximumPageSize = MAX_PAGE_SIZE,
): number {
  if (!Number.isInteger(defaultPageSize) || defaultPageSize < 1) {
    throw new Error("The default page size must be a positive integer.");
  }

  if (!Number.isInteger(maximumPageSize) || maximumPageSize < defaultPageSize) {
    throw new Error("The maximum page size must be an integer at least as large as the default.");
  }

  if (requested === undefined) {
    return defaultPageSize;
  }

  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error("The requested page size must be a positive integer.");
  }

  return Math.min(requested, maximumPageSize);
}

export function encodeTimestampCursor(cursor: TimestampCursor): string {
  validateTimestampCursor(cursor);
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTimestampCursor(encodedCursor: string): TimestampCursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(encodedCursor, "base64url").toString("utf8"));
    validateTimestampCursor(value);
    return value;
  } catch (error) {
    throw new Error("Invalid pagination cursor.", { cause: error });
  }
}

export function buildCursorPage<T>(
  rows: readonly T[],
  pageSize: number,
  cursorFor: (item: T) => TimestampCursor,
): CursorPage<T> {
  const normalizedPageSize = normalizePageSize(pageSize, pageSize, pageSize);
  const hasNextPage = rows.length > normalizedPageSize;
  const items = rows.slice(0, normalizedPageSize);
  const finalItem = items.at(-1);

  return {
    items,
    nextCursor:
      hasNextPage && finalItem !== undefined ? encodeTimestampCursor(cursorFor(finalItem)) : null,
  };
}

function validateTimestampCursor(value: unknown): asserts value is TimestampCursor {
  if (typeof value !== "object" || value === null) {
    throw new Error("A cursor must be an object.");
  }

  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("createdAt") || !keys.includes("id")) {
    throw new Error("A cursor contains unexpected fields.");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !UUID_PATTERN.test(candidate.id)) {
    throw new Error("A cursor ID must be a UUID.");
  }

  if (typeof candidate.createdAt !== "string") {
    throw new Error("A cursor timestamp must be a string.");
  }

  const timestamp = new Date(candidate.createdAt);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== candidate.createdAt) {
    throw new Error("A cursor timestamp must be a canonical UTC ISO timestamp.");
  }
}
