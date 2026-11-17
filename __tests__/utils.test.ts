import { flattenSections, formatDate, groupByMonth, timeAgo, todayISO } from '@/features/diary/grouping';
import { histogramIndex, ratingFromPosition, snapRating, starFills, starsText } from '@/features/diary/rating';
import {
  normaliseTags,
  validateComment,
  validateEmail,
  validatePassword,
  validateReview,
  validateUsername,
} from '@/lib/validation';

describe('rating utils', () => {
  it('snaps to half stars within 0.5..5', () => {
    expect(snapRating(3.3)).toBe(3.5);
    expect(snapRating(3.2)).toBe(3);
    expect(snapRating(0.1)).toBe(0.5);
    expect(snapRating(9)).toBe(5);
    expect(snapRating(0)).toBeNull();
    expect(snapRating(null)).toBeNull();
    expect(snapRating(Number.NaN)).toBeNull();
  });

  it('maps a touch position to a rating (rounding up to the touched half)', () => {
    expect(ratingFromPosition(0, 200)).toBeNull();
    expect(ratingFromPosition(10, 200)).toBe(0.5);
    expect(ratingFromPosition(100, 200)).toBe(2.5);
    expect(ratingFromPosition(250, 200)).toBe(5);
    expect(ratingFromPosition(10, 0)).toBeNull();
  });

  it('renders text stars and fills', () => {
    expect(starsText(3.5)).toBe('★★★½');
    expect(starsText(5)).toBe('★★★★★');
    expect(starsText(null)).toBe('');
    expect(starFills(2.5)).toEqual(['full', 'full', 'half', 'empty', 'empty']);
  });

  it('indexes the 10-bucket histogram', () => {
    expect(histogramIndex(0.5)).toBe(0);
    expect(histogramIndex(5)).toBe(9);
    expect(histogramIndex(3.5)).toBe(6);
  });
});

describe('diary grouping', () => {
  const entries = [
    { id: 'a', watchedOn: '2026-10-05' },
    { id: 'b', watchedOn: '2026-11-02' },
    { id: 'c', watchedOn: '2026-11-15' },
    { id: 'd', watchedOn: '2025-12-31' },
  ];

  it('groups by month, newest first', () => {
    const sections = groupByMonth(entries);
    expect(sections.map((s) => s.title)).toEqual(['November 2026', 'October 2026', 'December 2025']);
    expect(sections[0].data.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('flattens to header + item rows for FlashList', () => {
    const rows = flattenSections(groupByMonth(entries), (e) => e.id);
    expect(rows[0]).toEqual({ type: 'header', key: 'h-2026-11', title: 'November 2026', count: 2 });
    expect(rows).toHaveLength(7);
  });

  it('formats dates and relative times', () => {
    expect(formatDate('2026-11-17')).toBe('17 Nov 2026');
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    const now = Date.parse('2026-11-17T12:00:00Z');
    expect(timeAgo('2026-11-17T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-17T09:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-11-14T12:00:00Z', now)).toBe('3d');
  });
});

describe('validation', () => {
  it('validates usernames', () => {
    expect(validateUsername('film_buff').ok).toBe(true);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('Has Caps').ok).toBe(false);
    expect(validateUsername('a'.repeat(21)).ok).toBe(false);
  });

  it('validates email, password, review and comment limits', () => {
    expect(validateEmail('a@b.co').ok).toBe(true);
    expect(validateEmail('nope').ok).toBe(false);
    expect(validatePassword('1234567').ok).toBe(false);
    expect(validateReview('x'.repeat(5000)).ok).toBe(true);
    expect(validateReview('x'.repeat(5001)).ok).toBe(false);
    expect(validateComment('   ').ok).toBe(false);
    expect(validateComment('nice').ok).toBe(true);
  });

  it('normalises tags', () => {
    expect(normaliseTags(' Cinema , IMAX,cinema, date night ')).toEqual(['cinema', 'imax', 'date-night']);
    expect(normaliseTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});
