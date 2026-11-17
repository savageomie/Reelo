/**
 * Letterboxd export parser (pure; used by the import-letterboxd edge function and the app's preview).
 *
 * Letterboxd: Settings -> Import & Export -> Export your data gives a zip with, among others:
 *   diary.csv     Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
 *   reviews.csv   Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
 *   ratings.csv   Date,Name,Year,Letterboxd URI,Rating
 *   watched.csv   Date,Name,Year,Letterboxd URI
 *   watchlist.csv Date,Name,Year,Letterboxd URI
 */

export type LetterboxdKind = 'diary' | 'reviews' | 'ratings' | 'watched' | 'watchlist';

export interface LetterboxdRow {
  title: string;
  year: number | null;
  watchedOn: string | null; // YYYY-MM-DD
  rating: number | null; // 0.5..5
  rewatch: boolean;
  review: string | null;
  tags: string[];
  uri: string | null;
}

export interface ParsedExport {
  kind: LetterboxdKind;
  rows: LetterboxdRow[];
  skipped: number;
}

/** RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function detectKind(header: string[]): LetterboxdKind | null {
  const h = header.map((x) => x.trim().toLowerCase());
  if (!h.includes('name')) return null;
  if (h.includes('review')) return 'reviews';
  if (h.includes('watched date')) return 'diary';
  if (h.includes('rating')) return 'ratings';
  return 'watched'; // watched.csv and watchlist.csv share a header; the caller says which
}

function toDate(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toRating(v: string | undefined): number | null {
  const n = Number((v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

export function parseLetterboxd(text: string, hint?: 'watchlist'): ParsedExport {
  const table = parseCsv(text);
  if (table.length === 0) return { kind: hint ?? 'watched', rows: [], skipped: 0 };
  const header = table[0];
  const detected = detectKind(header);
  if (!detected) throw new Error('This does not look like a Letterboxd CSV export (no "Name" column).');
  const kind: LetterboxdKind = hint === 'watchlist' && detected === 'watched' ? 'watchlist' : detected;
  const col = (name: string) => header.findIndex((x) => x.trim().toLowerCase() === name);
  const iName = col('name');
  const iYear = col('year');
  const iDate = col('date');
  const iWatched = col('watched date');
  const iRating = col('rating');
  const iRewatch = col('rewatch');
  const iTags = col('tags');
  const iReview = col('review');
  const iUri = col('letterboxd uri');

  let skipped = 0;
  const rows: LetterboxdRow[] = [];
  for (const r of table.slice(1)) {
    const title = (r[iName] ?? '').trim();
    if (!title) {
      skipped++;
      continue;
    }
    const year = Number((r[iYear] ?? '').trim());
    rows.push({
      title: title.slice(0, 300),
      year: Number.isInteger(year) && year > 1870 ? year : null,
      // ratings.csv / watched.csv have no viewing date: the date it was logged is the best we have.
      watchedOn: kind === 'watchlist' ? null : (toDate(r[iWatched]) ?? toDate(r[iDate])),
      rating: iRating >= 0 ? toRating(r[iRating]) : null,
      rewatch: iRewatch >= 0 && (r[iRewatch] ?? '').trim().toLowerCase() === 'yes',
      review: iReview >= 0 ? (r[iReview] ?? '').trim().slice(0, 5000) || null : null,
      tags:
        iTags >= 0
          ? (r[iTags] ?? '')
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 10)
          : [],
      uri: iUri >= 0 ? (r[iUri] ?? '').trim() || null : null,
    });
  }
  return { kind, rows, skipped };
}

/** Unique (title, year) pairs to look up on TMDB. */
export function uniqueTitles(rows: LetterboxdRow[]): { title: string; year: number | null; key: string }[] {
  const seen = new Map<string, { title: string; year: number | null; key: string }>();
  for (const r of rows) {
    const key = `${r.title.toLowerCase()}|${r.year ?? ''}`;
    if (!seen.has(key)) seen.set(key, { title: r.title, year: r.year, key });
  }
  return [...seen.values()];
}

/** Choose the best TMDB search hit: exact year first, then ±1 year, then the first result. */
export function bestMatch(
  results: { id: number; title: string; release_date?: string; original_title?: string }[],
  title: string,
  year: number | null,
): number | null {
  if (!results.length) return null;
  const yr = (r: { release_date?: string }) => Number((r.release_date ?? '').slice(0, 4)) || null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = norm(title);
  const sameTitle = results.filter((r) => norm(r.title) === t || norm(r.original_title ?? '') === t);
  const pool = sameTitle.length ? sameTitle : results;
  if (year != null) {
    const exact = pool.find((r) => yr(r) === year);
    if (exact) return exact.id;
    const near = pool.find((r) => yr(r) != null && Math.abs((yr(r) as number) - year) <= 1);
    if (near) return near.id;
    if (!sameTitle.length) return null; // different title and wrong year: don't guess
  }
  return pool[0].id;
}
