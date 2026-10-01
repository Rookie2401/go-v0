/**
 * The importer: validate everything first, build every row in memory, then write atomically (one
 * `store.transaction`), the `Text` row LAST. Repeatable and versioned:
 *
 *  - re-importing an unchanged document writes nothing and changes no version (content signature in `meta`);
 *  - a changed sentence gets a new key/id and the old sentence is RETIRED (kept as history, `retiredInVersion`),
 *    `contentVersion` bumps, unchanged sentences keep their ids, tokens, human corrections (and, through
 *    GoListen's text-hash cache keys, their audio); encounters and events are never touched;
 *  - rows left behind by a previously failed attempt (no Text row, or sentences newer than the Text's version)
 *    are cleaned before the import proceeds.
 */
import type {
  AdapterRegistry, AppStore, ContentNote, ContentSource, DictionaryEntry, DictionaryInfo, EnglishRescue, LanguageCode, LexiconSource,
  PhraseOccurrence, PatternOccurrence, Sentence, Text, Token, TokenAnalysis, TransformationRecord,
} from '../core';
import { hash, ids } from '../core';
import type { AnalysisCoverage } from '../adapters/shared';
import { describeVersionBump } from './history';
import { hasErrors, validateBatch, type CorpusDocument, type ValidationIssue } from './format';
import {
  INGEST_TOOL, buildNoteRows, collectWordForms, coverageWarning, materializeSentence, newCatalog, planDocument, type DocumentPlan, type PlannedSentence,
  type SentenceRows,
} from './plan';

export interface ImportOptions {
  /** ISO timestamp source; defaults to the wall clock. Tests pass a fixed clock for exact repeatability checks. */
  clock?: () => string;
  /**
   * The installed dictionary of a language, if any. Words the language adapter cannot analyse are looked up in it and
   * analysed from it (provenance `lexicon`, analyzer `dict:<id>`, confidence below certainty). Installing or changing a
   * dictionary re-analyses a text on its next import. Without it (or with no dictionary installed) nothing changes.
   */
  lexicon?: (lang: LanguageCode) => LexiconSource | undefined;
}

export type ImportAction = 'created' | 'updated' | 'unchanged' | 'rejected';

export interface DocumentReport {
  id: string;
  textId?: string;
  action: ImportAction;
  contentVersion: number;
  published: boolean;
  /** Readable because it is the learner's own copy of a published work: on this device only, not published to anyone. */
  personalCopy?: true;
  unpublishedReasons: string[];
  issues: ValidationIssue[];
  analysisCoverage: AnalysisCoverage;
  sentencesAdded: number;
  sentencesRetired: number;
  /** Set on a document that was valid itself but rejected together with the batch. */
  note?: string;
}

export interface ImportReport {
  /** True when every document was imported (or was already up to date). */
  ok: boolean;
  documents: DocumentReport[];
}

const TABLES = [
  'sources', 'corpora', 'texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'lemmas', 'analyses',
  'phrases', 'phraseOccurrences', 'patterns', 'patternOccurrences', 'rescues', 'notes', 'meta',
] as const;

export const signatureKey = (textId: string) => `ingest-sig:${textId}`;

const emptyCoverage: AnalysisCoverage = { words: 0, analysed: 0, coverage: 1, unanalysed: [] };

// ── diff helpers ──

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) o[k] = canon(x);
    }
    return o;
  }
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

interface Tbl<T extends { id: string }> {
  getMany(ids: string[]): Promise<(T | undefined)[]>;
  bulkPut(rows: T[]): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Write only the rows that are missing or differ (createdAt is ignored when the row already exists). */
async function putChanged<T extends { id: string }>(table: Tbl<T>, rows: T[]): Promise<number> {
  if (!rows.length) return 0;
  const existing = await table.getMany(rows.map((r) => r.id));
  const changed = rows.filter((r, i) => {
    const e = existing[i];
    if (!e) return true;
    const ea = e as unknown as { createdAt?: string };
    return !same(ea.createdAt !== undefined ? { ...r, createdAt: ea.createdAt } : r, e);
  });
  if (changed.length) await table.bulkPut(changed);
  return changed.length;
}
async function deleteAll<T extends { id: string }>(table: Tbl<T>, idList: Iterable<string>): Promise<void> {
  for (const id of idList) await table.delete(id);
}

const compact = <T extends object>(o: T): T => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
};

// ── planning with the installed dictionary ──

/**
 * Plan valid documents, looking up in the installed dictionary (if any) every word form of the text — once
 * per form. Async and outside any transaction. A dictionary that cannot be read never blocks: the document is planned
 * without it and `notes` says why.
 */
export async function planWithDictionary(
  docs: readonly CorpusDocument[], registry: AdapterRegistry, lexicon?: ImportOptions['lexicon'],
): Promise<{ plans: DocumentPlan[]; notes: Map<number, string> }> {
  const dictionaries = new Map<LanguageCode, { src: LexiconSource; info: DictionaryInfo; known: Map<string, DictionaryEntry[]>; asked: Set<string> } | null>();
  const notes = new Map<number, string>();
  const plans: DocumentPlan[] = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const src = lexicon?.(doc.lang);
    if (!src) { plans.push(planDocument(doc, registry)); continue; }
    try {
      let dict = dictionaries.get(doc.lang);
      if (dict === undefined) {
        const info = await src.info();
        dict = info ? { src, info, known: new Map(), asked: new Set() } : null;
        dictionaries.set(doc.lang, dict);
      }
      if (!dict) { plans.push(planDocument(doc, registry)); continue; }
      const want = [...collectWordForms(doc, registry)].filter((f) => !dict!.asked.has(f));
      if (want.length) {
        const found = await dict.src.lookup(want);
        for (const f of want) dict.asked.add(f);
        for (const [form, entries] of found) if (entries.length) dict.known.set(form, entries);
      }
      plans.push(planDocument(doc, registry, { dictionary: dict.known, dictionaryId: dict.info.id }));
    } catch (e) {
      // a dictionary that cannot be read must not block the import of the text: say so and import without it
      notes.set(i, `dictionary not used: ${e instanceof Error ? e.message : String(e)}`);
      plans.push(planDocument(doc, registry));
    }
  }
  return { plans, notes };
}

/**
 * Where a plan exists the low-coverage warning comes from the plan's final coverage (word list + dictionary + supplied spans +
 * corrections), the same basis as the figure shown beside it: validation's adapter-only issue is replaced by it.
 */
function withPlanCoverage(issues: ValidationIssue[], plan: DocumentPlan, dictionaryNote?: string): ValidationIssue[] {
  const warning = coverageWarning(plan, dictionaryNote);
  const out = issues.filter((i) => i.code !== 'low-analysis-coverage');
  return warning ? [...out, warning] : out;
}

export interface DocumentPreview {
  id: string;
  issues: ValidationIssue[];
  /** Present for a document without errors: what the import would store, with the installed dictionary applied. */
  analysisCoverage?: AnalysisCoverage;
  published?: boolean;
  /** Readable because it is the learner's own copy of a published work: on this device only, not published to anyone. */
  personalCopy?: true;
  unpublishedReasons?: string[];
  note?: string;
}

/**
 * Dry run: validate the batch exactly as the import would and, for documents without errors, plan them (dictionary
 * included) to say what the import WOULD store — analysis coverage and the publication outcome. Writes nothing.
 */
export async function previewDocuments(store: AppStore, registry: AdapterRegistry, docs: readonly unknown[], opts: ImportOptions = {}): Promise<DocumentPreview[]> {
  const existingTexts: Array<{ id: string; sourceId: string }> = [];
  for (const d of docs) {
    const o = d as { id?: unknown; lang?: unknown } | null;
    if (o && typeof o === 'object' && typeof o.id === 'string' && typeof o.lang === 'string') {
      const t = await store.texts.get(`text:${o.lang}:${o.id}`);
      if (t) existingTexts.push({ id: t.id, sourceId: t.sourceId });
    }
  }
  const knownWorks = new Set((await store.works.all()).map((w) => w.id));
  const batch = validateBatch(docs, { registry, existingTexts, knownWorks });
  const out: DocumentPreview[] = [];
  for (let i = 0; i < docs.length; i++) {
    const r = batch.documents[i];
    if (hasErrors(r.issues)) { out.push({ id: r.id, issues: r.issues }); continue; }
    const { plans, notes } = await planWithDictionary([docs[i] as CorpusDocument], registry, opts.lexicon);
    const plan = plans[0];
    out.push({
      id: r.id, issues: withPlanCoverage(r.issues, plan, notes.get(0)), analysisCoverage: plan.coverage, published: plan.decision.published,
      ...(plan.decision.personalCopy ? { personalCopy: true as const } : {}),
      unpublishedReasons: plan.decision.unpublishedReasons, ...(notes.has(0) ? { note: notes.get(0) } : {}),
    });
  }
  return out;
}

// ── the import ──

/**
 * Import documents. Validation covers the whole batch first: if any document has an error NOTHING is written
 * (every document is reported `rejected`, the faulty ones with their issues). Otherwise everything is written in
 * one transaction.
 */
export async function importDocuments(store: AppStore, registry: AdapterRegistry, docs: readonly unknown[], opts: ImportOptions = {}): Promise<ImportReport> {
  const now = (opts.clock ?? (() => new Date().toISOString()))();

  // which of these text ids already exist (under which source)?
  const existingTexts: Array<{ id: string; sourceId: string }> = [];
  for (const d of docs) {
    const o = d as { id?: unknown; lang?: unknown };
    if (o && typeof o === 'object' && typeof o.id === 'string' && typeof o.lang === 'string') {
      const t = await store.texts.get(`text:${o.lang}:${o.id}`);
      if (t) existingTexts.push({ id: t.id, sourceId: t.sourceId });
    }
  }
  const knownWorks = new Set((await store.works.all()).map((w) => w.id));
  const batch = validateBatch(docs, { registry, existingTexts, knownWorks });

  if (!batch.ok) {
    return {
      ok: false,
      documents: batch.documents.map((r, i) => {
        const bad = hasErrors(r.issues);
        const doc = docs[i] as Partial<CorpusDocument> | undefined;
        return {
          id: r.id, textId: doc?.lang && typeof doc.id === 'string' ? ids.text(doc.lang, doc.id) : undefined, action: 'rejected' as const,
          contentVersion: 0, published: false, unpublishedReasons: [], issues: r.issues, analysisCoverage: r.coverage ?? emptyCoverage,
          sentencesAdded: 0, sentencesRetired: 0,
          ...(bad ? {} : { note: 'valid, but not imported because another document in the batch has errors (a batch imports all or nothing)' }),
        };
      }),
    };
  }

  const { plans, notes: dictNotes } = await planWithDictionary(docs as readonly CorpusDocument[], registry, opts.lexicon);
  const reports: DocumentReport[] = [];

  await store.transaction([...TABLES], async () => {
    for (let i = 0; i < plans.length; i++) {
      const r = await importOne(store, plans[i], withPlanCoverage(batch.documents[i].issues, plans[i], dictNotes.get(i)), now);
      reports.push(dictNotes.has(i) ? { ...r, note: dictNotes.get(i) } : r);
    }
  });
  return { ok: true, documents: reports };
}

async function cascadeDeleteSentence(store: AppStore, s: Sentence, tokensBySentence: Map<string, Token[]>): Promise<void> {
  for (const t of tokensBySentence.get(s.id) ?? (await store.tokens.where('sentenceId', s.id))) {
    for (const a of await store.analyses.where('tokenId', t.id)) await store.analyses.delete(a.id);
    await store.tokens.delete(t.id);
  }
  for (const o of await store.phraseOccurrences.where('sentenceId', s.id)) await store.phraseOccurrences.delete(o.id);
  for (const o of await store.patternOccurrences.where('sentenceId', s.id)) await store.patternOccurrences.delete(o.id);
  await store.rescues.delete(ids.rescue(s.id));
  await store.sentences.delete(s.id);
}

const baseKey = (key: string) => key.split('@')[0];

async function importOne(store: AppStore, plan: DocumentPlan, issues: ValidationIssue[], now: string): Promise<DocumentReport> {
  const { doc, textId, adapter, analyzerName } = plan;
  const lang = doc.lang;
  const existing = await store.texts.get(textId);
  const report = (action: ImportAction, contentVersion: number, added: number, retired: number): DocumentReport => ({
    id: doc.id, textId, action, contentVersion, published: plan.decision.published, unpublishedReasons: plan.decision.unpublishedReasons, issues,
    ...(plan.decision.personalCopy ? { personalCopy: true as const } : {}),
    analysisCoverage: plan.coverage, sentencesAdded: added, sentencesRetired: retired,
  });

  // fast path: the stored content signature equals what this import would write
  if (existing) {
    const sig = await store.meta.get(signatureKey(textId));
    if (sig?.value === plan.signature) return report('unchanged', existing.contentVersion, 0, 0);
  }

  // ── what exists for this text ──
  const oldSentences = await store.sentences.where('textId', textId);
  const oldTokens = await store.tokens.where('textId', textId);
  const tokensBySentence = new Map<string, Token[]>();
  for (const t of oldTokens) (tokensBySentence.get(t.sentenceId) ?? tokensBySentence.set(t.sentenceId, []).get(t.sentenceId)!).push(t);

  // orphans of a failed attempt
  let live: Sentence[] = [];
  const retiredByKey = new Map<string, Sentence>();
  if (!existing) {
    for (const s of oldSentences) await cascadeDeleteSentence(store, s, tokensBySentence);
    for (const o of await store.phraseOccurrences.where('textId', textId)) await store.phraseOccurrences.delete(o.id);
    for (const o of await store.patternOccurrences.where('textId', textId)) await store.patternOccurrences.delete(o.id);
    for (const r of await store.rescues.where('textId', textId)) await store.rescues.delete(r.id);
    for (const x of await store.sections.where('textId', textId)) await store.sections.delete(x.id);
    for (const p of await store.paragraphs.where('textId', textId)) await store.paragraphs.delete(p.id);
  } else {
    for (const s of oldSentences) {
      if ((s.versionAdded ?? 0) > existing.contentVersion) { await cascadeDeleteSentence(store, s, tokensBySentence); continue; }
      let row = s;
      if (s.retiredInVersion !== undefined && s.retiredInVersion > existing.contentVersion) {
        row = { ...s };
        delete row.retiredInVersion; // the retirement belongs to the failed attempt
        await store.sentences.put(row);
      }
      if (row.retiredInVersion !== undefined) { if (row.key) retiredByKey.set(row.key, row); } else live.push(row);
    }
    live = live.sort((a, b) => a.index - b.index);
  }

  const baseVersion = existing?.contentVersion ?? 0;

  // ── match planned sentences to existing ones ──
  type Match = { ps: PlannedSentence; id: string; key: string; reuse?: Sentence; status: 'kept' | 'added' | 'revived' };
  const liveByKey = new Map(live.filter((s) => s.key).map((s) => [s.key, s]));
  const liveByBase = new Map<string, Sentence>();
  for (const s of live) if (s.key) liveByBase.set(baseKey(s.key), s);
  const usedIds = new Set<string>();
  const matches: Match[] = [];
  const pendingNew: Array<{ m: Match; authorId: string }> = [];
  for (const ps of plan.sentences) {
    const hashText = hash(ps.text);
    let m: Match;
    if (ps.authorId === undefined) {
      const key = ps.hashKey;
      const l = liveByKey.get(key);
      const r = retiredByKey.get(key);
      m = l ? { ps, id: l.id, key, reuse: l, status: 'kept' } : r ? { ps, id: r.id, key, reuse: r, status: 'revived' } : { ps, id: ids.sentence(textId, key), key, status: 'added' };
    } else {
      const a = ps.authorId;
      const l = liveByBase.get(a);
      if (l && l.textHash === hashText) m = { ps, id: l.id, key: l.key, reuse: l, status: 'kept' };
      else {
        const r = [...retiredByKey.values()].find((x) => baseKey(x.key) === a && x.textHash === hashText);
        if (r) m = { ps, id: r.id, key: r.key, reuse: r, status: 'revived' };
        else {
          m = { ps, id: '', key: '', status: 'added' };
          pendingNew.push({ m, authorId: a });
        }
      }
    }
    if (m.id) usedIds.add(m.id);
    matches.push(m);
  }
  // keys for changed/new author-id sentences are decided after the content version is known
  const liveIdSeq = live.filter((s) => s.key).map((s) => s.id);
  const provisional = matches.map((m) => m.id).filter(Boolean);
  const hasPendingOrChange = pendingNew.length > 0 || provisional.length !== liveIdSeq.length || provisional.some((id, i) => id !== liveIdSeq[i]) || live.some((s) => !s.key);
  const contentVersion = existing ? baseVersion + (hasPendingOrChange ? 1 : 0) : 1;
  const takenKeys = new Set<string>([...oldSentences.map((s) => s.key).filter(Boolean)]);
  for (const { m, authorId } of pendingNew) {
    let key = authorId;
    if (takenKeys.has(key)) key = `${authorId}@${contentVersion}`;
    m.key = key;
    m.id = ids.sentence(textId, key);
    takenKeys.add(key);
    usedIds.add(m.id);
  }
  const newSeq = matches.map((m) => m.id);
  const contentChanged = !existing || newSeq.length !== liveIdSeq.length || newSeq.some((id, i) => id !== liveIdSeq[i]) || live.some((s) => !s.key);
  const retire = live.filter((s) => !usedIds.has(s.id));
  const added = matches.filter((m) => m.status !== 'kept').length;

  const lastAdapterTool = existing ? [...existing.transformations].reverse().find((t) => t.tool.startsWith('adapter-'))?.tool : undefined;
  const analyzerChanged = !!existing && lastAdapterTool !== analyzerName;
  // the dictionary that analysed this text last time (none ⇒ undefined); installing, changing or removing one re-analyses
  const lastDictTool = existing ? [...existing.transformations].reverse().find((t) => t.tool.startsWith('dict:'))?.tool : undefined;
  const wantDictTool = plan.dictionary?.tool ?? 'dict:none';
  const dictChanged = !!existing && (lastDictTool ?? 'dict:none') !== wantDictTool;

  // ── build rows ──
  const catalog = newCatalog();
  const sentenceRows: Sentence[] = [];
  const derived: Array<{ m: Match; rows: SentenceRows }> = [];
  const sections = doc.sections.map((s, i) => ({ id: ids.section(textId, i), textId, index: i, ...(s.title !== undefined ? { title: s.title } : {}), ...(s.chapter !== undefined ? { chapter: s.chapter } : {}) }));
  const paragraphRows = plan.paragraphs.map((p, i) => ({ id: ids.paragraph(textId, i), textId, sectionId: sections[p.sectionIndex].id, index: i, originalText: p.originalText }));

  matches.forEach((m, index) => {
    const ps = m.ps;
    const row: Sentence = compact({
      id: m.id, key: m.key, textId, paragraphId: paragraphRows[ps.paragraphIndex].id, lang, index,
      versionAdded: m.reuse ? (m.reuse.versionAdded ?? contentVersion) : contentVersion,
      speaker: ps.speaker, paraStart: ps.paraStart, paraEnd: ps.paraEnd, text: ps.text, normalizedText: adapter.normalize(ps.text),
      verseRefs: ps.verseRefs, textHash: hash(ps.text),
    });
    const para = plan.paragraphs[ps.paragraphIndex].originalText;
    if (para.slice(ps.paraStart, ps.paraEnd) !== ps.text) throw new Error(`paragraph offsets do not round-trip for sentence ${m.id}`);
    sentenceRows.push(row);
    const rows = materializeSentence(plan, ps, m.id, now, catalog);
    for (const t of rows.tokens) if (ps.text.slice(t.start, t.end) !== t.surface) throw new Error(`token offsets do not round-trip in ${m.id}: "${t.surface}"`);
    derived.push({ m, rows });
  });

  // notes: one row per note, anchored to the surviving/new sentence id; replaced as a set with the text
  const noteSeen = new Map<string, number>();
  const noteRows: ContentNote[] = matches.flatMap((m, i) => buildNoteRows(plan, m.ps, m.key, m.id, derived[i].rows.tokens, noteSeen));

  const retiredRows: Sentence[] = retire.map((s) => ({ ...s, versionAdded: s.versionAdded ?? 1, retiredInVersion: contentVersion }));

  // ── write: additions first, removals after, meta then Text LAST ──
  const source: ContentSource = compact({
    id: doc.source.id, title: doc.source.title, attribution: doc.source.attribution, provenance: doc.source.provenance, author: doc.source.author,
    publisher: doc.source.publisher, url: doc.source.url, edition: doc.source.edition, rights: doc.source.rights, licenseNote: doc.source.licenseNote,
    authorship: doc.source.authorship,
  });
  await putChanged(store.sources, [source]);
  if (!(await store.corpora.get(doc.corpus.id))) await store.corpora.put({ id: doc.corpus.id, lang, kind: doc.corpus.kind, title: doc.corpus.title });

  await putChanged(store.sections, sections);
  await putChanged(store.paragraphs, paragraphRows);
  await putChanged(store.sentences, sentenceRows);

  let analysisRowsWritten = 0;
  const staleAnalyses: string[] = [];
  const staleTokens: string[] = [];
  const staleOccs: { phrase: string[]; pattern: string[]; rescue: string[] } = { phrase: [], pattern: [], rescue: [] };
  for (const { m, rows } of derived) {
    if (m.reuse) {
      // reconcile the surviving sentence's derived rows with the new plan (tokens, analyses, occurrences, rescue)
      const planned = new Set(rows.tokens.map((t) => t.id));
      const plannedById = new Map(rows.tokens.map((t) => [t.id, t]));
      const plannedAnalyses = new Set(rows.analyses.map((a) => a.id));
      for (const t of tokensBySentence.get(m.id) ?? []) {
        const p = plannedById.get(t.id);
        if (!planned.has(t.id)) {
          for (const a of await store.analyses.where('tokenId', t.id)) staleAnalyses.push(a.id);
          staleTokens.push(t.id);
        } else if (p && (p.surface !== t.surface || p.start !== t.start)) {
          for (const a of await store.analyses.where('tokenId', t.id)) if (a.provenance === 'human') staleAnalyses.push(a.id);
        }
      }
      for (const t of rows.tokens) {
        for (const a of await store.analyses.where('tokenId', t.id)) {
          if (a.provenance !== 'human' && !plannedAnalyses.has(a.id)) staleAnalyses.push(a.id);
        }
      }
      const plannedPh = new Set(rows.phraseOccurrences.map((o) => o.id));
      for (const o of await store.phraseOccurrences.where('sentenceId', m.id)) if (!plannedPh.has(o.id)) staleOccs.phrase.push(o.id);
      const plannedPa = new Set(rows.patternOccurrences.map((o) => o.id));
      for (const o of await store.patternOccurrences.where('sentenceId', m.id)) if (!plannedPa.has(o.id)) staleOccs.pattern.push(o.id);
      if (!rows.rescue) staleOccs.rescue.push(ids.rescue(m.id));
    }
    await putChanged<Token>(store.tokens, rows.tokens);
    analysisRowsWritten += await putChanged<TokenAnalysis>(store.analyses, rows.analyses);
    await putChanged<PhraseOccurrence>(store.phraseOccurrences, rows.phraseOccurrences);
    await putChanged<PatternOccurrence>(store.patternOccurrences, rows.patternOccurrences);
    if (rows.rescue) await putChanged<EnglishRescue>(store.rescues, [rows.rescue]);
  }

  // lemma / phrase / pattern definitions: add what is missing, fill a missing gloss, never rewrite
  const lemmaIds = [...catalog.lemmas.keys()];
  const curLemmas = await store.lemmas.getMany(lemmaIds);
  const lemmaWrites = lemmaIds.flatMap((id, i) => {
    const want = catalog.lemmas.get(id)!;
    const cur = curLemmas[i];
    if (!cur) return [compact(want)];
    return !cur.gloss && want.gloss ? [{ ...cur, gloss: want.gloss }] : [];
  });
  if (lemmaWrites.length) await store.lemmas.bulkPut(lemmaWrites);
  for (const p of catalog.phrases.values()) if (!(await store.phrases.get(p.id))) await store.phrases.put(compact(p));
  for (const p of catalog.patterns.values()) if (!(await store.patterns.get(p.id))) await store.patterns.put(p);

  // retired sentences stay as history: their tokens, analyses AND phrase / pattern occurrences are kept (a rebuild of learner
  // state from the event log needs to see which phrase / pattern items the old sentence carried; the definitions they point
  // to are never deleted). Only the English rescue goes - an aid shown at display time, not evidence. Nothing retired is
  // offered to a learner because learner-facing reads ignore sentences with retiredInVersion.
  if (retiredRows.length) await putChanged(store.sentences, retiredRows);
  for (const s of retire) staleOccs.rescue.push(ids.rescue(s.id));
  await deleteAll(store.analyses, staleAnalyses);
  await deleteAll(store.tokens, staleTokens);
  await deleteAll(store.phraseOccurrences, staleOccs.phrase);
  await deleteAll(store.patternOccurrences, staleOccs.pattern);
  await deleteAll(store.rescues, staleOccs.rescue);
  const keepSections = new Set(sections.map((s) => s.id));
  for (const s of existing ? await store.sections.where('textId', textId) : []) if (!keepSections.has(s.id)) await store.sections.delete(s.id);
  const keepParas = new Set(paragraphRows.map((p) => p.id));
  for (const p of existing ? await store.paragraphs.where('textId', textId) : []) if (!keepParas.has(p.id)) await store.paragraphs.delete(p.id);

  const notesWritten = await putChanged<ContentNote>(store.notes, noteRows);
  const keepNotes = new Set(noteRows.map((n) => n.id));
  let notesRemoved = 0;
  for (const n of await store.notes.where('textId', textId)) if (!keepNotes.has(n.id)) { await store.notes.delete(n.id); notesRemoved++; }

  // ── the Text row: transformation log, then signature, then the Text itself ──
  const transformations: TransformationRecord[] = existing ? [...existing.transformations] : [];
  const reviewNote = describeReview(doc);
  const lastReview = [...transformations].reverse().find((t) => t.tool === 'review');
  if (!existing || contentChanged || analyzerChanged || dictChanged) {
    const a = plan.coverage;
    transformations.push({
      at: now, tool: INGEST_TOOL,
      description: `${!existing ? 'imported' : contentChanged ? 're-imported (sentence text changed)' : analyzerChanged ? 're-imported (analyzer changed)' : 're-imported (dictionary changed)'} ${doc.id}: ${plan.sentences.length} sentences, ${plan.tokenCount} tokens, contentVersion ${contentVersion}; ` +
        `text stored exactly as supplied${plan.nonNfcBlocks ? ` (${plan.nonNfcBlocks} block(s) not in NFC)` : ''}` +
        (existing && (added || retire.length) ? `; ${added} sentence(s) added, ${retire.length} retired` : ''),
    });
    transformations.push({
      at: now, tool: analyzerName,
      description: `tokenized and analyzed: ${a.analysed}/${a.words} word tokens have a lexicon/rule/author analysis (rest uncertain, left empty); ` +
        `${derived.reduce((n, x) => n + x.rows.phraseOccurrences.length, 0)} phrase and ${derived.reduce((n, x) => n + x.rows.patternOccurrences.length, 0)} pattern occurrences`,
    });
    if (plan.dictionary || dictChanged) {
      transformations.push({
        at: now, tool: wantDictTool,
        description: plan.dictionary
          ? `${plan.dictionary.tokens} word token(s) the adapter could not analyse were analysed from the dictionary (origin dictionary, confidence below certainty); ${plan.dictionary.alongside} analysed word(s) were marked as also in the dictionary (their analysis is the adapter's, unchanged; the entries stay in the dictionary); author spans and corrections take precedence`
          : 'no dictionary installed: words the adapter cannot analyse are left without an analysis',
      });
    }
  }
  if (notesWritten || notesRemoved) {
    const by = [...new Set(plan.sentences.flatMap((s) => s.notes.map((n) => n.by)).filter((x): x is string => !!x))];
    const machine = noteRows.filter((n) => n.provenance === 'machine');
    transformations.push({
      at: now, tool: 'notes',
      description: noteRows.length
        ? `${noteRows.length} note(s) stored (${noteRows.length - machine.length} human, ${machine.length} machine, ${noteRows.filter((n) => n.reviewStatus === 'unreviewed').length} unreviewed)` +
          `${by.length ? `; by ${by.join(', ')}` : ''}${notesRemoved ? `; ${notesRemoved} earlier note(s) replaced` : ''}`
        : `${notesRemoved} note(s) removed`,
    });
  }
  if (!existing || contentVersion > baseVersion) {
    // revision history: one record per content version (read back by `contentHistory`)
    transformations.push({
      at: now, tool: INGEST_TOOL,
      description: describeVersionBump({
        from: existing ? baseVersion : 0, to: contentVersion,
        addedKeys: matches.filter((m) => m.status === 'added').map((m) => m.key),
        revivedKeys: matches.filter((m) => m.status === 'revived').map((m) => m.key),
        retiredKeys: retire.map((s) => s.key ?? s.id),
        analysisRowsWritten, sentenceCount: plan.sentences.length,
      }),
    });
  }
  if (lastReview?.description !== reviewNote) transformations.push({ at: doc.review.reviewedAt ?? now, tool: 'review', description: reviewNote });

  const text: Text = compact({
    id: textId, corpusId: doc.corpus.id, lang, kind: doc.contentType, title: doc.title, sourceId: doc.source.id,
    version: doc.scripture?.translationName, importedAt: existing?.importedAt ?? now, staticLevel: doc.difficulty, locale: doc.locale,
    tags: [...doc.topics], editorialTags: doc.scripture?.role === 'technical-fixture' && !doc.editorialTags.includes('technical-fixture') ? [...doc.editorialTags, 'technical-fixture'] : [...doc.editorialTags], prepTargets: [...doc.prepTargets], reviewStatus: doc.review.status,
    published: plan.decision.published, unpublishedReasons: [...plan.decision.unpublishedReasons], schemaVersion: 2, generated: doc.generated,
    transformations, contentVersion,
    workId: plan.workId, chapter: doc.work?.chapter ? compact({ index: doc.work.chapter.index, title: doc.work.chapter.title }) : undefined,
    personalCopy: plan.decision.personalCopy,
    streams: doc.streams ? [...doc.streams] : undefined, domains: doc.domains ? [...doc.domains] : undefined, variety: doc.variety, quality: doc.quality,
    scripture: doc.scripture
      ? compact({ book: doc.scripture.book, chapter: doc.scripture.chapter, translationId: doc.scripture.translationId, edition: doc.scripture.edition, verification: doc.scripture.verification })
      : undefined,
  });
  await store.meta.put({ id: signatureKey(textId), value: plan.signature, updatedAt: now });
  await store.texts.put(text); // LAST: a failed import never leaves a published partial text
  return report(existing ? 'updated' : 'created', contentVersion, added, retire.length);
}

function describeReview(doc: CorpusDocument): string {
  const r = doc.review;
  return `review status ${r.status}${r.reviewedBy ? ` by ${r.reviewedBy}` : ''}${r.reviewedAt ? ` on ${r.reviewedAt}` : ''}${r.notes ? `: ${r.notes}` : ''}`;
}
