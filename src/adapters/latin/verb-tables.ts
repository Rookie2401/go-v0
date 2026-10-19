/**
 * Verb endings of the regular conjugations, ported from the Romance app (src/morphology/verbTables.ts) with the macrons dropped.
 * Every finite cell is [marker, ending]; the six persons are always 1sg 2sg 3sg 1pl 2pl 3pl, in that order.
 */
export type ConjClass = 1 | 2 | 3 | '3io' | 4;

export type MarkerEnding = [marker: string, ending: string];

/** ama-, mone-, reg-, cap(i)-, audi-: the bare present stem (thematic vowel stripped for 3/3io/4). */
export function presentRoot(conj: ConjClass, presentStem: string): string {
  if (conj === 1 || conj === 2 || conj === 4) return presentStem.slice(0, -1); // drop a / e / i
  return presentStem; // 3rd and 3-io stems are already consonant-final ("reg", "cap")
}

// ------------------------------------------------------------------ present system, active

export const PRES_IND_ACT: Record<ConjClass, MarkerEnding[]> = {
  1: [['', 'o'], ['a', 's'], ['a', 't'], ['a', 'mus'], ['a', 'tis'], ['a', 'nt']],
  2: [['e', 'o'], ['e', 's'], ['e', 't'], ['e', 'mus'], ['e', 'tis'], ['e', 'nt']],
  3: [['', 'o'], ['i', 's'], ['i', 't'], ['i', 'mus'], ['i', 'tis'], ['u', 'nt']],
  '3io': [['i', 'o'], ['i', 's'], ['i', 't'], ['i', 'mus'], ['i', 'tis'], ['iu', 'nt']],
  4: [['i', 'o'], ['i', 's'], ['i', 't'], ['i', 'mus'], ['i', 'tis'], ['iu', 'nt']],
};

export const PRES_IND_PASS: Record<ConjClass, MarkerEnding[]> = {
  1: [['', 'or'], ['a', 'ris'], ['a', 'tur'], ['a', 'mur'], ['a', 'mini'], ['a', 'ntur']],
  2: [['e', 'or'], ['e', 'ris'], ['e', 'tur'], ['e', 'mur'], ['e', 'mini'], ['e', 'ntur']],
  3: [['', 'or'], ['e', 'ris'], ['i', 'tur'], ['i', 'mur'], ['i', 'mini'], ['u', 'ntur']],
  '3io': [['i', 'or'], ['e', 'ris'], ['i', 'tur'], ['i', 'mur'], ['i', 'mini'], ['iu', 'ntur']],
  4: [['i', 'or'], ['i', 'ris'], ['i', 'tur'], ['i', 'mur'], ['i', 'mini'], ['iu', 'ntur']],
};

export const IMPF_IND_ACT: Record<ConjClass, MarkerEnding[]> = {
  1: [['a', 'bam'], ['a', 'bas'], ['a', 'bat'], ['a', 'bamus'], ['a', 'batis'], ['a', 'bant']],
  2: [['e', 'bam'], ['e', 'bas'], ['e', 'bat'], ['e', 'bamus'], ['e', 'batis'], ['e', 'bant']],
  3: [['e', 'bam'], ['e', 'bas'], ['e', 'bat'], ['e', 'bamus'], ['e', 'batis'], ['e', 'bant']],
  '3io': [['ie', 'bam'], ['ie', 'bas'], ['ie', 'bat'], ['ie', 'bamus'], ['ie', 'batis'], ['ie', 'bant']],
  4: [['ie', 'bam'], ['ie', 'bas'], ['ie', 'bat'], ['ie', 'bamus'], ['ie', 'batis'], ['ie', 'bant']],
};

export const IMPF_IND_PASS: Record<ConjClass, MarkerEnding[]> = {
  1: [['a', 'bar'], ['a', 'baris'], ['a', 'batur'], ['a', 'bamur'], ['a', 'bamini'], ['a', 'bantur']],
  2: [['e', 'bar'], ['e', 'baris'], ['e', 'batur'], ['e', 'bamur'], ['e', 'bamini'], ['e', 'bantur']],
  3: [['e', 'bar'], ['e', 'baris'], ['e', 'batur'], ['e', 'bamur'], ['e', 'bamini'], ['e', 'bantur']],
  '3io': [['ie', 'bar'], ['ie', 'baris'], ['ie', 'batur'], ['ie', 'bamur'], ['ie', 'bamini'], ['ie', 'bantur']],
  4: [['ie', 'bar'], ['ie', 'baris'], ['ie', 'batur'], ['ie', 'bamur'], ['ie', 'bamini'], ['ie', 'bantur']],
};

/** future, conj. 1–2: the -b- marker, vowel alternating bi-/bu-/bo (PLAN.md's amabimus example). */
export const FUT_IND_ACT: Record<ConjClass, MarkerEnding[]> = {
  1: [['b', 'o'], ['bi', 's'], ['bi', 't'], ['bi', 'mus'], ['bi', 'tis'], ['bu', 'nt']],
  2: [['b', 'o'], ['bi', 's'], ['bi', 't'], ['bi', 'mus'], ['bi', 'tis'], ['bu', 'nt']],
  3: [['a', 'm'], ['e', 's'], ['e', 't'], ['e', 'mus'], ['e', 'tis'], ['e', 'nt']],
  '3io': [['ia', 'm'], ['ie', 's'], ['ie', 't'], ['ie', 'mus'], ['ie', 'tis'], ['ie', 'nt']],
  4: [['ia', 'm'], ['ie', 's'], ['ie', 't'], ['ie', 'mus'], ['ie', 'tis'], ['ie', 'nt']],
};

export const FUT_IND_PASS: Record<ConjClass, MarkerEnding[]> = {
  1: [['b', 'or'], ['be', 'ris'], ['bi', 'tur'], ['bi', 'mur'], ['bi', 'mini'], ['bu', 'ntur']],
  2: [['b', 'or'], ['be', 'ris'], ['bi', 'tur'], ['bi', 'mur'], ['bi', 'mini'], ['bu', 'ntur']],
  3: [['a', 'r'], ['e', 'ris'], ['e', 'tur'], ['e', 'mur'], ['e', 'mini'], ['e', 'ntur']],
  '3io': [['ia', 'r'], ['ie', 'ris'], ['ie', 'tur'], ['ie', 'mur'], ['ie', 'mini'], ['ie', 'ntur']],
  4: [['ia', 'r'], ['ie', 'ris'], ['ie', 'tur'], ['ie', 'mur'], ['ie', 'mini'], ['ie', 'ntur']],
};

/** present subjunctive: conj. 1 marks with -e-, conj. 2/3/3io/4 with -a- (ambiguous with the
 * 3rd/3io/4th future indicative — flagged in verbParadigm.ts's notes, not hidden). */
export const PRES_SUBJ_ACT: Record<ConjClass, MarkerEnding[]> = {
  1: [['', 'em'], ['e', 's'], ['e', 't'], ['e', 'mus'], ['e', 'tis'], ['e', 'nt']],
  2: [['ea', 'm'], ['ea', 's'], ['ea', 't'], ['ea', 'mus'], ['ea', 'tis'], ['ea', 'nt']],
  3: [['a', 'm'], ['a', 's'], ['a', 't'], ['a', 'mus'], ['a', 'tis'], ['a', 'nt']],
  '3io': [['ia', 'm'], ['ia', 's'], ['ia', 't'], ['ia', 'mus'], ['ia', 'tis'], ['ia', 'nt']],
  4: [['ia', 'm'], ['ia', 's'], ['ia', 't'], ['ia', 'mus'], ['ia', 'tis'], ['ia', 'nt']],
};

export const PRES_SUBJ_PASS: Record<ConjClass, MarkerEnding[]> = {
  1: [['', 'er'], ['e', 'ris'], ['e', 'tur'], ['e', 'mur'], ['e', 'mini'], ['e', 'ntur']],
  2: [['ea', 'r'], ['ea', 'ris'], ['ea', 'tur'], ['ea', 'mur'], ['ea', 'mini'], ['ea', 'ntur']],
  3: [['a', 'r'], ['a', 'ris'], ['a', 'tur'], ['a', 'mur'], ['a', 'mini'], ['a', 'ntur']],
  '3io': [['ia', 'r'], ['ia', 'ris'], ['ia', 'tur'], ['ia', 'mur'], ['ia', 'mini'], ['ia', 'ntur']],
  4: [['ia', 'r'], ['ia', 'ris'], ['ia', 'tur'], ['ia', 'mur'], ['ia', 'mini'], ['ia', 'ntur']],
};

/** imperfect subjunctive = present active infinitive + personal endings, hence the "re" mood-marker
 * for every conjugation (ama+re+m, mone+re+m, reg+ere+m [=regere+m], cap+ere+m [=capere+m], aud+ire+m). */
export const IMPF_SUBJ_ACT: Record<ConjClass, MarkerEnding[]> = {
  1: [['are', 'm'], ['are', 's'], ['are', 't'], ['are', 'mus'], ['are', 'tis'], ['are', 'nt']],
  2: [['ere', 'm'], ['ere', 's'], ['ere', 't'], ['ere', 'mus'], ['ere', 'tis'], ['ere', 'nt']],
  3: [['ere', 'm'], ['ere', 's'], ['ere', 't'], ['ere', 'mus'], ['ere', 'tis'], ['ere', 'nt']],
  '3io': [['ere', 'm'], ['ere', 's'], ['ere', 't'], ['ere', 'mus'], ['ere', 'tis'], ['ere', 'nt']],
  4: [['ire', 'm'], ['ire', 's'], ['ire', 't'], ['ire', 'mus'], ['ire', 'tis'], ['ire', 'nt']],
};

export const IMPF_SUBJ_PASS: Record<ConjClass, MarkerEnding[]> = {
  1: [['are', 'r'], ['are', 'ris'], ['are', 'tur'], ['are', 'mur'], ['are', 'mini'], ['are', 'ntur']],
  2: [['ere', 'r'], ['ere', 'ris'], ['ere', 'tur'], ['ere', 'mur'], ['ere', 'mini'], ['ere', 'ntur']],
  3: [['ere', 'r'], ['ere', 'ris'], ['ere', 'tur'], ['ere', 'mur'], ['ere', 'mini'], ['ere', 'ntur']],
  '3io': [['ere', 'r'], ['ere', 'ris'], ['ere', 'tur'], ['ere', 'mur'], ['ere', 'mini'], ['ere', 'ntur']],
  4: [['ire', 'r'], ['ire', 'ris'], ['ire', 'tur'], ['ire', 'mur'], ['ire', 'mini'], ['ire', 'ntur']],
};

// ------------------------------------------------------------------ perfect system (conjugation-independent)

/** appended directly to the perfect stem, no conjugation distinction. */
export const PERF_IND_ACT: MarkerEnding[] = [['', 'i'], ['i', 'sti'], ['i', 't'], ['i', 'mus'], ['i', 'stis'], ['e', 'runt']];
/** pluperfect marker -era-/-era- (short/long alternating by person, like the future -bi-/-bu-):
 * monu-era-mus, PLAN.md's worked example, needs exactly this boundary (marker "era", ending "mus"). */
export const PLUP_IND_ACT: MarkerEnding[] = [['era', 'm'], ['era', 's'], ['era', 't'], ['era', 'mus'], ['era', 'tis'], ['era', 'nt']];
/** future-perfect marker -er-/-eri- (1st sg. is the irregular-looking -ero, not *-erio); 3rd plural
 * -erint, distinct from sum's own future erunt (the passive periphrasis uses sum's future, not this).
 * rex-eri-mus, PLAN.md's worked example, needs exactly this boundary (marker "eri", ending "mus"). */
export const FUT_PERF_IND_ACT: MarkerEnding[] = [['er', 'o'], ['eri', 's'], ['eri', 't'], ['eri', 'mus'], ['eri', 'tis'], ['eri', 'nt']];
/** perfect subjunctive marker -eri-/-eri- (short/long alternating; 3rd sg. is identical in spelling
 * to the future perfect indicative — flagged in verbParadigm.ts's notes, not hidden). */
export const PERF_SUBJ_ACT: MarkerEnding[] = [['eri', 'm'], ['eri', 's'], ['eri', 't'], ['eri', 'mus'], ['eri', 'tis'], ['eri', 'nt']];
export const PLUP_SUBJ_ACT: MarkerEnding[] = [['isse', 'm'], ['isse', 's'], ['isse', 't'], ['isse', 'mus'], ['isse', 'tis'], ['isse', 'nt']];

// ------------------------------------------------------------------ imperative

export interface ImperativeSuffixes {
  presActSg: string;
  presActPl: string;
  /** the -re passive/deponent 2sg (sequere); spelled the same as the active infinitive for non-deponents. */
  presPassSg: string;
  presPassPl: string;
  futActSgAndThird: string; // 2nd = 3rd person singular
  futActPl2: string;
  futActPl3: string;
  futPassSgAndThird: string;
  futPassPl3: string;
}

export const IMPERATIVE: Record<ConjClass, ImperativeSuffixes> = {
  1: { presActSg: 'a', presActPl: 'ate', presPassSg: 'are', presPassPl: 'amini', futActSgAndThird: 'ato', futActPl2: 'atote', futActPl3: 'anto', futPassSgAndThird: 'ator', futPassPl3: 'antor' },
  2: { presActSg: 'e', presActPl: 'ete', presPassSg: 'ere', presPassPl: 'emini', futActSgAndThird: 'eto', futActPl2: 'etote', futActPl3: 'ento', futPassSgAndThird: 'etor', futPassPl3: 'entor' },
  3: { presActSg: 'e', presActPl: 'ite', presPassSg: 'ere', presPassPl: 'imini', futActSgAndThird: 'ito', futActPl2: 'itote', futActPl3: 'unto', futPassSgAndThird: 'itor', futPassPl3: 'untor' },
  '3io': { presActSg: 'e', presActPl: 'ite', presPassSg: 'ere', presPassPl: 'imini', futActSgAndThird: 'ito', futActPl2: 'itote', futActPl3: 'iunto', futPassSgAndThird: 'itor', futPassPl3: 'iuntor' },
  4: { presActSg: 'i', presActPl: 'ite', presPassSg: 'ire', presPassPl: 'imini', futActSgAndThird: 'ito', futActPl2: 'itote', futActPl3: 'iunto', futPassSgAndThird: 'itor', futPassPl3: 'iuntor' },
};

// ------------------------------------------------------------------ infinitives, participle, gerund/gerundive

export interface NonFiniteSuffixes {
  infPresAct: string;
  /** 1st/2nd/4th: -ari/-eri/-iri; 3rd/3io: bare -i (A&G's "regi" exception). */
  infPresPass: string;
  /** present participle: nominative singular suffix and the oblique stem suffix (…ntis). */
  ptcpPresNom: string;
  ptcpPresStem: string;
  /** gerund/gerundive suffix before -i/-o/-um/-o or -us/-a/-um. */
  gerundive: string;
}

export const NON_FINITE: Record<ConjClass, NonFiniteSuffixes> = {
  1: { infPresAct: 'are', infPresPass: 'ari', ptcpPresNom: 'ans', ptcpPresStem: 'ant', gerundive: 'andus' },
  2: { infPresAct: 'ere', infPresPass: 'eri', ptcpPresNom: 'ens', ptcpPresStem: 'ent', gerundive: 'endus' },
  3: { infPresAct: 'ere', infPresPass: 'i', ptcpPresNom: 'ens', ptcpPresStem: 'ent', gerundive: 'endus' },
  '3io': { infPresAct: 'ere', infPresPass: 'i', ptcpPresNom: 'iens', ptcpPresStem: 'ient', gerundive: 'iendus' },
  4: { infPresAct: 'ire', infPresPass: 'iri', ptcpPresNom: 'iens', ptcpPresStem: 'ient', gerundive: 'iendus' },
};

export const CONJ_LABEL: Record<ConjClass, string> = { 1: '1st', 2: '2nd', 3: '3rd', '3io': '3rd (-io)', 4: '4th' };

// ------------------------------------------------------------------ sum, as the auxiliary of every passive perfect system

/**
 * sum's own present-system finite forms, used both for sum's own paradigm (lexicon/irregular.ts)
 * and — because every passive perfect system is PPP + a form of sum — as the auxiliary word
 * plugged into every OTHER verb's perfect/pluperfect/future-perfect passive and perfect/pluperfect
 * passive subjunctive (`verbParadigm.ts`). Note sum's own future 3rd plural is "erunt", not the
 * "-erint" of a synthetic future perfect active — so the passive future perfect reads "amati erunt",
 * not *"amati erint".
 */
export const SUM_AUX = {
  presInd: ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'],
  imperfInd: ['eram', 'eras', 'erat', 'eramus', 'eratis', 'erant'],
  futInd: ['ero', 'eris', 'erit', 'erimus', 'eritis', 'erunt'],
  presSubj: ['sim', 'sis', 'sit', 'simus', 'sitis', 'sint'],
  imperfSubj: ['essem', 'esses', 'esset', 'essemus', 'essetis', 'essent'],
} as const;
