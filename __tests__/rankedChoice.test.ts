import {
  ballotsFromVotes,
  bordaPoints,
  instantRunoff,
  normaliseBallots,
  tallySwipe,
} from '@/features/groups/rankedChoice';

// Picks in the order they were added to the pool.
const DUNE = 'a-dune';
const COCO = 'b-coco';
const UP = 'c-up';
const PICKS = [DUNE, COCO, UP];

describe('instantRunoff â€” worked example (viva)', () => {
  // 5 friends rank 3 films.
  const ballots = [
    [DUNE, COCO, UP], // Asha
    [DUNE, UP, COCO], // Ben
    [COCO, UP, DUNE], // Chen
    [UP, COCO, DUNE], // Dev
    [UP, COCO, DUNE], // Esha
  ];
  const result = instantRunoff(PICKS, ballots);

  it('round 1: counts first choices â€” nobody has a majority (needs > 2.5 of 5)', () => {
    expect(result.rounds[0].counts).toEqual({ [DUNE]: 2, [COCO]: 1, [UP]: 2 });
    expect(result.rounds[0].eliminated).toBe(COCO);
  });

  it("round 2: Coco's ballot transfers to its next choice (Up), which now has 3 of 5", () => {
    expect(result.rounds[1].counts).toEqual({ [DUNE]: 2, [UP]: 3 });
    expect(result.rounds[1].eliminated).toBeNull();
    expect(result.winner).toBe(UP);
  });

  it('computes Borda points used for tie-breaks (first = 3, second = 2, third = 1)', () => {
    expect(result.points).toEqual({ [DUNE]: 9, [COCO]: 10, [UP]: 11 });
  });
});

describe('instantRunoff â€” rules and tie-breaks', () => {
  it('wins outright in round one with a majority', () => {
    const r = instantRunoff(PICKS, [[DUNE], [DUNE], [COCO]]);
    expect(r.winner).toBe(DUNE);
    expect(r.rounds).toHaveLength(1);
  });

  it('elimination tie is broken by fewer total points', () => {
    // First choices: DUNE 2, COCO 1, UP 1. COCO and UP tie on 1 vote.
    // Points: COCO appears second on both DUNE ballots -> more points, so UP is eliminated.
    const r = instantRunoff(PICKS, [
      [DUNE, COCO, UP],
      [DUNE, COCO, UP],
      [COCO, UP, DUNE],
      [UP, DUNE, COCO],
    ]);
    expect(r.rounds[0].eliminated).toBe(UP);
    expect(r.winner).toBe(DUNE); // UP's ballot moves to DUNE: 3 of 4
  });

  it('full tie (votes and points) eliminates the most recently added pick', () => {
    const r = instantRunoff([DUNE, COCO], [
      [DUNE, COCO],
      [COCO, DUNE],
    ]);
    expect(r.rounds[0].eliminated).toBe(COCO);
    expect(r.winner).toBe(DUNE);
  });

  it('exhausted ballots do not count toward the majority threshold', () => {
    // Round 1: DUNE 2, COCO 1, UP 1 (4 ballots). COCO/UP tie on votes and points; UP was added last -> out.
    // The UP-only ballot is now exhausted, so DUNE's 2 of the remaining 3 is a majority.
    const r = instantRunoff(PICKS, [[DUNE], [DUNE], [COCO], [UP]]);
    expect(r.rounds[0].eliminated).toBe(UP);
    expect(r.rounds[1].counts).toEqual({ [DUNE]: 2, [COCO]: 1 });
    expect(r.winner).toBe(DUNE);
  });

  it('with no ballots the earliest added pick wins', () => {
    const r = instantRunoff(PICKS, []);
    expect(r.winner).toBe(DUNE);
  });

  it('handles no candidates', () => {
    expect(instantRunoff([], [[DUNE]])).toEqual({ winner: null, rounds: [], points: {} });
  });

  it('ignores unknown and duplicate picks on ballots', () => {
    expect(normaliseBallots(PICKS, [[DUNE, 'zzz', DUNE, UP]])).toEqual([[DUNE, UP]]);
  });

  it('always terminates with a single winner', () => {
    const many = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const ballots = Array.from({ length: 13 }, (_, v) => [...many].sort((a, b) => ((a.charCodeAt(1) * (v + 3)) % 7) - ((b.charCodeAt(1) * (v + 3)) % 7)));
    const r = instantRunoff(many, ballots);
    expect(many).toContain(r.winner);
    expect(r.rounds[r.rounds.length - 1].eliminated).toBeNull();
  });
});

describe('ballotsFromVotes', () => {
  it('orders each member ranks ascending and skips unranked rows', () => {
    const ballots = ballotsFromVotes([
      { userId: 'u1', pickId: UP, rank: 2 },
      { userId: 'u1', pickId: DUNE, rank: 1 },
      { userId: 'u2', pickId: COCO, rank: 1 },
      { userId: 'u2', pickId: UP, rank: null },
    ]);
    expect(ballots).toEqual([[DUNE, UP], [COCO]]);
  });
});

describe('bordaPoints', () => {
  it('gives N points for first place down to 1', () => {
    expect(bordaPoints(PICKS, [[UP, DUNE]])).toEqual({ [DUNE]: 2, [COCO]: 0, [UP]: 3 });
  });
});

describe('tallySwipe', () => {
  it('most yes votes wins; ties go to the earliest added pick', () => {
    const votes = [
      { userId: 'u1', pickId: COCO, value: 1 as const },
      { userId: 'u2', pickId: UP, value: 1 as const },
      { userId: 'u1', pickId: UP, value: 0 as const },
    ];
    const r = tallySwipe(PICKS, votes);
    expect(r.yes).toEqual({ [DUNE]: 0, [COCO]: 1, [UP]: 1 });
    expect(r.winner).toBe(COCO);
  });
});
