/**
 * Instant-runoff (ranked-choice) voting for Watch Together (blueprint 6.3).
 * Mirrored by public.tally_ranked_choice in SQL — keep both in sync.
 *
 * - candidates: pick ids in the order they were added to the pool (earliest first).
 * - ballots: one per member, pick ids from first choice to last (unranked picks omitted).
 *
 * Each round, every ballot counts for its highest-ranked pick still in the race.
 * If a pick holds a strict majority (> 50%) of the non-exhausted ballots, it wins.
 * Otherwise the pick with the fewest votes is eliminated. Ties for elimination are broken by
 * total Borda points (first choice = N points, second = N-1, ...) — fewer points goes out —
 * and then by recency: the most recently added pick goes out (earliest added survives).
 */

export type Ballot = string[];

export interface IrvRound {
  counts: Record<string, number>;
  eliminated: string | null;
}

export interface IrvResult {
  winner: string | null;
  rounds: IrvRound[];
  points: Record<string, number>;
}

/** Clean ballots: drop unknown candidates and repeated picks. */
export function normaliseBallots(candidates: string[], ballots: Ballot[]): Ballot[] {
  const known = new Set(candidates);
  return ballots.map((b) => {
    const seen = new Set<string>();
    return b.filter((id) => {
      if (!known.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });
}

export function bordaPoints(candidates: string[], ballots: Ballot[]): Record<string, number> {
  const n = candidates.length;
  const points: Record<string, number> = {};
  for (const c of candidates) points[c] = 0;
  for (const b of ballots) b.forEach((id, idx) => (points[id] += n - idx));
  return points;
}

export function instantRunoff(candidates: string[], rawBallots: Ballot[]): IrvResult {
  if (candidates.length === 0) return { winner: null, rounds: [], points: {} };
  const ballots = normaliseBallots(candidates, rawBallots);
  const points = bordaPoints(candidates, ballots);
  let active = [...candidates];
  const rounds: IrvRound[] = [];

  for (;;) {
    const counts: Record<string, number> = {};
    for (const c of active) counts[c] = 0;
    const activeSet = new Set(active);
    let total = 0;
    for (const b of ballots) {
      const top = b.find((id) => activeSet.has(id));
      if (top !== undefined) {
        counts[top] += 1;
        total += 1;
      }
    }

    let leader = active[0];
    for (const c of active) if (counts[c] > counts[leader]) leader = c;

    if ((total > 0 && counts[leader] * 2 > total) || active.length === 1) {
      rounds.push({ counts, eliminated: null });
      return { winner: leader, rounds, points };
    }

    // Iterate in added order using <= on ties so the most recently added tied pick is eliminated.
    let loser = active[0];
    for (const c of active) {
      if (
        counts[c] < counts[loser] ||
        (counts[c] === counts[loser] && points[c] <= points[loser])
      ) {
        loser = c;
      }
    }
    rounds.push({ counts, eliminated: loser });
    active = active.filter((c) => c !== loser);
  }
}

export interface RankVote {
  userId: string;
  pickId: string;
  rank: number | null;
}

/** Turn per-pick rank rows into ordered ballots (rank asc, then pick id — same as SQL). */
export function ballotsFromVotes(votes: RankVote[]): Ballot[] {
  const byUser = new Map<string, RankVote[]>();
  for (const v of votes) {
    if (v.rank == null) continue;
    const list = byUser.get(v.userId) ?? [];
    list.push(v);
    byUser.set(v.userId, list);
  }
  return [...byUser.values()].map((vs) =>
    vs
      .sort((a, b) => (a.rank as number) - (b.rank as number) || (a.pickId < b.pickId ? -1 : a.pickId > b.pickId ? 1 : 0))
      .map((v) => v.pickId),
  );
}

export interface SwipeVote {
  userId: string;
  pickId: string;
  value: 0 | 1 | null;
}

/** Swipe mode: most "yes" votes wins; ties -> earliest added. */
export function tallySwipe(candidates: string[], votes: SwipeVote[]) {
  const yes: Record<string, number> = {};
  for (const c of candidates) yes[c] = 0;
  for (const v of votes) if (v.value === 1 && v.pickId in yes) yes[v.pickId] += 1;
  let winner: string | null = candidates[0] ?? null;
  for (const c of candidates) if (winner !== null && yes[c] > yes[winner]) winner = c;
  return { winner, yes };
}
