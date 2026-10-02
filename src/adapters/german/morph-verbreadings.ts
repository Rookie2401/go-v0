/**
 * Readings of a lexicon verb: one per distinct feature set of each written form, persons united where one form fills
 * several (machten: first or third person plural). A separable verb gets its attached forms (aufsteht) and, as a
 * separate set, the base verb's finite forms (steht) marked "prefix detached" for the sentence layer to keep or drop.
 */
import type { WordPart } from '../../core';
import type { DeReading, DeVerb } from './types';
import { morphOfCells } from './types';
import { formsOnStem } from './morph-adjective';
import { describeGermanMorph } from './morph-describe';
import { NO_PARTICIPLE_ADJECTIVE } from './morph-irregular';
import { conjugateFull, type Conjugation, type VerbForms } from './morph-verb';
import type { Entry } from './morph-readings';

interface Slot { morph: Record<string, string>; person?: string; number?: string }

const MOOD: Record<string, [string, string]> = { pres: ['Ind', 'Pres'], pret: ['Ind', 'Past'], subj1: ['Sub', 'Pres'], subj2: ['Sub', 'Past'] };

function slotOf(key: string): Slot | undefined {
  if (key === 'inf' || key === 'inf.zu') return { morph: { VerbForm: 'Inf' } };
  if (key === 'part.past') return { morph: { VerbForm: 'Part', Tense: 'Past' } };
  if (key === 'part.pres') return { morph: { VerbForm: 'Part', Tense: 'Pres' } };
  const [kind, who] = key.split('.');
  const number = who?.[1] === 's' ? 'Sing' : 'Plur';
  if (kind === 'imp') return { morph: { VerbForm: 'Fin', Mood: 'Imp' }, person: '2', number };
  const mood = MOOD[kind];
  return mood && who ? { morph: { VerbForm: 'Fin', Mood: mood[0], Tense: mood[1] }, person: who[0], number } : undefined;
}

const CONFIDENCE = { irregular: 0.92, strong: 0.9, mixed: 0.9, weak: 0.88 } as const;

function label(verb: DeVerb, conj: Conjugation): string {
  if (conj.tier === 'irregular') return `irregular verb ${verb.lemma}`;
  if (conj.tier === 'weak') return `weak verb ${verb.lemma}, regular endings`;
  const parts = [verb.pres3, verb.pret, verb.part].filter(Boolean).join(', ');
  return `${conj.tier} verb ${verb.lemma} (${parts})`;
}

/** The pieces of a verb form with its separable prefix written on. */
function partsFor(surface: string, prefix: string, key: string): WordPart[] | undefined {
  if (!surface.startsWith(prefix)) return undefined;
  const p = prefix.length;
  const parts: WordPart[] = [{ text: prefix, start: 0, end: p, kind: 'prefix', role: 'separable prefix' }];
  let at = p;
  if (key === 'inf.zu' && surface.startsWith('zu', p)) {
    parts.push({ text: 'zu', start: p, end: p + 2, kind: 'marker', role: 'infinitive marker zu' });
    at = p + 2;
  } else if (key === 'part.past' && surface.startsWith('ge', p)) {
    parts.push({ text: 'ge', start: p, end: p + 2, kind: 'marker', role: 'participle prefix ge-' });
    at = p + 2;
  }
  parts.push({ text: surface.slice(at), start: at, end: surface.length, kind: 'stem' });
  return parts;
}

function baseReading(verb: DeVerb, conj: Conjugation, older: boolean): Omit<DeReading, 'morph' | 'rule'> {
  const r: Omit<DeReading, 'morph' | 'rule'> = { lemma: verb.lemma, pos: 'VERB', confidence: CONFIDENCE[conj.tier], lemmaKnown: true, gloss: verb.gloss };
  if (older) r.register = ['literary'];
  else if (verb.register) r.register = [...verb.register];
  if (verb.varieties) r.varieties = [...verb.varieties];
  return r;
}

interface Group { slot: Slot; key: string; persons: Set<string>; older: boolean }

/** Group the written forms of one set of keys into readings. `state`: how the separable prefix stands in these forms. */
function readingsOf(verb: DeVerb, conj: Conjugation, forms: VerbForms, state: 'none' | 'attached' | 'detached'): Entry[] {
  const bySurface = new Map<string, Map<string, Group>>();
  for (const [key, list] of Object.entries(forms)) {
    const slot = slotOf(key);
    if (!slot) continue;
    if (state === 'attached' && key.startsWith('imp.')) continue; // an imperative never stands as one written word with its prefix
    for (const f of list) {
      if (f.form.includes(' ')) continue;
      const groups = bySurface.get(f.form) ?? new Map<string, Group>();
      const gk = `${key === 'inf.zu' ? 'zu' : key.startsWith('part') || key === 'inf' ? key : ''}|${JSON.stringify(slot.morph)}|${slot.number ?? ''}|${f.older ? 'o' : ''}`;
      const g = groups.get(gk) ?? { slot, key, persons: new Set<string>(), older: !!f.older };
      if (slot.person) g.persons.add(slot.person);
      groups.set(gk, g);
      bySurface.set(f.form, groups);
    }
  }
  const out: Entry[] = [];
  const kind = label(verb, conj);
  for (const [surface, groups] of bySurface) {
    for (const g of groups.values()) {
      const morph: Record<string, string> = { ...g.slot.morph };
      if (g.persons.size) morph.Person = [...g.persons].sort().join(',');
      if (g.slot.number) morph.Number = g.slot.number;
      let rule = `${kind}: ${g.key === 'inf.zu' ? 'infinitive with zu' : describeGermanMorph(morph)}`;
      if (g.older) rule += ' (older form)';
      const reading: DeReading = { ...baseReading(verb, conj, g.older), morph, rule };
      if (state === 'attached' && conj.prefix) {
        reading.prefix = { text: conj.prefix, attached: true };
        reading.rule += `; separable prefix ${conj.prefix}- written on`;
        const parts = partsFor(surface, conj.prefix, g.key);
        if (parts) reading.parts = parts;
      } else if (state === 'detached' && conj.prefix) {
        reading.prefix = { text: conj.prefix, attached: false };
        reading.confidence = 0.8;
        reading.rule += `; ${verb.lemma} with its prefix ${conj.prefix}- standing apart at the end of the clause`;
      }
      out.push([surface, reading]);
    }
  }
  return out;
}

/** Readings of every form of the verb itself (attached forms for a separable verb). */
export function verbEntries(verb: DeVerb, conj: Conjugation = conjugateFull(verb)): Entry[] {
  return readingsOf(verb, conj, conj.forms, conj.prefix ? 'attached' : 'none');
}

/** A separable verb's base finite forms as readings of the verb with its prefix detached; empty for any other verb. */
export function detachedEntries(verb: DeVerb, conj: Conjugation = conjugateFull(verb)): Entry[] {
  return conj.prefix ? readingsOf(verb, conj, conj.detached, 'detached') : [];
}

/** The participles inflected like adjectives (der schlafende Hund, das gelesene Buch), as VERB readings with cells. */
export function participleAdjectiveEntries(verb: DeVerb, conj: Conjugation = conjugateFull(verb)): Entry[] {
  if (conj.tier === 'irregular' && NO_PARTICIPLE_ADJECTIVE.has(conj.head)) return [];
  const out: Entry[] = [];
  const kind = label(verb, conj);
  for (const key of ['part.past', 'part.pres'] as const) {
    const tense = key === 'part.past' ? 'Past' : 'Pres';
    for (const base of conj.forms[key] ?? []) {
      if (base.form.includes(' ')) continue;
      for (const f of formsOnStem(base.form)) {
        const morph = { VerbForm: 'Part', Tense: tense, ...morphOfCells(f.cells) };
        const reading: DeReading = {
          ...baseReading(verb, conj, !!base.older), morph, cells: f.cells, confidence: 0.85,
          rule: `${kind}: ${tense === 'Past' ? 'past' : 'present'} participle used like an adjective, ${describeGermanMorph(morphOfCells(f.cells))}`,
        };
        if (conj.prefix) {
          reading.prefix = { text: conj.prefix, attached: true };
          const parts = partsFor(f.form, conj.prefix, key);
          if (parts) reading.parts = parts;
        }
        out.push([f.form, reading]);
      }
    }
  }
  return out;
}
