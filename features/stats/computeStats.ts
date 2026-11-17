/** Stats & Wrapped computations (pure). Input: diary entries + cached film metadata. */

export interface StatsEntry {
  tmdbId: number;
  watchedOn: string; // YYYY-MM-DD
  rating: number | null;
  liked?: boolean;
  isRewatch?: boolean;
  hasReview?: boolean;
}

export interface StatsFilm {
  title: string;
  year: number | null;
  runtime: number | null;
  genres: { id: number; name: string }[];
  directors: { id: number; name: string }[];
  cast: { id: number; name: string }[];
  posterPath?: string | null;
}

export interface Ranked {
  key: string;
  name: string;
  count: number;
}

export interface StatsSummary {
  year: number | null;
  totalLogs: number;
  uniqueFilms: number;
  rewatches: number;
  totalMinutes: number;
  hours: number;
  reviews: number;
  liked: number;
  averageRating: number | null;
  perMonth: number[]; // 12 buckets (Jan..Dec)
  ratingDistribution: number[]; // 10 buckets (0.5..5)
  genres: Ranked[];
  decades: Ranked[];
  topDirectors: Ranked[];
  topActors: Ranked[];
  heatmap: Record<string, number>;
  longestStreak: number;
  busiestMonth: number | null; // 0..11
  favouriteWeekday: number | null; // 0 = Sunday
  topRated: { tmdbId: number; rating: number }[];
}

function rank(map: Map<string, { name: string; count: number }>, limit: number): Ranked[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function bump(map: Map<string, { name: string; count: number }>, key: string, name: string) {
  const cur = map.get(key);
  if (cur) cur.count += 1;
  else map.set(key, { name, count: 1 });
}

function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map(dayIndex))].sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const d of days) {
    cur = prev !== null && d === prev + 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function computeStats(
  allEntries: StatsEntry[],
  films: Map<number, StatsFilm> | Record<number, StatsFilm>,
  year: number | null = null,
): StatsSummary {
  const getFilm = (id: number): StatsFilm | undefined =>
    films instanceof Map ? films.get(id) : (films as Record<number, StatsFilm>)[id];
  const entries = year == null ? allEntries : allEntries.filter((e) => e.watchedOn.startsWith(`${year}-`));

  const perMonth = new Array(12).fill(0);
  const ratingDistribution = new Array(10).fill(0);
  const weekday = new Array(7).fill(0);
  const genres = new Map<string, { name: string; count: number }>();
  const decades = new Map<string, { name: string; count: number }>();
  const directors = new Map<string, { name: string; count: number }>();
  const actors = new Map<string, { name: string; count: number }>();
  const heatmap: Record<string, number> = {};
  const unique = new Set<number>();
  let totalMinutes = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let rewatches = 0;
  let reviews = 0;
  let liked = 0;
  const bestRating = new Map<number, number>();

  for (const e of entries) {
    unique.add(e.tmdbId);
    perMonth[Number(e.watchedOn.slice(5, 7)) - 1] += 1;
    weekday[new Date(`${e.watchedOn}T12:00:00Z`).getUTCDay()] += 1;
    heatmap[e.watchedOn] = (heatmap[e.watchedOn] ?? 0) + 1;
    if (e.isRewatch) rewatches += 1;
    if (e.hasReview) reviews += 1;
    if (e.liked) liked += 1;
    if (e.rating != null) {
      ratingSum += e.rating;
      ratingCount += 1;
      ratingDistribution[Math.round(e.rating * 2) - 1] += 1;
      bestRating.set(e.tmdbId, Math.max(bestRating.get(e.tmdbId) ?? 0, e.rating));
    }
    const f = getFilm(e.tmdbId);
    if (!f) continue;
    totalMinutes += f.runtime ?? 0;
    for (const g of f.genres) bump(genres, String(g.id), g.name);
    if (f.year) {
      const dec = Math.floor(f.year / 10) * 10;
      bump(decades, String(dec), `${dec}s`);
    }
    for (const d of f.directors) bump(directors, String(d.id), d.name);
    for (const a of f.cast.slice(0, 5)) bump(actors, String(a.id), a.name);
  }

  const maxIdx = (arr: number[]) => {
    let best = -1;
    let idx: number | null = null;
    arr.forEach((v, i) => {
      if (v > best && v > 0) {
        best = v;
        idx = i;
      }
    });
    return idx;
  };

  return {
    year,
    totalLogs: entries.length,
    uniqueFilms: unique.size,
    rewatches,
    totalMinutes,
    hours: Math.round((totalMinutes / 60) * 10) / 10,
    reviews,
    liked,
    averageRating: ratingCount ? Math.round((ratingSum / ratingCount) * 100) / 100 : null,
    perMonth,
    ratingDistribution,
    genres: rank(genres, 8),
    decades: [...decades.entries()]
      .map(([key, v]) => ({ key, name: v.name, count: v.count }))
      .sort((a, b) => Number(a.key) - Number(b.key)),
    topDirectors: rank(directors, 5),
    topActors: rank(actors, 5),
    heatmap,
    longestStreak: longestStreak(entries.map((e) => e.watchedOn)),
    busiestMonth: maxIdx(perMonth),
    favouriteWeekday: maxIdx(weekday),
    topRated: [...bestRating.entries()]
      .map(([tmdbId, rating]) => ({ tmdbId, rating }))
      .sort((a, b) => b.rating - a.rating || a.tmdbId - b.tmdbId)
      .slice(0, 5),
  };
}

export interface HeatCell {
  date: string | null; // null = padding outside the year
  count: number;
}

/**
 * GitHub-style calendar grid for a year: array of week columns, each with 7 cells (Sun..Sat).
 */
export function heatmapGrid(year: number, counts: Record<string, number>): HeatCell[][] {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31);
  const firstDow = new Date(start).getUTCDay();
  const weeks: HeatCell[][] = [];
  let week: HeatCell[] = Array.from({ length: firstDow }, () => ({ date: null, count: 0 }));
  for (let t = start; t <= end; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    week.push({ date, count: counts[date] ?? 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push({ date: null, count: 0 });
    weeks.push(week);
  }
  return weeks;
}

/** Bucket a count into intensity 0..4 relative to the max. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
