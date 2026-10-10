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
import type { LanguageAdapter, PartOfSpeech, WordPart } from '../../../../src/core';
import { cellsForSelection, featureKey, mergeParadigm, type Paradigm, type SegmentationAlternatives } from '../../../../src/core/paradigm';
import type { AnalysisCandidate } from '../../../../src/core/adapters';
import { languageNameOf } from './languageNames';

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
  /** Cognates the source lists (template `cog`): words of other languages that share the origin. Not steps of the word's own history. */
  cognates: Array<{ language?: string; form?: string; gloss?: string }>;
  /** Names for the language codes that occur in the chain and the cognates (`la` → Latin); a code with no entry stays a code. */
  languageNames: Record<string, string>;
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
  const cognates: EtymologyView['cognates'] = [];
  for (const t of record?.ety?.tpl ?? []) {
    const k = str(t?.k, 20);
    if (!k) continue;
    const relation = RELATION[k] ?? 'other';
    const language = str(t.lang, 20);
    const form = str(t.form, 80);
    if (!language && !form && relation === 'other') continue;
    const gloss = str(t.gloss, 120);
    // a cognate is a word of another language that shares the origin, not a step in this word's history
    if (relation === 'cognate') { if (form) cognates.push({ ...(language ? { language } : {}), form, ...(gloss ? { gloss } : {}) }); continue; }
    chain.push({ relation, ...(language ? { language } : {}), ...(form ? { form } : {}), ...(gloss ? { gloss } : {}) });
  }
  if (!text && !chain.length && !cognates.length) return { status: 'unknown', chain: [], cognates: [], languageNames: {}, note: 'No documented origin in the dictionary.' };
  const disputed = /uncertain|unknown|disputed|unclear|perhaps|possibly/i.test(text ?? '') || chain.some((c) => c.relation === 'uncertain');
  const kept = chain.slice(0, 12);
  const keptCognates = cognates.slice(0, 12);
  const languageNames: Record<string, string> = {};
  for (const c of [...kept, ...keptCognates]) { const n = languageNameOf(c.language); if (c.language && n) languageNames[c.language] = n; }
  return { status: disputed ? 'conflicted' : 'supported-by-source', text, chain: kept, cognates: keptCognates, languageNames, source: WIKTIONARY, ...(disputed ? { note: 'The source itself calls this origin uncertain or disputed.' } : {}) };
}

const STEP_VERB: Record<EtymologyView['chain'][number]['relation'], string> = { inherited: 'inherited from', borrowed: 'borrowed from', derived: 'derived from', cognate: 'cognate', calque: 'calque of', affix: 'built from', compound: 'compound of', onomatopoeic: 'imitative', uncertain: 'uncertain', other: 'see' };

/** One step of the chain in words: "borrowed from Latin liber (“book”)"; a code with no known name stays a code ("borrowed from xyz: liber"). */
export function etymologyStepText(c: EtymologyView['chain'][number], names: Record<string, string>): string {
  const lang = c.language ? names[c.language] ?? languageNameOf(c.language) : undefined;
  const gloss = c.gloss ? ` (“${c.gloss}”)` : '';
  if (c.relation === 'affix' || c.relation === 'compound') return `${STEP_VERB[c.relation]} ${c.form ?? ''}${lang ? ` (${lang})` : c.language ? ` (${c.language})` : ''}${gloss}`.replace(/\s+/g, ' ').trim();
  const where = lang ? `${lang}${c.form ? ` ${c.form}` : ''}` : c.language ? `${c.language}${c.form ? `: ${c.form}` : ''}` : c.form ?? '';
  return `${STEP_VERB[c.relation]}${where ? ` ${where}` : ''}${gloss}`;
}

/** One cognate in words: "German Buch (“book”)"; an unknown code stays a code ("xyz: Buch"). */
export function cognateText(c: EtymologyView['cognates'][number], names: Record<string, string>): string {
  const lang = c.language ? names[c.language] ?? languageNameOf(c.language) : undefined;
  return `${lang ? `${lang} ` : c.language ? `${c.language}: ` : ''}${c.form ?? ''}${c.gloss ? ` (“${c.gloss}”)` : ''}`.trim();
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

// ───────────────────────────── word structure (Stage 5) ─────────────────────────────

export type StructureRole = 'prefix' | 'root' | 'stem' | 'suffix' | 'ending' | 'component' | 'head' | 'clitic' | 'linking';

export interface StructurePart {
  text: string;
  role: StructureRole;
  gloss?: string;
  /** Who gave this part: the dictionary's template, the analyser's rules, or the analyser's paradigm. */
  source: string;
}

export interface WordStructureView {
  /** supported-by-source: a dictionary template gave the parts; provisional: only the analyser's rules did; unknown: nothing. */
  status: FieldStatus;
  parts: StructurePart[];
  derivedFrom?: { lemma: string; relation: string; source: string };
  /** Words of the same family the dictionary lists (derived: rel.d; related: rel.r). */
  family: { derived: string[]; related: string[]; source?: string };
  notes: string[];
}

const PART_TEMPLATES = new Set(['af', 'affix', 'suffix', 'prefix', 'com', 'compound', 'blend']);
const FORMING = new Set(['af', 'affix', 'suffix', 'prefix']);

/**
 * The parts one dictionary template names. `form` is the template's parts joined with " + ". A hyphen marks an affix
 * ("-keit" a suffix, "ver-" a prefix, "-s-" a linking element); without hyphens the template kind decides (prefix: the
 * first part is the prefix; suffix: the last is the suffix) and every other part is a root or, in a compound, a component.
 */
function partsOfTemplate(k: string, form: string, source: string): StructurePart[] {
  const raw = form.split(/\s+\+\s+/).map((p) => p.replace(/[\u0000-\u001f\u007f]/g, '').trim()).filter((p) => p && p !== '-' && p !== '?');
  if (!raw.length || raw.length > 8 || raw.some((p) => p.length > 40)) return [];
  const affixy = (p: string): boolean => /^-|-$/.test(p);
  const bases = raw.filter((p, i) => !affixy(p) && !(k === 'prefix' && i === 0) && !(k === 'suffix' && i === raw.length - 1)).length;
  return raw.map((p, i): StructurePart => {
    const lead = p.startsWith('-'); const trail = p.endsWith('-') && p.length > 1;
    let role: StructureRole;
    if (lead && trail) role = 'linking';
    else if (lead) role = 'suffix';
    else if (trail) role = 'prefix';
    else if (k === 'prefix' && i === 0) role = 'prefix';
    else if (k === 'suffix' && i === raw.length - 1) role = 'suffix';
    else if (k === 'com' || k === 'compound' || k === 'blend') role = 'component';
    else role = bases > 1 ? 'component' : 'root';
    return { text: p, role, source };
  });
}

const baseOf = (p: string): string => p.replace(/^\*/, '').replace(/^-+|-+$/g, '');
const normText = (s: string | undefined): string => (s ?? '').normalize('NFC').toLowerCase();

const PART_ROLE: Record<NonNullable<WordPart['kind']>, StructureRole> = { component: 'component', head: 'head', link: 'linking', contracted: 'component', clitic: 'clitic', prefix: 'prefix', marker: 'linking', stem: 'stem' };

/** The analyser's reading of the word that matches the card's lemma, part of speech and features, with the structure it carries. */
function analysedReading(adapter: LanguageAdapter, word: string, lemma: string, pos: string | undefined, features: Record<string, string>): AnalysisCandidate | undefined {
  const analysed = safe(() => adapter.analyze([{ surface: word, start: 0, end: word.length, isWord: true, normalized: adapter.normalize(word) }]));
  const cands = analysed?.[0]?.candidates ?? [];
  const same = cands.filter((c) => normText(c.lemma) === normText(lemma) && (!pos || !c.pos || c.pos === pos));
  if (!same.length) return undefined;
  const score = (c: AnalysisCandidate): number => Object.entries(features).filter(([k, v]) => c.morph?.[k] === v).length;
  const top = Math.max(...same.map(score));
  const pool = same.filter((c) => score(c) === top);
  return pool.find(hasStructure) ?? pool[0];
}
const hasStructure = (c: AnalysisCandidate): boolean => (c.parts?.length ?? 0) >= 2 || Array.isArray(c.notes?.components) || typeof c.notes?.derivedFrom === 'string' || !!c.unit;

/** The longest common prefix of the paradigm's one-word cells, as the stem of the selected form, when it is a believable one. */
function generatedSplit(adapter: LanguageAdapter, lemma: string, pos: PartOfSpeech, surface: string, features: Record<string, string>): { stem: string; ending: string } | undefined {
  const g = adapter.paradigm ? safe(() => adapter.paradigm!(lemma, pos, { features, surface })) : undefined;
  if (!g || g.kind === 'none' || !g.cells?.length) return undefined;
  const forms = [...new Set(g.cells.map((c) => c.form.normalize('NFC')).filter((f) => f && !/\s/.test(f)))];
  const w = surface.normalize('NFC');
  if (forms.length < 2 || !forms.some((f) => normText(f) === normText(w))) return undefined;
  let lcp = forms[0];
  for (const f of forms) { let i = 0; while (i < lcp.length && i < f.length && normText(lcp[i]) === normText(f[i])) i++; lcp = lcp.slice(0, i); }
  // never cut between a consonant and its nukta / virama; an irregular paradigm shares too little to name a stem
  while (lcp.length && /[़्]/.test(w[lcp.length] ?? '')) lcp = lcp.slice(0, -1);
  if (lcp.length < 2 || lcp.length < Math.ceil(lemma.length / 2) || lcp.length >= w.length) return undefined;
  return { stem: w.slice(0, lcp.length), ending: w.slice(lcp.length) };
}

/**
 * The structure of a word, from named sources only and never from guesswork. In this order: (1) the dictionary's etymology
 * templates that give parts (af, affix, suffix, prefix, compound, com, blend); (2) the analyser's reading: compound
 * components, a separable prefix, attached pronouns, the causative base or the word a derivation comes from (`parts`,
 * `notes`, `unit`); (3) the stem and ending of the selected form when the analyser's paradigm generates the lemma
 * (`generated`: the shared start of the paradigm's cells is the stem); (4) the dictionary's derived and related words as the
 * family. A source that has nothing contributes nothing: a word with no source stays `unknown` and is never split.
 */
export function structureOf(record: LexicalRecord | undefined, adapter: LanguageAdapter | undefined, lemma: string, pos: PartOfSpeech | string | undefined, surface: string, features: Record<string, string> = {}, opts: { languageId?: string } = {}): WordStructureView {
  const notes: string[] = [];
  const own = opts.languageId ?? adapter?.lang;
  const ownName = languageNameOf(own);
  const wordLemma = lemma.trim() || surface.trim();
  const written = surface.trim() || wordLemma;

  // (1) the dictionary's templates
  let parts: StructurePart[] = [];
  let derivedFrom: WordStructureView['derivedFrom'];
  const templates = (record?.ety?.tpl ?? []).filter((t) => t && PART_TEMPLATES.has(String(t.k)) && typeof t.form === 'string').map((t) => ({ k: String(t.k), lang: str(t.lang, 20), form: String(t.form) }));
  const ordered = [...templates.filter((t) => !t.lang || t.lang === own), ...templates.filter((t) => t.lang && t.lang !== own)];
  for (const t of ordered) {
    const source = `Wiktionary etymology template “${t.k}”`;
    const tp = partsOfTemplate(t.k, t.form, source);
    if (!tp.length) continue;
    parts = tp;
    const foreign = !!t.lang && t.lang !== own;
    if (foreign) notes.push(`The dictionary gives these parts for the ${languageNameOf(t.lang) ?? t.lang} word this one comes from, not for the ${ownName ?? 'word\'s own language'} word itself.`);
    else {
      const bases = tp.filter((p) => p.role === 'root');
      const affixes = tp.filter((p) => p.role === 'prefix' || p.role === 'suffix');
      if (FORMING.has(t.k) && bases.length === 1 && affixes.length && !tp.some((p) => p.role === 'component')) {
        derivedFrom = { lemma: baseOf(bases[0].text), relation: `formed with ${affixes.map((a) => `${a.role} ${a.text}`).join(' and ')}`, source };
      }
    }
    break;
  }
  const fromTemplate = parts.length > 0;

  // (2) the analyser's reading
  let analyserParts: StructurePart[] = [];
  let analyserDerived: WordStructureView['derivedFrom'];
  let analyserSource = '';
  if (adapter) {
    analyserSource = `${adapter.name} analyser (${adapter.lang}@${adapter.version}), by its rules`;
    let reading = analysedReading(adapter, written, wordLemma, pos, features);
    let on = 'the written form';
    if ((!reading || !hasStructure(reading)) && normText(written) !== normText(wordLemma)) {
      const viaLemma = analysedReading(adapter, wordLemma, wordLemma, pos, {});
      if (viaLemma && hasStructure(viaLemma)) { reading = viaLemma; on = 'the lemma'; }
    }
    if (reading) {
      const src = `${analyserSource}, on ${on}`;
      const wp = reading.parts ?? [];
      if (wp.length >= 2) {
        analyserParts = wp.filter((p) => p.text).map((p): StructurePart => {
          const bits = [p.role, p.lemma && normText(p.lemma) !== normText(p.text) ? `lemma ${p.lemma}` : undefined].filter((x): x is string => !!x);
          return { text: p.text, role: p.kind ? PART_ROLE[p.kind] : /pronoun|reflexive|clitic/i.test(p.role ?? '') ? 'clitic' : 'component', ...(bits.length ? { gloss: bits.join('; ') } : {}), source: src };
        });
      } else if (Array.isArray(reading.notes?.components) && reading.notes!.components.length >= 2) {
        analyserParts = (reading.notes!.components as string[]).filter((x) => typeof x === 'string' && x).map((text) => ({ text, role: 'component' as const, source: src }));
      }
      const df = reading.notes?.derivedFrom;
      if (typeof df === 'string' && df.trim()) {
        const causative = typeof reading.notes?.causative === 'string' ? reading.notes.causative : undefined;
        analyserDerived = { lemma: df.trim(), relation: causative ? `${causative} causative of` : reading.morph?.Voice === 'Cau' ? 'causative of (marked so in the analyser\'s word list)' : 'derived from, by the analyser\'s rule', source: src };
      }
      if (reading.unit) notes.push(`This word is a piece of the unit “${reading.unit.display}” (${reading.unit.role}), as the analyser reads the sentence.`);
      const stemNote = reading.notes?.stem;
      if (typeof stemNote === 'string' && stemNote && !analyserParts.some((p) => p.role === 'stem')) notes.push(`Stem by the analyser's rules: ${stemNote}.`);
    }
  }

  // (3) the generated stem and ending of the selected form
  let generated: StructurePart[] = [];
  if (adapter && pos) {
    const split = generatedSplit(adapter, wordLemma, pos as PartOfSpeech, written, features);
    if (split) {
      const src = `${adapter.name} analyser (${adapter.lang}@${adapter.version}), generated: the stem is the start the paradigm's forms share`;
      const gloss = Object.keys(features).sort().map((k) => `${k} ${features[k]}`).join(', ');
      generated = [{ text: split.stem, role: 'stem', source: src }, { text: split.ending, role: 'ending', ...(gloss ? { gloss } : {}), source: src }];
    }
  }

  // which source supplies the parts
  let status: FieldStatus = 'unknown';
  if (fromTemplate) {
    status = 'supported-by-source';
    if (analyserParts.length && normText(written) === normText(wordLemma)) {
      const join = (ps: StructurePart[]): string => normText(ps.map((p) => baseOf(p.text)).join(''));
      if (join(analyserParts) !== join(parts)) notes.push(`The analyser's rules cut this word differently (${analyserParts.map((p) => p.text).join(' | ')}); the dictionary's parts are shown.`);
    }
    if (generated.length) notes.push(`The form “${written}” is the stem “${generated[0].text}” with the ending “${generated[1].text}” (generated by the analyser's rules, not from the dictionary).`);
  } else if (analyserParts.length) {
    parts = analyserParts; status = 'provisional';
    if (generated.length) notes.push(`The form “${written}” is the stem “${generated[0].text}” with the ending “${generated[1].text}” (generated by the analyser's rules).`);
  } else if (generated.length) {
    parts = generated; status = 'provisional';
  }
  if (!derivedFrom && analyserDerived) { derivedFrom = analyserDerived; if (status === 'unknown') status = 'provisional'; }
  else if (derivedFrom && analyserDerived && normText(derivedFrom.lemma) !== normText(analyserDerived.lemma)) notes.push(`The analyser's rules read it as derived from “${analyserDerived.lemma}”; the dictionary's template gives “${derivedFrom.lemma}”.`);
  if (status === 'provisional') notes.push('Provisional: from the analyser\'s rules only, with no dictionary template to confirm it.');

  // (4) the family
  const rel = relationsOf(record);
  const family: WordStructureView['family'] = { derived: rel.derived, related: rel.related, ...(rel.derived.length || rel.related.length ? { source: WIKTIONARY.label } : {}) };
  return { status, parts, ...(derivedFrom ? { derivedFrom } : {}), family, notes };
}

function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }
