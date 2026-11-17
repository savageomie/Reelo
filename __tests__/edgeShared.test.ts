import { hslToHex, paletteFromPixels, rgbToHsl } from '@/supabase/functions/_shared/palette';
import {
  cacheKey,
  isStale,
  normaliseDetails,
  normaliseProviders,
  normaliseSummary,
  pickTrailer,
  yearOf,
} from '@/supabase/functions/_shared/tmdbNormalize';

describe('TMDB normalisers (edge function)', () => {
  const raw = {
    id: 27205,
    title: 'Inception',
    original_title: 'Inception',
    release_date: '2010-07-15',
    runtime: 148,
    overview: 'Dreams within dreams.',
    poster_path: '/p.jpg',
    backdrop_path: '/b.jpg',
    genres: [
      { id: 28, name: 'Action' },
      { id: 878, name: 'Science Fiction' },
    ],
    popularity: 80.5,
    vote_average: 8.4,
    credits: {
      cast: [
        { id: 2, name: 'Joseph Gordon-Levitt', character: 'Arthur', order: 1, profile_path: null },
        { id: 1, name: 'Leonardo DiCaprio', character: 'Cobb', order: 0, profile_path: '/l.jpg' },
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', profile_path: null },
        { id: 99, name: 'Hans Zimmer', job: 'Original Music Composer' },
      ],
    },
    videos: {
      results: [
        { site: 'YouTube', key: 'teaser', type: 'Teaser', official: true },
        { site: 'YouTube', key: 'trailer', type: 'Trailer', official: true },
        { site: 'Vimeo', key: 'nope', type: 'Trailer' },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          link: 'https://tmdb.org/watch',
          flatrate: [
            { provider_id: 2, provider_name: 'Prime Video', logo_path: '/a.png', display_priority: 2 },
            { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png', display_priority: 1 },
          ],
        },
      },
    },
  };

  it('normalises details into a films_cache row', () => {
    const row = normaliseDetails(raw, 'IN');
    expect(row).toMatchObject({ tmdb_id: 27205, title: 'Inception', year: 2010, runtime: 148, genre_ids: [28, 878], is_partial: false });
    expect(row.directors.map((d) => d.name)).toEqual(['Christopher Nolan']);
    expect(row.cast.map((c) => c.name)).toEqual(['Leonardo DiCaprio', 'Joseph Gordon-Levitt']);
    expect(row.trailer_key).toBe('trailer');
    expect(row.providers.flatrate.map((p) => p.name)).toEqual(['Netflix', 'Prime Video']);
  });

  it('handles a region with no providers', () => {
    expect(normaliseProviders(raw['watch/providers'], 'US')).toEqual({ region: 'US', link: null, flatrate: [], rent: [], buy: [] });
  });

  it('normalises list results', () => {
    expect(normaliseSummary({ id: 1, title: 'X', release_date: '', genre_ids: [18] })).toMatchObject({
      tmdb_id: 1,
      year: null,
      genre_ids: [18],
      poster_path: null,
    });
    expect(yearOf('1999-10-15')).toBe(1999);
  });

  it('only picks YouTube trailers or teasers', () => {
    expect(pickTrailer({ results: [{ site: 'YouTube', key: 'k', type: 'Featurette' }] })).toBeNull();
    expect(pickTrailer(undefined)).toBeNull();
  });

  it('decides when a cached film is stale', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    expect(isStale(null, now)).toBe(true);
    expect(isStale({ fetched_at: '2026-11-16T00:00:00Z', is_partial: false }, now)).toBe(false);
    expect(isStale({ fetched_at: '2026-11-16T00:00:00Z', is_partial: true }, now)).toBe(true);
    expect(isStale({ fetched_at: '2026-11-01T00:00:00Z', is_partial: false }, now)).toBe(true);
  });

  it('builds stable cache keys', () => {
    expect(cacheKey('search', { query: ' Dune ', page: 1 })).toBe(cacheKey('search', { page: 1, query: 'dune' }));
    expect(cacheKey('list', { kind: 'trending', region: undefined })).toBe('list?kind=trending');
  });
});

describe('poster palette', () => {
  it('converts colours', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#FF0000');
    const [h, s, l] = rgbToHsl(0, 0, 255);
    expect([Math.round(h), s, l]).toEqual([240, 1, 0.5]);
  });

  it('prefers a vivid colour over a large dark background', () => {
    const px: number[] = [];
    for (let i = 0; i < 900; i++) px.push(10, 10, 12, 255); // near-black background (ignored)
    for (let i = 0; i < 300; i++) px.push(120, 120, 120, 255); // grey
    for (let i = 0; i < 200; i++) px.push(230, 60, 40, 255); // vivid red-orange
    const p = paletteFromPixels(px);
    expect(p).not.toBeNull();
    const [h] = rgbToHsl(
      parseInt(p!.primary.slice(1, 3), 16),
      parseInt(p!.primary.slice(3, 5), 16),
      parseInt(p!.primary.slice(5, 7), 16),
    );
    expect(h).toBeLessThan(20);
    expect(p!.dark).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('returns null for empty or fully transparent images', () => {
    expect(paletteFromPixels([])).toBeNull();
    expect(paletteFromPixels([0, 0, 0, 0])).toBeNull();
  });
});
