/**
 * Full lexical records (schema `full-1`, Level 2 of the linguistic engine): pure and browser-safe, shared by the builder
 * (src/dict/build-full.ts) and the runtime reader (src/dict/full.ts). The schema-3 shards (format.ts) stay as they are
 * for the fast Level-1 lookup; these are a second, parallel shard set that keeps what that one drops: the Wiktextract
 * inflection tables, etymology text and templates, audio files, hyphenation and the related-word lists.
 *
 *   <dir>/<lang>/full/manifest.json   { schema: 'full-1', lang, source, buckets, shardFiles, counts, builtAt }
 *   <dir>/<lang>/full/f-<hh>.json     { [lemmaKey]: FullRecord[] }   lemmaKey = the language's normalize(word),
 *                                      hh = hex of bucketOf(lemmaKey, buckets), at least 2 digits
 *
 * Every string is cleaned of control characters; nothing is invented (a field the source lacks is absent). The keys
 * and caps are documented in docs/ecosystem/linguistics/LEXICAL-SCHEMA.md. Every field read back from disk is
 * untrusted: a bad record is dropped, a bad manifest or shard reads as absent.
 */
import type { LanguageCode, PartOfSpeech } from '../core';
import { MAX_BUCKETS, PARTS_OF_SPEECH, bucketOf } from './format';
import { NON_WORD_POS, partOfSpeechOf } from './map';

export const FULL_SCHEMA = 'full-1';
export const FULL_TARGET_SHARD_BYTES = 150_000;
export const FULL_MIN_BUCKETS = 256;

export const FULL_CAPS = {
  senses: 12, examplesPerSense: 2, exampleChars: 300, glossChars: 400, forms: 400, ipa: 10, audio: 6, hyph: 6,
  etymologyChars: 600, etymologyTemplates: 20, related: 30,
} as const;

/** Etymology templates that are kept (the rest are dropped). */
export const ETYMOLOGY_TEMPLATES: readonly string[] = [
  'inh', 'bor', 'der', 'cog', 'lbor', 'slbor', 'clq', 'calque', 'af', 'affix', 'suffix', 'prefix', 'com', 'compound', 'blend', 'uder', 'unc', 'onom',
];
/** Languages whose `romanization` form rows go to `rom` instead of the forms list. */
export const ROMANIZATION_LANGS: readonly string[] = ['hi', 'th'];

export interface FullSense { g: string; t?: string[]; x?: string[] }
/** One tagged form: `f` the form, `t` the source's tags verbatim (sorted), `s` the source's `source` ('conjugation', 'declension' ...), `r` its romanization (Hindi tables). */
export interface FullForm { f: string; t: string[]; s?: string; r?: string }
export interface FullIpa { i: string; t?: string[] }
export interface FullAudio { u: string; n: string; t?: string[] }
export interface FullEtymologyTemplate { k: string; lang?: string; form?: string; gloss?: string }
export interface FullEtymology { text?: string; tpl: FullEtymologyTemplate[] }
export interface FullRelated { d?: string[]; r?: string[]; syn?: string[]; ant?: string[]; hyper?: string[]; hypo?: string[] }

export interface FullRecord {
  /** the word as written */
  w: string;
  /** part of speech, mapped exactly as the schema-3 build maps it; absent when the heading is not one it maps */
  p?: PartOfSpeech;
  /** the source's own heading, kept only when `p` is absent or X (a phrase, a contraction ...) */
  h?: string;
  /** etymology number */
  e?: number;
  s: FullSense[];
  f?: FullForm[];
  /** the inflection-template names the source gives (es-conj, sq-decl-noun ...) */
  tpl?: string[];
  /** romanization (hi, th) */
  rom?: string;
  ipa?: FullIpa[];
  audio?: FullAudio[];
  hyph?: string[];
  ety?: FullEtymology;
  rel?: FullRelated;
}

export const RELATED_SOURCE: ReadonlyArray<readonly [keyof FullRelated, string]> = [
  ['d', 'derived'], ['r', 'related'], ['syn', 'synonyms'], ['ant', 'antonyms'], ['hyper', 'hypernyms'], ['hypo', 'hyponyms'],
];

// ───────────────────────────── file names ─────────────────────────────

/** Full shard file name: two hex digits for 256 buckets or fewer, wider when there are more (f-3ff.json for 1024). */
export function fullShardName(bucket: number, buckets: number): string {
  const width = Math.max(2, (buckets - 1).toString(16).length);
  return `f-${bucket.toString(16).padStart(width, '0')}.json`;
}
export const FULL_SHARD_FILE = /^f-[0-9a-f]{2,4}\.json$/;

/** 256 times a power of two, the smallest that brings the average shard under the target. */
export function chooseFullBuckets(totalBytes: number, target = FULL_TARGET_SHARD_BYTES): number {
  let b = FULL_MIN_BUCKETS;
  while (b < MAX_BUCKETS && totalBytes / b > target) b *= 2;
  return b;
}

// ───────────────────────────── helpers ─────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
// C0 and C1 controls and DEL; the three whitespace ones become a space first.
const WHITESPACE_CONTROLS = /[\t\n\r\v\f\x85\p{Zl}\p{Zp}]+/gu;
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

/** A string with its control characters removed (line breaks and tabs become one space) and its whitespace collapsed; '' for a non-string. */
export function cleanText(x: unknown): string {
  if (typeof x !== 'string') return '';
  return x.replace(WHITESPACE_CONTROLS, ' ').replace(CONTROLS, '').replace(/ {2,}/g, ' ').trim();
}
const clean = cleanText;
const cleanOpt = (x: unknown): string | undefined => { const s = clean(x); return s || undefined; };

/** At most `max` UTF-16 units, cut on a code-point boundary, with an ellipsis when something was cut (the ellipsis counts). */
export function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

const labelsOf = (o: Record<string, unknown>): string[] => {
  const out: string[] = [];
  for (const t of [...list(o.tags), ...list(o.raw_tags)]) { const s = clean(t); if (s && !out.includes(s)) out.push(s); }
  return out;
};
const sortedTags = (o: Record<string, unknown>): string[] => [...new Set(list(o.tags).map(clean).filter(Boolean))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function glossParts(sense: Record<string, unknown>): string[] {
  const parts = list(sense.glosses).map(clean).filter(Boolean);
  if (parts.length) return parts;
  return list(sense.raw_glosses).map(clean).filter(Boolean).slice(0, 1);
}
const shortGloss = (parts: string[]): string => (parts[0].endsWith(':') && parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0]);

function sensesOf(line: Record<string, unknown>): FullSense[] {
  const out: FullSense[] = [];
  for (const raw of list(line.senses)) {
    if (!isObj(raw)) continue;
    if (list(raw.form_of).length) continue; // an inflected-form sense is a relation, not a sense (the schema-3 shards carry it)
    const parts = glossParts(raw);
    if (!parts.length) continue;
    const s: FullSense = { g: capText(shortGloss(parts), FULL_CAPS.glossChars) };
    const t = labelsOf(raw); if (t.length) s.t = t;
    const x: string[] = [];
    for (const e of list(raw.examples)) {
      const text = isObj(e) ? cleanOpt(e.text) : undefined;
      if (text && x.length < FULL_CAPS.examplesPerSense) x.push(capText(text, FULL_CAPS.exampleChars));
    }
    if (x.length) s.x = x;
    out.push(s);
    if (out.length >= FULL_CAPS.senses) break;
  }
  return out;
}

interface FormsResult { forms: FullForm[]; tpl: string[]; rom?: string }

function formsOf(line: Record<string, unknown>, lang: string): FormsResult {
  const forms: FullForm[] = [];
  const tpl: string[] = [];
  let rom: string | undefined;
  const seen = new Set<string>();
  for (const raw of list(line.forms)) {
    if (!isObj(raw)) continue;
    const f = clean(raw.form);
    const t = sortedTags(raw);
    if (!f || !t.length) continue;
    if (t.includes('inflection-template')) { if (!tpl.includes(f)) tpl.push(f); continue; }
    if (t.includes('table-tags')) continue;
    if (ROMANIZATION_LANGS.includes(lang) && t.includes('romanization')) { rom ??= f; continue; }
    if (forms.length >= FULL_CAPS.forms) continue;
    const s = cleanOpt(raw.source);
    const r = cleanOpt(raw.roman);
    const key = JSON.stringify([f, t, s ?? '', r ?? '']);
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({ f, t, ...(s ? { s } : {}), ...(r ? { r } : {}) });
  }
  return { forms, tpl, ...(rom ? { rom } : {}) };
}

function soundsOf(line: Record<string, unknown>): { ipa: FullIpa[]; audio: FullAudio[] } {
  const ipa: FullIpa[] = [];
  const audio: FullAudio[] = [];
  for (const raw of list(line.sounds)) {
    if (!isObj(raw)) continue;
    const t = labelsOf(raw);
    const i = cleanOpt(raw.ipa);
    if (i && ipa.length < FULL_CAPS.ipa && !ipa.some((x) => x.i === i && x.t?.join('\u0000') === (t.length ? t.join('\u0000') : undefined))) ipa.push({ i, ...(t.length ? { t } : {}) });
    const n = cleanOpt(raw.audio);
    const u = cleanOpt(raw.ogg_url) ?? cleanOpt(raw.mp3_url);
    if (n && u && audio.length < FULL_CAPS.audio && !audio.some((x) => x.u === u)) audio.push({ u, n, ...(t.length ? { t } : {}) });
  }
  return { ipa, audio };
}

function hyphenationsOf(line: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const h of list(line.hyphenations)) {
    const parts = isObj(h) ? list(h.parts).map(clean).filter(Boolean) : [];
    const s = parts.join('‧');
    if (s && !out.includes(s) && out.length < FULL_CAPS.hyph) out.push(s);
  }
  return out;
}

const ARG_NUMBER = /^\d+$/;
function templateOf(name: string, args: Record<string, unknown>): FullEtymologyTemplate {
  const a = (k: string | number): string | undefined => cleanOpt(args[String(k)]);
  const real = (v: string | undefined): string | undefined => (v && v !== '-' && v !== '?' ? v : undefined);
  const out: FullEtymologyTemplate = { k: name };
  let lang: string | undefined, form: string | undefined, gloss: string | undefined;
  if (['inh', 'bor', 'der', 'lbor', 'slbor', 'clq', 'calque', 'uder'].includes(name)) {
    lang = a(2); form = real(a(3)); gloss = a('t') ?? a('gloss') ?? a(5);
  } else if (name === 'cog') {
    lang = a(1); form = real(a(2)); gloss = a('t') ?? a('gloss') ?? a(4);
  } else if (name === 'unc' || name === 'onom') {
    lang = a(1);
  } else {
    // af, affix, suffix, prefix, com, compound, blend: the language, then the parts in order
    lang = a(1);
    const parts = Object.keys(args).filter((k) => ARG_NUMBER.test(k) && Number(k) >= 2).sort((x, y) => Number(x) - Number(y)).map((k) => real(a(k))).filter((v): v is string => v !== undefined);
    if (parts.length) form = parts.join(' + ');
  }
  if (lang) out.lang = lang;
  if (form) out.form = form;
  if (gloss) out.gloss = gloss;
  return out;
}

function etymologyOf(line: Record<string, unknown>): FullEtymology | undefined {
  const text = cleanOpt(line.etymology_text);
  const tpl: FullEtymologyTemplate[] = [];
  for (const raw of list(line.etymology_templates)) {
    if (!isObj(raw) || tpl.length >= FULL_CAPS.etymologyTemplates) continue;
    const name = cleanOpt(raw.name);
    if (!name || !ETYMOLOGY_TEMPLATES.includes(name)) continue;
    const t = templateOf(name, isObj(raw.args) ? raw.args : {});
    if (!tpl.some((x) => JSON.stringify(x) === JSON.stringify(t))) tpl.push(t);
  }
  if (!text && !tpl.length) return undefined;
  return { ...(text ? { text: capText(text, FULL_CAPS.etymologyChars) } : {}), tpl };
}

function relatedOf(line: Record<string, unknown>): FullRelated | undefined {
  const rel: FullRelated = {};
  for (const [short, key] of RELATED_SOURCE) {
    const words: string[] = [];
    const take = (arr: unknown) => {
      for (const w of list(arr)) {
        const word = isObj(w) ? cleanOpt(w.word) : undefined;
        if (word && !words.includes(word) && words.length < FULL_CAPS.related) words.push(word);
      }
    };
    take(line[key]);
    for (const s of list(line.senses)) if (isObj(s)) take(s[key]); // synonyms and the like are mostly given per sense
    if (words.length) rel[short] = words;
  }
  return Object.keys(rel).length ? rel : undefined;
}

// ───────────────────────────── the mapper ─────────────────────────────

export type FullSkip = 'not-an-object' | 'no-word' | 'wrong-language' | 'non-word' | 'no-senses';
export const FULL_SKIPS: readonly FullSkip[] = ['not-an-object', 'no-word', 'wrong-language', 'non-word', 'no-senses'];

export interface FullMapping { key?: string; record?: FullRecord; skipped?: FullSkip }

/** Map one parsed kaikki line to a full record under its lemma key; says why when nothing comes out. Never throws on odd input. */
export function mapFullLine(line: unknown, normalize: (surface: string) => string, lang: LanguageCode): FullMapping {
  if (!isObj(line)) return { skipped: 'not-an-object' };
  const code = cleanOpt(line.lang_code);
  if (code !== undefined && code !== lang) return { skipped: 'wrong-language' };
  const word = cleanOpt(line.word);
  let key = '';
  try { key = word ? clean(normalize(word)) : ''; } catch { key = ''; }
  if (!word || !key) return { skipped: 'no-word' };
  const heading = (cleanOpt(line.pos) ?? '').toLowerCase();
  if (NON_WORD_POS.has(heading)) return { skipped: 'non-word' };
  const s = sensesOf(line);
  if (!s.length) return { skipped: 'no-senses' };

  const p = partOfSpeechOf(heading);
  const e = line.etymology_number;
  // property order is fixed by construction, so shards are byte-stable
  const record: FullRecord = {
    w: word.normalize('NFC'),
    ...(p ? { p } : {}),
    ...(heading && (!p || p === 'X') ? { h: heading } : {}),
    ...(typeof e === 'number' && Number.isInteger(e) && e >= 1 ? { e } : {}),
    s,
  };
  const { forms, tpl, rom } = formsOf(line, lang);
  if (forms.length) record.f = forms;
  if (tpl.length) record.tpl = tpl;
  if (rom) record.rom = rom;
  const { ipa, audio } = soundsOf(line);
  if (ipa.length) record.ipa = ipa;
  if (audio.length) record.audio = audio;
  const hyph = hyphenationsOf(line);
  if (hyph.length) record.hyph = hyph;
  const ety = etymologyOf(line);
  if (ety) record.ety = ety;
  const rel = relatedOf(line);
  if (rel) record.rel = rel;
  return { key, record };
}

// ───────────────────────────── the manifest ─────────────────────────────

export interface FullSource {
  name: string;
  url: string;
  /** the kaikki dump's date (YYYY-MM-DD) */
  version: string;
  licence: string;
  attribution: string;
  /** what was read: file name, sha256, line count (the builder fills them) */
  file?: string;
  sha256?: string;
  lines?: number;
}
export interface FullCounts { records: number; withForms: number; withEtymology: number; withIpa: number; withAudio: number }
export interface FullManifest {
  schema: typeof FULL_SCHEMA;
  lang: LanguageCode;
  source: FullSource;
  buckets: number;
  shardFiles: string[];
  counts: FullCounts;
  builtAt: string;
}

export const newFullCounts = (): FullCounts => ({ records: 0, withForms: 0, withEtymology: 0, withIpa: 0, withAudio: 0 });
export function tallyFullRecord(c: FullCounts, r: FullRecord): void {
  c.records++;
  if (r.f?.length) c.withForms++;
  if (r.ety) c.withEtymology++;
  if (r.ipa?.length) c.withIpa++;
  if (r.audio?.length) c.withAudio++;
}

export const fullManifestText = (m: FullManifest): string => JSON.stringify(m, null, 2) + '\n';

const byCodeUnit = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
/** Shard file text: keys in code-unit order, each with its records' JSON, one line, trailing newline. */
export function fullShardText(byKey: Map<string, string[]>): string {
  const keys = [...byKey.keys()].sort(byCodeUnit);
  return `{${keys.map((k) => `${JSON.stringify(k)}:[${byKey.get(k)!.join(',')}]`).join(',')}}\n`;
}

// ───────────────────────────── reading back (untrusted) ─────────────────────────────

const POS_SET = new Set<string>(PARTS_OF_SPEECH);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? clean(x) || undefined : undefined);
const strList = (x: unknown, max = Infinity): string[] => (Array.isArray(x) ? x.map(str).filter((s): s is string => s !== undefined).slice(0, max) : []);

function readSense(raw: unknown): FullSense | undefined {
  if (!isObj(raw)) return undefined;
  const g = str(raw.g);
  if (!g) return undefined;
  const s: FullSense = { g };
  const t = strList(raw.t); if (t.length) s.t = t;
  const x = strList(raw.x, FULL_CAPS.examplesPerSense); if (x.length) s.x = x;
  return s;
}
function readForm(raw: unknown): FullForm | undefined {
  if (!isObj(raw)) return undefined;
  const f = str(raw.f);
  const t = strList(raw.t);
  if (!f || !t.length) return undefined;
  const out: FullForm = { f, t };
  const s = str(raw.s); if (s) out.s = s;
  const r = str(raw.r); if (r) out.r = r;
  return out;
}
const isUrl = (u: string | undefined): u is string => !!u && /^https?:\/\//i.test(u);

/** One record as read from disk; undefined for anything that is not a usable record (no word, no senses, wrong shapes). Bad sub-entries are dropped. */
export function readFullRecord(raw: unknown): FullRecord | undefined {
  if (!isObj(raw)) return undefined;
  const w = str(raw.w);
  const s = Array.isArray(raw.s) ? raw.s.map(readSense).filter((x): x is FullSense => x !== undefined).slice(0, FULL_CAPS.senses) : [];
  if (!w || !s.length) return undefined;
  const r: FullRecord = { w, s };
  if (typeof raw.p === 'string' && POS_SET.has(raw.p)) r.p = raw.p as PartOfSpeech;
  const h = str(raw.h); if (h) r.h = h;
  if (typeof raw.e === 'number' && Number.isInteger(raw.e) && raw.e >= 1) r.e = raw.e;
  if (Array.isArray(raw.f)) { const f = raw.f.map(readForm).filter((x): x is FullForm => x !== undefined).slice(0, FULL_CAPS.forms); if (f.length) r.f = f; }
  const tpl = strList(raw.tpl); if (tpl.length) r.tpl = tpl;
  const rom = str(raw.rom); if (rom) r.rom = rom;
  if (Array.isArray(raw.ipa)) {
    const ipa: FullIpa[] = [];
    for (const x of raw.ipa.slice(0, FULL_CAPS.ipa)) { const i = isObj(x) ? str(x.i) : undefined; if (i) { const t = strList((x as Record<string, unknown>).t); ipa.push({ i, ...(t.length ? { t } : {}) }); } }
    if (ipa.length) r.ipa = ipa;
  }
  if (Array.isArray(raw.audio)) {
    const audio: FullAudio[] = [];
    for (const x of raw.audio.slice(0, FULL_CAPS.audio)) {
      const o = isObj(x) ? x : undefined;
      const u = o ? str(o.u) : undefined, n = o ? str(o.n) : undefined;
      if (o && isUrl(u) && n) { const t = strList(o.t); audio.push({ u, n, ...(t.length ? { t } : {}) }); }
    }
    if (audio.length) r.audio = audio;
  }
  const hyph = strList(raw.hyph, FULL_CAPS.hyph); if (hyph.length) r.hyph = hyph;
  if (isObj(raw.ety)) {
    const text = str(raw.ety.text);
    const tpl2: FullEtymologyTemplate[] = [];
    for (const x of Array.isArray(raw.ety.tpl) ? raw.ety.tpl.slice(0, FULL_CAPS.etymologyTemplates) : []) {
      const k = isObj(x) ? str(x.k) : undefined;
      if (!isObj(x) || !k) continue;
      const lang = str(x.lang), form = str(x.form), gloss = str(x.gloss);
      tpl2.push({ k, ...(lang ? { lang } : {}), ...(form ? { form } : {}), ...(gloss ? { gloss } : {}) });
    }
    if (text || tpl2.length) r.ety = { ...(text ? { text } : {}), tpl: tpl2 };
  }
  if (isObj(raw.rel)) {
    const rel: FullRelated = {};
    for (const [short] of RELATED_SOURCE) { const v = strList(raw.rel[short], FULL_CAPS.related); if (v.length) rel[short] = v; }
    if (Object.keys(rel).length) r.rel = rel;
  }
  return r;
}

/** A shard's records by lemma key; unusable records are dropped, a non-object shard reads as empty. */
export function parseFullShard(raw: unknown): Map<string, FullRecord[]> {
  const out = new Map<string, FullRecord[]>();
  if (!isObj(raw)) return out;
  for (const key of Object.keys(raw)) {
    const l = raw[key];
    if (!Array.isArray(l)) continue;
    const records = l.map(readFullRecord).filter((r): r is FullRecord => r !== undefined);
    if (records.length) out.set(key, records);
  }
  return out;
}

const count = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : undefined);

/** A full manifest the runtime can trust, or undefined (wrong schema or language, missing fields). */
export function parseFullManifest(raw: unknown, lang: LanguageCode): FullManifest | undefined {
  if (!isObj(raw) || raw.schema !== FULL_SCHEMA || raw.lang !== lang) return undefined;
  const src = isObj(raw.source) ? raw.source : undefined;
  if (!src) return undefined;
  const name = str(src.name), url = str(src.url), version = str(src.version), licence = str(src.licence), attribution = str(src.attribution);
  if (!name || !url || !version || !licence || !attribution) return undefined;
  const c = isObj(raw.counts) ? raw.counts : undefined;
  if (!c) return undefined;
  const counts: FullCounts = {
    records: count(c.records) ?? -1, withForms: count(c.withForms) ?? -1, withEtymology: count(c.withEtymology) ?? -1,
    withIpa: count(c.withIpa) ?? -1, withAudio: count(c.withAudio) ?? -1,
  };
  if (Object.values(counts).some((v) => v < 0)) return undefined;
  if (typeof raw.buckets !== 'number' || !Number.isInteger(raw.buckets) || raw.buckets < 1 || raw.buckets > MAX_BUCKETS) return undefined;
  const shardFiles = Array.isArray(raw.shardFiles) && raw.shardFiles.every((s) => typeof s === 'string' && FULL_SHARD_FILE.test(s)) ? (raw.shardFiles as string[]) : [];
  const source: FullSource = { name, url, version, licence, attribution };
  const file = str(src.file); if (file) source.file = file;
  const sha256 = str(src.sha256); if (sha256) source.sha256 = sha256;
  const lines = count(src.lines); if (lines !== undefined) source.lines = lines;
  return { schema: FULL_SCHEMA, lang, source, buckets: raw.buckets, shardFiles, counts, builtAt: str(raw.builtAt) ?? '' };
}

export { bucketOf };
