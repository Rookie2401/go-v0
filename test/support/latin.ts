/**
 * The Latin analyser, when the adapter lane's file exists (src/adapters/la.ts, exporting the adapter whose `lang` is 'la').
 * `import.meta.glob` finds nothing when the file is absent, so a test that needs the real analyser can say
 * `describe.skipIf(!laAdapter)` instead of failing to import. Once the adapter ships, nothing here is skipped.
 */
import type { LanguageAdapter } from '../../src/core';

const modules = import.meta.glob('../../src/adapters/la.ts', { eager: true }) as Record<string, Record<string, unknown>>;

const isAdapter = (v: unknown): v is LanguageAdapter =>
  typeof v === 'object' && v !== null && (v as { lang?: unknown }).lang === 'la' && typeof (v as { tokenize?: unknown }).tokenize === 'function';

/** The real Latin adapter, or undefined while the adapter lane's file does not exist. */
export const laAdapter: LanguageAdapter | undefined = Object.values(modules).flatMap((m) => Object.values(m)).find(isAdapter);

/** True when the built Latin dictionary (public/dict/la/manifest.json) is on disk. */
export { laDictionaryOnDisk } from './latinDictionary';
