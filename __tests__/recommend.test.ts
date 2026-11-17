import {
  becauseYouLoved,
  buildProfile,
  COLD_START_MIN,
  contentScores,
  cosine,
  filmVector,
  hybridRank,
  isLoved,
  normalise,
  type FilmFeatures,
} from '@/features/recs/recommend';

const film = (tmdbId: number, genreIds: number[], directorIds: number[], castIds: number[], year: number): FilmFeatures => ({
  tmdbId,
  genreIds,
  directorIds,
  castIds,
  year,
});

// Nolan films share director 525 and sci-fi/thriller genres.
const INCEPTION = film(27205, [28, 878, 53], [525], [6193, 24045], 2010);
const INTERSTELLAR = film(157336, [12, 18, 878], [525], [10297, 1813], 2014);
const TENET = film(577922, [28, 878, 53], [525], [1190668], 2020);
const MAMMA_MIA = film(11631, [35, 10402, 10749], [1], [5064], 2008);
const ARRIVAL = film(329865, [18, 878, 9648], [137427], [9273], 2016);

describe('content-based', () => {
  it('builds sparse vectors from genres, director, top cast and decade', () => {
    const v = filmVector(INCEPTION);
    expect(v.get('g:878')).toBe(1);
    expect(v.get('d:525')).toBe(1.5);
    expect(v.get('c:6193')).toBe(0.6);
    expect(v.get('y:2010')).toBe(0.5);
  });

  it('cosine similarity: same director + genres beats a musical', () => {
    expect(cosine(filmVector(INCEPTION), filmVector(TENET))).toBeGreaterThan(cosine(filmVector(INCEPTION), filmVector(MAMMA_MIA)));
    expect(cosine(filmVector(INCEPTION), filmVector(MAMMA_MIA))).toBe(0);
  });

  it('profile only uses loved films (>= 4 stars or hearted), weighting 5★ more', () => {
    expect(isLoved({ rating: 3.5 })).toBe(false);
    expect(isLoved({ rating: null, liked: true })).toBe(true);
    const profile = buildProfile([
      { film: INCEPTION, rating: 5 },
      { film: MAMMA_MIA, rating: 2 },
    ]);
    expect(profile.get('d:525')).toBe(1.5 * 2);
    expect(profile.has('g:10402')).toBe(false);
  });

  it('ranks unseen films by similarity to the profile (worked example)', () => {
    const profile = buildProfile([
      { film: INCEPTION, rating: 5 },
      { film: INTERSTELLAR, rating: 4.5 },
    ]);
    const ranked = contentScores(profile, [TENET, ARRIVAL, MAMMA_MIA, INCEPTION], new Set([27205, 157336]));
    expect(ranked.map((r) => r.tmdbId)).toEqual([577922, 329865]); // Tenet, then Arrival; Mamma Mia scores 0
  });

  it('"because you loved X" excludes the seed and seen films', () => {
    const r = becauseYouLoved(INCEPTION, [INCEPTION, TENET, ARRIVAL], new Set([329865]));
    expect(r.map((x) => x.tmdbId)).toEqual([577922]);
  });
});

describe('hybrid', () => {
  it('min-max normalises each source', () => {
    const n = normalise([
      { tmdbId: 1, score: 2 },
      { tmdbId: 2, score: 4 },
      { tmdbId: 3, score: 3 },
    ]);
    expect([n.get(1), n.get(2), n.get(3)]).toEqual([0, 1, 0.5]);
    expect(normalise([{ tmdbId: 9, score: 7 }]).get(9)).toBe(1);
  });

  it('blends collaborative, content and popularity with weights', () => {
    const out = hybridRank({
      collaborative: [
        { tmdbId: 1, score: 0.9 },
        { tmdbId: 2, score: 0.1 },
      ],
      content: [
        { tmdbId: 2, score: 0.8 },
        { tmdbId: 3, score: 0.2 },
      ],
      popularity: [
        { tmdbId: 3, score: 500 },
        { tmdbId: 4, score: 100 },
      ],
      ratedCount: 20,
      exclude: new Set([4]),
    });
    // 1: 0.5*1 = 0.5 ; 2: 0.5*0 + 0.35*1 = 0.35 ; 3: 0.35*0 + 0.15*1 = 0.15 ; 4 excluded
    expect(out.map((i) => i.tmdbId)).toEqual([1, 2, 3]);
    expect(out[0].score).toBeCloseTo(0.5);
    expect(out[1].score).toBeCloseTo(0.35);
  });

  it('falls back to popularity for new users (cold start)', () => {
    const out = hybridRank({
      collaborative: [{ tmdbId: 1, score: 1 }],
      content: [],
      popularity: [
        { tmdbId: 7, score: 900 },
        { tmdbId: 8, score: 100 },
      ],
      ratedCount: COLD_START_MIN - 1,
      exclude: new Set(),
    });
    expect(out.map((i) => i.tmdbId)).toEqual([7]); // collaborative ignored; least popular normalises to 0
  });
});
