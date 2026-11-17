/**
 * Offline mutation queue — pure logic (blueprint 6.4). The runtime wrapper that persists the queue
 * and talks to Supabase lives in lib/offlineQueue.ts.
 *
 * Idempotency: every mutation carries a client-generated UUID (`id`), and the entity it touches is
 * addressed by a client-generated id too (e.g. the diary entry's UUID). Replaying a mutation twice
 * is therefore harmless: diary upserts are `insert ... on conflict (id) do update`, deletes by id
 * are no-ops the second time, watchlist add/remove are keyed by (user, film).
 *
 * Ordering: mutations replay strictly in FIFO order; a transient failure stops the drain so later
 * mutations never overtake earlier ones. Conflicts resolve last-write-wins on `updatedAt`
 * (enforced server-side by upsert_diary_entry's WHERE clause, and locally by `lastWriteWins`).
 */

export type MutationKind = 'diary.upsert' | 'diary.delete' | 'watchlist.add' | 'watchlist.remove';

export interface QueuedMutation<P = unknown> {
  id: string;
  kind: MutationKind;
  /** Entity the mutation applies to, e.g. `diary:<uuid>` or `watchlist:<tmdbId>`. */
  entityKey: string;
  payload: P;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

const OPPOSITES: Partial<Record<MutationKind, MutationKind>> = {
  'watchlist.add': 'watchlist.remove',
  'watchlist.remove': 'watchlist.add',
};

/**
 * Add a mutation. Rules:
 *  - same `id` already queued -> unchanged (idempotent enqueue)
 *  - diary.upsert for an entity with a pending, never-attempted diary.upsert -> replace it in place
 *  - diary.delete -> drops pending never-attempted upserts of that entity, then appends the delete
 *  - watchlist add/remove cancelling a pending, never-attempted opposite -> both disappear
 */
export function enqueue<P>(queue: QueuedMutation<P>[], m: QueuedMutation<P>): QueuedMutation<P>[] {
  if (queue.some((q) => q.id === m.id)) return queue;
  const untouched = (q: QueuedMutation<P>) => q.entityKey === m.entityKey && q.attempts === 0;

  if (m.kind === 'diary.upsert') {
    const idx = queue.findIndex((q) => untouched(q) && q.kind === 'diary.upsert');
    if (idx >= 0) {
      const next = [...queue];
      next[idx] = { ...m, createdAt: queue[idx].createdAt };
      return next;
    }
  }
  if (m.kind === 'diary.delete') {
    return [...queue.filter((q) => !(untouched(q) && q.kind === 'diary.upsert')), m];
  }
  const opposite = OPPOSITES[m.kind];
  if (opposite) {
    const idx = queue.findIndex((q) => untouched(q) && q.kind === opposite);
    if (idx >= 0) return queue.filter((_, i) => i !== idx);
  }
  return [...queue, m];
}

/** Exponential backoff: 1s, 2s, 4s ... capped at 60s. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), 60_000);
}

export type ExecOutcome = 'ok' | 'transient' | 'permanent';

export interface DrainResult<P> {
  queue: QueuedMutation<P>[];
  processed: QueuedMutation<P>[];
  dropped: QueuedMutation<P>[];
  stoppedOn?: QueuedMutation<P>;
}

/**
 * Replay queued mutations in order. `exec` returns 'ok', 'transient' (network/5xx: keep and stop)
 * or 'permanent' (validation/RLS rejection: drop so the queue cannot jam forever).
 */
export async function drain<P>(
  queue: QueuedMutation<P>[],
  exec: (m: QueuedMutation<P>) => Promise<{ outcome: ExecOutcome; error?: string }>,
  now: number = Date.now(),
): Promise<DrainResult<P>> {
  const remaining = [...queue];
  const processed: QueuedMutation<P>[] = [];
  const dropped: QueuedMutation<P>[] = [];
  while (remaining.length > 0) {
    const head = remaining[0];
    if (head.nextAttemptAt > now) return { queue: remaining, processed, dropped, stoppedOn: head };
    const { outcome, error } = await exec(head);
    if (outcome === 'ok') {
      processed.push(remaining.shift() as QueuedMutation<P>);
    } else if (outcome === 'permanent') {
      dropped.push({ ...(remaining.shift() as QueuedMutation<P>), lastError: error });
    } else {
      const attempts = head.attempts + 1;
      remaining[0] = { ...head, attempts, nextAttemptAt: now + backoffMs(attempts), lastError: error };
      return { queue: remaining, processed, dropped, stoppedOn: remaining[0] };
    }
  }
  return { queue: remaining, processed, dropped };
}

/** Last-write-wins merge on updatedAt (ISO strings compare lexicographically). Ties keep remote. */
export function lastWriteWins<T extends { updatedAt: string }>(local: T, remote: T): T {
  return local.updatedAt > remote.updatedAt ? local : remote;
}

/** Classify a Supabase/PostgREST error for `drain`. */
export function classifyError(err: unknown): ExecOutcome {
  if (!err) return 'ok';
  const e = err as { status?: number; code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) return 'transient';
  if (e.message?.startsWith('rate_limited')) return 'transient';
  if (typeof e.status === 'number') return e.status >= 500 || e.status === 0 || e.status === 429 ? 'transient' : 'permanent';
  // Postgres error codes (class 23 = integrity, 42 = syntax/permission, P0001 = raised by us)
  if (e.code && /^(23|42|22|P0)/.test(e.code)) return 'permanent';
  return 'transient';
}

/** Overlay pending diary upserts/deletes on server data so the UI is optimistic while offline. */
export function applyPendingDiary<E extends { id: string; updatedAt?: string }>(
  serverEntries: E[],
  queue: QueuedMutation<unknown>[],
): E[] {
  const byId = new Map(serverEntries.map((e) => [e.id, e]));
  for (const m of queue) {
    if (m.kind === 'diary.upsert') {
      const p = m.payload as E;
      const existing = byId.get(p.id);
      if (!existing || !existing.updatedAt || !p.updatedAt || p.updatedAt >= existing.updatedAt) byId.set(p.id, p);
    } else if (m.kind === 'diary.delete') {
      byId.delete((m.payload as { id: string }).id);
    }
  }
  return [...byId.values()];
}
