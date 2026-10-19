/**
 * Wiktionary (kaikki.org) Hebrew labels → this adapter's features. Used for a dictionary form-of relation (`morphFromTags`), for
 * the rows of a dictionary inflection table (`featuresFromTableTags`) and for the kaikki-he-tables form index (index-store.ts,
 * codes 'kaikki-tags': the tags joined with "|"). Unknown labels are ignored, never guessed. Values are the tokens oshb.ts writes
 * for the Biblical readings, so one paradigm can hold both periods; the Modern tenses are Past / Pres / Fut.
 */
import type { PartOfSpeech } from '../../core';

const LABELS: Readonly<Record<string, readonly [string, string]>> = {
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'], dual: ['Number', 'Dual'],
  past: ['Conj', 'Past'], present: ['Conj', 'Pres'], future: ['Conj', 'Fut'], imperative: ['Conj', 'Imp'],
  infinitive: ['VerbForm', 'Inf'], participle: ['VerbForm', 'Part'],
  passive: ['Voice', 'Pass'], active: ['Voice', 'Act'],
  construct: ['State', 'Cons'], 'construct-form': ['State', 'Cons'],
  definite: ['Definite', 'Def'], indefinite: ['Definite', 'Ind'],
  'possessed-form': ['Poss', 'Yes'], possessive: ['Poss', 'Yes'],
  negative: ['Polarity', 'Neg'],
  "construction-pa'al": ['Binyan', 'Qal'], 'construction-paal': ['Binyan', 'Qal'],
  "construction-nif'al": ['Binyan', 'Nifal'], 'construction-nifal': ['Binyan', 'Nifal'],
  "construction-pi'el": ['Binyan', 'Piel'], 'construction-piel': ['Binyan', 'Piel'],
  "construction-pu'al": ['Binyan', 'Pual'], 'construction-pual': ['Binyan', 'Pual'],
  "construction-hif'il": ['Binyan', 'Hifil'], 'construction-hifil': ['Binyan', 'Hifil'],
  "construction-huf'al": ['Binyan', 'Hofal'], "construction-hof'al": ['Binyan', 'Hofal'], 'construction-hufal': ['Binyan', 'Hofal'],
  "construction-hitpa'el": ['Binyan', 'Hitpael'], 'construction-hitpael': ['Binyan', 'Hitpael'],
  "construction-nitpa'el": ['Binyan', 'Nitpael'],
  "construction-pi'lel": ['Binyan', 'Pilel'], 'construction-polel': ['Binyan', 'Polel'], 'construction-pilpel': ['Binyan', 'Pilpel'],
  "construction-hitpol'el": ['Binyan', 'Hitpolel'], 'construction-hitpalpel': ['Binyan', 'Hitpalpel'],
};
const ORDER: Readonly<Record<string, readonly string[]>> = { Gender: ['Fem', 'Masc'], Number: ['Dual', 'Plur', 'Sing'], Person: ['1', '2', '3'] };
/** Labels that are not morphology and are dropped before anything is read. */
export const NON_MORPH_TAGS: ReadonlySet<string> = new Set([
  'canonical', 'romanization', 'table-tags', 'inflection-template', 'class', 'error-unrecognized-form', 'form-of', 'alt-of', 'alternative',
  'misspelling', 'noun-from-verb', 'morpheme', 'collocation', 'abbreviation', 'Modern-Israeli', 'Biblical', 'colloquial', 'archaic', 'slang',
  'literary', 'rare', 'dated', 'obsolete', 'uncountable', 'countable', 'no-plural', 'no-construct-forms', 'transitive', 'intransitive',
]);

export function heMorphFromTags(tags: readonly string[]): Record<string, string> {
  const sets: Record<string, string[]> = {};
  for (const raw of tags) {
    const hit = LABELS[raw.normalize('NFC').trim().toLowerCase().replace(/\s+/g, '-')];
    if (!hit) continue;
    const [k, v] = hit;
    if (!(sets[k] ??= []).includes(v)) sets[k].push(v);
  }
  const out: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) {
    const order = ORDER[k];
    out[k] = (order ? [...vs].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vs).join(',');
  }
  // a Modern tense without a verb form is finite; the present is the participle in form but a tense in use, so it stays Fin
  if (!out.VerbForm && out.Conj) out.VerbForm = out.Conj === 'Imp' || out.Conj === 'Past' || out.Conj === 'Pres' || out.Conj === 'Fut' ? 'Fin' : out.VerbForm ?? 'Fin';
  if (out.Voice === 'Pass' && out.VerbForm === 'Part') out.Conj = 'PassPart';
  return out;
}

/** The dictionary table's tags for one row → feature keys; undefined when the tags name no feature (the row is not placed). */
export function heFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech): Record<string, string> | undefined {
  const kept = tags.filter((t) => !NON_MORPH_TAGS.has(t));
  const f = heMorphFromTags(kept);
  if (!Object.keys(f).length) return undefined;
  // a noun or adjective row with no state is the absolute state; a plain noun row is indefinite unless said otherwise
  if ((pos === 'NOUN' || pos === 'ADJ') && !f.State && !f.Poss) f.State = 'Abs';
  return f;
}
