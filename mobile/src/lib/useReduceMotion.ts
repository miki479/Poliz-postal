import { useSyncExternalStore } from 'react';
import { getReduceMotion, subscribeReduceMotion } from './reduceMotion';

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, getReduceMotion, getReduceMotion);
}
