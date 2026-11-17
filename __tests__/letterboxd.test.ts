import { bestMatch, detectKind, parseCsv, parseLetterboxd, uniqueTitles } from '@/supabase/functions/_shared/letterboxd';

const DIARY = [
  'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
  '2026-01-02,Inception,2010,https://boxd.it/a,4.5,,"imax, with friends",2026-01-01',
  '2026-02-10,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/b,4,Yes,,2026-02-09',
  '2026-03-01,Parasite,2019,https://boxd.it/c,,,,2026-03-01',
  ',,,,,,,',
].join('\r\n');

const REVIEWS = [
  'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
  '2026-04-01,Whiplash,2014,https://boxd.it/d,5,No,"Not quite my tempo.\nLine two with ""quotes"", and a comma.",,2026-03-30',
].join('\n');

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines inside fields, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ]);
  });
});

describe('parseLetterboxd', () => {
  it('parses diary.csv', () => {
    const out = parseLetterboxd(DIARY);
    expect(out.kind).toBe('diary');
    expect(out.rows).toHaveLength(3);
    expect(out.skipped).toBe(1); // the empty ',,,,' row
    expect(out.rows[0]).toMatchObject({ title: 'Inception', year: 2010, watchedOn: '2026-01-01', rating: 4.5, tags: ['imax', 'with friends'] });
    expect(out.rows[1]).toMatchObject({ title: 'Crouching Tiger, Hidden Dragon', rewatch: true });
    expect(out.rows[2].rating).toBeNull();
  });

  it('parses reviews.csv including multi-line reviews', () => {
    const out = parseLetterboxd(REVIEWS);
    expect(out.kind).toBe('reviews');
    expect(out.rows[0].review).toBe('Not quite my tempo.\nLine two with "quotes", and a comma.');
    expect(out.rows[0].watchedOn).toBe('2026-03-30');
  });

  it('parses ratings.csv and watchlist.csv', () => {
    expect(parseLetterboxd('Date,Name,Year,Letterboxd URI,Rating\n2025-05-05,Up,2009,u,3.5').rows[0]).toMatchObject({
      rating: 3.5,
      watchedOn: '2025-05-05',
    });
    const wl = parseLetterboxd('Date,Name,Year,Letterboxd URI\n2025-05-05,Dune,2021,u', 'watchlist');
    expect(wl.kind).toBe('watchlist');
    expect(wl.rows[0].title).toBe('Dune');
  });

  it('rejects files that are not Letterboxd exports', () => {
    expect(() => parseLetterboxd('foo,bar\n1,2')).toThrow(/Letterboxd/);
    expect(detectKind(['Title', 'Year'])).toBeNull();
  });

  it('dedupes titles for TMDB lookups', () => {
    const rows = parseLetterboxd(DIARY + '\r\n2026-05-01,Inception,2010,u,5,Yes,,2026-05-01').rows;
    expect(uniqueTitles(rows)).toHaveLength(3);
  });
});

describe('bestMatch', () => {
  const results = [
    { id: 1, title: 'Dune', release_date: '1984-12-14' },
    { id: 2, title: 'Dune', release_date: '2021-09-15' },
    { id: 3, title: 'Dune: Part Two', release_date: '2024-02-27' },
  ];
  it('prefers same title + exact year', () => {
    expect(bestMatch(results, 'Dune', 2021)).toBe(2);
    expect(bestMatch(results, 'Dune', 1984)).toBe(1);
  });
  it('accepts ±1 year (release date differences) and falls back sensibly', () => {
    expect(bestMatch(results, 'Dune', 2022)).toBe(2);
    expect(bestMatch(results, 'Dune', null)).toBe(1);
    expect(bestMatch([], 'X', 2000)).toBeNull();
    expect(bestMatch([{ id: 9, title: 'Something Else', release_date: '1990-01-01' }], 'Dune', 2021)).toBeNull();
  });
});
