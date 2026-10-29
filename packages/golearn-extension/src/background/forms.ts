/**
 * GoLearn Active asks the dictionary which of the words the course word list does not know are real words (2026-10-27,
 * docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md). The content script sends normalised forms (`golearn:confirm-forms`); the BACKGROUND
 * reads the language's slim forms index (`dict/<lang>/forms/`: form -> lemma and part of speech) and answers in one round trip.
 *
 * Where the index is read from is the gloss service's business, not this file's: `gloss.dictionaryAt` returns the location (the
 * learner's dictionary address, then the extension's own `app/`, then the hosted copy named in `app/config.json`) and the caching
 * shard fetch, so the forms shards persist in `chrome.storage.local` beside the gloss shards and work offline once read. This file
 * holds no address. It never throws to the content script: every failure is a `reason` and an empty (or partial) map.
 */
import { createFormsSource, FORMS_DIR, FORMS_MANIFEST } from '../../../../src/dict/forms';
import { MAX_CONFIRM_FORMS, cleanText, isLanguageId, type ConfirmFormsReply } from '../protocol';
import type { LanguageCode } from '../../../../src/core';
import { retryEndings, splitCompounds } from './compounds';
import type { GlossService, ShardFetch } from './gloss';

type FormsSource = ReturnType<typeof createFormsSource>;
type Reason = NonNullable<ConfirmFormsReply['reason']>;

export interface FormsServiceOptions {
  /** The gloss service's location search (`dictionaryAt`). */
  gloss: Pick<GlossService, 'dictionaryAt'>;
  /** Tests substitute the source factory. */
  createSource?: typeof createFormsSource;
}

const MAX_FORM_CHARS = 80;
const NONE = (reason: Reason): ConfirmFormsReply => ({ ok: true, forms: Object.create(null) as ConfirmFormsReply['forms'], reason });

export function createFormsService(opts: FormsServiceOptions) {
  const make = opts.createSource ?? createFormsSource;
  const sources = new Map<string, FormsSource>();
  /** An index known to be absent at a location (a 404 manifest is remembered for the worker's lifetime; a failed request is not). */
  const missing = new Set<string>();

  async function confirm(raw: unknown): Promise<ConfirmFormsReply> {
    const r = (raw ?? {}) as { languageId?: unknown; forms?: unknown };
    if (!isLanguageId(r.languageId) || !Array.isArray(r.forms)) return { ...NONE('no-pack'), ok: false };
    const languageId = r.languageId;
    const asked = [...new Set(r.forms.slice(0, MAX_CONFIRM_FORMS * 2).map((f) => cleanText(f, MAX_FORM_CHARS)).filter((f): f is string => !!f))].slice(0, MAX_CONFIRM_FORMS);
    if (!asked.length) return { ok: true, forms: Object.create(null) as ConfirmFormsReply['forms'] };
    try {
      const where = await opts.gloss.dictionaryAt(languageId);
      if (!where.ok) return NONE(where.reason);
      // `rel` is `dict/<lang>`: the source appends `/<lang>/forms/` itself, so it is given the folder that holds the language folders
      const rel = where.rel.replace(/\/+$/, '');
      if (!rel.endsWith(`/${languageId}`)) return NONE('no-pack');
      const root = `${where.base.replace(/\/+$/, '')}/${rel.slice(0, -(languageId.length + 1))}`;
      const key = `${languageId}@${root}`;
      if (missing.has(key)) return { ...NONE('no-index'), source: where.source };

      // is there an index at all, and can its location be reached? (the manifest is cached by the shard fetch once read, so the source's own read is free)
      const probe = await probeManifest(where.fetch, `${root}/${languageId}/${FORMS_DIR}/${FORMS_MANIFEST}`);
      if (probe === 'missing') { missing.add(key); return { ...NONE('no-index'), source: where.source }; }
      if (probe === 'offline') return { ...NONE('offline'), source: where.source };

      let source = sources.get(key);
      if (!source) { source = make(languageId as LanguageCode, { fetch: where.fetch, base: root }); sources.set(key, source); }
      const failuresBefore = where.fetch.failures;
      const found = await source.lookupForms(asked);
      const out = Object.create(null) as ConfirmFormsReply['forms'];
      for (const f of asked) {
        const row = found.get(f)?.[0];
        out[f] = row && typeof row.lemma === 'string' && row.lemma ? [row.lemma, typeof row.pos === 'string' && row.pos ? row.pos : null] : null;
      }
      // German only, and only for forms the index lacks as a whole: an inflected adjective, participle or dative plural is the remainder's lemma
      // (compounds.ts `retryEndings`, one extra call), and what is still missing is tried as a compound of words the index has (`splitCompounds`)
      const unanswered = new Set<string>();
      if (languageId === 'de' && where.fetch.failures === failuresBefore) {
        const src = source;
        const lookup = (parts: string[]) => src.lookupForms(parts);
        let missing = asked.filter((f) => !out[f]);
        if (missing.length) {
          const ended = await retryEndings(missing, lookup);
          for (const [f, row] of ended) out[f] = [row[0], row[1] || null];
          missing = missing.filter((f) => !out[f]);
        }
        if (missing.length) {
          const split = await splitCompounds(missing, lookup);
          for (const [f, row] of split.found) out[f] = [row[0], row[1] || null];
          for (const f of split.unanswered) unanswered.add(f);
        }
      }
      // a shard that could not be fetched makes its forms "unknown", not "absent": the page keeps the hits and asks the rest again later
      if (where.fetch.failures > failuresBefore) {
        const hits = Object.create(null) as ConfirmFormsReply['forms'];
        for (const f of asked) if (out[f]) hits[f] = out[f];
        return { ok: true, forms: hits, source: where.source, reason: 'offline' };
      }
      // a form the compound budget did not reach is neither found nor absent: it is left out of the reply, and the page asks again
      for (const f of unanswered) delete out[f];
      return { ok: true, forms: out, source: where.source };
    } catch {
      return NONE('offline');
    }
  }

  return { confirm };
}

export type FormsService = ReturnType<typeof createFormsService>;

/** 'ok' when the forms manifest can be read (cached by the shard fetch), 'missing' on a 404/410, 'offline' otherwise (a thrown fetch, a 5xx, anything else not ok). */
async function probeManifest(fetchShard: ShardFetch, url: string): Promise<'ok' | 'missing' | 'offline'> {
  try {
    const res = await fetchShard(url);
    if (res.ok) return 'ok';
    return res.status === 404 || res.status === 410 ? 'missing' : 'offline';
  } catch { return 'offline'; }
}
