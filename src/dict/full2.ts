/**
 * Full lexical records, compact encoding (schema `full-2`): pure and browser-safe, shared by the builder
 * (src/dict/build-full.ts) and the reader (src/dict/full.ts). A full-2 shard holds the SAME records as a full-1 shard; only
 * how they are written changes, and the reader expands them back to the identical `FullRecord` shape (readFullRecord is
 * the single gate for what comes out). Nothing is lost: the only rows dropped are exact duplicates.
 *
 *   shard (stored gzipped as f-xx.json.gz when the manifest says `gzip`):
 *     { "v": 2, "T": [ [tag, ...], ... ], "k": { <lemmaKey>: [ <record>, ... ] } }
 *   T: this shard's tag sets, most used first. Every tag array (sense labels `t`, form tags, ipa/audio tags) is its index.
 *     A set is itself a list of tags, each an index into manifest.strings when the tag is frequent, the tag itself when not.
 *   manifest.strings: the dictionary-wide interned strings. The tags of the tag sets, an etymology template's `k` and `lang`,
 *     a form's `s` and an audio url's prefix (`b`) are an index into it when the string is frequent (a number), the string
 *     itself when not.
 *
 *   record: as full-1, except
 *     s[].t    -> number (T index)
 *     f[]      -> [form, T, source?, roman?]   source: string index | string | null (only when a romanization follows)
 *     ipa[].t  -> number;  audio[].t -> number;  audio[].u -> remainder after the prefix string `b` (when `b` is present)
 *     ety.tpl[].k / .lang -> string index | string
 *
 * Reading back is as untrusted as full-1: an out-of-range index drops that sub-entry, never the shard.
 */
import type { FullAudio, FullForm, FullIpa, FullRecord, FullSense } from './full-format';
import { readFullRecord } from './full-format';

export const FULL2_VERSION = 2;
/** The average encoded shard size the builder aims at (before gzip). */
export const FULL2_TARGET_SHARD_BYTES = 70_000;
/** Typical encoded size as a share of the full-1 size; only used to pick the bucket count before encoding. */
export const FULL2_SIZE_FACTOR = 0.35;
export const FULL2_MIN_STRING_COUNT = 6;
export const FULL2_MAX_STRINGS = 2048;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const byCodeUnit = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

// ───────────────────────────── interned strings ─────────────────────────────

const COMMONS = /^(https?:\/\/[^/]+\/wikipedia\/commons\/(?:transcoded\/)?)(.+)$/;
const HOST = /^(https?:\/\/[^/]+\/)(.+)$/;
/** Splits an audio url into a prefix worth interning and the rest; undefined when there is nothing to split. */
export function splitUrl(u: string): [string, string] | undefined {
  const m = COMMONS.exec(u) ?? HOST.exec(u);
  return m ? [m[1], m[2]] : undefined;
}

/** Calls `add` for every string of a record that full-2 may intern (so the builder can count them dictionary-wide). */
export function internCandidates(r: FullRecord, add: (s: string) => void): void {
  for (const s of r.s) for (const t of s.t ?? []) add(t);
  for (const i of r.ipa ?? []) for (const t of i.t ?? []) add(t);
  for (const a of r.audio ?? []) for (const t of a.t ?? []) add(t);
  for (const f of r.f ?? []) for (const t of f.t) add(t);
  for (const f of r.f ?? []) if (f.s) add(f.s);
  for (const a of r.audio ?? []) { const sp = splitUrl(a.u); if (sp) add(sp[0]); }
  for (const t of r.ety?.tpl ?? []) { add(t.k); if (t.lang) add(t.lang); }
}

export interface StringTable { list: string[]; index: Map<string, number> }

export function makeStringTable(list: string[]): StringTable {
  return { list, index: new Map(list.map((s, i) => [s, i])) };
}
/** The table of the strings that were counted often enough (most frequent first, so the small numbers go to the common strings). */
export function buildStringTable(counts: Map<string, number>, min = FULL2_MIN_STRING_COUNT, max = FULL2_MAX_STRINGS): StringTable {
  const list = [...counts.entries()]
    .filter(([s, n]) => n >= min && s.length >= 3)
    .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
    .slice(0, max)
    .map(([s]) => s);
  return makeStringTable(list);
}

// ───────────────────────────── encoding ─────────────────────────────

export interface TagSets { list: string[][]; index: Map<string, number> }
const tagKey = (t: readonly string[]): string => JSON.stringify(t);

/** Count how often each tag set is used in these records, then number them most-used-first. */
export function buildTagSets(records: Iterable<FullRecord>): TagSets {
  const counts = new Map<string, { t: string[]; n: number }>();
  const see = (t: readonly string[] | undefined) => {
    if (!t?.length) return;
    const k = tagKey(t);
    const c = counts.get(k);
    if (c) c.n++; else counts.set(k, { t: [...t], n: 1 });
  };
  for (const r of records) {
    for (const s of r.s) see(s.t);
    for (const f of r.f ?? []) see(f.t);
    for (const i of r.ipa ?? []) see(i.t);
    for (const a of r.audio ?? []) see(a.t);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || byCodeUnit(a[0], b[0]));
  return { list: sorted.map(([, c]) => c.t), index: new Map(sorted.map(([k], i) => [k, i])) };
}

/** Exact duplicate rows of a form table (same form, tags, source, romanization) collapse to the first. */
export function dedupeForms(forms: readonly FullForm[]): FullForm[] {
  const seen = new Set<string>();
  const out: FullForm[] = [];
  for (const f of forms) {
    const k = JSON.stringify([f.f, f.t, f.s ?? '', f.r ?? '']);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

/** One record in the compact form (a plain JSON-able object). */
export function encodeRecord2(r: FullRecord, tags: TagSets, strings: StringTable): Record<string, unknown> {
  const tag = (t: readonly string[] | undefined): number | undefined => (t?.length ? tags.index.get(tagKey(t)) : undefined);
  const str = (s: string): number | string => strings.index.get(s) ?? s;
  const out: Record<string, unknown> = { w: r.w };
  if (r.p) out.p = r.p;
  if (r.h) out.h = r.h;
  if (r.e !== undefined) out.e = r.e;
  out.s = r.s.map((s: FullSense) => {
    const o: Record<string, unknown> = { g: s.g };
    const t = tag(s.t); if (t !== undefined) o.t = t;
    if (s.x?.length) o.x = s.x;
    return o;
  });
  if (r.f?.length) {
    out.f = dedupeForms(r.f).map((f) => {
      const row: unknown[] = [f.f, tag(f.t) ?? -1];
      if (f.s !== undefined || f.r !== undefined) row.push(f.s !== undefined ? str(f.s) : null);
      if (f.r !== undefined) row.push(f.r);
      return row;
    });
  }
  if (r.tpl?.length) out.tpl = r.tpl;
  if (r.rom) out.rom = r.rom;
  if (r.ipa?.length) out.ipa = r.ipa.map((i: FullIpa) => { const o: Record<string, unknown> = { i: i.i }; const t = tag(i.t); if (t !== undefined) o.t = t; return o; });
  if (r.audio?.length) {
    out.audio = r.audio.map((a: FullAudio) => {
      const o: Record<string, unknown> = {};
      const sp = splitUrl(a.u);
      const b = sp ? strings.index.get(sp[0]) : undefined;
      if (b !== undefined && sp) { o.u = sp[1]; o.b = b; } else o.u = a.u;
      o.n = a.n;
      const t = tag(a.t); if (t !== undefined) o.t = t;
      return o;
    });
  }
  if (r.hyph?.length) out.hyph = r.hyph;
  if (r.ety) {
    const ety: Record<string, unknown> = {};
    if (r.ety.text) ety.text = r.ety.text;
    ety.tpl = r.ety.tpl.map((t) => {
      const o: Record<string, unknown> = { k: str(t.k) };
      if (t.lang) o.lang = str(t.lang);
      if (t.form) o.form = t.form;
      if (t.gloss) o.gloss = t.gloss;
      return o;
    });
    out.ety = ety;
  }
  if (r.rel) out.rel = r.rel;
  return out;
}

/** Shard text for a set of records by lemma key: keys in code-unit order, one line, trailing newline. */
export function encodeShard2(byKey: Map<string, FullRecord[]>, strings: StringTable): string {
  const all: FullRecord[] = [];
  for (const l of byKey.values()) all.push(...l);
  const tags = buildTagSets(all);
  const keys = [...byKey.keys()].sort(byCodeUnit);
  const body = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(byKey.get(k)!.map((r) => encodeRecord2(r, tags, strings)))}`).join(',');
  const T = tags.list.map((set) => set.map((t) => strings.index.get(t) ?? t));
  return `{"v":${FULL2_VERSION},"T":${JSON.stringify(T)},"k":{${body}}}\n`;
}

// ───────────────────────────── expanding (untrusted) ─────────────────────────────

/** A full-1-shaped raw record from a compact one; sub-entries with a bad index are dropped. readFullRecord then validates it. */
export function expandRecord2(raw: unknown, T: readonly (readonly string[])[], strings: readonly string[]): unknown {
  if (!isObj(raw)) return undefined;
  const tagAt = (i: unknown): string[] | undefined => (typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < T.length ? [...T[i]] : undefined);
  const strAt = (x: unknown): string | undefined => (typeof x === 'number' ? (Number.isInteger(x) && x >= 0 && x < strings.length ? strings[x] : undefined) : typeof x === 'string' ? x : undefined);
  const out: Record<string, unknown> = { ...raw };
  if (Array.isArray(raw.s)) {
    out.s = raw.s.map((s) => {
      if (!isObj(s)) return s;
      const o: Record<string, unknown> = { ...s };
      if ('t' in s) { const t = tagAt(s.t); if (t) o.t = t; else delete o.t; }
      return o;
    });
  }
  if (Array.isArray(raw.f)) {
    out.f = raw.f.map((row) => {
      if (!Array.isArray(row)) return undefined;
      const t = tagAt(row[1]);
      if (typeof row[0] !== 'string' || !t) return undefined;
      const o: Record<string, unknown> = { f: row[0], t };
      if (row[2] !== undefined && row[2] !== null) { const s = strAt(row[2]); if (s !== undefined) o.s = s; }
      if (typeof row[3] === 'string') o.r = row[3];
      return o;
    });
  }
  if (Array.isArray(raw.ipa)) {
    out.ipa = raw.ipa.map((i) => {
      if (!isObj(i)) return i;
      const o: Record<string, unknown> = { ...i };
      if ('t' in i) { const t = tagAt(i.t); if (t) o.t = t; else delete o.t; }
      return o;
    });
  }
  if (Array.isArray(raw.audio)) {
    out.audio = raw.audio.map((a) => {
      if (!isObj(a)) return a;
      const o: Record<string, unknown> = { u: a.u, n: a.n };
      if ('b' in a) { const p = strAt(a.b); o.u = p !== undefined && typeof a.u === 'string' ? p + a.u : undefined; }
      if ('t' in a) { const t = tagAt(a.t); if (t) o.t = t; }
      return o;
    });
  }
  if (isObj(raw.ety) && Array.isArray(raw.ety.tpl)) {
    out.ety = {
      ...raw.ety,
      tpl: raw.ety.tpl.map((t) => {
        if (!isObj(t)) return t;
        const o: Record<string, unknown> = { ...t, k: strAt(t.k) };
        if ('lang' in t) o.lang = strAt(t.lang);
        return o;
      }),
    };
  }
  return out;
}

/** A full-2 shard's records by lemma key, in the same shape parseFullShard gives for full-1. Bad records are dropped. */
export function parseFullShard2(raw: unknown, strings: readonly string[]): Map<string, FullRecord[]> {
  const out = new Map<string, FullRecord[]>();
  if (!isObj(raw) || raw.v !== FULL2_VERSION || !isObj(raw.k)) return out;
  const at = (x: unknown): string | undefined => (typeof x === 'number' ? (Number.isInteger(x) && x >= 0 && x < strings.length ? strings[x] : undefined) : typeof x === 'string' ? x : undefined);
  const T = Array.isArray(raw.T) ? raw.T.map((t) => (Array.isArray(t) ? t.map(at).filter((x): x is string => x !== undefined) : [])) : [];
  for (const key of Object.keys(raw.k)) {
    const l = raw.k[key];
    if (!Array.isArray(l)) continue;
    const records = l.map((r) => readFullRecord(expandRecord2(r, T, strings))).filter((r): r is FullRecord => r !== undefined);
    if (records.length) out.set(key, records);
  }
  return out;
}
