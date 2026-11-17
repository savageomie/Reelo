/** Diary grouping & date helpers. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface Dated {
  watchedOn: string; // YYYY-MM-DD
}

export interface MonthSection<T> {
  key: string; // YYYY-MM
  title: string; // "November 2026"
  data: T[];
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Group entries by month, newest month first, entries newest first within a month. */
export function groupByMonth<T extends Dated>(entries: T[]): MonthSection<T>[] {
  const map = new Map<string, T[]>();
  for (const e of [...entries].sort((a, b) => (a.watchedOn < b.watchedOn ? 1 : a.watchedOn > b.watchedOn ? -1 : 0))) {
    const k = monthKey(e.watchedOn);
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, data]) => ({ key, title: monthTitle(key), data }));
}

/** Flatten sections for FlashList: header rows interleaved with items. */
export type SectionRow<T> = { type: 'header'; key: string; title: string; count: number } | { type: 'item'; key: string; item: T };

export function flattenSections<T>(sections: MonthSection<T>[], keyOf: (t: T) => string): SectionRow<T>[] {
  const rows: SectionRow<T>[] = [];
  for (const s of sections) {
    rows.push({ type: 'header', key: `h-${s.key}`, title: s.title, count: s.data.length });
    for (const item of s.data) rows.push({ type: 'item', key: keyOf(item), item });
  }
  return rows;
}

/** Local date as YYYY-MM-DD (not UTC — a film watched at 11pm belongs to that day). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

export function shortWeekday(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return formatDate(iso.slice(0, 10));
}
