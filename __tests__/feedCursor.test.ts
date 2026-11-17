import {
  compareDesc,
  decodeCursor,
  encodeCursor,
  mergePages,
  nextCursor,
  pageAfter,
  type FeedKey,
} from '@/features/social/feedCursor';

const row = (createdAt: string, id: string): FeedKey => ({ createdAt, id });

describe('cursor encoding', () => {
  it('round-trips', () => {
    const key = row('2026-11-17T10:00:00.000Z', '0b8f8a4e-7c1e-4a8e-9a37-8f3f0c1c2d3e');
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('rejects malformed cursors', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('not-a-date|abc')).toBeNull();
    expect(decodeCursor('2026-01-01T00:00:00Z|')).toBeNull();
  });
});

describe('ordering', () => {
  it('sorts newest first, then by id descending for equal timestamps', () => {
    const rows = [row('2026-01-01T00:00:00Z', 'a'), row('2026-01-02T00:00:00Z', 'b'), row('2026-01-01T00:00:00Z', 'c')];
    expect([...rows].sort(compareDesc).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('cursor pagination vs offset (worked example)', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 17, 12, min)).toISOString();
  const initial = [row(t(5), 'e5'), row(t(4), 'e4'), row(t(3), 'e3'), row(t(2), 'e2'), row(t(1), 'e1')];

  it('pages through without duplicates even when new events arrive at the top', () => {
    const page1 = pageAfter(initial, null, 2);
    expect(page1.map((r) => r.id)).toEqual(['e5', 'e4']);
    const cursor = nextCursor(page1, 2);

    // Two new events are inserted while the user is reading page 1.
    const live = [row(t(7), 'e7'), row(t(6), 'e6'), ...initial];

    const page2 = pageAfter(live, cursor, 2);
    expect(page2.map((r) => r.id)).toEqual(['e3', 'e2']);

    // OFFSET 2 on the live data would have returned e5, e4 again (duplicates).
    const offsetPage2 = [...live].sort(compareDesc).slice(2, 4).map((r) => r.id);
    expect(offsetPage2).toEqual(['e5', 'e4']);
  });

  it('handles identical timestamps via the id tie-breaker', () => {
    const same = [row(t(1), 'a'), row(t(1), 'b'), row(t(1), 'c')];
    const p1 = pageAfter(same, null, 2);
    const p2 = pageAfter(same, nextCursor(p1, 2), 2);
    expect([...p1, ...p2].map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('nextCursor is null on the last page', () => {
    expect(nextCursor([row(t(1), 'a')], 2)).toBeNull();
    expect(nextCursor([], 2)).toBeNull();
  });
});

describe('mergePages', () => {
  it('dedupes rows that appear in two pages', () => {
    const p1 = [row('2026-01-03T00:00:00Z', 'c'), row('2026-01-02T00:00:00Z', 'b')];
    const p2 = [row('2026-01-02T00:00:00Z', 'b'), row('2026-01-01T00:00:00Z', 'a')];
    expect(mergePages([p1, p2]).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('microsecond timestamps from Postgres', () => {
  it('orders rows that differ only in microseconds and never skips them', () => {
    const a = { createdAt: '2026-11-17T10:00:00.123400+00:00', id: 'a' };
    const b = { createdAt: '2026-11-17T10:00:00.123900+00:00', id: 'b' };
    expect(compareDesc(b, a)).toBeLessThan(0); // b is newer
    const page1 = pageAfter([a, b], null, 1);
    expect(page1.map((r) => r.id)).toEqual(['b']);
    expect(pageAfter([a, b], nextCursor(page1, 1), 1).map((r) => r.id)).toEqual(['a']);
  });
});
