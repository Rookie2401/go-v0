/**
 * Level 2 enrichment of a card (Linguistic Engine V2): what the content script can build for the deeper sections once it
 * has (a) the loaded analyser and (b) the dictionary's FULL record for the lemma (the worker fetches it from the pack's
 * `full/` shards: inflection tables, etymology, IPA, audio, related words; schema `full-1`, docs/ecosystem/linguistics/LEXICAL-SCHEMA.md).
 *
 * Every field keeps its provenance and a validation state, and nothing is invented: a paradigm cell is `generated`
 * (the analyser's rules), `supported` (the dictionary's table), `verified` (both agree) or `conflicted` (they differ);
 * an etymology is `supported-by-source` (Wiktionary, CC BY-SA) and never generated; a pronunciation says whether it is
 * the dictionary's IPA, the analyser's rule, or a recording. Pure: no DOM, no network.
 */
import type { LanguageAdapter, PartOfSpeech } from '../../../../src/core';
import { cellsForSelection, featureKey, mergeParadigm, type Paradigm, type SegmentationAlternatives } from '../../../../src/core/paradigm';

/** The dictionary's full record as the worker hands it to the page (the `full-1` keys; every field optional and untrusted). */
export interface LexicalRecord {
  w: string; p: string; e?: number;
  s?: Array<{ g: string; t?: string[]; x?: string[] }>;
  f?: Array<{ f: string; t: string[]; s?: string }>;
  tpl?: string[]; rom?: string;
  ipa?: Array<{ i: string; t?: string[] }>;
  audio?: Array<{ u: string; n?: string; t?: string[] }>;
  hyph?: string[];
  ety?: { text: string; tpl?: Array<{ k: string; lang?: string; form?: string; gloss?: string }> };
  rel?: { d?: string[]; r?: string[]; syn?: string[]; ant?: string[]; hyper?: string[]; hypo?: string[] };
}

export type FieldStatus = 'verified' | 'supported-by-source' | 'provisional' | 'conflicted' | 'unknown';

export interface EtymologyView {
  status: FieldStatus;
  /** The dictionary's etymology text as written (Wiktionary, CC BY-SA), or undefined. */
  text?: string;
  /** The structured chain the templates give: inherited / borrowed / derived from a language and form. */
  chain: Array<{ relation: 'inherited' | 'borrowed' | 'derived' | 'cognate' | 'calque' | 'affix' | 'compound' | 'onomatopoeic' | 'uncertain' | 'other'; language?: string; form?: string; gloss?: string }>;
  source?: { label: string; licence: string };
  note?: string;
}

export interface PronunciationView {
  status: FieldStatus;
  ipa: Array<{ ipa: string; tags: string[] }>;
  hyphenation?: string[];
  romanization?: string;
  /** Recordings the dictionary names (Wikimedia Commons; volunteer recordings, not reviewed for this learner's variety). */
  recordings: Array<{ url: string; name?: string; tags: string[] }>;
  /** The analyser's own notes (letter hints, stress, tone, schwa). */
  notes: string[];
  source?: string;
}

export interface RelationsView {
  derived: string[]; related: string[]; synonyms: string[]; antonyms: string[];
  source?: string;
}

const WIKTIONARY = { label: 'Wiktionary (kaikki.org extract)', licence: 'CC BY-SA 4.0' };
const RELATION: Record<string, EtymologyView['chain'][number]['relation']> = {
  inh: 'inherited', bor: 'borrowed', lbor: 'borrowed', slbor: 'borrowed', uder: 'derived', der: 'derived', cog: 'cognate', clq: 'calque', calque: 'calque',
  af: 'affix', affix: 'affix', suffix: 'affix', prefix: 'affix', com: 'compound', compound: 'compound', blend: 'compound', onom: 'onomatopoeic', unc: 'uncertain',
};

const str = (v: unknown, max = 400): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : undefined);
const strs = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter((x): x is string => !!x).slice(0, max) : []);

/** The record that matches the part of speech best (the dictionary's POS vocabulary is the parser's), else the first. */
export function pickRecord(records: LexicalRecord[] | undefined, pos?: string): LexicalRecord | undefined {
  if (!records?.length) return undefined;
  return (pos && records.find((r) => r.p === pos)) || records[0];
}

/**
 * The paradigm: the analyser's generated cells merged with the dictionary's table (mapped to the analyser's feature keys by
 * the analyser's own tag map). Undefined when neither side has anything for this lemma.
 */
export function buildParadigm(adapter: LanguageAdapter | undefined, languageId: string, lemma: string, pos: PartOfSpeech, record: LexicalRecord | undefined, hint?: { features?: Record<string, string>; surface?: string }): Paradigm | undefined {
  const generated = adapter?.paradigm ? safe(() => adapter.paradigm!(lemma, pos, hint)) : undefined;
  const table: Array<{ features: Record<string, string>; form: string; note?: string }> = [];
  if (record?.f && adapter?.featuresFromTableTags) {
    for (const row of record.f) {
      const form = str(row.f, 80);
      if (!form || !Array.isArray(row.t)) continue;
      const features = safe(() => adapter.featuresFromTableTags!(row.t, pos, form));
      if (features && Object.keys(features).length) table.push({ features, form });
    }
  }
  if (!generated && !table.length) return undefined;
  const aligned = alignTable(generated?.cells, table);
  if (generated?.kind === 'none') {
    return { languageId, lemma, pos, kind: 'none', cells: [], notes: generated.notes, sources: [{ id: `${adapter!.lang}@${adapter!.version}`, label: `${adapter!.name} analyser` }], status: 'none', constructions: generated.constructions };
  }
  const sources: Paradigm['sources'] = [];
  if (generated && adapter) sources.push({ id: `adapter-${adapter.lang}@${adapter.version}`, label: `${adapter.name} analyser (rules and its irregular tables)` });
  if (table.length) sources.push({ id: 'wiktionary', label: `${WIKTIONARY.label}${record?.tpl?.length ? `, table ${record.tpl.join(', ')}` : ''}`, licence: WIKTIONARY.licence });
  const kind = generated?.kind ?? (pos === 'VERB' ? 'verb-conjugation' : pos === 'ADJ' ? 'adjective-declension' : pos === 'NOUN' || pos === 'PROPN' ? 'noun-declension' : pos === 'PRON' ? 'pronoun-paradigm' : 'none');
  const notes = [...(generated?.notes ?? [])];
  if (!generated && table.length) notes.push('The analyser has no rules for this word; every form here is the dictionary\'s table, unverified by the rules.');
  if (generated && !table.length) notes.push('The dictionary has no table for this word; every form here comes from the analyser\'s rules and is unverified by a second source.');
  return mergeParadigm({ languageId, lemma, pos, kind, layout: generated?.layout, template: generated?.template ?? record?.tpl?.[0], notes, sources, constructions: generated?.constructions }, generated?.cells ?? [], aligned);
}

/**
 * Put the dictionary's rows on the generated cells' keys where the two sides describe the same cell in different words:
 * (1) a feature every generated cell carries with one value (a noun's Gender) is added to a row that lacks it, since the
 * table is the table of that one lexeme; (2) a row whose single value falls inside a generated cell's union value
 * ("Dat" inside "Gen,Dat") takes that cell's features when exactly one cell fits; (3) a row that names fewer features than
 * every generated cell does (the headline "plural" / "definite" forms above a table) is dropped, because it is not a cell.
 * Without generated cells the rows are kept as they are. Nothing is invented: a value is only ever copied from the one
 * generated side or narrowed to the one cell it already fits.
 */
export function alignTable<R extends { features: Record<string, string>; form: string }>(generated: ReadonlyArray<{ features: Record<string, string> }> | undefined, table: R[]): R[] {
  if (!generated?.length) return table;
  const required = new Set(Object.keys(generated[0].features));
  for (const c of generated) for (const k of [...required]) if (c.features[k] === undefined) required.delete(k);
  const constant: Record<string, string> = {};
  for (const k of required) { const vals = new Set(generated.map((c) => c.features[k])); if (vals.size === 1) constant[k] = [...vals][0]; }
  const keys = new Set(generated.map((c) => featureKey(c.features)));
  const out: R[] = [];
  for (const row of table) {
    const f: Record<string, string> = { ...row.features };
    for (const [k, v] of Object.entries(constant)) if (f[k] === undefined) f[k] = v;
    if ([...required].some((k) => f[k] === undefined)) continue; // a headline form, not a cell
    if (!keys.has(featureKey(f))) {
      const fits = generated.filter((c) => { const ck = Object.keys(c.features); return ck.length === Object.keys(f).length && ck.every((k) => f[k] !== undefined && c.features[k].split(',').includes(f[k])); });
      if (fits.length === 1) { out.push({ ...row, features: { ...fits[0].features } }); continue; }
    }
    out.push({ ...row, features: f });
  }
  return out;
}

/** The etymology, from the dictionary only. Never generated: no record, no text → `unknown` with nothing to show. */
export function etymologyOf(record: LexicalRecord | undefined): EtymologyView {
  const text = str(record?.ety?.text, 600);
  const chain: EtymologyView['chain'] = [];
  for (const t of record?.ety?.tpl ?? []) {
    const k = str(t?.k, 20);
    if (!k) continue;
    const relation = RELATION[k] ?? 'other';
    const language = str(t.lang, 20);
    const form = str(t.form, 80);
    if (!language && !form && relation === 'other') continue;
    chain.push({ relation, ...(language ? { language } : {}), ...(form ? { form } : {}), ...(str(t.gloss, 120) ? { gloss: str(t.gloss, 120) } : {}) });
  }
  if (!text && !chain.length) return { status: 'unknown', chain: [], note: 'No documented origin in the dictionary.' };
  const disputed = /uncertain|unknown|disputed|unclear|perhaps|possibly/i.test(text ?? '') || chain.some((c) => c.relation === 'uncertain');
  return { status: disputed ? 'conflicted' : 'supported-by-source', text, chain: chain.slice(0, 12), source: WIKTIONARY, ...(disputed ? { note: 'The source itself calls this origin uncertain or disputed.' } : {}) };
}

/** Pronunciation: the dictionary's IPA, hyphenation, romanisation and recordings, with the analyser's notes beside them. */
export function pronunciationOf(record: LexicalRecord | undefined, adapterNotes: string[] = [], adapterIpa?: string): PronunciationView {
  const ipa = (record?.ipa ?? []).map((p) => ({ ipa: str(p?.i, 120), tags: strs(p?.t, 6) })).filter((p): p is { ipa: string; tags: string[] } => !!p.ipa).slice(0, 6);
  const recordings = (record?.audio ?? []).map((a) => ({ url: str(a?.u, 400), name: str(a?.n, 160), tags: strs(a?.t, 6) })).filter((a): a is { url: string; name: string | undefined; tags: string[] } => !!a.url && /^https:\/\/upload\.wikimedia\.org\//.test(a.url)).slice(0, 4);
  const notes = adapterNotes.map((n) => str(n, 300)).filter((n): n is string => !!n);
  if (adapterIpa && !ipa.length) ipa.push({ ipa: adapterIpa, tags: ['from the analyser\'s rules'] });
  const status: FieldStatus = ipa.length && record?.ipa?.length ? 'supported-by-source' : ipa.length || notes.length ? 'provisional' : 'unknown';
  return { status, ipa, hyphenation: strs(record?.hyph, 12).length ? strs(record?.hyph, 12) : undefined, romanization: str(record?.rom, 80), recordings, notes, ...(record?.ipa?.length || recordings.length ? { source: `${WIKTIONARY.label}; recordings: Wikimedia Commons volunteers, unreviewed` } : {}) };
}

export function relationsOf(record: LexicalRecord | undefined): RelationsView {
  const r = record?.rel;
  const out: RelationsView = { derived: strs(r?.d, 30), related: strs(r?.r, 30), synonyms: strs(r?.syn, 20), antonyms: strs(r?.ant, 20) };
  if (out.derived.length || out.related.length || out.synonyms.length || out.antonyms.length) out.source = WIKTIONARY.label;
  return out;
}

/** Senses beyond the first: the dictionary's list with tags and up to two examples each (the card's Meaning section). */
export function sensesOf(record: LexicalRecord | undefined): Array<{ gloss: string; tags: string[]; examples: string[] }> {
  return (record?.s ?? []).map((s) => ({ gloss: str(s?.g, 300) ?? '', tags: strs(s?.t, 8), examples: strs(s?.x, 2).map((x) => x.slice(0, 200)) })).filter((s) => s.gloss).slice(0, 12);
}

/**
 * The feature keys of the cells the selected form occupies: the adapter's own projection when it has one (Albanian,
 * Spanish, Norwegian: union readings, varieties), else the generic split of union values, else the cells whose form is
 * the surface. Empty for a language without inflection or when nothing matches (the card then marks nothing).
 */
export function selectedCellKeys(adapter: LanguageAdapter | undefined, paradigm: Paradigm | undefined, features: Record<string, string>, surface?: string): string[] {
  if (!paradigm || paradigm.kind === 'none' || !paradigm.cells.length) return [];
  const own = adapter?.cellsFor ? safe(() => adapter.cellsFor!(paradigm, features, surface)) : undefined;
  const cells = own?.length ? own : cellsForSelection(paradigm, features, surface);
  return [...new Set(cells.map((c) => featureKey(c.features)))];
}

/** The adapter's alternative cuts of the selection into words (Thai), or undefined for a language that writes spaces. */
export function segmentationsOf(adapter: LanguageAdapter | undefined, text: string, context?: { before?: string; after?: string }): SegmentationAlternatives | undefined {
  if (!adapter?.segmentations || !text.trim()) return undefined;
  const s = safe(() => adapter.segmentations!(text, context));
  return s && s.chosen && Array.isArray(s.alternatives) ? s : undefined;
}

function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }
