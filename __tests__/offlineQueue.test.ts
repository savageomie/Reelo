import {
  applyPendingDiary,
  backoffMs,
  classifyError,
  drain,
  enqueue,
  lastWriteWins,
  type QueuedMutation,
} from '@/features/offline/queue';

let seq = 0;
function mut(kind: QueuedMutation['kind'], entityKey: string, payload: unknown = {}, id?: string): QueuedMutation {
  seq += 1;
  return { id: id ?? `m${seq}`, kind, entityKey, payload, createdAt: seq, attempts: 0, nextAttemptAt: 0 };
}

describe('enqueue', () => {
  it('is idempotent on mutation id', () => {
    const m = mut('watchlist.add', 'watchlist:1', {}, 'same');
    const q = enqueue(enqueue([], m), { ...m });
    expect(q).toHaveLength(1);
  });

  it('collapses repeated edits to the same diary entry into one upsert (keeps position)', () => {
    let q = enqueue([], mut('diary.upsert', 'diary:e1', { rating: 3 }));
    q = enqueue(q, mut('watchlist.add', 'watchlist:9'));
    q = enqueue(q, mut('diary.upsert', 'diary:e1', { rating: 4.5 }));
    expect(q.map((x) => x.kind)).toEqual(['diary.upsert', 'watchlist.add']);
    expect(q[0].payload).toEqual({ rating: 4.5 });
  });

  it('does not collapse into an upsert that is already being retried', () => {
    const first = { ...mut('diary.upsert', 'diary:e1', { rating: 3 }), attempts: 1 };
    const q = enqueue([first], mut('diary.upsert', 'diary:e1', { rating: 4 }));
    expect(q).toHaveLength(2);
  });

  it('a delete drops pending upserts of the same entry', () => {
    let q = enqueue([], mut('diary.upsert', 'diary:e1'));
    q = enqueue(q, mut('diary.delete', 'diary:e1', { id: 'e1' }));
    expect(q.map((x) => x.kind)).toEqual(['diary.delete']);
  });

  it('watchlist add then remove cancel out', () => {
    let q = enqueue([], mut('watchlist.add', 'watchlist:5'));
    q = enqueue(q, mut('watchlist.remove', 'watchlist:5'));
    expect(q).toEqual([]);
  });
});

describe('drain', () => {
  it('replays in FIFO order and empties the queue on success', async () => {
    const seen: string[] = [];
    const q = [mut('diary.upsert', 'diary:a', {}, 'A'), mut('diary.upsert', 'diary:b', {}, 'B')];
    const r = await drain(q, async (m) => {
      seen.push(m.id);
      return { outcome: 'ok' };
    });
    expect(seen).toEqual(['A', 'B']);
    expect(r.queue).toEqual([]);
    expect(r.processed.map((m) => m.id)).toEqual(['A', 'B']);
  });

  it('stops on a transient failure so later mutations never overtake earlier ones', async () => {
    const q = [mut('diary.upsert', 'diary:a', {}, 'A'), mut('diary.upsert', 'diary:b', {}, 'B')];
    const seen: string[] = [];
    const r = await drain(
      q,
      async (m) => {
        seen.push(m.id);
        return { outcome: 'transient', error: 'Network request failed' };
      },
      1000,
    );
    expect(seen).toEqual(['A']);
    expect(r.queue.map((m) => m.id)).toEqual(['A', 'B']);
    expect(r.queue[0].attempts).toBe(1);
    expect(r.queue[0].nextAttemptAt).toBe(1000 + backoffMs(1));
  });

  it('respects backoff (does not retry before nextAttemptAt)', async () => {
    const waiting = { ...mut('diary.upsert', 'diary:a'), nextAttemptAt: 5000 };
    const exec = jest.fn();
    const r = await drain([waiting], exec, 4000);
    expect(exec).not.toHaveBeenCalled();
    expect(r.queue).toHaveLength(1);
  });

  it('drops permanent failures (e.g. RLS rejection) and continues', async () => {
    const q = [mut('diary.upsert', 'diary:a', {}, 'A'), mut('diary.upsert', 'diary:b', {}, 'B')];
    const r = await drain(q, async (m) => ({ outcome: m.id === 'A' ? 'permanent' : 'ok', error: 'denied' }));
    expect(r.dropped.map((m) => m.id)).toEqual(['A']);
    expect(r.processed.map((m) => m.id)).toEqual(['B']);
    expect(r.queue).toEqual([]);
  });

  it('replaying the same mutation twice is harmless when the server is idempotent', async () => {
    // Simulated server: upsert keyed by entry id with last-write-wins on updatedAt.
    const server = new Map<string, { id: string; rating: number; updatedAt: string }>();
    const exec = async (m: QueuedMutation) => {
      const p = m.payload as { id: string; rating: number; updatedAt: string };
      const cur = server.get(p.id);
      if (!cur || cur.updatedAt <= p.updatedAt) server.set(p.id, p);
      return { outcome: 'ok' as const };
    };
    const m = mut('diary.upsert', 'diary:e1', { id: 'e1', rating: 4, updatedAt: '2026-01-01T10:00:00Z' });
    await drain([m], exec);
    await drain([m], exec); // retry after an ambiguous network failure
    expect(server.size).toBe(1);
    expect(server.get('e1')?.rating).toBe(4);
  });
});

describe('backoffMs', () => {
  it('grows exponentially and caps at 60s', () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe('lastWriteWins', () => {
  it('keeps the newer write; ties keep the server copy', () => {
    const local = { updatedAt: '2026-05-02T00:00:00Z', v: 'local' };
    const remote = { updatedAt: '2026-05-01T00:00:00Z', v: 'remote' };
    expect(lastWriteWins(local, remote).v).toBe('local');
    expect(lastWriteWins(remote, local).v).toBe('local');
    expect(lastWriteWins({ ...local, v: 'l' }, { ...local, v: 'r' }).v).toBe('r');
  });
});

describe('classifyError', () => {
  it('treats network and 5xx as transient, validation/RLS as permanent', () => {
    expect(classifyError(new TypeError('Network request failed'))).toBe('transient');
    expect(classifyError({ status: 503, message: 'unavailable' })).toBe('transient');
    expect(classifyError({ status: 403, message: 'denied' })).toBe('permanent');
    expect(classifyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe('permanent');
    expect(classifyError({ code: 'P0001', message: 'rate_limited: slow down' })).toBe('transient');
    expect(classifyError(null)).toBe('ok');
  });
});

describe('applyPendingDiary', () => {
  it('overlays queued upserts and deletes on server data', () => {
    const server = [
      { id: 'a', rating: 3, updatedAt: '2026-01-01' },
      { id: 'b', rating: 2, updatedAt: '2026-01-01' },
    ];
    const queue = [
      mut('diary.upsert', 'diary:a', { id: 'a', rating: 5, updatedAt: '2026-02-01' }),
      mut('diary.upsert', 'diary:c', { id: 'c', rating: 4, updatedAt: '2026-02-01' }),
      mut('diary.delete', 'diary:b', { id: 'b' }),
    ];
    const out = applyPendingDiary(server, queue);
    expect(out.map((e) => [e.id, e.rating]).sort()).toEqual([
      ['a', 5],
      ['c', 4],
    ]);
  });
});
