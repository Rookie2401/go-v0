/**
 * Prepositions with a pronoun suffix, as Modern Hebrew writes them unpointed: שלהם "their", לי "to me", אותו "him", עליו "on him".
 *
 * Wiktionary (the source of the Modern index) gives these forms no entry and no table, so before 2026-11-13 the commonest of them
 * had no reading on a Modern page: in the audit of two Hebrew Wikipedia articles שלהם alone was missed four times. They are a
 * closed class, so they are listed here by hand, each with the preposition it belongs to and the person, number and gender of
 * its suffix. Owner-authored, AI-drafted, not reviewed by a native speaker (the pack says so).
 *
 * A listed form is read this way only when the text is unpointed (a pointed form is the Tanakh index's to read), or when no index
 * holds the form at all. Its confidence (0.8) puts it before a Wiktionary reading of the same letters (0.7 at most: שָׁלֵו "calm"
 * for שלו, אֵלִי "my God" for אלי), which stays as the alternative; nothing is removed.
 */
import type { AnalysisCandidate, RawToken, WordPart } from '../../core';
import { consonantal } from './text';

/** The suffix slots, in the order every row below lists its spellings. */
const SLOTS: ReadonlyArray<{ morph: Record<string, string>; obj: string; poss: string }> = [
  { morph: { Person: '1', Number: 'Sing' }, obj: 'me', poss: 'my, mine' },
  { morph: { Person: '2', Number: 'Sing' }, obj: 'you (sg.)', poss: 'your, yours (sg.)' },
  { morph: { Person: '3', Number: 'Sing', Gender: 'Masc' }, obj: 'him, it', poss: 'his, its' },
  { morph: { Person: '3', Number: 'Sing', Gender: 'Fem' }, obj: 'her, it', poss: 'her, hers, its' },
  { morph: { Person: '1', Number: 'Plur' }, obj: 'us', poss: 'our, ours' },
  { morph: { Person: '2', Number: 'Plur', Gender: 'Masc' }, obj: 'you (pl. m.)', poss: 'your, yours (pl. m.)' },
  { morph: { Person: '2', Number: 'Plur', Gender: 'Fem' }, obj: 'you (pl. f.)', poss: 'your, yours (pl. f.)' },
  { morph: { Person: '3', Number: 'Plur', Gender: 'Masc' }, obj: 'them (m.)', poss: 'their, theirs (m.)' },
  { morph: { Person: '3', Number: 'Plur', Gender: 'Fem' }, obj: 'them (f.)', poss: 'their, theirs (f.)' },
];

interface Row {
  /** The preposition's citation form, pointed. */
  lemma: string;
  /** What the preposition means before the pronoun ("to" → "to me"); '' for the object marker. */
  english: string;
  /** How the English is made: before the object pronoun, or the possessive. */
  kind: 'obj' | 'poss';
  /** Spellings per slot, '|' between alternatives; '' where the slot is not listed (a form the bare preposition shares). */
  forms: readonly string[];
  /** Less common in Modern prose than another reading of the same letters: stays behind an index reading. */
  literary?: boolean;
}

const ROWS: readonly Row[] = [
  { lemma: 'שֶׁל', english: '', kind: 'poss', forms: ['שלי', 'שלך', 'שלו', 'שלה', 'שלנו', 'שלכם', 'שלכן', 'שלהם', 'שלהן'] },
  { lemma: 'לְ', english: 'to', kind: 'obj', forms: ['לי', 'לך', 'לו', 'לה', 'לנו', 'לכם', 'לכן', 'להם', 'להן'] },
  { lemma: 'בְּ', english: 'in', kind: 'obj', forms: ['בי', 'בך', 'בו', 'בה', 'בנו', 'בכם', 'בכן', 'בהם', 'בהן'] },
  { lemma: 'אֶת', english: '', kind: 'obj', forms: ['אותי', 'אותך', 'אותו', 'אותה', 'אותנו', 'אתכם|אותכם', 'אתכן|אותכן', 'אותם', 'אותן'] },
  { lemma: 'אֵת', english: 'with', kind: 'obj', forms: ['איתי', 'איתך', 'איתו', 'איתה', 'איתנו', 'איתכם', 'איתכן', 'איתם', 'איתן'] },
  { lemma: 'עִם', english: 'with', kind: 'obj', forms: ['עמי|עימי', 'עמך|עימך', 'עמו|עימו', 'עמה|עימה', 'עמנו|עימנו', 'עמכם|עימכם', 'עמכן|עימכן', 'עמם|עימם', 'עמן|עימן'], literary: true },
  { lemma: 'מִן', english: 'from', kind: 'obj', forms: ['ממני', 'ממך', 'ממנו', 'ממנה', 'ממנו|מאיתנו', 'מכם', 'מכן', 'מהם', 'מהן'] },
  { lemma: 'עַל', english: 'on', kind: 'obj', forms: ['עליי|עלי', 'עליך|עלייך', 'עליו', 'עליה', 'עלינו', 'עליכם', 'עליכן', 'עליהם', 'עליהן'] },
  { lemma: 'אֶל', english: 'to', kind: 'obj', forms: ['אליי|אלי', 'אליך|אלייך', 'אליו', 'אליה', 'אלינו', 'אליכם', 'אליכן', 'אליהם', 'אליהן'] },
  { lemma: 'אֵצֶל', english: 'at the place of', kind: 'obj', forms: ['אצלי', 'אצלך', 'אצלו', 'אצלה', 'אצלנו', 'אצלכם', 'אצלכן', 'אצלם', 'אצלן'] },
  { lemma: 'בִּשְׁבִיל', english: 'for', kind: 'obj', forms: ['בשבילי', 'בשבילך', 'בשבילו', 'בשבילה', 'בשבילנו', 'בשבילכם', 'בשבילכן', 'בשבילם', 'בשבילן'] },
  { lemma: 'לִפְנֵי', english: 'before', kind: 'obj', forms: ['לפניי', 'לפניך|לפנייך', 'לפניו', 'לפניה', 'לפנינו', 'לפניכם', 'לפניכן', 'לפניהם', 'לפניהן'] },
  { lemma: 'אַחֲרֵי', english: 'after', kind: 'obj', forms: ['אחריי', 'אחריך|אחרייך', 'אחריו', 'אחריה', 'אחרינו', 'אחריכם', 'אחריכן', 'אחריהם', 'אחריהן'] },
  { lemma: 'כְּמוֹ', english: 'like', kind: 'obj', forms: ['כמוני', 'כמוך', 'כמוהו', 'כמוה', 'כמונו', 'כמוכם', 'כמוכן', 'כמוהם', 'כמוהן'] },
];

/** The table as a lookup: unpointed spelling → its readings (ממנו is both "from him" and "from us"). */
const BY_FORM: ReadonlyMap<string, ReadonlyArray<{ row: Row; slot: number }>> = (() => {
  const m = new Map<string, Array<{ row: Row; slot: number }>>();
  for (const row of ROWS) row.forms.forEach((spellings, slot) => {
    for (const s of spellings.split('|').filter(Boolean)) m.set(s, [...(m.get(s) ?? []), { row, slot }]);
  });
  return m;
})();

/** Every listed spelling (for tests and the pack's own count). */
export const PRONOMINAL_FORMS: readonly string[] = [...BY_FORM.keys()];

/** The English of one reading: "to them (m.)", "their, theirs (m.)", "him, it (object)". */
export function pronominalGloss(row: Pick<Row, 'english' | 'kind'>, slot: number): string {
  const s = SLOTS[slot];
  if (row.kind === 'poss') return s.poss;
  return row.english ? `${row.english} ${s.obj}` : `${s.obj} (object)`;
}

/** Prefixes that may stand before a listed form (וְ "and", שֶׁ "that", כְּשֶׁ "when"), longest first. */
const LEADS: ReadonlyArray<{ text: string; lemma: string; gloss: string }> = [
  { text: 'וכש', lemma: 'וְ + כְּשֶׁ', gloss: 'and when' },
  { text: 'כש', lemma: 'כְּשֶׁ', gloss: 'when' },
  { text: 'וש', lemma: 'וְ + שֶׁ', gloss: 'and that' },
  { text: 'ו', lemma: 'וְ', gloss: 'and' },
  { text: 'ש', lemma: 'שֶׁ', gloss: 'that, which' },
];

/**
 * The readings of a preposition-with-suffix form, best first; empty when the form is not listed. `pointedText` lowers the
 * confidence (the table is of unpointed spellings) and marks the reading unconfirmed.
 */
export function pronominalReadings(token: RawToken, key: string, pointedText: boolean): AnalysisCandidate[] {
  const letters = consonantal(key);
  const tries: Array<{ rest: string; lead?: (typeof LEADS)[number] }> = [{ rest: letters }];
  for (const lead of LEADS) if (letters.startsWith(lead.text) && letters.length > lead.text.length + 1) tries.push({ rest: letters.slice(lead.text.length), lead });
  // the longest listed remainder wins: ושלו is ו + שלו "and his", not וש + לו
  tries.sort((a, b) => b.rest.length - a.rest.length);
  for (const t of tries) {
    const hits = BY_FORM.get(t.rest);
    if (!hits?.length) continue;
    return hits.map(({ row, slot }): AnalysisCandidate => {
      const gloss = pronominalGloss(row, slot);
      const parts: WordPart[] = [];
      if (t.lead) {
        const leadLen = surfaceLength(token.surface, t.lead.text.length);
        parts.push({ text: token.surface.slice(0, leadLen), start: 0, end: leadLen, lemma: t.lead.lemma, pos: 'CONJ', morph: {}, role: t.lead.gloss, kind: 'clitic' });
        parts.push({ text: token.surface.slice(leadLen), start: leadLen, end: token.surface.length, lemma: row.lemma, pos: 'ADP', morph: { ...SLOTS[slot].morph }, role: 'stem', kind: 'stem' });
      }
      const base = row.literary ? 0.65 : 0.8;
      return {
        lemma: row.lemma, pos: 'ADP', morph: { ...SLOTS[slot].morph, PronType: 'Prs' }, gloss: t.lead ? `${t.lead.gloss} ${gloss}` : gloss,
        confidence: pointedText ? 0.5 : t.lead ? base - 0.1 : base, varieties: ['he-mod', 'he-mish', 'he-med'],
        origin: 'rule', sourceId: 'he-rules@1',
        ...(pointedText ? { unconfirmed: true } : {}),
        ...(parts.length ? { parts } : {}),
        notes: { source: 'rule', rule: `preposition ${row.lemma} with the suffix of ${describe(slot)}${t.lead ? `, after ${t.lead.lemma}` : ''} (listed by hand: Wiktionary has no entry for these forms)` },
      };
    });
  }
  return [];
}

function describe(slot: number): string {
  const m = SLOTS[slot].morph;
  const person = { 1: 'first', 2: 'second', 3: 'third' }[Number(m.Person) as 1 | 2 | 3];
  return `the ${person} person ${m.Number === 'Sing' ? 'singular' : 'plural'}${m.Gender ? ` ${m.Gender === 'Masc' ? 'masculine' : 'feminine'}` : ''}`;
}

/** How many code units of the surface carry the first `letters` letters (points stay with their letter). */
function surfaceLength(surface: string, letters: number): number {
  let seen = 0;
  for (let i = 0; i < surface.length; i++) {
    if (/[א-ת]/u.test(surface[i])) { if (seen === letters) return i; seen++; }
  }
  return surface.length;
}
