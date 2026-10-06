/// <reference types="node" />
/**
 * The real engine for the simulation (Node only): the app's own `bootstrap` over a memory store, for one course, with the built
 * library read from disk.
 *
 *   bootstrap({ store: memory, courseId, clock })   corpus + ladder units imported through the importer, Stage 0 (createStage0),
 *                                                   GoLearn (attached to the bus), the ladder path source (setLadderPathSource),
 *                                                   the course catalogue, GoListen (inert: no recording exists), the library
 *   content.ensureCourse(course)                    the same call the app makes before Home: bundle, catalogue, library index
 *   setWholeLibrarySource({ pager, profileOf })     the app's `library.search` / `library.profile` (what recommend.ts documents as the
 *                                                   registration; the app's bootstrap does not make it yet)
 *   openText(textId)                                the store's text, else `library.open(textId)`: a library text is imported when opened
 *
 * SUBSTITUTIONS (nothing else differs from the browser app):
 *   - an in-memory store instead of IndexedDB;
 *   - `globalThis.fetch` answers `/library/<lang>/…` from `public/library/<lang>/…` on disk (the built library the app would
 *     fetch), and `/dict/<lang>/…` from `public/dict` only with `dict: true` (otherwise 404, "no dictionary installed": the
 *     importer then analyses with the adapter alone, which is also what the learner's own lemma rule uses);
 *   - a simulated clock (every reading advances it a little; a jump of 45 minutes between texts ends each sitting);
 *   - no localStorage: every preference is at its default; preview mode is the `includeUnpublished` option of `recommend`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { COURSES } from '../core';
import type { LanguageCode } from '../core';
import { bootstrap } from '../app/bootstrap';
import { setLadderPathSource, setWholeLibrarySource } from '../golearn/recommend';
import { bundledLadder } from '../ladder/bundle';
import { createIndexedMemoryStore } from './store';
import type { Stage0ServiceImpl } from '../stage0';
import type { SimClock, SimEngine } from './types';

export function makeSimClock(start = '2026-10-06T08:00:00.000Z', stepMs = 200): SimClock {
  let t = Date.parse(start);
  return {
    now: () => new Date((t += stepMs)).toISOString(),
    jumpMinutes: (m) => { t += m * 60_000; },
  };
}

/** A fetch that serves `/library/…` (and `/dict/…` when allowed) from `<publicDir>`; anything else is a 404. */
export function diskFetch(publicDir: string, opts: { dict: boolean }): typeof fetch {
  const cache = new Map<string, string>();
  const CACHE_MAX = 4000;
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const url = raw.split('?')[0]!;
    const ok = url.startsWith('/library/') || (opts.dict && url.startsWith('/dict/'));
    if (!ok || url.includes('..')) return new Response('not found', { status: 404 });
    const file = path.join(publicDir, url);
    // the index and the per-text profiles are read again and again by the ranking: keep them. Documents (t/) are read once.
    const keep = !/\/t\//.test(url);
    const hit = cache.get(file);
    if (hit !== undefined) return new Response(hit, { status: 200 });
    try {
      const body = await fs.readFile(file, 'utf8');
      if (keep) { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string); cache.set(file, body); }
      return new Response(body, { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }) as typeof fetch;
}

export interface RealEngineOptions {
  lang: LanguageCode;
  /** The repository's `public` directory (default: ./public). */
  publicDir?: string;
  /** Serve the installed dictionary too (default: no). */
  dict?: boolean;
}

export interface RealEngine extends SimEngine {
  /** Restore fetch and unregister the sources this engine registered. */
  dispose(): void;
  /** Where the setup time went (ms). */
  setupMs: { bootstrap: number; ensureCourse: number };
}

export async function createRealEngine(opts: RealEngineOptions): Promise<RealEngine> {
  const { lang } = opts;
  const course = COURSES.find((c) => c.lang === lang);
  if (!course) throw new Error(`no course for ${lang}`);
  const publicDir = path.resolve(opts.publicDir ?? 'public');
  const realFetch = globalThis.fetch;
  globalThis.fetch = diskFetch(publicDir, { dict: opts.dict === true });
  const clock = makeSimClock();
  try {
    const store = createIndexedMemoryStore();
    const tB = Date.now();
    const boot = await bootstrap({ store, courseId: course.id, clock: clock.now, bundleLanguages: 'active' });
    const { services } = boot;
    if (!boot.user) throw new Error('bootstrap created no learner');
    const tE = Date.now();
    await services.content?.ensureCourse(course.id);
    const setupMs = { bootstrap: tE - tB, ensureCourse: Date.now() - tE };
    const userId = boot.user.id;
    setWholeLibrarySource({ pager: (q) => services.library.search(q), profileOf: (id) => services.library.profile(id) });

    const ladder = new Map<string, { unitId: string; stage: string; domain: string; kind: string }>();
    for (const u of bundledLadder(lang)?.units ?? []) if (u.textId) ladder.set(u.textId, { unitId: u.unit.id, stage: u.unit.stage, domain: u.unit.domain, kind: u.unit.kind });

    return {
      setupMs, lang, userId, store, bus: services.bus, adapters: services.adapters, clock,
      recommend: (o) => services.golearn.recommend(userId, { limit: o.limit, includeUnpublished: o.includeUnpublished }),
      openText: async (textId) => (await store.texts.get(textId)) ?? services.library.open(textId),
      profileOf: (textId) => services.library.profile(textId),
      stage0: services.stage0 as Stage0ServiceImpl,
      ladder,
      substitutions: [
        'In-memory store (indexed clone of createMemoryStore, same semantics) instead of IndexedDB.',
        `globalThis.fetch serves /library/${lang}/ from public/library on disk${opts.dict ? ' and /dict from public/dict' : '; no dictionary is installed in the import (404 on /dict), as in the learner\'s own adapter-lemma rule'}.`,
        'setWholeLibrarySource is registered here with the app\'s library.search / library.profile as the app\'s bootstrap does.',
        'Simulated clock: every reading advances 0.2 s; 45 minutes pass between texts (each text is its own sitting).',
        'No localStorage: preferences are defaults; preview mode is recommend(includeUnpublished).',
        'The Stage 0 exit verdict is the simulation\'s own (>= 80 % of Stage 0 lemmas known); no exit-gate answers are sent.',
        'No recordings exist, so no listening recommendation can be opened; any that appeared would be skipped.',
      ],
      dispose() {
        globalThis.fetch = realFetch;
        setWholeLibrarySource(undefined);
        setLadderPathSource(undefined);
      },
    };
  } catch (e) {
    globalThis.fetch = realFetch;
    throw e;
  }
}
