/**
 * Whether listening (GoListen) is switched on. The UI reads the flag from the app services, never the constant, so
 * tests can render either state; an app wired without `features` falls back to the product default.
 */
import { FEATURES } from '../../core';
import type { Features } from '../../core';
import { useApp } from '../context';

export function useListenEnabled(): boolean {
  const { features } = useApp() as ReturnType<typeof useApp> & { features?: Features };
  return features?.listen ?? FEATURES.listen;
}
