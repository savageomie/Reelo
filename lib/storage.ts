/**
 * Key-value storage used by the offline queue, Zustand persistence and the Supabase auth session.
 *
 * Preferred backend: MMKV (fast, synchronous, native). MMKV is NOT bundled in Expo Go, so when the
 * native module is missing we transparently fall back to AsyncStorage (which Expo Go ships).
 * In a development build or the APK, MMKV is used. See docs/DECISIONS.md (D-003).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KVStore {
  readonly backend: 'mmkv' | 'async-storage' | 'memory';
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type MMKVLike = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove?: (key: string) => boolean | void;
  delete?: (key: string) => void;
};

function tryCreateMMKV(): MMKVLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-mmkv');
    if (typeof mod.createMMKV === 'function') return mod.createMMKV({ id: 'reelo' });
    if (typeof mod.MMKV === 'function') return new mod.MMKV({ id: 'reelo' });
    return null;
  } catch {
    return null;
  }
}

export function createMemoryStore(): KVStore {
  const map = new Map<string, string>();
  return {
    backend: 'memory',
    async getItem(k) {
      return map.has(k) ? (map.get(k) as string) : null;
    },
    async setItem(k, v) {
      map.set(k, v);
    },
    async removeItem(k) {
      map.delete(k);
    },
  };
}

function createStore(): KVStore {
  if (process.env.NODE_ENV === 'test') return createMemoryStore();
  const mmkv = tryCreateMMKV();
  if (mmkv) {
    return {
      backend: 'mmkv',
      async getItem(k) {
        return mmkv.getString(k) ?? null;
      },
      async setItem(k, v) {
        mmkv.set(k, v);
      },
      async removeItem(k) {
        if (mmkv.remove) mmkv.remove(k);
        else mmkv.delete?.(k);
      },
    };
  }
  return {
    backend: 'async-storage',
    getItem: (k) => AsyncStorage.getItem(k),
    setItem: (k, v) => AsyncStorage.setItem(k, v),
    removeItem: (k) => AsyncStorage.removeItem(k),
  };
}

export const kv: KVStore = createStore();
