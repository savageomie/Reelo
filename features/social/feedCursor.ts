/**
 * Cursor pagination for the activity feed (blueprint 6.5). The SQL side is public.get_feed.
 *
 * The cursor is the (created_at, id) of the last row already shown. The next page is
 * `WHERE (created_at, id) < (cursor.created_at, cursor.id) ORDER BY created_at DESC, id DESC`.
 * Unlike OFFSET pagination this (a) uses the index directly instead of scanning and discarding
 * N rows, and (b) never duplicates or skips rows when new events are inserted at the top while
 * the user scrolls (an OFFSET would shift by the number of new rows).
 */

export interface FeedKey {
  createdAt: string; // ISO timestamp
  id: string;
}

export function encodeCursor(key: FeedKey): string {
  return `${key.createdAt}|${key.id}`;
}

export function decodeCursor(cursor: string | null | undefined): FeedKey | null {
  if (!cursor) return null;
  const i = cursor.lastIndexOf('|');
  if (i <= 0 || i === cursor.length - 1) return null;
  const createdAt = cursor.slice(0, i);
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id: cursor.slice(i + 1) };
}

/** Descending order comparator on (createdAt, id): negative when a comes first. */
export function compareDesc(a: FeedKey, b: FeedKey): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Is `row` strictly after the cursor in feed order (i.e. belongs on a later page)? */
export function isAfterCursor(row: FeedKey, cursor: FeedKey): boolean {
  return compareDesc(row, cursor) > 0;
}

/** Cursor for the page after `page`, or null when there are no more rows. */
export function nextCursor<T extends FeedKey>(page: T[], limit: number): string | null {
  if (page.length < limit || page.length === 0) return null;
  return encodeCursor(page[page.length - 1]);
}

/** Reference implementation of get_feed's paging over an in-memory list (used in tests). */
export function pageAfter<T extends FeedKey>(rows: T[], cursor: string | null, limit: number): T[] {
  const key = decodeCursor(cursor);
  return [...rows]
    .sort(compareDesc)
    .filter((r) => (key ? isAfterCursor(r, key) : true))
    .slice(0, limit);
}

/** Flatten infinite-query pages, removing duplicates and keeping feed order. */
export function mergePages<T extends FeedKey>(pages: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out.sort(compareDesc);
}
