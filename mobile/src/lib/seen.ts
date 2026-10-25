import AsyncStorage from '@react-native-async-storage/async-storage';

/** Cose già viste su questo telefono (recap guardati, presentazioni chiuse): servono solo a dare meno risalto. */
const KEY = 'runngo.seen.v1';
let cache: Set<string> | null = null;

export async function seenSet(): Promise<Set<string>> {
  if (cache) return cache;
  try {
    cache = new Set(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as string[]);
  } catch {
    cache = new Set();
  }
  return cache;
}

export async function markSeen(id: string): Promise<void> {
  const s = await seenSet();
  if (s.has(id)) return;
  s.add(id);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...s].slice(-300)));
  } catch {
    /* non essenziale */
  }
}
