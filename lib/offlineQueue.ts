/**
 * Offline-first mutation queue runtime (blueprint 6.4). Pure rules live in features/offline/queue.ts.
 *
 * - The queue is persisted in MMKV (AsyncStorage fallback in Expo Go) so it survives app restarts.
 * - Each mutation has a client UUID; diary entries get their UUID on the device, so a replay after an
 *   ambiguous failure is idempotent (insert ... on conflict (id) do update, last-write-wins).
 * - Drains on: enqueue, network reconnect (expo-network), app foreground, and a manual "Sync now".
 */
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  classifyError,
  drain,
  enqueue,
  type MutationKind,
  type QueuedMutation,
} from '@/features/offline/queue';
import { queryClient } from './queryClient';
import { kv } from './storage';
import { supabase } from './supabase';

export interface DiaryUpsertPayload {
  id: string;
  user_id: string;
  tmdb_id: number;
  watched_on: string;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
  tags: string[];
  is_rewatch: boolean;
  liked: boolean;
  created_at: string;
  updated_at: string;
}

interface QueueState {
  queue: QueuedMutation[];
  syncing: boolean;
  online: boolean;
  lastSyncedAt: number | null;
  lastDropped: { kind: MutationKind; error?: string } | null;
}

export const useOfflineQueue = create<QueueState>()(
  persist(
    () => ({ queue: [], syncing: false, online: true, lastSyncedAt: null, lastDropped: null }) as QueueState,
    {
      name: 'reelo.offline-queue',
      storage: createJSONStorage(() => kv),
      partialize: (s) => ({ queue: s.queue, lastSyncedAt: s.lastSyncedAt }) as QueueState,
    },
  ),
);

export const newId = () => Crypto.randomUUID();

async function execute(m: QueuedMutation): Promise<{ outcome: 'ok' | 'transient' | 'permanent'; error?: string }> {
  try {
    let error: unknown = null;
    switch (m.kind) {
      case 'diary.upsert': {
        const p = m.payload as DiaryUpsertPayload;
        ({ error } = await supabase.rpc('upsert_diary_entry', {
          p_id: p.id,
          p_tmdb_id: p.tmdb_id,
          p_watched_on: p.watched_on,
          p_rating: p.rating,
          p_review: p.review,
          p_spoiler: p.spoiler,
          p_tags: p.tags,
          p_is_rewatch: p.is_rewatch,
          p_liked: p.liked,
          p_updated_at: p.updated_at,
        }));
        break;
      }
      case 'diary.delete':
        ({ error } = await supabase.from('diary_entries').delete().eq('id', (m.payload as { id: string }).id));
        break;
      case 'watchlist.add': {
        const p = m.payload as { tmdb_id: number; user_id: string };
        ({ error } = await supabase
          .from('watchlist')
          .upsert({ user_id: p.user_id, tmdb_id: p.tmdb_id }, { onConflict: 'user_id,tmdb_id', ignoreDuplicates: true }));
        break;
      }
      case 'watchlist.remove': {
        const p = m.payload as { tmdb_id: number; user_id: string };
        ({ error } = await supabase.from('watchlist').delete().eq('user_id', p.user_id).eq('tmdb_id', p.tmdb_id));
        break;
      }
    }
    if (!error) return { outcome: 'ok' };
    const outcome = classifyError(error);
    return { outcome: outcome === 'ok' ? 'transient' : outcome, error: (error as Error).message };
  } catch (err) {
    return { outcome: 'transient', error: err instanceof Error ? err.message : String(err) };
  }
}

let draining: Promise<void> | null = null;

export function syncNow(force = false): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    const { queue } = useOfflineQueue.getState();
    if (queue.length === 0) return;
    useOfflineQueue.setState((s) => ({
      syncing: true,
      // A forced sync (reconnect / foreground / "Sync now") ignores backoff timers.
      queue: force ? s.queue.map((m) => ({ ...m, nextAttemptAt: 0 })) : s.queue,
    }));
    const res = await drain(useOfflineQueue.getState().queue, execute, Date.now());
    // Merge with anything enqueued while we were draining.
    const handled = new Set([...res.processed, ...res.dropped].map((m) => m.id));
    const current = useOfflineQueue.getState().queue.filter((m) => !handled.has(m.id));
    const retried = new Map(res.queue.map((m) => [m.id, m]));
    useOfflineQueue.setState({
      queue: current.map((m) => retried.get(m.id) ?? m),
      syncing: false,
      lastSyncedAt: res.processed.length ? Date.now() : useOfflineQueue.getState().lastSyncedAt,
      lastDropped: res.dropped.length ? { kind: res.dropped[0].kind, error: res.dropped[0].lastError } : null,
    });
    if (res.processed.length || res.dropped.length) {
      queryClient.invalidateQueries({ queryKey: ['diary'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['filmStats'] });
    }
    if (res.stoppedOn && !force) {
      const delay = Math.max(1000, res.stoppedOn.nextAttemptAt - Date.now());
      setTimeout(() => syncNow(), delay);
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

export function enqueueMutation<P>(kind: MutationKind, entityKey: string, payload: P) {
  const m: QueuedMutation<P> = {
    id: newId(),
    kind,
    entityKey,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  useOfflineQueue.setState((s) => ({ queue: enqueue(s.queue as QueuedMutation<P>[], m) as QueuedMutation[] }));
  void syncNow();
}

let listening = false;

/** Start network + foreground listeners (root layout). */
export function startOfflineSync() {
  if (listening) return;
  listening = true;
  try {
    Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      useOfflineQueue.setState({ online });
      if (online) void syncNow(true);
    });
    Network.getNetworkStateAsync()
      .then((s) => useOfflineQueue.setState({ online: !!s.isConnected && s.isInternetReachable !== false }))
      .catch(() => {});
  } catch {
    // expo-network unavailable (tests/web): rely on foreground + manual sync.
  }
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncNow(true);
  });
  void syncNow(true);
}
