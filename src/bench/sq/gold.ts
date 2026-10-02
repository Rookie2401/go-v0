/**
 * The gold set for Albanian: its format, its validator, its status, and the regression check against it.
 *
 * A native-reviewed gold set (target 1,000-2,000 sentences) does not exist yet and must never be faked. This module
 * holds the machinery only; the data is `data/benchmarks/sq/gold/*.jsonl` (one JSON object per line, see SCHEMA.md
 * there). Pure: no file is read or written here (scripts/sq-gold.mts does that).
 *
 * The one rule that matters: ONLY items with status 'native-reviewed' or 'approved' are evidence. A draft is the
 * machine's own opinion written down for a reviewer to correct; checking the adapter against drafts would measure the
 * adapter against itself.
 */
import type { AnalysisCandidate, LanguageAdapter } from '../../core';
import { fnv1a } from './compare';

export type ComparableGoldAdapter = Pick<LanguageAdapter, 'lang' | 'name' | 'version' | 'tokenize' | 'analyze' | 'normalize'>;

// ───────────────────────────── categories and targets ─────────────────────────────

export const GOLD_CATEGORIES = [
  'noun-paradigm', 'definiteness', 'case', 'plural', 'irregular-verb', 'tense-mood-voice', 'clitic', 'clitic-cluster',
  'clitic-doubling', 'negation', 'linking-article', 'pronoun', 'subordinate-clause', 'tokenization', 'apostrophe', 'dialect',
] as const;
export type GoldCategory = (typeof GOLD_CATEGORIES)[number];

/**
 * THE TARGETS. An item counts toward its FIRST (primary) category; further categories are tags that are listed in the
 * status but do not count toward a target. So the targets add up to the number of sentences wanted: 1,500, inside the
 * owner's range of 1,000-2,000. Only reviewed items (native-reviewed, approved) count toward them.
 *
 *   noun-paradigm 120 · definiteness 100 · case 120 · plural 90 · irregular-verb 120 · tense-mood-voice 140
 *   clitic 100 · clitic-cluster 80 · clitic-doubling 80 · negation 80 · linking-article 120 · pronoun 90
 *   subordinate-clause 90 · tokenization 70 · apostrophe 50 · dialect 50                           = 1,500
 */
export const GOLD_TARGETS: Readonly<Record<GoldCategory, number>> = {
  'noun-paradigm': 120, definiteness: 100, case: 120, plural: 90, 'irregular-verb': 120, 'tense-mood-voice': 140,
  clitic: 100, 'clitic-cluster': 80, 'clitic-doubling': 80, negation: 80, 'linking-article': 120, pronoun: 90,
  'subordinate-clause': 90, tokenization: 70, apostrophe: 50, dialect: 50,
};
export const GOLD_TARGET_TOTAL: number = Object.values(GOLD_TARGETS).reduce((a, b) => a + b, 0);

// ───────────────────────────── the item ─────────────────────────────

export type GoldSourceKind = 'course-authored' | 'reviewer-written' | 'learner-import' | 'treebank-derived';
export type GoldStatus = 'draft' | 'native-reviewed' | 'approved' | 'rejected';
export const GOLD_SOURCE_KINDS: readonly GoldSourceKind[] = ['course-authored', 'reviewer-written', 'learner-import', 'treebank-derived'];
export const GOLD_STATUSES: readonly GoldStatus[] = ['draft', 'native-reviewed', 'approved', 'rejected'];

export interface GoldPart { form: string; lemma: string; upos: string }

export interface GoldToken {
  form: string;
  /** Offsets in `text`: `text.slice(start, end) === form`. */
  start: number;
  end: number;
  lemma: string;
  upos: string;
  feats: Record<string, string>;
  /** The grammatical words inside a written token (ta = të + e), in order. */
  parts?: GoldPart[];
}

export interface GoldItem {
  id: string;
  text: string;
  /** 'sq' Standard Albanian, 'aln' Gheg, ... */
  variety: string;
  /** The first is the primary category (the one the target counts). */
  categories: string[];
  tokens: GoldToken[];
  source: { kind: GoldSourceKind; ref?: string; licence?: string };
  review: {
    status: GoldStatus;
    reviewer?: string;
    reviewedAt?: string;
    note?: string;
    /** On a draft: a digest of the machine's tokens, so that accepting an unedited draft can be refused. */
    draftDigest?: string;
  };
  /** The adapter that wrote the draft ("name@version"). */
  analysisVersion: string;
  createdAt: string;
}

export const REVIEWED_STATUSES: readonly GoldStatus[] = ['native-reviewed', 'approved'];
export const isReviewed = (item: GoldItem): boolean => REVIEWED_STATUSES.includes(item.review?.status);

const UPOS = new Set(['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'PUNCT', 'SCONJ', 'SYM', 'VERB', 'X']);

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isDate = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ───────────────────────────── validation ─────────────────────────────

/** The problems with an item, in plain words. Empty = the item is well formed. */
export function validateGoldItem(raw: unknown): string[] {
  const p: string[] = [];
  if (!isRecord(raw)) return ['not an object'];
  const it = raw;

  if (!isText(it.id)) p.push('id is missing');
  if (!isText(it.text)) p.push('text is missing');
  else if (it.text !== it.text.normalize('NFC')) p.push('text is not NFC-normalized (offsets would not be stable)');
  if (!isText(it.variety)) p.push('variety is missing (sq, aln, ...)');
  if (!isText(it.analysisVersion)) p.push('analysisVersion is missing');
  if (!isDate(it.createdAt)) p.push('createdAt is not a date');

  if (!Array.isArray(it.categories) || it.categories.length === 0) p.push('categories must name at least one category');
  else {
    for (const c of it.categories) if (!(GOLD_CATEGORIES as readonly unknown[]).includes(c)) p.push(`unknown category "${String(c)}"`);
    if (new Set(it.categories).size !== it.categories.length) p.push('a category is named twice');
  }

  const status = isRecord(it.review) ? it.review.status : undefined;
  const reviewed = status === 'native-reviewed' || status === 'approved';

  if (!Array.isArray(it.tokens) || it.tokens.length === 0) p.push('tokens must list at least one token');
  else if (isText(it.text)) {
    let prevEnd = 0;
    it.tokens.forEach((t: unknown, i: number) => {
      const at = `token ${i + 1}`;
      if (!isRecord(t)) { p.push(`${at}: not an object`); return; }
      const { form, start, end } = t;
      if (!isText(form)) p.push(`${at}: form is missing`);
      if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > (it.text as string).length) {
        p.push(`${at}: offsets ${String(start)}-${String(end)} are not a span inside the text`);
      } else {
        if ((it.text as string).slice(start as number, end as number) !== form) {
          p.push(`${at}: offsets ${String(start)}-${String(end)} slice "${(it.text as string).slice(start as number, end as number)}", not "${String(form)}"`);
        }
        if ((start as number) < prevEnd) p.push(`${at}: overlaps or precedes the token before it`);
        prevEnd = end as number;
      }
      if (!isText(t.lemma)) p.push(`${at}: lemma is missing`);
      if (typeof t.upos !== 'string' || !UPOS.has(t.upos)) p.push(`${at}: upos "${String(t.upos)}" is not a UPOS tag`);
      if (!isRecord(t.feats)) p.push(`${at}: feats must be an object ({} for none)`);
      else {
        for (const [k, v] of Object.entries(t.feats)) {
          if (typeof v !== 'string' || v === '') p.push(`${at}: feature ${k} needs a text value`);
          else if (reviewed && v.includes(',')) p.push(`${at}: feature ${k}=${v} is a union; in a reviewed item decide it, or leave the feature out`);
        }
      }
      if (t.parts !== undefined) {
        if (!Array.isArray(t.parts) || t.parts.length < 2) p.push(`${at}: parts must list at least two grammatical words`);
        else t.parts.forEach((q: unknown, j: number) => {
          if (!isRecord(q) || !isText(q.form) || !isText(q.lemma) || typeof q.upos !== 'string' || !UPOS.has(q.upos)) p.push(`${at}: part ${j + 1} needs form, lemma and a UPOS tag`);
        });
      }
    });
  }

  if (!isRecord(it.source)) p.push('source is missing');
  else {
    const s = it.source;
    if (!GOLD_SOURCE_KINDS.includes(s.kind as GoldSourceKind)) p.push(`source.kind "${String(s.kind)}" is not one of ${GOLD_SOURCE_KINDS.join(', ')}`);
    if (s.kind === 'treebank-derived') {
      if (!isText(s.licence)) p.push('a treebank-derived item must carry its licence (source.licence)');
      if (!isText(s.ref)) p.push('a treebank-derived item must name where it came from (source.ref)');
    }
    if (s.kind === 'course-authored' && /\bUD_[A-Za-z]|Universal Dependencies|treebank/i.test(`${String(s.ref ?? '')} ${String(s.licence ?? '')}`)) {
      p.push('source names a treebank but is marked course-authored: a treebank sentence is "treebank-derived" and can never be course-authored');
    }
  }

  if (!isRecord(it.review)) p.push('review is missing');
  else {
    const r = it.review;
    if (!GOLD_STATUSES.includes(r.status as GoldStatus)) p.push(`review.status "${String(r.status)}" is not one of ${GOLD_STATUSES.join(', ')}`);
    if (r.status === 'native-reviewed' || r.status === 'approved') {
      if (!isText(r.reviewer)) p.push(`a ${String(r.status)} item must name its reviewer (review.reviewer)`);
      if (!isDate(r.reviewedAt)) p.push(`a ${String(r.status)} item must carry the date of the review (review.reviewedAt)`);
    }
  }
  return p;
}

// ───────────────────────────── reading and writing lines ─────────────────────────────

export interface GoldParse { items: GoldItem[]; problems: Array<{ line: number; message: string }> }

/** Parse a .jsonl text: blank lines skipped; a line that is not JSON is a problem (with its number), not an item. */
export function parseGoldJsonl(text: string): GoldParse {
  const items: GoldItem[] = [];
  const problems: GoldParse['problems'] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      const v: unknown = JSON.parse(line);
      if (!isRecord(v)) problems.push({ line: i + 1, message: 'not a JSON object' });
      else items.push(v as unknown as GoldItem);
    } catch (e) {
      problems.push({ line: i + 1, message: `not valid JSON (${e instanceof Error ? e.message : String(e)})` });
    }
  });
  return { items, problems };
}

export const toGoldJsonl = (items: readonly GoldItem[]): string => items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : '');

// ───────────────────────────── status ─────────────────────────────

export interface CategoryStatus {
  category: GoldCategory;
  target: number;
  /** Items whose primary category this is, by status. */
  draft: number;
  reviewed: number;
  rejected: number;
  /** Items that list the category after their first (tags): shown, not counted toward the target. */
  tagged: number;
}
export interface GoldStatusReport {
  total: number;
  byStatus: Record<GoldStatus, number>;
  reviewed: number;
  targetTotal: number;
  categories: CategoryStatus[];
  /** Items whose primary category is not one of the known ones (invalid items). */
  uncategorised: number;
}

export function goldStatus(items: readonly GoldItem[]): GoldStatusReport {
  const byStatus: Record<GoldStatus, number> = { draft: 0, 'native-reviewed': 0, approved: 0, rejected: 0 };
  const cats = new Map<GoldCategory, CategoryStatus>(GOLD_CATEGORIES.map((c) => [c, { category: c, target: GOLD_TARGETS[c], draft: 0, reviewed: 0, rejected: 0, tagged: 0 }]));
  let uncategorised = 0;
  for (const it of items) {
    const st = it.review?.status;
    if (st && st in byStatus) byStatus[st]++;
    const [primary, ...rest] = Array.isArray(it.categories) ? it.categories : [];
    const row = cats.get(primary as GoldCategory);
    if (!row) { uncategorised++; continue; }
    if (st === 'draft') row.draft++;
    else if (st === 'native-reviewed' || st === 'approved') row.reviewed++;
    else if (st === 'rejected') row.rejected++;
    for (const c of rest) { const t = cats.get(c as GoldCategory); if (t) t.tagged++; }
  }
  return {
    total: items.length,
    byStatus,
    reviewed: byStatus['native-reviewed'] + byStatus.approved,
    targetTotal: GOLD_TARGET_TOTAL,
    categories: [...cats.values()],
    uncategorised,
  };
}

// ───────────────────────────── drafts ─────────────────────────────

const HAS_LETTER = /\p{L}/u;
const toUpos = (pos: string | undefined): string => (pos === undefined ? 'X' : pos === 'CONJ' ? 'CCONJ' : pos === 'CLF' ? 'X' : pos);

export const tokensDigest = (tokens: readonly GoldToken[]): string => fnv1a(JSON.stringify(tokens)).toString(16).padStart(8, '0');

export interface DraftOptions {
  category: GoldCategory;
  variety?: string;
  source?: GoldItem['source'];
  /** Clock, for tests. */
  now?: () => Date;
}

/** A stable id from the category and the text. */
export const goldId = (category: string, text: string): string => `sq-${category}-${fnv1a(text.normalize('NFC')).toString(16).padStart(8, '0')}`;

/**
 * A DRAFT item from the adapter's own analysis (first reading of each word token). It is the machine's opinion, written
 * out for a reviewer to correct; it is not gold and counts for nothing until a reviewer has accepted it.
 */
export function draftGoldItem(rawText: string, adapter: ComparableGoldAdapter, opts: DraftOptions): GoldItem {
  const text = rawText.normalize('NFC').trim();
  const raw = adapter.tokenize(text);
  const analyzed = adapter.analyze(raw);
  const tokens: GoldToken[] = [];
  raw.forEach((t, i) => {
    if (!t.isWord || !HAS_LETTER.test(t.surface)) return;
    const c: AnalysisCandidate | undefined = analyzed[i]?.candidates[0];
    const tok: GoldToken = {
      form: t.surface, start: t.start, end: t.end,
      lemma: c?.lemma ?? adapter.normalize(t.surface),
      upos: toUpos(c?.pos),
      feats: { ...(c?.morph ?? {}) },
    };
    if (c?.parts && c.parts.length >= 2) tok.parts = c.parts.map((q) => ({ form: q.text, lemma: q.lemma ?? q.text, upos: toUpos(q.pos) }));
    tokens.push(tok);
  });
  return {
    id: goldId(opts.category, text),
    text,
    variety: opts.variety ?? 'sq',
    categories: [opts.category],
    tokens,
    source: opts.source ?? { kind: 'reviewer-written' },
    review: { status: 'draft', note: 'machine draft: the adapter\'s own opinion, not yet looked at by a person', draftDigest: tokensDigest(tokens) },
    analysisVersion: `${adapter.name}@${adapter.version}`,
    createdAt: (opts.now?.() ?? new Date()).toISOString(),
  };
}

// ───────────────────────────── accepting ─────────────────────────────

export class AcceptRefused extends Error {
  constructor(readonly problems: string[]) { super(`refused: ${problems.join('; ')}`); this.name = 'AcceptRefused'; }
}

/**
 * Mark a draft native-reviewed by a named person, today. Refuses: no reviewer name; an item that is not a draft; an
 * unedited machine draft (unless `confirmUnchanged`: the reviewer says the machine was right); an item the validator
 * rejects once reviewed. This records that the named person says they checked the analysis; the tool cannot verify
 * that they read Albanian.
 */
export function acceptGoldItem(item: GoldItem, opts: { by?: string; confirmUnchanged?: boolean; now?: () => Date }): GoldItem {
  const by = (opts.by ?? '').trim();
  if (!by) throw new AcceptRefused(['--by "<name>" is required: a reviewed item must name its reviewer']);
  const status = item.review?.status;
  if (status !== 'draft') throw new AcceptRefused([`only a draft can be accepted; this item is "${String(status)}"`]);
  const digest = item.review.draftDigest;
  if (digest && Array.isArray(item.tokens) && digest === tokensDigest(item.tokens) && !opts.confirmUnchanged) {
    throw new AcceptRefused(['the tokens are exactly as the machine drafted them; correct them, or pass --confirm-unchanged to say the machine was right']);
  }
  const { draftDigest: _digest, ...review } = item.review;
  void _digest;
  const next: GoldItem = {
    ...item,
    review: { ...review, status: 'native-reviewed', reviewer: by, reviewedAt: (opts.now?.() ?? new Date()).toISOString().slice(0, 10) },
  };
  const problems = validateGoldItem(next);
  if (problems.length) throw new AcceptRefused(problems);
  return next;
}

// ───────────────────────────── the regression check ─────────────────────────────

export interface GoldRegression {
  id: string;
  kind: 'tokenization' | 'no-reading' | 'not-first' | 'parts';
  token?: string;
  expected: string;
  got: string;
}
export interface GoldCheck {
  /** Reviewed items that were checked. */
  checked: number;
  /** Items left out because they are drafts or rejected: never evidence. */
  skipped: number;
  /** Reviewed items the validator rejects (they are not checked). */
  invalid: Array<{ id: string; problems: string[] }>;
  regressions: GoldRegression[];
}

const values = (v: string | undefined): string[] | undefined => (v === undefined || v === '' ? undefined : v.split(',').map((x) => x.trim()));

/** The candidate says what the gold token says: same lemma, same UPOS, no stated feature contradicting. */
function readingMatches(tok: GoldToken, c: AnalysisCandidate, norm: (s: string) => string): boolean {
  if (c.lemma === undefined || norm(c.lemma) !== norm(tok.lemma)) return false;
  if (toUpos(c.pos) !== tok.upos) return false;
  for (const [k, gv] of Object.entries(tok.feats)) {
    const cv = values(c.morph[k]);
    const g = values(gv);
    if (cv && g && !cv.some((x) => g.includes(x))) return false;
  }
  return true;
}

const describe = (t: GoldToken): string => `${t.lemma}/${t.upos}${Object.keys(t.feats).length ? ' ' + Object.entries(t.feats).map(([k, v]) => `${k}=${v}`).join('|') : ''}`;
const describeCand = (c: AnalysisCandidate | undefined): string =>
  c ? `${c.lemma ?? '?'}/${toUpos(c.pos)}${Object.keys(c.morph).length ? ' ' + Object.entries(c.morph).map(([k, v]) => `${k}=${v}`).join('|') : ''}` : '(no reading)';

/**
 * Check the adapter against the reviewed items. Drafts and rejected items are skipped and counted as skipped: they are
 * never evidence. For each reviewed item: the adapter's word tokens must have the gold offsets; each gold token must be
 * among the adapter's readings (else 'no-reading') and the first reading must be that one (else 'not-first'); a gold
 * token with parts needs a matching reading with the same number of parts whose lemmas agree (else 'parts').
 */
export function checkAgainstGold(items: readonly GoldItem[], adapter: ComparableGoldAdapter): GoldCheck {
  const out: GoldCheck = { checked: 0, skipped: 0, invalid: [], regressions: [] };
  const norm = (s: string): string => adapter.normalize(s);
  for (const item of items) {
    if (!isReviewed(item)) { out.skipped++; continue; }
    const problems = validateGoldItem(item);
    if (problems.length) { out.invalid.push({ id: String(item.id), problems }); continue; }
    out.checked++;

    const raw = adapter.tokenize(item.text);
    const analyzed = adapter.analyze(raw);
    const words = new Map<string, number>();
    raw.forEach((t, i) => { if (t.isWord && HAS_LETTER.test(t.surface)) words.set(`${t.start}-${t.end}`, i); });
    const gold = item.tokens.filter((t) => HAS_LETTER.test(t.form));

    const same = gold.length === words.size && gold.every((t) => words.has(`${t.start}-${t.end}`));
    if (!same) {
      out.regressions.push({
        id: item.id, kind: 'tokenization',
        expected: gold.map((t) => t.form).join(' | '),
        got: [...words.values()].map((i) => raw[i].surface).join(' | '),
      });
      continue;
    }
    for (const t of gold) {
      const cands = analyzed[words.get(`${t.start}-${t.end}`)!]?.candidates ?? [];
      const at = cands.findIndex((c) => readingMatches(t, c, norm));
      if (at < 0) {
        out.regressions.push({ id: item.id, kind: 'no-reading', token: t.form, expected: describe(t), got: cands.length ? cands.map(describeCand).join(' ; ') : '(no reading)' });
        continue;
      }
      if (at > 0) out.regressions.push({ id: item.id, kind: 'not-first', token: t.form, expected: describe(t), got: `first reading ${describeCand(cands[0])}` });
      if (t.parts) {
        const c = cands[at];
        const ok = c.parts?.length === t.parts.length && c.parts.every((q, k) => q.lemma !== undefined && norm(q.lemma) === norm(t.parts![k].lemma));
        if (!ok) {
          out.regressions.push({
            id: item.id, kind: 'parts', token: t.form,
            expected: t.parts.map((q) => `${q.form}/${q.lemma}`).join(' + '),
            got: c.parts?.length ? c.parts.map((q) => `${q.text}/${q.lemma ?? '?'}`).join(' + ') : '(no parts)',
          });
        }
      }
    }
  }
  return out;
}
