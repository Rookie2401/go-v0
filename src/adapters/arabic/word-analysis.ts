/**
 * Arabic word analysis for the card: the English of a verb FORM from its citation and features, the cells a form stands for when it
 * is two at once, and the expanded analysis (root, verb form, parts).
 *
 * Three things are kept apart, as for Hebrew and Greek:
 *   lexical        the lemma's meaning as the dictionary cites it ("to write").
 *   morphological  the English of this form: كَتَبَتْ "she wrote", يَكْتُبُونَ "they write", اُكْتُبْ "write!". Written here from the
 *                  features alone. The perfect is written as a past ("he wrote") and the imperfect as a present ("he writes"; with سَـ
 *                  or سَوْفَ, "he will write"): that is the reader's default, not a claim about the sentence, where لَمْ يَكْتُبْ is "he
 *                  did not write". The explanation line says so.
 *   contextual     nothing is computed for Arabic.
 * ONE FORM, TWO CELLS. تَكْتُبُ is "she writes" and "you (m.) write"; unvocalized كتبت is "I wrote", "you wrote" and "she wrote". The
 * analyser hands such a form over as one reading with unions (Person=2,3; Gender=Fem,Masc). The shared projection would split
 * Person alone and pair it with the wrong gender, and would show the first as if it were decided. Here the cells are named from the
 * syncretisms Arabic really has (`arVerbCells`) and the form's English says all of them: "she writes / you (m.) write".
 *
 * The root is the SOURCE's (the index row of the lemma: text.ts, index-store.ts); nothing is derived from letters. A lemma the
 * installed index does not hold shows no root. Machine-drafted; not reviewed by a native speaker or an Arabist.
 */
import { candidateWordAnalysis, type CandidateMeaningInput, type CandidateWordPart, type WordAnalysis, type WordFormAnalysis, type WordFormComponent } from '../../core/word-analysis';
import { realizeFromCitation, type VerbShape } from '../../core/english-verb';
import { lookupArabicLemma } from './index-store';
import { rootRadicals } from './text';

export type ArabicWordAnalysisInput = Omit<CandidateMeaningInput, 'language'>;
type Morph = Readonly<Record<string, string>>;

const list = (v: string | undefined, sep = ','): string[] => (v ?? '').split(sep).map((s) => s.trim()).filter(Boolean);
const single = (v: string | undefined): string | undefined => (v && !/[,/]/.test(v) ? v : undefined);
const UNION = '/';

/**
 * The person, gender and number cells a verb reading stands for, the commonest first. A reading with no union is its own single
 * cell. Only the syncretisms of the Arabic verb are unpacked (the imperfect: 3rd feminine = 2nd masculine in the singular, 3rd
 * feminine = 2nd in the dual, 3rd = 2nd in the feminine plural; the unvocalized perfect كتبت: 1st, 2nd masculine, 2nd feminine, 3rd
 * feminine). Any other union is left as it is: one cell that keeps the union, of which no English is written.
 */
export function arVerbCells(morph: Morph): Array<Record<string, string>> {
  const ps = list(morph.Person), gs = list(morph.Gender), ns = list(morph.Number);
  if (ps.length <= 1 && gs.length <= 1 && ns.length <= 1) return [{ ...morph }];
  const n = ns.length === 1 ? ns[0] : undefined;
  const cell = (p: string, g?: string): Record<string, string> => {
    const m: Record<string, string> = { ...morph, Person: p };
    if (g) m.Gender = g; else delete m.Gender;
    return m;
  };
  const aspects = list(morph.Aspect);
  if (n && aspects.length === 1 && aspects[0] === 'Imp' && ps.length === 2 && ps.includes('2') && ps.includes('3')) {
    if (n === 'Sing') return [cell('3', 'Fem'), cell('2', 'Masc')];
    if (n === 'Dual') return [cell('3', 'Fem'), cell('2')];
    if (n === 'Plur' && gs.length === 1 && gs[0] === 'Fem') return [cell('3', 'Fem'), cell('2', 'Fem')];
  }
  if (n === 'Sing' && aspects.length === 1 && aspects[0] === 'Perf' && ps.length > 1) {
    const out: Array<Record<string, string>> = [];
    if (ps.includes('1')) out.push(cell('1'));
    if (ps.includes('3')) out.push(cell('3', gs.includes('Fem') ? 'Fem' : gs[0]));
    if (ps.includes('2')) for (const g of gs.length ? gs.slice().sort().reverse() : [undefined]) out.push(cell('2', g));
    return out;
  }
  return [{ ...morph }];
}

/** What the word carries beside its stem: a leading "and" / "so", the future prefix, an object pronoun on a verb. */
interface Attachments { prefix?: string; future?: boolean; object?: string }
function attachmentsOf(parts: readonly CandidateWordPart[] | undefined, verb: boolean): Attachments {
  const out: Attachments = {};
  for (const p of parts ?? []) {
    const role = (p.role ?? '').toLowerCase();
    if (p.lemma === 'و' || /^and\b/.test(role) || role.includes('conjunction')) out.prefix = out.prefix ?? (/\bso\b|then/.test(role) ? 'so ' : 'and ');
    if (role.includes('future')) out.future = true;
    if (verb && p.pos === 'PRON' && p.morph?.Person) {
      const plural = p.morph.Number === 'Plur' || p.morph.Number === 'Dual';
      out.object = p.morph.Person === '1' ? (plural ? 'us' : 'me') : p.morph.Person === '2' ? 'you' : plural ? 'them' : p.morph.Gender === 'Fem' ? 'her/it' : 'him/it';
    }
  }
  return out;
}

/** The neutral shape of one verb cell, or undefined when the features do not describe one form. */
export function arVerbShape(morph: Morph, attach: Attachments = {}): VerbShape | undefined {
  const voices = list(morph.Voice);
  // an unvocalized form is active and passive at once: the active is the reading a reader assumes
  const passive = voices.length === 1 && voices[0] === 'Pass';
  const form = single(morph.VerbForm);
  const gender = single(morph.Gender);
  const common = { passive, ...(gender === 'Masc' || gender === 'Fem' ? { gender: gender as VerbShape['gender'] } : {}), ...(attach.prefix ? { prefix: attach.prefix } : {}) };
  if (form === 'Part') return { finite: false, nonFinite: 'participle', time: passive ? 'perfect' : 'present', ...common };
  if (form && form !== 'Fin') return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const numberValue = single(morph.Number);
  const number: VerbShape['number'] | undefined = numberValue === 'Sing' ? 'Sing' : numberValue === 'Plur' || numberValue === 'Dual' ? 'Plur' : undefined;
  if (!person || !['1', '2', '3'].includes(person) || !number) return undefined;
  const who = { person, number, ...(attach.object ? { object: attach.object } : {}) };
  const moods = list(morph.Mood);
  if (moods.length === 1 && moods[0] === 'Imp') return { finite: true, mood: 'imperative', ...common, ...who };
  const aspects = list(morph.Aspect);
  if (aspects.length !== 1) return undefined;
  if (aspects[0] === 'Perf') return { finite: true, time: 'past', ...common, ...who };
  if (aspects[0] === 'Imp') return { finite: true, time: attach.future ? 'future' : 'present', ...common, ...who };
  return undefined;
}

const isUnionMorph = (m: Morph): boolean => ['Person', 'Gender', 'Number'].some((k) => (m[k] ?? '').includes(UNION));

/** The English of a verb form: one cell, or every cell the form stands for, joined with " / ". */
export function arInflectedMeaning(morph: Morph, lemmaGloss: string | undefined, attach: Attachments = {}): string | undefined {
  const plain: Record<string, string> = {};
  for (const [k, v] of Object.entries(morph)) plain[k] = v.split(UNION).join(',');
  const texts: string[] = [];
  for (const cell of arVerbCells(plain)) {
    const shape = arVerbShape(cell, attach);
    const text = shape ? realizeFromCitation(lemmaGloss, shape) : undefined;
    if (!text) return undefined;
    // the realizer writes a sentence-initial capital; a second cell is the middle of the line
    const shownText = texts.length ? text[0].toLowerCase() + text.slice(1) : text;
    if (!texts.some((t) => t.toLowerCase() === shownText.toLowerCase())) texts.push(shownText);
  }
  return texts.length ? texts.join(' / ') : undefined;
}

const FORM_NAMES: Record<string, string> = {
  I: 'Form I (the basic verb)', II: 'Form II (doubled middle radical: often “make do”, intensive)', III: 'Form III (long ā after the first radical: often “do with or toward someone”)',
  IV: 'Form IV (prefixed أ: often causative)', V: 'Form V (تَـ + Form II: often its reflexive)', VI: 'Form VI (تَـ + Form III: often reciprocal)',
  VII: 'Form VII (اِنْـ: often passive or “get done”)', VIII: 'Form VIII (ـتَـ after the first radical: often reflexive)', IX: 'Form IX (doubled last radical: colours and defects)',
  X: 'Form X (اِسْتَـ: often “seek, consider”)',
};

/** The expanded analysis: the source's root, the verb form, the word's parts. Undefined when there is nothing to add. */
export function arabicFormAnalysis(input: ArabicWordAnalysisInput, inflected: boolean): WordFormAnalysis | undefined {
  const morph = input.morph ?? {};
  const row = input.lemma ? lookupArabicLemma(`${input.lemma}|${input.pos ?? ''}`) ?? (['VERB', 'NOUN', 'ADJ'] as const).map((p) => lookupArabicLemma(`${input.lemma}|${p}`)).find(Boolean) : undefined;
  const radicals = rootRadicals(row?.[5]);
  const components: WordFormComponent[] = (input.parts ?? []).map((p) => ({ text: p.text, role: p.role ?? 'part' }));
  const lines: WordFormAnalysis['lines'] = [];
  const form = single(morph.Form);
  if (form && FORM_NAMES[form]) lines.push({ key: 'stem', label: 'Verb form', text: FORM_NAMES[form] });
  const aspect = single(morph.Aspect);
  const mood = single(morph.Mood);
  if (aspect === 'Perf') lines.push({ key: 'conjugation', label: 'Aspect', text: 'Perfect: a completed action, written here as an English past. The sentence may ask for another tense.' });
  else if (mood === 'Imp') lines.push({ key: 'conjugation', label: 'Mood', text: 'Imperative: a command.' });
  else if (aspect === 'Imp') lines.push({ key: 'conjugation', label: 'Aspect', text: `Imperfect: an action not completed, written here as an English present${mood === 'Jus' ? '. Jussive: after لَمْ it is a past negative (“did not …”), after لَا a prohibition' : mood === 'Sub' ? '. Subjunctive: after أَنْ, لَنْ, كَيْ and the like' : ''}.` });
  if (isUnionMorph(morph) || ['Person', 'Gender', 'Number'].some((k) => (morph[k] ?? '').includes(','))) {
    lines.push({ key: 'agreement', label: 'Agreement', text: 'This written form is more than one person at once; the subject of the sentence says which.' });
  }
  if (!radicals.length && !components.length && !lines.length) return undefined;
  const verbal = input.pos === 'VERB' || input.pos === 'AUX';
  return {
    ...(radicals.length ? { root: radicals.join(' ') } : {}),
    components, lines,
    ...(verbal && !inflected ? { limitation: 'GoLearn could not write this form in English with confidence, so the lemma meaning is shown instead.' } : {}),
  };
}

/** The word analysis of an Arabic reading (the per-language hook of src/adapters/word-analysis.ts). */
export function arabicWordAnalysis(input: ArabicWordAnalysisInput): WordAnalysis {
  const morph = input.morph ?? {};
  const verbal = !input.pos || input.pos === 'VERB' || input.pos === 'AUX';
  const attach = attachmentsOf(input.parts, verbal);
  // a form that is several cells is ONE reading here: its unions are written with "/" so the shared projection does not split them
  const cells = verbal ? arVerbCells(morph) : [{ ...morph }];
  const shown: Record<string, string> = { ...morph };
  if (cells.length > 1) for (const k of ['Person', 'Gender', 'Number']) if (shown[k]) shown[k] = shown[k].split(',').join(UNION);
  const realize = (_lemma: string | undefined, _pos: string | undefined, m: Morph, gloss: string | undefined): string | undefined => arInflectedMeaning(m, gloss, attach);
  const analysis = candidateWordAnalysis({ ...input, language: 'ar', morph: shown }, { realize });
  const formAnalysis = arabicFormAnalysis(input, !!analysis.inflectedMeaning);
  return formAnalysis ? { ...analysis, formAnalysis } : analysis;
}
