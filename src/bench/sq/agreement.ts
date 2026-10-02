/**
 * Do the sources agree about one reading of one written Albanian form? Pure logic for npm run sq:agreement.
 *
 * The reading under test comes from the course's own word list and rules (machine-drafted). The sources asked:
 *   uniparser   the UniParser Albanian analyzer (a lexicon of some 58,000 lexemes with paradigms; MIT)
 *   wiktionary  English Wiktionary's Albanian entries with their inflection tables (kaikki.org extract; CC BY-SA)
 *   ud-tsa      UD_Albanian-TSA (60 sentences, annotated by hand; CC BY-SA)
 *   ud-staf     UD_Albanian-STAF (202 sentences, lemmas and features "automatic with corrections"; CC BY-SA)
 * Each says one of:
 *   agree   it has the form under this lemma (or a recorded citation alias) with features that do not contradict
 *   differ  it has the form under this lemma, and nothing it says about it is compatible with these features
 *   other   it has the form, but only as (a form of) other words
 *   silent  it does not have the form
 *
 * What counts as a source SAYING OTHERWISE (dissent):
 *   - the analyzer: differ or other. It is a full analyzer of the language, so a form it knows only as another word,
 *     or under this lemma with other features, is a real difference.
 *   - Wiktionary: differ only. Its coverage of a lemma's forms depends on whether the entry has a table, so a form
 *     found only under another headword is silence about this word, not a statement against it.
 *   - a treebank: never. A treebank attests the readings that happen to occur in its sentences; it cannot say a
 *     reading does not exist. Its agreement supports; its differences are recorded for a reviewer and nothing more.
 *
 * The outcome (nothing is picked silently — every reading that is not `unanimous` is written, with what each source
 * said, to data/review/sq/source-agreement.json):
 *   unanimous      at least one source agrees and none says otherwise: every source that speaks agrees
 *   majority       a source says otherwise, and at least TWO others agree with the reading: kept, at reduced confidence
 *   disputed       a source says otherwise, and fewer than two others agree: kept at low confidence ("possibly …")
 *   single-source  no source says otherwise and none agrees: only the course's list says so — treated like disputed
 *   name-unlisted  a personal or place name no source lists: names are an open class; not penalised
 */
import type { SqReading } from '../../adapters/albanian/types';
import { sqAgree } from '../../adapters/albanian/types';
import { SQ_CITATION_ALIASES, sameCitation } from './aliases';
import { COMPARED, samePos, type UniparserVerdict } from './uniparser';
import type { WiktIndex } from './wiktionary';

export const SOURCE_IDS = ['uniparser', 'wiktionary', 'ud-tsa', 'ud-staf'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export type SourceVerdict = 'agree' | 'differ' | 'other' | 'silent';
export type AgreementStatus = 'unanimous' | 'majority' | 'disputed' | 'single-source' | 'name-unlisted';
export const AGREEMENT_STATUSES: readonly AgreementStatus[] = ['unanimous', 'majority', 'disputed', 'single-source', 'name-unlisted'];
export type Verdicts = Record<SourceId, SourceVerdict>;

/** The analyzer's finer verdict in the four words every source uses. */
export function fromUniparser(v: UniparserVerdict): SourceVerdict {
  switch (v) {
    case 'agree': return 'agree';
    case 'nonstandard': case 'features-differ': return 'differ';
    case 'other-lemma': return 'other';
    // the same lemma with compatible features, filed under another part of speech (besimtar: a noun here, an adjective
    // there): the form and its lemma are confirmed; the part of speech stays the list's own statement
    case 'pos-differs': return 'agree';
    case 'unknown-form': case 'name-unknown': return 'silent';
  }
}

/** One statement of a source about a form: lemma, part of speech, features. */
export interface Statement { lemma: string; pos?: string; morph: Record<string, string>; /** From an entry with a full inflection table (Wiktionary). */ tabled?: boolean }

const compatible = (r: SqReading, m: Record<string, string>): boolean => COMPARED.every((f) => sqAgree(r.morph[f], m[f]));

/** What a list of statements about the reading's form says about the reading. `lemma` is the reading's lemma, normalized. */
export function verdictFrom(lemma: string, r: SqReading, statements: readonly Statement[]): SourceVerdict {
  if (!statements.length) return 'silent';
  const same = statements.filter((s) => (sameCitation(lemma, s.lemma) || sameCitation(s.lemma, lemma)) && samePos(r.pos, s.pos));
  if (!same.length) return 'other';
  return same.some((s) => compatible(r, s.morph)) ? 'agree' : 'differ';
}

/** The features that name a cell of an inflection table. */
const CELL = ['Case', 'Number', 'Definite', 'Person', 'Tense', 'Mood'] as const;

/**
 * Wiktionary. A statement about the form that fits the reading confirms it (`verdictFrom`). Otherwise Wiktionary says
 * otherwise ONLY when the lemma's own full inflection table puts a DIFFERENT form in the reading's cell (the list has
 * the plural "gjella", the table "gjellë"): `filledBy` then names what the table has there. A table that has no such
 * cell, a head line's principal parts and a separate "X of Y" entry are partial: their not covering a reading says
 * nothing, and the verdict is silence (or `other` when the form is only found under other headwords).
 */
export function wiktVerdict(lemma: string, form: string, r: SqReading, index: WiktIndex): { verdict: SourceVerdict; filledBy: string[] } {
  const v = verdictFrom(lemma, r, index.forms.get(form) ?? []);
  if (v === 'agree') return { verdict: v, filledBy: [] };
  const lemmas = [lemma, ...(SQ_CITATION_ALIASES[lemma] ?? [])];
  const filledBy = new Set<string>();
  for (const l of lemmas) {
    for (const [f, s] of index.tables.get(l) ?? []) {
      if (f === form || !samePos(r.pos, s.pos)) continue;
      // the tables are active only: they have no cell for a non-active reading
      if (r.morph.Voice === 'Mid' && s.morph.Voice !== 'Mid') continue;
      const names = CELL.every((k) => r.morph[k] === undefined || s.morph[k] !== undefined) && (r.morph.VerbForm !== 'Part' || s.morph.VerbForm === 'Part');
      // a participle cell is not a finite cell: a statement that says Part fills only a participle reading's cell
      if (names && (s.morph.VerbForm === 'Part') === (r.morph.VerbForm === 'Part') && compatible(r, s.morph)) filledBy.add(f);
    }
  }
  if (filledBy.size) return { verdict: 'differ', filledBy: [...filledBy].sort() };
  return { verdict: v === 'differ' ? 'silent' : v, filledBy: [] };
}

const dissents = (v: Verdicts): SourceId[] => [
  ...(v.uniparser === 'differ' || v.uniparser === 'other' ? ['uniparser' as const] : []),
  ...(v.wiktionary === 'differ' ? ['wiktionary' as const] : []),
];
const supports = (v: Verdicts): SourceId[] => SOURCE_IDS.filter((s) => v[s] === 'agree');

export interface Adjudication { status: AgreementStatus; support: SourceId[]; dissent: SourceId[] }

/** The outcome for one reading from what each source said (see the file comment for the rule). */
export function adjudicate(pos: string, v: Verdicts): Adjudication {
  const support = supports(v);
  const dissent = dissents(v);
  let status: AgreementStatus;
  if (dissent.length === 0) status = support.length > 0 ? 'unanimous' : pos === 'PROPN' ? 'name-unlisted' : 'single-source';
  else status = support.length >= 2 ? 'majority' : 'disputed';
  return { status, support, dissent };
}
