import { tastePersona } from '@/features/stats/persona';

describe('tastePersona', () => {
  it('names the persona from the top genre and rating style', () => {
    const p = tastePersona({
      totalLogs: 40,
      averageRating: 4.2,
      genres: [{ key: '878', name: 'Science Fiction', count: 12 }],
      decades: [{ key: '1960', name: '1960s', count: 2 }],
    });
    expect(p.name).toBe('The Star Gazer');
    expect(p.blurb).toContain('You love generously.');
    expect(p.blurb).toContain('classics');
  });

  it('handles an empty year and unknown genres', () => {
    expect(tastePersona({ totalLogs: 0, averageRating: null, genres: [], decades: [] }).name).toBe('The Fresh Start');
    expect(tastePersona({ totalLogs: 3, averageRating: 2.5, genres: [{ key: 'x', name: 'TV Movie', count: 3 }], decades: [] }).name).toBe(
      'The Eclectic',
    );
  });
});
