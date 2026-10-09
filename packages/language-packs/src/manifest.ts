/**
 * The pack manifest: one declarative description of a language pack, checked by `validateManifest` before a pack is
 * installed or listed. A manifest is data (JSON-able, no functions); the code a pack needs (the analyser) is named by
 * `analyzer.id` and found by the runtime.
 *
 * Honesty rules the validator enforces: an installable pack names real validation cases; a dictionary that is
 * CC BY-SA carries the attribution line; a remote voice is never offered without consent and a key; the review status
 * of the pack is never higher than that of its own hand lexicon; a Norwegian pack states its written standard.
 */
import type { LanguagePackInfo, ValidationIssue } from '../../repository-contract/src';

export type ReviewStatus = 'machine-drafted' | 'partly-reviewed' | 'reviewed';

/**
 * How far a pack is built, in the words the setup page shows.
 *   installable   an analyser, a dictionary, validation cases and an orientation exist (Albanian; Spanish at a minimal level)
 *   experimental  wired and installable, but only at a deliberately minimal level: seed-only lemmatisation, an unreviewed
 *                 word list, validation cases and no orientation tutorial; shown as "experimental, seed-only
 *                 lemmatisation, unreviewed" (German, Hindi, Thai)
 *   planned       described honestly and never installable (Norwegian)
 * `status` keeps its two values ('installable' | 'planned'): an experimental pack has status 'installable' (the installer
 * and the parser accept it) and `level: 'experimental'`. A manifest without `level` has the level its status implies.
 */
export type PackLevel = 'installable' | 'experimental' | 'planned';
const REVIEW_RANK: Record<ReviewStatus, number> = { 'machine-drafted': 0, 'partly-reviewed': 1, reviewed: 2 };

export interface GrammarFeature {
  /** The feature key as the analyser writes it ('Case', 'Definite' …). */
  key: string;
  /** Plain label shown to the learner ('Case'). */
  label: string;
  /** Value code → plain-language name ('Acc' → 'accusative'). */
  values: Record<string, string>;
  /** What the feature does in this language, in plain words. */
  explain: string;
}

export interface GrammarConstruction { id: string; label: string; explain: string }

export interface ValidationCase {
  id: string;
  /** The selected word, exactly as written in the sentence. */
  surface: string;
  /** The sentence the word is read in; absent = the word is read alone. */
  sentence?: string;
  expect: {
    lemma?: string;
    pos?: string;
    /** Every listed feature must equal the analyser's value for the top reading (a union is written 'Nom,Acc'). */
    features?: Record<string, string>;
    /** 'high-confidence' | 'conflicted' | 'provisional' (see analysis.ts: the same rule as the Repository resolver). */
    status?: string;
    /** 'none': the analyser must give no reading at all (a word it does not know). */
    readings?: 'none';
  };
}

export interface PackVariety {
  varietyId: string;
  label: string;
  /** Norwegian only: which written standard this variety is. */
  writtenStandard?: 'nb' | 'nn';
  /** True when the pack analyses this variety; false when it only relates forms to it. */
  analysed: boolean;
  note?: string;
}

export interface PackManifest {
  packId: string;
  languageId: string;
  varietyId: string;
  scriptId: string;
  version: string;
  compatibility: { contractVersion: number; extensionMin: string };
  identity: { name: string; nativeName: string; direction: 'ltr' | 'rtl' };
  /** Every variety the pack names; `varietyId` is the default one. Norway: the written standard is explicit here. */
  varieties: PackVariety[];
  lexical: {
    handLexicon: { ref: string; licence: string; reviewStatus: ReviewStatus };
    dictionary?: { id: string; baseUrl: string; licence: string; attribution: string; entries: number; frequency: boolean };
  };
  analyzer: { id: string; version: string; capabilities: string[] };
  segmentation: { method: 'adapter' | 'intl'; notes: string };
  sentenceBoundaries: { method: 'adapter' | 'intl' };
  grammar: {
    features: GrammarFeature[];
    constructions: GrammarConstruction[];
    clitics?: string[];
  };
  pronunciation: {
    registryRef: string;
    notesAvailable: boolean;
    recordings: 'none' | 'some';
    deviceVoiceExpected: boolean;
    remoteVoice: { provider: string; voices: string[]; requiresConsentAndKey: true };
  };
  tutorial: { ref: string; estimatedMinutes: number; skippable: true };
  rights: {
    provenance: string[];
    licences: Array<{ resource: string; licence: string; notice?: string }>;
    reviewStatus: ReviewStatus;
  };
  validation: ValidationCase[];
  status: 'installable' | 'planned';
  /** How far the pack is built (see PackLevel). Absent = derived from `status`; an experimental pack must say so here. */
  level?: PackLevel;
}

/** The level of a pack: its stated level, else the one its status implies. */
export function levelOf(m: Pick<PackManifest, 'status' | 'level'>): PackLevel {
  return m.level ?? (m.status === 'installable' ? 'installable' : 'planned');
}

/** The learner-facing label of a level; an experimental pack is never shown as plainly installable. */
export const LEVEL_LABEL: Readonly<Record<PackLevel, string>> = Object.freeze({
  installable: 'installable',
  experimental: 'experimental, seed-only lemmatisation, unreviewed',
  planned: 'planned, not installable',
});

/** An installable pack proves itself with at least this many real selections. */
export const MIN_VALIDATION_CASES = 12;
/** The line every surface that shows a Wiktionary-derived gloss must show. */
export const KAIKKI_ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Runtime validation of an untrusted manifest (a pack fetched from elsewhere is checked, never trusted). */
export function validateManifest(m: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const bad = (path: string, message: string): void => { out.push({ path, message }); };
  if (!isObj(m)) return [{ path: '', message: 'not an object' }];
  const x = m as Record<string, any>;

  for (const k of ['packId', 'languageId', 'varietyId', 'scriptId', 'version']) if (!isStr(x[k])) bad(k, 'required string');
  if (isStr(x.packId) && !/^pack:[a-z]{2,3}$/u.test(x.packId)) bad('packId', 'must look like pack:<language code>');
  if (isStr(x.packId) && isStr(x.languageId) && x.packId !== `pack:${x.languageId}`) bad('packId', 'must be pack:<languageId>');
  if (x.status !== 'installable' && x.status !== 'planned') bad('status', "'installable' or 'planned'");
  if (x.level !== undefined) {
    if (x.level !== 'installable' && x.level !== 'experimental' && x.level !== 'planned') bad('level', "'installable', 'experimental' or 'planned'");
    else if ((x.level === 'planned') !== (x.status === 'planned')) bad('level', "'planned' goes with status 'planned' and no other level does");
    else if (x.level === 'experimental' && isObj(x.rights) && x.rights.reviewStatus !== 'machine-drafted') bad('level', 'an experimental pack is unreviewed (machine-drafted)');
  }

  const comp = x.compatibility;
  if (!isObj(comp) || !Number.isInteger(comp.contractVersion) || !isStr(comp.extensionMin)) bad('compatibility', 'contractVersion (integer) and extensionMin required');

  const id = x.identity;
  if (!isObj(id) || !isStr(id.name) || !isStr(id.nativeName) || (id.direction !== 'ltr' && id.direction !== 'rtl')) bad('identity', 'name, nativeName and direction (ltr|rtl) required');

  // varieties
  if (!Array.isArray(x.varieties) || x.varieties.length === 0) bad('varieties', 'at least one variety required');
  else {
    const seen = new Set<string>();
    x.varieties.forEach((v: any, i: number) => {
      if (!isObj(v) || !isStr(v.varietyId) || !isStr(v.label) || typeof v.analysed !== 'boolean') { bad(`varieties[${i}]`, 'varietyId, label and analysed required'); return; }
      if (seen.has(v.varietyId)) bad(`varieties[${i}].varietyId`, 'duplicate variety');
      seen.add(v.varietyId);
      if (v.writtenStandard !== undefined && v.writtenStandard !== 'nb' && v.writtenStandard !== 'nn') bad(`varieties[${i}].writtenStandard`, "'nb' or 'nn'");
      if ((x.languageId === 'nb' || x.languageId === 'nn') && v.writtenStandard !== x.languageId) bad(`varieties[${i}].writtenStandard`, `a Norwegian pack states its written standard explicitly (${x.languageId})`);
    });
    if (isStr(x.varietyId) && !x.varieties.some((v: any) => isObj(v) && v.varietyId === x.varietyId)) bad('varietyId', 'must be one of the listed varieties');
  }

  // lexical
  const lex = x.lexical;
  if (!isObj(lex) || !isObj(lex.handLexicon) || !isStr(lex.handLexicon.ref) || !isStr(lex.handLexicon.licence) || !((lex.handLexicon.reviewStatus as string) in REVIEW_RANK)) bad('lexical.handLexicon', 'ref, licence and reviewStatus required');
  if (isObj(lex) && lex.dictionary !== undefined) {
    const d = lex.dictionary;
    if (!isObj(d) || !isStr(d.id) || !isStr(d.baseUrl) || !isStr(d.licence) || !isStr(d.attribution) || !Number.isInteger(d.entries) || d.entries <= 0 || typeof d.frequency !== 'boolean') bad('lexical.dictionary', 'id, baseUrl, licence, attribution, entries (> 0) and frequency required');
    else {
      if (/^[a-z][a-z0-9+.-]*:|^\/|\.\./iu.test(d.baseUrl)) bad('lexical.dictionary.baseUrl', 'must be relative to the application asset base (no scheme, no leading slash, no ..)');
      else if (isStr(x.languageId) && !d.baseUrl.endsWith(`/${x.languageId}/`)) bad('lexical.dictionary.baseUrl', `must end with /${x.languageId}/`);
      if (/CC BY-SA/iu.test(d.licence) && !d.attribution.includes('CC BY-SA 4.0')) bad('lexical.dictionary.attribution', 'a CC BY-SA dictionary must carry its licence in the attribution line');
      if (/Wiktionary|kaikki/iu.test(d.id + d.licence) && d.attribution !== KAIKKI_ATTRIBUTION) bad('lexical.dictionary.attribution', `must read exactly: ${KAIKKI_ATTRIBUTION}`);
    }
  }

  // analyzer
  const an = x.analyzer;
  if (!isObj(an) || !isStr(an.id) || !isStr(an.version) || !Array.isArray(an.capabilities) || an.capabilities.some((c: unknown) => !isStr(c))) bad('analyzer', 'id, version and capabilities (strings) required');
  else {
    if (isStr(x.languageId) && an.id !== `adapter-${x.languageId}@${an.version}`) bad('analyzer.id', 'must be adapter-<languageId>@<analyzer.version>');
    if (isStr(x.version) && an.version !== x.version) bad('analyzer.version', 'must equal the pack version (a pack is versioned by its analyser)');
  }
  const seg = x.segmentation;
  if (!isObj(seg) || (seg.method !== 'adapter' && seg.method !== 'intl') || !isStr(seg.notes)) bad('segmentation', "method ('adapter'|'intl') and notes required");
  if (!isObj(x.sentenceBoundaries) || (x.sentenceBoundaries.method !== 'adapter' && x.sentenceBoundaries.method !== 'intl')) bad('sentenceBoundaries', "method ('adapter'|'intl') required");

  // grammar
  const g = x.grammar;
  if (!isObj(g) || !Array.isArray(g.features) || !Array.isArray(g.constructions)) bad('grammar', 'features and constructions required');
  else {
    const keys = new Set<string>();
    g.features.forEach((f: any, i: number) => {
      if (!isObj(f) || !isStr(f.key) || !isStr(f.label) || !isObj(f.values) || !isStr(f.explain)) { bad(`grammar.features[${i}]`, 'key, label, values and explain required'); return; }
      if (keys.has(f.key)) bad(`grammar.features[${i}].key`, 'duplicate feature');
      keys.add(f.key);
      if (Object.keys(f.values).length === 0 || Object.values(f.values).some((v) => !isStr(v))) bad(`grammar.features[${i}].values`, 'at least one value, each with a plain name');
    });
    const ids = new Set<string>();
    g.constructions.forEach((c: any, i: number) => {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.label) || !isStr(c.explain)) { bad(`grammar.constructions[${i}]`, 'id, label and explain required'); return; }
      if (ids.has(c.id)) bad(`grammar.constructions[${i}].id`, 'duplicate construction');
      ids.add(c.id);
    });
    if (g.clitics !== undefined && (!Array.isArray(g.clitics) || g.clitics.some((c: unknown) => !isStr(c)))) bad('grammar.clitics', 'array of strings');
  }

  // pronunciation
  const p = x.pronunciation;
  if (!isObj(p) || !isStr(p.registryRef) || typeof p.notesAvailable !== 'boolean' || (p.recordings !== 'none' && p.recordings !== 'some') || typeof p.deviceVoiceExpected !== 'boolean') bad('pronunciation', 'registryRef, notesAvailable, recordings and deviceVoiceExpected required');
  else {
    const rv = p.remoteVoice;
    if (!isObj(rv) || !isStr(rv.provider) || !Array.isArray(rv.voices) || rv.voices.some((v: unknown) => !isStr(v))) bad('pronunciation.remoteVoice', 'provider and voices required');
    else if (rv.requiresConsentAndKey !== true) bad('pronunciation.remoteVoice.requiresConsentAndKey', 'a remote voice always requires the learner’s consent and key (must be true)');
  }

  const tu = x.tutorial;
  if (!isObj(tu) || !isStr(tu.ref) || !(typeof tu.estimatedMinutes === 'number' && tu.estimatedMinutes > 0) || tu.skippable !== true) bad('tutorial', 'ref, estimatedMinutes (> 0) and skippable: true required (the orientation is never forced)');

  // rights
  const r = x.rights;
  if (!isObj(r) || !Array.isArray(r.provenance) || r.provenance.length === 0 || r.provenance.some((s: unknown) => !isStr(s)) || !Array.isArray(r.licences) || !((r.reviewStatus as string) in REVIEW_RANK)) bad('rights', 'provenance (non-empty), licences and reviewStatus required');
  else {
    r.licences.forEach((l: any, i: number) => { if (!isObj(l) || !isStr(l.resource) || !isStr(l.licence)) bad(`rights.licences[${i}]`, 'resource and licence required'); });
    if (isObj(lex) && isObj(lex.handLexicon) && (lex.handLexicon.reviewStatus as string) in REVIEW_RANK && REVIEW_RANK[r.reviewStatus as ReviewStatus] > REVIEW_RANK[lex.handLexicon.reviewStatus as ReviewStatus]) bad('rights.reviewStatus', 'a pack is not reviewed beyond its hand lexicon');
  }

  // validation cases
  if (!Array.isArray(x.validation)) bad('validation', 'array required');
  else {
    const ids = new Set<string>();
    x.validation.forEach((c: any, i: number) => {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.surface) || !isObj(c.expect)) { bad(`validation[${i}]`, 'id, surface and expect required'); return; }
      if (ids.has(c.id)) bad(`validation[${i}].id`, 'duplicate case id');
      ids.add(c.id);
      if (c.sentence !== undefined && (!isStr(c.sentence) || !c.sentence.includes(c.surface))) bad(`validation[${i}].sentence`, 'the sentence must contain the selected surface');
      const e = c.expect;
      if (e.lemma === undefined && e.pos === undefined && e.features === undefined && e.status === undefined && e.readings === undefined) bad(`validation[${i}].expect`, 'state at least one expectation');
    });
  }

  if (x.status === 'installable') {
    if (Array.isArray(x.validation) && x.validation.length < MIN_VALIDATION_CASES) bad('validation', `an installable pack needs at least ${MIN_VALIDATION_CASES} validation cases`);
    if (isObj(an) && Array.isArray(an.capabilities) && an.capabilities.length === 0) bad('analyzer.capabilities', 'an installable pack states what its analyser can do');
    if (isObj(lex) && lex.dictionary === undefined) bad('lexical.dictionary', 'an installable pack declares its dictionary (planned packs may not)');
  }
  return out;
}

/** The manifest in the shape the Repository records for a pack (agrees with the Repository’s own descriptor of the pack). */
export function toPackInfo(m: PackManifest, extraNotes: string[] = []): LanguagePackInfo {
  return {
    packId: m.packId,
    languageId: m.languageId,
    version: m.version,
    analyzerId: m.analyzer.id,
    coverage: { notes: [...m.rights.provenance, ...extraNotes] },
    licences: m.rights.licences.map((l) => ({ ...l })),
    reviewStatus: m.rights.reviewStatus,
  };
}
