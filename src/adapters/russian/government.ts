/**
 * Russian prepositions and the cases they take: the table behind the ordering rule "the nominal after a preposition is read in a case
 * the preposition governs" (russian/sentence.ts) and behind the construction notes of constructions.ts.
 *
 * MACHINE-DRAFTED from standard grammar descriptions of Russian (no running text was copied); not reviewed by a native speaker.
 * `main` cases are the ones a learner meets first; `minor` cases are real but rare or tied to a few expressions (с + accusative in
 * "с неделю" = about a week, по + prepositional in "по окончании", между + genitive in "между нами и ими" with some pronouns), so a
 * reading in a minor case is not ruled out, only not preferred as strongly.
 *
 * Case names are the pack's (Case=Acc, Gen, Dat, Ins, Prep). The second locative (в лесу́) and the partitive are read as Prep and Gen
 * by `ruGovCase`, which is how the rules compare a reading's case with a preposition's.
 */

export type RuGovCase = 'Gen' | 'Dat' | 'Acc' | 'Ins' | 'Prep';

export interface RuPreposition {
  /** The headword the dictionary files the preposition under. */
  lemma: string;
  /** Written variants that are the same word (before a cluster of consonants): во, со, ко, обо, изо, надо, подо, передо, ото, безо. */
  variants: string[];
  /** The cases the preposition most often takes. */
  main: RuGovCase[];
  /** Cases it takes in a few expressions only. */
  minor: RuGovCase[];
  /** What the case changes, when it changes the meaning (в / на + Acc = direction; + Prep = location). */
  contrast?: Partial<Record<RuGovCase, string>>;
}

const P = (lemma: string, variants: string[], main: RuGovCase[], minor: RuGovCase[] = [], contrast?: Partial<Record<RuGovCase, string>>): RuPreposition =>
  ({ lemma, variants, main, minor, ...(contrast ? { contrast } : {}) });

export const RU_PREPOSITIONS: readonly RuPreposition[] = [
  P('в', ['во'], ['Acc', 'Prep'], [], { Acc: 'into, to (direction)', Prep: 'in (location)' }),
  P('на', [], ['Acc', 'Prep'], [], { Acc: 'onto, to (direction)', Prep: 'on, at (location)' }),
  P('с', ['со'], ['Gen', 'Ins'], ['Acc'], { Gen: 'from, down from, since', Ins: 'with, together with', Acc: 'about, approximately (с неделю)' }),
  P('к', ['ко'], ['Dat'], [], { Dat: 'to, towards' }),
  P('у', [], ['Gen'], [], { Gen: 'at, by, near, in the possession of' }),
  P('от', ['ото'], ['Gen']),
  P('до', [], ['Gen']),
  P('из', ['изо'], ['Gen']),
  P('без', ['безо'], ['Gen']),
  P('для', [], ['Gen']),
  P('около', [], ['Gen']),
  P('после', [], ['Gen']),
  P('кроме', [], ['Gen']),
  P('вместо', [], ['Gen']),
  P('вокруг', [], ['Gen']),
  P('среди', [], ['Gen']),
  P('против', [], ['Gen']),
  P('из-за', [], ['Gen']),
  P('из-под', [], ['Gen']),
  P('мимо', [], ['Gen']),
  P('возле', [], ['Gen']),
  P('вдоль', [], ['Gen']),
  P('внутри', [], ['Gen']),
  P('вне', [], ['Gen']),
  P('ради', [], ['Gen']),
  P('помимо', [], ['Gen']),
  P('ввиду', [], ['Gen']),
  P('насчёт', [], ['Gen']),
  P('вследствие', [], ['Gen']),
  P('о', ['об', 'обо'], ['Prep'], ['Acc'], { Prep: 'about, concerning', Acc: 'against, on (о стену)' }),
  P('по', [], ['Dat', 'Acc'], ['Prep'], { Dat: 'along, on, according to', Acc: 'up to, as far as, each', Prep: 'after (по окончании)' }),
  P('за', [], ['Acc', 'Ins'], [], { Acc: 'for, behind (direction), in exchange for', Ins: 'behind, beyond (location)' }),
  P('под', ['подо'], ['Acc', 'Ins'], [], { Acc: 'under (direction)', Ins: 'under (location)' }),
  P('перед', ['передо'], ['Ins']),
  P('над', ['надо'], ['Ins']),
  P('между', ['меж'], ['Ins'], ['Gen'], { Ins: 'between, among', Gen: 'between (with some pronouns and fixed phrases)' }),
  P('при', [], ['Prep']),
  P('через', [], ['Acc']),
  P('про', [], ['Acc']),
  P('сквозь', [], ['Acc']),
  P('благодаря', [], ['Dat']),
  P('согласно', [], ['Dat']),
  P('вопреки', [], ['Dat']),
  P('навстречу', [], ['Dat']),
  P('посредством', [], ['Ins']),
];

/** Every written form (the lemma and its variants) → the preposition. */
const BY_FORM: ReadonlyMap<string, RuPreposition> = new Map(RU_PREPOSITIONS.flatMap((p) => [p.lemma, ...p.variants].map((f): [string, RuPreposition] => [f, p])));

/** The preposition a written form (a key: lower case, no stress marks) is, or undefined. */
export const ruPrepositionOf = (key: string): RuPreposition | undefined => BY_FORM.get(key);

/** The pack's case → the case the rules compare: the second locative is a prepositional, the partitive a genitive, the vocative a nominative. */
export function ruGovCase(c: string): string {
  return c === 'Loc' ? 'Prep' : c === 'Par' ? 'Gen' : c === 'Voc' ? 'Nom' : c;
}

/** The cases of a reading's `Case` value (possibly a union "Acc,Nom"), as the rules compare them. */
export const ruCasesOf = (value: string | undefined): string[] => (value ? [...new Set(value.split(',').map(ruGovCase))] : []);

/** How well a case fits a preposition: 2 = a main case, 1 = a minor one, 0 = it does not take it. */
export function ruGovernmentFit(prep: RuPreposition, caseName: string): 0 | 1 | 2 {
  const c = ruGovCase(caseName);
  if ((prep.main as string[]).includes(c)) return 2;
  if ((prep.minor as string[]).includes(c)) return 1;
  return 0;
}

/**
 * Pronoun forms that Russian writes with an initial н- only after a preposition (него, неё, них, ним, нём, нему, ней, ними): they
 * are forms of the personal pronouns (он, она, оно, они), never the possessive.
 */
export const RU_N_PRONOUNS: ReadonlySet<string> = new Set(['него', 'нему', 'ним', 'нём', 'нем', 'неё', 'нее', 'ней', 'них', 'ними']);
