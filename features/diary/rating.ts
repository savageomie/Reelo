/** Half-star rating helpers (0.5 .. 5). */

export const MIN_RATING = 0.5;
export const MAX_RATING = 5;

/** Snap any number to the nearest half star in [0.5, 5]; null/NaN/<=0 -> null (no rating). */
export function snapRating(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  const snapped = Math.round(value * 2) / 2;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, snapped));
}

/** Map a touch x-position on a star row of `width` px to a half-star value. */
export function ratingFromPosition(x: number, width: number, stars = 5): number | null {
  if (width <= 0) return null;
  const clamped = Math.min(Math.max(x, 0), width);
  const raw = (clamped / width) * stars;
  if (raw <= 0.05) return null;
  return snapRating(Math.ceil(raw * 2) / 2);
}

/** Stars as text, e.g. 3.5 -> "★★★½". */
export function starsText(rating: number | null | undefined): string {
  const r = snapRating(rating);
  if (r == null) return '';
  const full = Math.floor(r);
  return '★'.repeat(full) + (r - full === 0.5 ? '½' : '');
}

/** For each of 5 stars: 'full' | 'half' | 'empty'. */
export function starFills(rating: number | null | undefined): ('full' | 'half' | 'empty')[] {
  const r = snapRating(rating) ?? 0;
  return [1, 2, 3, 4, 5].map((i) => (r >= i ? 'full' : r >= i - 0.5 ? 'half' : 'empty'));
}

export function ratingLabel(rating: number | null | undefined): string {
  const r = snapRating(rating);
  if (r == null) return 'No rating';
  return `${r} out of 5 stars`;
}

/** Histogram index (0..9) for a half-star rating. */
export function histogramIndex(rating: number): number {
  return Math.round((snapRating(rating) as number) * 2) - 1;
}
