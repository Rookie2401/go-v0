/**
 * One reading of the course's Albanian word list against what the UniParser Albanian analyzer says about the same
 * written form (uniparser-albanian, MIT; run offline by scripts/external/uniparser_sq_analyze.py). Pure: the callers
 * (npm run sq:check-analyzer, npm run sq:agreement) read the analyzer's stored output and ask here.
 *
 * Conventions that are differences of NAMING, not of analysis, and are treated as the same word:
 *   - a verb used only non-actively is listed here under that form (ankohem, lodhem) and there under the active verb
 *     with a non-active analysis (ankoj, lodh);
 *   - the citation aliases of src/bench/sq/aliases.ts (përgatis / përgatit, te / tek);
 *   - a short object pronoun is a form of the full pronoun here (na under ne) and its own entry there (acc_1pl);
 *   - the plural command is the present second person plural for the analyzer.
 */
import { sqNormalize } from '../../adapters/albanian/orthography';
import { uniparserToReading, type UniparserReading } from '../../adapters/albanian/tags';
import { sqAgree, type SqReading } from '../../adapters/albanian/types';
import { SQ_CITATION_ALIASES } from './aliases';

export type UniparserVerdict = 'agree' | 'nonstandard' | 'features-differ' | 'other-lemma' | 'unknown-form' | 'pos-differs' | 'name-unknown';
export const UNIPARSER_VERDICTS: readonly UniparserVerdict[] = ['agree', 'nonstandard', 'features-differ', 'other-lemma', 'unknown-form', 'pos-differs', 'name-unknown'];
/** The verdicts that mean the two sources do not say the same thing about the reading. */
export const UNIPARSER_DISPUTE: ReadonlySet<UniparserVerdict> = new Set<UniparserVerdict>(['nonstandard', 'features-differ', 'other-lemma', 'unknown-form']);

export const COMPARED = ['Case', 'Number', 'Definite', 'Gender', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm'] as const;

export interface UniparserAnalysis { lemma: string; gramm: string; reading: UniparserReading }

/** One stored line of the analyzer's output ({form, analyses:[{lemma, gramm}]}) in this module's terms. */
export const toUniparserAnalyses = (analyses: ReadonlyArray<{ lemma: string; gramm: string }>): UniparserAnalysis[] =>
  analyses.map((a) => ({ lemma: sqNormalize(a.lemma), gramm: a.gramm, reading: uniparserToReading(a.gramm) }));

export const samePos = (a: string, b: string | undefined): boolean =>
  b === undefined || a === b || (a === 'AUX' && b === 'VERB') || (a === 'PROPN' && b === 'NOUN') || (['DET', 'PRON'].includes(a) && ['DET', 'PRON'].includes(b))
  || (['CONJ', 'SCONJ'].includes(a) && b === 'CONJ') || (['PART', 'ADV', 'INTJ', 'ADP', 'CONJ', 'SCONJ'].includes(a) && ['PART', 'ADV', 'INTJ', 'ADP', 'CONJ'].includes(b));

const compatible = (r: SqReading, u: UniparserReading): boolean => {
  const pluralCommand = r.morph.Mood === 'Imp' && r.morph.Number === 'Plur' && u.morph.Mood === 'Ind' && u.morph.Tense === 'Pres';
  return COMPARED.every((f) => (pluralCommand && (f === 'Mood' || f === 'Tense')) || sqAgree(r.morph[f], u.morph[f]));
};

const deponentMatch = (r: SqReading, t: UniparserAnalysis): boolean => {
  if (!(r.pos === 'VERB' || r.pos === 'AUX') || !/em$/u.test(r.lemma) || t.reading.pos !== 'VERB') return false;
  const lemma = sqNormalize(r.lemma);
  // lahem → la-j (the h belongs to the ending), lodhem → lodh (the h belongs to the stem): either
  const mine = [lemma.replace(/em$/u, ''), lemma.replace(/hem$/u, '')];
  const theirs = t.lemma.replace(/j$/u, '');
  return (mine.includes(theirs) || mine.includes(t.lemma)) && (t.reading.morph.Voice === 'Mid' || t.reading.morph.VerbForm === 'Part');
};

const aliasMatch = (r: SqReading, t: UniparserAnalysis): boolean =>
  samePos(r.pos, t.reading.pos) && (SQ_CITATION_ALIASES[sqNormalize(r.lemma)] ?? []).includes(t.lemma);

const cliticMatch = (form: string, r: SqReading, t: UniparserAnalysis): boolean => {
  if (r.pos !== 'PRON' || t.lemma !== form || t.reading.clitics.length !== 1) return false;
  const m = /^(acc|dat)_([123])(sg|pl)$/.exec(t.reading.clitics[0]);
  return !!m && sqAgree(r.morph.Case, m[1] === 'acc' ? 'Acc' : 'Dat') && sqAgree(r.morph.Person, m[2]) && sqAgree(r.morph.Number, m[3] === 'sg' ? 'Sing' : 'Plur');
};

export interface UniparserFinding { verdict: UniparserVerdict; /** The analyses the verdict rests on (for the review file). */ evidence: UniparserAnalysis[] }

/** What the analyzer's analyses of `form` say about the reading `r` of that form. */
export function uniparserVerdict(form: string, r: SqReading, them: readonly UniparserAnalysis[]): UniparserFinding {
  const lemma = sqNormalize(r.lemma);
  if (!them.length) return { verdict: r.pos === 'PROPN' ? 'name-unknown' : 'unknown-form', evidence: [] };
  if (them.some((t) => cliticMatch(form, r, t))) return { verdict: 'agree', evidence: [] };
  const same = them.filter((t) => (t.lemma === lemma && samePos(r.pos, t.reading.pos)) || deponentMatch(r, t) || aliasMatch(r, t));
  if (!same.length) {
    // a personal name the analyzer does not hold, spelled like a common word it does (Ana / anë, Mira / mirë): not a dispute
    if (r.pos === 'PROPN') return { verdict: 'name-unknown', evidence: [] };
    const otherPos = them.filter((t) => t.lemma === lemma && !samePos(r.pos, t.reading.pos) && compatible(r, t.reading));
    return { verdict: otherPos.length ? 'pos-differs' : 'other-lemma', evidence: [...them] };
  }
  const ok = same.filter((t) => compatible(r, t.reading));
  if (!ok.length) return { verdict: 'features-differ', evidence: same };
  return ok.every((t) => t.reading.gheg || t.reading.nonstandard) ? { verdict: 'nonstandard', evidence: same } : { verdict: 'agree', evidence: [] };
}
