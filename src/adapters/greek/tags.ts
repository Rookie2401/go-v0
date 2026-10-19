/**
 * Wiktionary (kaikki.org) Greek labels → this adapter's features, for Ancient and Modern Greek alike. Used for a dictionary form-of
 * relation (`morphFromTags`), for table rows (`featuresFromTableTags`) and for the kaikki form indexes (codes 'kaikki-tags': the
 * row's tags joined with "|", the table header carried as "table:<header>" — "table:Epic aorist", "table:Attic declension-2").
 * Unknown labels are ignored, never guessed. Values are the tokens morphgnt.ts writes, so one paradigm can hold both sources.
 */
import type { PartOfSpeech } from '../../core';

const LABELS: Readonly<Record<string, readonly [string, string]>> = {
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  singular: ['Number', 'Sing'], dual: ['Number', 'Dual'], plural: ['Number', 'Plur'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'], neuter: ['Gender', 'Neut'],
  nominative: ['Case', 'Nom'], genitive: ['Case', 'Gen'], dative: ['Case', 'Dat'], accusative: ['Case', 'Acc'], vocative: ['Case', 'Voc'],
  active: ['Voice', 'Act'], middle: ['Voice', 'Mid'], passive: ['Voice', 'Pass'], mediopassive: ['Voice', 'Mid,Pass'], 'middle-passive': ['Voice', 'Mid,Pass'],
  indicative: ['Mood', 'Ind'], subjunctive: ['Mood', 'Sub'], optative: ['Mood', 'Opt'], imperative: ['Mood', 'Imp'],
  infinitive: ['VerbForm', 'Inf'], participle: ['VerbForm', 'Part'],
  present: ['Tense', 'Pres'], imperfect: ['Tense', 'Impf'], future: ['Tense', 'Fut'], aorist: ['Tense', 'Aor'], perfect: ['Tense', 'Perf'], pluperfect: ['Tense', 'Plup'],
  'future-perfect': ['Tense', 'FutPerf'], 'future perfect': ['Tense', 'FutPerf'],
  imperfective: ['Aspect', 'Imp'], perfective: ['Aspect', 'Perf'],
  comparative: ['Degree', 'Cmp'], superlative: ['Degree', 'Sup'],
  adverbial: ['Adverbial', 'Yes'],
};
const ORDER: Readonly<Record<string, readonly string[]>> = { Gender: ['Fem', 'Masc', 'Neut'], Number: ['Dual', 'Plur', 'Sing'], Person: ['1', '2', '3'], Voice: ['Act', 'Mid', 'Pass'] };
/** Labels that are not morphology. Dialect labels are read by varieties.ts, not here. */
export const NON_MORPH_TAGS: ReadonlySet<string> = new Set([
  'canonical', 'romanization', 'table-tags', 'inflection-template', 'class', 'error-unrecognized-form', 'form-of', 'alt-of', 'alternative', 'apocopic',
  'poetic', 'rare', 'contracted', 'before-vowel', 'uppercase', 'lowercase', 'stressed', 'unstressed', 'enclitic', 'emphatic', 'prefix', 'diminutive',
  'Epic', 'Attic', 'Ionic', 'Doric', 'Aeolic', 'Koine', 'Byzantine', 'Laconian', 'Boeotian', 'Old-Attic', 'Cretan', 'Arcadocypriot', 'Cypriot', 'Thessalian',
  'Lesbian', 'Elean', 'Locrian', 'Corinthian', 'Katharevousa', 'colloquial', 'dated', 'archaic', 'learned', 'formal', 'informal',
]);

/** The table header's own words also name tense and voice ("Epic aorist", "contracted present", "future perfect"). */
function headerFeatures(header: string, out: Record<string, string[]>): void {
  const h = header.toLowerCase();
  const put = (k: string, v: string) => { if (!(out[k] ??= []).includes(v)) out[k].push(v); };
  if (/future perfect/.test(h)) put('Tense', 'FutPerf');
  else for (const t of ['present', 'imperfect', 'future', 'aorist', 'perfect', 'pluperfect']) if (h.includes(t)) put('Tense', LABELS[t][1]);
  if (/declension/.test(h)) { const m = /declension-(\d)/.exec(h); if (m) put('Declension', m[1]); }
}

export function elMorphFromTags(tags: readonly string[]): Record<string, string> {
  const sets: Record<string, string[]> = {};
  for (const raw of tags) {
    const t = raw.normalize('NFC').trim();
    if (t.startsWith('table:')) { headerFeatures(t.slice(6), sets); continue; }
    const hit = LABELS[t.toLowerCase().replace(/\s+/g, '-')] ?? LABELS[t.toLowerCase()];
    if (!hit) continue;
    const [k, v] = hit;
    for (const piece of v.split(',')) if (!(sets[k] ??= []).includes(piece)) sets[k].push(piece);
  }
  const out: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) {
    const order = ORDER[k];
    out[k] = (order ? [...vs].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vs).join(',');
  }
  if (out.Mood && !out.VerbForm) out.VerbForm = 'Fin';
  return out;
}

export function elFeaturesFromTableTags(tags: readonly string[], _pos: PartOfSpeech): Record<string, string> | undefined {
  const f = elMorphFromTags(tags.filter((t) => !NON_MORPH_TAGS.has(t)));
  delete f.Declension;
  return Object.keys(f).length ? f : undefined;
}
