/**
 * The expanded analysis of a Hebrew verb form: its root, stem, conjugation, agreement and components, for the card's "analysis" section. The compact
 * card is not touched. Grammar first: everything here reads the source's features and the letters of the word.
 *
 * Components. The source (Open Scriptures) cuts a word at its prefixes and suffix pronouns, and does not cut the verb's own preformative and ending.
 * Those are cut here only when the features name an ending AND the letters and points of the word show it; otherwise the verb stays whole. A weak or
 * irregular form is not forced into a pattern: no segmentation is invented.
 */
import type { CandidateWordPart, WordFormAnalysis, WordFormComponent } from '../../core/word-analysis';
import { BINYAN_WORDS } from './describe';
import { consonantal, pointed } from './text';

const SHEVA = 'ְ', HIRIQ = 'ִ', SEGOL = 'ֶ', QAMATS = 'ָ', SHURUQ = 'ּ';
const LETTER = /[א-ת]/u;

/** A pointed word as its letters, each with its marks. */
function letters(word: string): Array<{ ch: string; marks: string; start: number; end: number }> {
  const out: Array<{ ch: string; marks: string; start: number; end: number }> = [];
  let i = 0;
  for (const c of word) {
    if (LETTER.test(c)) out.push({ ch: c, marks: '', start: i, end: i + c.length });
    else if (out.length) { out[out.length - 1].marks += c; out[out.length - 1].end = i + c.length; }
    i += c.length;
  }
  return out;
}
const hasMark = (l: { marks: string } | undefined, m: string): boolean => !!l && l.marks.includes(m);

const PERSON_WORD: Record<string, string> = { 1: 'first person', 2: 'second person', 3: 'third person' };
const GENDER_WORD: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Com: 'common', 'Fem,Masc': 'masculine or feminine' };
const NUMBER_WORD: Record<string, string> = { Sing: 'singular', Plur: 'plural', Dual: 'dual' };
/** "first person common singular", or what the features give. */
export function agreementOf(morph: Readonly<Record<string, string>>): string | undefined {
  const bits = [PERSON_WORD[morph.Person ?? ''], GENDER_WORD[morph.Gender ?? ''], NUMBER_WORD[morph.Number ?? '']].filter(Boolean);
  return bits.length ? bits.join(' ') : undefined;
}
const shortAgreement = (m: Readonly<Record<string, string>>): string => [m.Person ? `${m.Person}` : '', m.Gender === 'Masc' ? 'm' : m.Gender === 'Fem' ? 'f' : m.Gender === 'Com' ? 'c' : '', m.Number === 'Sing' ? 's' : m.Number === 'Plur' ? 'p' : m.Number === 'Dual' ? 'd' : ''].join('');

/** How long the ending is, in letters, when the features name one and the word shows it. */
function endingOf(ls: ReadonlyArray<{ ch: string; marks: string }>, morph: Readonly<Record<string, string>>, rootClass?: RootClass): { letters: number; label: string } | undefined {
  const n = ls.length;
  const last = ls[n - 1], prev = ls[n - 2];
  const key = shortAgreement(morph);
  const conj = morph.Conj;
  if (conj === 'Perf' || conj === 'WeQatal') {
    const label = `perfect ${PERSON_WORD[morph.Person ?? ''] ?? ''} ${GENDER_WORD[morph.Gender ?? ''] ?? ''} ${NUMBER_WORD[morph.Number ?? ''] ?? ''} ending`.replace(/\s+/g, ' ');
    switch (key) {
      case '1cs': return prev?.ch === 'ת' && hasMark(prev, HIRIQ) && last?.ch === 'י' ? { letters: 2, label } : undefined;
      case '2ms': return last?.ch === 'ת' && hasMark(last, QAMATS) ? { letters: 1, label } : prev?.ch === 'ת' && hasMark(prev, QAMATS) && last?.ch === 'ה' ? { letters: 2, label } : undefined;
      case '2fs': return last?.ch === 'ת' && hasMark(last, SHEVA) ? { letters: 1, label } : undefined;
      // a root in final ה writes its feminine with ת: עָשְׂתָה
      case '3fs': return last?.ch === 'ה' && prev?.ch === 'ת' && hasMark(prev, QAMATS) && rootClass === 'III-he' ? { letters: 2, label }
        : last?.ch === 'ה' && hasMark(prev, QAMATS) && rootClass !== 'III-he' ? { letters: 1, label } : undefined;
      case '3cp': return last?.ch === 'ו' && hasMark(last, SHURUQ) ? { letters: 1, label } : undefined;
      case '1cp': return prev?.ch === 'נ' && last?.ch === 'ו' && hasMark(last, SHURUQ) ? { letters: 2, label } : undefined;
      case '2mp': return prev?.ch === 'ת' && hasMark(prev, SEGOL) && last?.ch === 'ם' ? { letters: 2, label } : undefined;
      case '2fp': return prev?.ch === 'ת' && hasMark(prev, SEGOL) && last?.ch === 'ן' ? { letters: 2, label } : undefined;
      default: return undefined;
    }
  }
  if (conj === 'Impf' || conj === 'Wayyiqtol' || conj === 'Juss' || conj === 'Imp') {
    if ((key === '2fs' || morph.Number === 'Sing' && morph.Gender === 'Fem' && morph.Person === '2') && last?.ch === 'י' && hasMark(prev, HIRIQ)) return { letters: 1, label: 'second person feminine singular ending' };
    if (morph.Number === 'Plur' && morph.Gender === 'Masc' && last?.ch === 'ו' && hasMark(last, SHURUQ)) return { letters: 1, label: 'masculine plural ending' };
    if (morph.Number === 'Plur' && morph.Gender === 'Fem' && prev?.ch === 'נ' && hasMark(prev, QAMATS) && last?.ch === 'ה') return { letters: 2, label: 'feminine plural ending' };
  }
  return undefined;
}

/** The preformative of a prefix conjugation: the person's letter, when the word opens with it. */
function preformativeOf(ls: ReadonlyArray<{ ch: string }>, morph: Readonly<Record<string, string>>): { label: string } | undefined {
  const conj = morph.Conj;
  if (conj !== 'Impf' && conj !== 'Wayyiqtol' && conj !== 'Juss' && conj !== 'Coh') return undefined;
  const p = morph.Person, plural = morph.Number === 'Plur';
  const want = p === '1' ? (plural ? 'נ' : 'א') : p === '2' ? 'ת' : p === '3' ? (morph.Gender === 'Fem' ? (plural ? 'ת' : 'ת') : 'י') : undefined;
  return want && ls[0]?.ch === want ? { label: `imperfect preformative, ${agreementOf(morph) ?? 'person'}` } : undefined;
}

/** The verb itself cut into preformative, base and ending, where the features and the letters agree. */
export function verbComponents(stem: string, morph: Readonly<Record<string, string>>, binyanName: string, rootClass?: RootClass): Array<{ text: string; role: string }> {
  const word = stem.normalize('NFC');
  const ls = letters(word);
  if (ls.length < 2) return [{ text: word, role: `${binyanName} verb` }];
  const ending = endingOf(ls, morph, rootClass);
  const before = preformativeOf(ls, morph);
  const from = before ? 1 : 0;
  const to = ls.length - (ending?.letters ?? 0);
  if (to - from < 1) return [{ text: word, role: `${binyanName} verb` }];
  const out: Array<{ text: string; role: string }> = [];
  if (before) out.push({ text: word.slice(0, ls[1].start), role: before.label });
  out.push({ text: word.slice(ls[from].start, ls[to - 1].end), role: ending || before ? `${binyanName} verbal base` : `${binyanName} verb` });
  if (ending) out.push({ text: word.slice(ls[to].start), role: ending.label });
  return out;
}

export type RootClass = 'hollow' | 'geminate' | 'III-he' | 'I-nun' | 'I-yod' | 'guttural' | 'strong' | 'other';
/** The root's class, from its consonants (final letters already made medial). */
export function rootClassOf(root: string): RootClass {
  const c = [...root];
  if (c.length !== 3) return 'other';
  if (c[1] === 'ו' || c[1] === 'י') return 'hollow';
  if (c[1] === c[2]) return 'geminate';
  if (c[2] === 'ה') return 'III-he';
  if (c[0] === 'נ') return 'I-nun';
  if (c[0] === 'י') return 'I-yod';
  if (c.some((x) => 'אהחע'.includes(x))) return 'guttural';
  return 'strong';
}

const STEM_EXPLAINED: Readonly<Record<string, string>> = {
  Qal: 'the basic stem: the root\'s plain meaning.',
  Nifal: 'often the passive or reflexive of the Qal; some roots use it as their ordinary active verb.',
  Piel: 'the doubled stem: it often makes a state into an action, or intensifies one.',
  Pual: 'the passive of the Piel.',
  Hifil: 'usually causative: it makes someone do or be what the root says.',
  Hofal: 'the passive of the Hifil.',
  Hitpael: 'usually reflexive or reciprocal: the subject acts on itself.',
  Polel: 'the form a hollow or doubled root uses in place of the Piel. It repeats the last root letter, and it often makes a state into an action.',
  Polal: 'the passive of the Polel.',
  Hitpolel: 'the reflexive of the Polel.',
  Poel: 'a form some roots use in place of the Piel: a long first vowel instead of a doubled middle letter.',
  Poal: 'the passive of the Poel.',
  Hitpoel: 'the reflexive of the Poel.',
  Pilpel: 'the stem that repeats two root letters; often an action done again and again.',
  Polpal: 'the passive of the Pilpel.',
  Hitpalpel: 'the reflexive of the Pilpel.',
  QalPass: 'an old passive of the Qal.',
  Hishtafel: 'a rare stem, known above all from הִשְׁתַּחֲוָה "bowed down".',
  Peal: 'the basic stem of Aramaic.', Peil: 'the passive of the Aramaic basic stem.', Pael: 'the Aramaic doubled stem.', Afel: 'the Aramaic causative.', Hafel: 'the Aramaic causative, in its older spelling.',
  Hitpeel: 'the Aramaic passive or reflexive of the basic stem.', Itpeel: 'the Aramaic passive or reflexive of the basic stem.', Hitpaal: 'the Aramaic passive or reflexive of the doubled stem.', Itpaal: 'the Aramaic passive or reflexive of the doubled stem.',
};
const CONJ_EXPLAINED: Readonly<Record<string, string>> = {
  Perf: 'perfect (qatal): the action seen as a whole. English usually says it in the past, but a state may be present and a prophecy future: the sentence decides.',
  WeQatal: 'weqatal: a perfect joined by "and" that usually carries a future or a command forward; in a past description it can mean what used to happen.',
  Impf: 'imperfect (yiqtol): action not seen as complete. English may need "will", "may", "would" or a present: the sentence decides.',
  Wayyiqtol: 'wayyiqtol: the form that carries a narrative forward in the past: "and he did".',
  Imp: 'imperative: a command.',
  Coh: 'cohortative: the speaker\'s own wish or resolve, "let me", "let us".',
  Juss: 'jussive: a wish or command to or about someone else, "may he", "let it".',
  Part: 'participle: a verbal adjective, the one doing the action or the action going on.',
  PassPart: 'passive participle: the one the action was done to.',
  InfCons: 'infinitive construct: the verb as a noun, often after a preposition, "to do", "when doing".',
  InfAbs: 'infinitive absolute: often beside a verb of the same root, for emphasis.',
};

export interface HebrewFormInput {
  surface: string; lemma?: string; pos?: string; lemmaGloss?: string; morph: Readonly<Record<string, string>>;
  parts?: readonly CandidateWordPart[]; inflected?: string; why?: string;
}

const FINAL_OF: Record<string, string> = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };
/** The root as written: consonants, with a word-final letter in its final form. */
function rootLetters(lemma: string): string {
  const c = [...consonantal(lemma).normalize('NFC')].map((x) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' } as Record<string, string>)[x] ?? x);
  if (c.length) c[c.length - 1] = FINAL_OF[c[c.length - 1]] ?? c[c.length - 1];
  return c.join('');
}

/** The expanded analysis of a verb form, or undefined for anything else (nothing is claimed about what it cannot read). */
export function hebrewFormAnalysis(input: HebrewFormInput): WordFormAnalysis | undefined {
  const { morph } = input;
  const verbal = input.pos === 'VERB' || input.pos === 'AUX' || (!input.pos && !!morph.Binyan);
  if (!verbal || !morph.Binyan) return undefined;
  const binyan = morph.Binyan.includes(',') ? undefined : morph.Binyan;
  const binyanName = binyan ? BINYAN_WORDS[binyan] ?? binyan : 'Verb';
  const root = input.lemma ? rootLetters(input.lemma) : undefined;
  const rootPlain = root ? root.replace(/[ךםןףץ]/g, (x) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' } as Record<string, string>)[x]) : '';
  const cls: RootClass = rootPlain ? rootClassOf(rootPlain) : 'other';
  const components: WordFormComponent[] = [];
  const surfaceParts = input.parts ?? [];
  if (surfaceParts.length) {
    for (const p of surfaceParts) {
      if (p.role === 'stem') for (const c of verbComponents(pointed(p.text), morph, binyanName, cls)) components.push(c);
      else components.push({ text: pointed(p.text), role: p.role ?? 'part' });
    }
  } else {
    for (const c of verbComponents(pointed(input.surface), morph, binyanName, cls)) components.push(c);
  }
  const lines: WordFormAnalysis['lines'] = [];
  if (binyan) {
    const weak = cls === 'hollow' && ['Polel', 'Polal', 'Hitpolel'].includes(binyan) ? ` ${root} is a hollow root, with no consonant of its own in the middle, so it cannot double its middle letter and repeats its last.`
      : cls === 'geminate' && ['Polel', 'Polal', 'Hitpolel', 'Poel', 'Poal', 'Hitpoel'].includes(binyan) ? ` ${root} has the same second and third letter, so this form takes the place of the Piel.` : '';
    lines.push({ key: 'stem', label: 'Stem', text: `${binyanName}: ${STEM_EXPLAINED[binyan] ?? 'a derived stem.'}${weak}` });
  }
  const conj = morph.Conj && !morph.Conj.includes(',') ? morph.Conj : undefined;
  if (conj && CONJ_EXPLAINED[conj]) lines.push({ key: 'conjugation', label: 'Conjugation', text: CONJ_EXPLAINED[conj][0].toUpperCase() + CONJ_EXPLAINED[conj].slice(1) });
  const agreement = agreementOf(morph);
  if (agreement) lines.push({ key: 'agreement', label: 'Agreement', text: agreement[0].toUpperCase() + agreement.slice(1) + (morph.Person === '3' && morph.Gender === 'Masc' && morph.Number === 'Sing' ? '. English may need "he" or "it": the sentence decides.' : '.') });
  if (input.why) lines.push({ key: 'context', label: 'In this verse', text: input.why });
  return {
    ...(root ? { root } : {}), ...(input.lemmaGloss ? { rootMeaning: input.lemmaGloss } : {}),
    components, lines,
    ...(input.inflected ? {} : { limitation: 'GoLearn could not write this form in English with confidence, so the lemma meaning is shown instead.' }),
  };
}
