/**
 * Other sources' grammatical labels → this adapter's features: a dictionary's labels (Wiktionary via kaikki.org) and
 * the tag strings of the UniParser Albanian analyzer. Unknown labels are ignored, never guessed. Package Q4 (dictionary
 * labels); the UniParser mapping is written once its real output has been seen.
 *
 * Conventions are those of types.ts: several values of one feature become a union in the conventional order
 * ('Gen,Dat'); a finite verb form (a mood, tense or person, and not a participle) gets VerbForm 'Fin'. The aorist is
 * Tense 'Past'; every non-active label (mediopassive, passive, non-active) is Voice 'Mid'. A label that is not listed
 * (including a bare "past" and "dialectal") is left out, not guessed.
 */

const LABELS: Readonly<Record<string, readonly [string, string]>> = {
  nominative: ['Case', 'Nom'], accusative: ['Case', 'Acc'], genitive: ['Case', 'Gen'], dative: ['Case', 'Dat'], ablative: ['Case', 'Abl'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'],
  definite: ['Definite', 'Def'], indefinite: ['Definite', 'Ind'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'], neuter: ['Gender', 'Neut'],
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  present: ['Tense', 'Pres'], imperfect: ['Tense', 'Imp'], aorist: ['Tense', 'Past'],
  indicative: ['Mood', 'Ind'], subjunctive: ['Mood', 'Sub'], imperative: ['Mood', 'Imp'], optative: ['Mood', 'Opt'], admirative: ['Mood', 'Adm'],
  active: ['Voice', 'Act'], mediopassive: ['Voice', 'Mid'], passive: ['Voice', 'Mid'], 'non-active': ['Voice', 'Mid'],
  participle: ['VerbForm', 'Part'],
};

const ORDER: Readonly<Record<string, readonly string[]>> = {
  Case: ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'], Number: ['Sing', 'Plur'], Gender: ['Masc', 'Fem', 'Neut'], Definite: ['Def', 'Ind'],
  Person: ['1', '2', '3'], Tense: ['Pres', 'Imp', 'Past'], Mood: ['Ind', 'Sub', 'Imp', 'Opt', 'Adm'], Voice: ['Act', 'Mid'],
};

export function sqMorphFromTags(tags: readonly string[]): Record<string, string> {
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
  if (!out.VerbForm && (out.Person || out.Tense || out.Mood)) out.VerbForm = 'Fin';
  return out;
}
