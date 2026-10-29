/**
 * The slim forms index (browser-safe: no node imports; the Node builder is scripts/build-forms-index.mts).
 *
 * The dictionary shards are heavy (German: 512 shards of ~350 kB). A page scanner only needs "is this form a word of the
 * language, and of which lemma?", so each language also gets a forms index: form -> lemma and part of speech, nothing else,
 * sharded small, served beside the dictionary.
 *
 * Rows come from the dictionary's entries (an inflected form points at its lemmas, a lemma at itself) and, after those, from the
 * inflection tables of the full records (`full/`), which carry the forms the entries lack (German "Klassenkämpfen").
 *
 * Files, next to the dictionary: `<dict>/<lang>/forms/manifest.json` and `f-<hex>.json`.
 *   manifest: { version: 1, lang, buckets, forms, lemmas, fromTables?, shardFiles, builtFrom }
 *   shard:    { [form]: Array<[lemma, pos | null]> }       (bucket = bucketOf(form, buckets); at most FORMS_MAX_ROWS rows)
 *
 * The keys are the adapter-normalized forms exactly as the dictionary shards key them (the index never normalizes: German
 * "Sklave" is asked as "sklave"). Rows keep the dictionary's order, so the first row is the dictionary's first reading.
 *
 * Runtime: createFormsSource(lang, { fetch?, base? }).lookupForms(["bisherigen"]) -> Map { "bisherigen" => [{ lemma: "bisherig", pos: "ADJ" }] }.
 * A language with no forms index (no manifest) answers an empty Map; a source never throws.
 */
import type { DictionaryEntry, LanguageCode, PartOfSpeech } from '../core';
import type { FullForm } from './full-format';
import { bucketOf } from './format';

export const FORMS_VERSION = 1;
/** Rows kept per form. */
export const FORMS_MAX_ROWS = 6;
/** Shards a source keeps parsed at once. */
export const FORMS_CACHE_SHARDS = 16;
/** The builder aims for an average shard under this many bytes raw, and keeps the biggest under FORMS_SHARD_MAX_BYTES. */
export const FORMS_SHARD_TARGET_BYTES = 200_000;
export const FORMS_SHARD_MAX_BYTES = 300_000;
export const FORMS_DIR = 'forms';
export const FORMS_MANIFEST = 'manifest.json';
export const FORMS_SHARD_FILE = /^f-[0-9a-f]{2,4}\.json$/;

/** One reading of a form as a shard stores it. */
export type FormsRow = [lemma: string, pos: string | null];

export interface FormsManifest {
  version: number;
  lang: LanguageCode;
  buckets: number;
  /** distinct forms in the index */
  forms: number;
  /** distinct lemma spellings the forms point at */
  lemmas: number;
  /** rows that came from inflection tables (0 or absent: the index is from the dictionary entries alone) */
  fromTables: number;
  shardFiles: string[];
  /** the id of the dictionary manifest this was built from */
  builtFrom: string;
}

/** What a lookup returns for a form. */
export interface FormsHit { lemma: string; pos?: PartOfSpeech }

export interface FormsSource {
  readonly lang: LanguageCode;
  /** The forms the index has, with their readings (dictionary order); forms it lacks are absent. Empty when there is no index. */
  lookupForms(forms: string[]): Promise<Map<string, FormsHit[]>>;
}

/** Shard file name: two hex digits for 256 buckets or fewer (the default), wider when the manifest has more (f-3ff.json for 1024). */
export function formsShardFile(bucket: number, buckets = 256): string {
  const width = Math.max(2, (buckets - 1).toString(16).length);
  return `f-${bucket.toString(16).padStart(width, '0')}.json`;
}

// -------------------------------------------------------------------------------------------------------------- builder

/** UTF-8 length of a string without allocating. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

export interface FormsFinish {
  buckets: number;
  /** each shard as JSON text, keyed by bucket; keys sorted */
  shards: Map<number, string>;
  forms: number;
  lemmas: number;
  /** rows that came from addTable */
  fromTables: number;
  /** total bytes of all shards */
  bytes: number;
  maxShardBytes: number;
}

export interface FormsBuilder {
  /** Add one dictionary entry (a lemma or an inflected form). Returns the rows it added to its form. */
  add(entry: DictionaryEntry): number;
  /** Add one inflection-table form (already normalized as the dictionary keys are) of a lemma; call after every add(entry). Returns 1 when it added a row. */
  addTable(form: string, lemma: string, pos: string | null): number;
  /** Distinct forms so far. */
  readonly size: number;
  /**
   * `buckets` defaults to the smallest power of two (at least 16) that brings the average shard under FORMS_SHARD_TARGET_BYTES,
   * doubled while the biggest shard is over FORMS_SHARD_MAX_BYTES (up to 4096). The builder is spent afterwards.
   */
  finish(buckets?: number): FormsFinish;
}

export function createFormsBuilder(): FormsBuilder {
  const byForm = new Map<string, FormsRow[]>();
  // The dictionary stores a form-of lemma in the normalized spelling ("klassenkampf"); the lemma's own entry keeps the written
  // one ("Klassenkampf"). The written spellings that differ from their key are remembered, by (key, pos) and by key alone, and
  // the form-of rows are put right when the index is finished (the lemma entry may come after the form in the shard order).
  const written = new Map<string, string>();
  const rememberWritten = (key: string, spelling: string) => { if (!written.has(key)) written.set(key, spelling); };
  const viaFormOf: FormsRow[] = [];
  let fromTables = 0;
  return {
    addTable(form, lemma, pos) {
      if (!form || !lemma) return 0;
      let rows = byForm.get(form);
      if (rows && (rows.length >= FORMS_MAX_ROWS || rows.some((r) => r[0] === lemma && r[1] === pos))) return 0;
      if (!rows) { rows = []; byForm.set(form, rows); }
      rows.push([lemma, pos]);
      fromTables++;
      return 1;
    },
    add(entry) {
      const pos = entry.pos ?? null;
      const isFormOf = !!entry.formOf?.length;
      if (!isFormOf && entry.written && entry.written !== entry.form) {
        rememberWritten(`${entry.form}\u0000${pos ?? ''}`, entry.written);
        rememberWritten(entry.form, entry.written);
      }
      const lemmas = isFormOf ? entry.formOf!.map((f) => f.lemma) : [entry.written ?? entry.form];
      let rows = byForm.get(entry.form);
      let n = 0;
      for (const lemma of lemmas) {
        if (!lemma) continue;
        if (rows && (rows.length >= FORMS_MAX_ROWS || rows.some((r) => r[0] === lemma && r[1] === pos))) continue;
        if (!rows) { rows = []; byForm.set(entry.form, rows); }
        const row: FormsRow = [lemma, pos];
        rows.push(row);
        if (isFormOf) viaFormOf.push(row);
        n++;
      }
      return n;
    },
    get size() { return byForm.size; },
    finish(buckets) {
      if (written.size) {
        for (const row of viaFormOf) row[0] = written.get(`${row[0]}\u0000${row[1] ?? ''}`) ?? written.get(row[0]) ?? row[0];
        for (const [form, rows] of byForm) {
          const seen = new Set<string>();
          const kept = rows.filter((r) => { const k = `${r[0]}\u0000${r[1] ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
          if (kept.length !== rows.length) byForm.set(form, kept);
        }
      }
      viaFormOf.length = 0;
      written.clear();
      const forms = [...byForm.keys()].sort();
      const lemmaSet = new Set<string>();
      const pieces = forms.map((f) => {
        const rows = byForm.get(f)!;
        for (const r of rows) lemmaSet.add(r[0]);
        return `${JSON.stringify(f)}:${JSON.stringify(rows)}`;
      });
      byForm.clear();
      const sizes = pieces.map((p) => utf8Length(p) + 1);
      const total = sizes.reduce((a, b) => a + b, 0);
      const pack = (b: number) => {
        const parts = new Map<number, string[]>();
        const bytes = new Map<number, number>();
        forms.forEach((f, i) => {
          const k = bucketOf(f, b);
          const list = parts.get(k);
          if (list) list.push(pieces[i]); else parts.set(k, [pieces[i]]);
          bytes.set(k, (bytes.get(k) ?? 1) + sizes[i]);
        });
        let max = 0;
        for (const v of bytes.values()) if (v > max) max = v;
        return { parts, max };
      };
      let b = buckets ?? 16;
      if (buckets === undefined) while (total / b > FORMS_SHARD_TARGET_BYTES && b < 4096) b *= 2;
      let packed = pack(b);
      if (buckets === undefined) while (packed.max > FORMS_SHARD_MAX_BYTES && b < 4096) { b *= 2; packed = pack(b); }
      const shards = new Map<number, string>();
      let bytes = 0;
      for (const [k, list] of packed.parts) { const text = `{${list.join(',')}}`; shards.set(k, text); bytes += utf8Length(text); }
      return { buckets: b, shards, forms: forms.length, lemmas: lemmaSet.size, fromTables, bytes, maxShardBytes: packed.max };
    },
  };
}

// ----------------------------------------------------------------------------------------------------- inflection tables

/** Tags that make a table row an inflected form of its lemma (case, number, tense, mood, person, gender, degree, definiteness ...). */
const GRAMMATICAL_TAGS: ReadonlySet<string> = new Set([
  'nominative', 'accusative', 'genitive', 'dative', 'ablative', 'vocative', 'locative', 'oblique', 'direct', 'ergative', 'singular', 'plural',
  'present', 'past', 'preterite', 'perfect', 'imperfect', 'pluperfect', 'future', 'aorist', 'infinitive', 'participle', 'gerund', 'supine', 'imperative',
  'subjunctive', 'indicative', 'conditional', 'comparative', 'superlative', 'first-person', 'second-person', 'third-person', 'masculine', 'feminine',
  'neuter', 'definite', 'indefinite', 'admirative', 'optative', 'infinitive-zu', 'perfective', 'habitual', 'presumptive', 'counterfactual',
]);
/** Tags that make a row something other than a plain inflected form: the source's own errors, a class label, an auxiliary, a misspelling ... */
const NOT_A_FORM_TAGS: ReadonlySet<string> = new Set([
  'error-unrecognized-form', 'error-unknown-tag', 'error-exponential-tagsets', 'class', 'auxiliary', 'canonical', 'romanization', 'stem',
  'multiword-construction', 'inflection-template', 'table-tags', 'misspelling', 'hypercorrect', 'abbreviation', 'initialism', 'symbol',
]);

/**
 * Is this row of a full record's `f` list a single inflected word? It needs a grammatical tag and no "not a form" tag, and it
 * must be one token (a row such as "hat gegangen" or "der Kampf" is a phrase the scanner never asks for).
 */
export function isTableForm(form: FullForm): boolean {
  if (!form.f || /\s/.test(form.f) || form.f === '-' || form.f === '–' || form.f === '—') return false;
  let grammatical = false;
  for (const t of form.t) {
    if (NOT_A_FORM_TAGS.has(t)) return false;
    if (GRAMMATICAL_TAGS.has(t)) grammatical = true;
  }
  return grammatical;
}

// --------------------------------------------------------------------------------------------------------------- reader

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A manifest the runtime can trust, or undefined (wrong version or language, bad fields). */
export function parseFormsManifest(raw: unknown, lang: LanguageCode): FormsManifest | undefined {
  if (!isObj(raw) || raw.version !== FORMS_VERSION || raw.lang !== lang) return undefined;
  if (typeof raw.buckets !== 'number' || !Number.isInteger(raw.buckets) || raw.buckets < 1 || raw.buckets > 65536) return undefined;
  const count = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : undefined);
  const forms = count(raw.forms), lemmas = count(raw.lemmas);
  if (forms === undefined || lemmas === undefined) return undefined;
  if (!Array.isArray(raw.shardFiles) || !raw.shardFiles.every((s) => typeof s === 'string' && FORMS_SHARD_FILE.test(s))) return undefined;
  const fromTables = count(raw.fromTables) ?? 0;
  return { version: FORMS_VERSION, lang, buckets: raw.buckets, forms, lemmas, fromTables, shardFiles: raw.shardFiles as string[], builtFrom: typeof raw.builtFrom === 'string' ? raw.builtFrom : '' };
}

/** A shard's rows by form; rows of the wrong shape are dropped. */
export function parseFormsShard(raw: unknown): Map<string, FormsRow[]> {
  const out = new Map<string, FormsRow[]>();
  if (!isObj(raw)) return out;
  for (const form of Object.keys(raw)) {
    const list = raw[form];
    if (!Array.isArray(list)) continue;
    const rows: FormsRow[] = [];
    for (const r of list) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || !r[0]) continue;
      rows.push([r[0], typeof r[1] === 'string' && r[1] ? r[1] : null]);
    }
    if (rows.length) out.set(form, rows.slice(0, FORMS_MAX_ROWS));
  }
  return out;
}

export interface FormsSourceOptions {
  fetch?: typeof fetch;
  /** The dictionary location; the index is `<base>/<lang>/forms/...`. Default '/dict' (the app passes `${BASE_URL}dict`, as for the dictionary). */
  base?: string;
}

export function createFormsSource(lang: LanguageCode, opts: FormsSourceOptions = {}): FormsSource {
  const base = (opts.base ?? '/dict').replace(/\/+$/, '');
  // text of a file under forms/, or undefined when it is definitely not there; rejects on a transient failure
  const read = async (relative: string): Promise<string | undefined> => {
    const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await doFetch(`${base}/${lang}/${FORMS_DIR}/${relative}`);
    if (res.status === 404 || res.status === 410) return undefined;
    if (!res.ok) throw new Error(`forms index request failed: ${res.status}`);
    return res.text();
  };
  const parseJson = (t: string | undefined): unknown => { if (t === undefined) return undefined; try { return JSON.parse(t) as unknown; } catch { return undefined; } };

  let manifest: Promise<FormsManifest | undefined> | undefined;
  const loadManifest = (): Promise<FormsManifest | undefined> => {
    if (!manifest) {
      const p = Promise.resolve().then(() => read(FORMS_MANIFEST)).then((t) => parseFormsManifest(parseJson(t), lang));
      manifest = p;
      p.catch(() => { if (manifest === p) manifest = undefined; }); // a failed request is retried on the next ask; a missing manifest is remembered
    }
    return manifest.catch(() => undefined);
  };

  // Map order is recency order: the first key is the least recently used.
  const cache = new Map<string, Promise<Map<string, FormsRow[]>>>();
  const loadShard = (name: string): Promise<Map<string, FormsRow[]>> => {
    const had = cache.get(name);
    if (had) { cache.delete(name); cache.set(name, had); return had; }
    while (cache.size >= FORMS_CACHE_SHARDS) cache.delete(cache.keys().next().value as string);
    const p = Promise.resolve().then(() => read(name)).then((t) => parseFormsShard(parseJson(t)));
    cache.set(name, p);
    p.catch(() => { if (cache.get(name) === p) cache.delete(name); });
    return p;
  };

  return {
    lang,
    async lookupForms(forms) {
      const out = new Map<string, FormsHit[]>();
      if (!forms.length) return out;
      const m = await loadManifest();
      if (!m) return out;
      const have = new Set(m.shardFiles);
      const byShard = new Map<string, string[]>();
      for (const f of new Set(forms)) {
        if (!f) continue;
        const name = formsShardFile(bucketOf(f, m.buckets), m.buckets);
        if (!have.has(name)) continue; // the manifest says the bucket is empty: no request
        const list = byShard.get(name);
        if (list) list.push(f); else byShard.set(name, [f]);
      }
      await Promise.all([...byShard].map(async ([name, wanted]) => {
        try {
          const shard = await loadShard(name);
          for (const f of wanted) {
            const rows = shard.get(f);
            if (rows) out.set(f, rows.map(([lemma, pos]) => ({ lemma, ...(pos ? { pos: pos as PartOfSpeech } : {}) })));
          }
        } catch { /* a shard that cannot be read leaves its forms unanswered; it is retried on the next ask */ }
      }));
      return out;
    },
  };
}
