/**
 * `refine` keeps its contract after a dictionary replaced the readings of a neighbour: it may only order and re-weight the readings
 * of a token, never add, drop, merge or change one (the importer's plan throws otherwise, and the text silently lost its
 * dictionary). Measured on the installed Wiktionary dictionary: 870 of 1,911 German texts threw, mostly on a form of haben
 * (Sie hatte nicht ausgeschlafen) or a -te preterite (suchte). The tests cannot rely on the git-ignored public/dict, so a
 * small in-test dictionary stands in, with the entries that triggered it.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry } from '../../src/core';
import { planDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc } from '../ingest/helpers';

const registry = createAdapterRegistry();
const de = registry.get('de');

const docOf = (...sentences: string[]): CorpusDocument => ({ ...baseDoc(), lang: 'de', corpus: { id: 'ci-de', kind: 'comprehensible-input', title: 'CI' }, sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }] });
const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'de', glosses: [], ...over });
const dict = (...entries: DictionaryEntry[]): Map<string, DictionaryEntry[]> => {
  const m = new Map<string, DictionaryEntry[]>();
  for (const e of entries) m.set(e.form, [...(m.get(e.form) ?? []), e]);
  return m;
};

const PRETERITE = ['first-person', 'form-of', 'preterite', 'singular', 'third-person'];
const SUBJ_II = ['first-person', 'form-of', 'singular', 'subjunctive-ii', 'third-person'];

/** What the engine alone says of the word at `index` (word tokens only), and what the plan with the dictionary says. */
function readings(text: string, word: string, d: Map<string, DictionaryEntry[]>) {
  const withoutDict = planDocument(docOf(text), registry).sentences[0].analyzed.find((a) => a.token.surface === word)!;
  const withDict = planDocument(docOf(text), registry, { dictionary: d, dictionaryId: 'd1' }).sentences[0].analyzed.find((a) => a.token.surface === word)!;
  return { withoutDict, withDict };
}
const pairs = (cs: readonly { lemma?: string; pos?: string }[]) => cs.map((c) => `${c.lemma}/${c.pos}`).sort();

describe('refine after a dictionary replaced a neighbour: the readings of a token stay the same set', () => {
  it('hatte stays the perfect auxiliary when the participle after it is now a dictionary entry that names no form (Sie hatte nicht ausgeschlafen)', () => {
    const d = dict(
      entry('hatte', { pos: 'VERB', formOf: [{ lemma: 'haben', tags: PRETERITE }] }),
      entry('ausgeschlafen', { pos: 'VERB', glosses: ['well rested, caught-up on sleep'], senses: [{ gloss: 'well rested, caught-up on sleep', tags: ['participle'] }] }),
    );
    const { withoutDict, withDict } = readings('Sie hatte nicht ausgeschlafen.', 'hatte', d);
    expect(pairs(withoutDict.candidates)).toEqual(['haben/AUX']);
    expect(pairs(withDict.candidates)).toEqual(pairs(withoutDict.candidates));
    expect(withDict.candidates[0].role).toMatch(/perfect auxiliary/);
  });

  it('suchte keeps its indicative and Konjunktiv II readings when another word has a dictionary reading that looks like a Konjunktiv II (garten as a form of garen)', () => {
    const d = dict(
      entry('suchte', { pos: 'VERB', formOf: [{ lemma: 'suchen', tags: PRETERITE }, { lemma: 'suchen', tags: SUBJ_II }] }),
      entry('garten', { pos: 'NOUN', written: 'Garten', glosses: ['garden'], senses: [{ gloss: 'garden', tags: ['masculine', 'strong'] }] }),
      entry('garten', { pos: 'VERB', written: 'Garten', formOf: [{ lemma: 'garen', tags: SUBJ_II }] }),
      entry('zimmer', { pos: 'NOUN', written: 'Zimmer', glosses: ['room'], senses: [{ gloss: 'room', tags: ['neuter', 'strong'] }] }),
    );
    const text = 'Anna suchte im Zimmer, in der Küche und sogar im Garten, aber sie fand es nicht.';
    const { withoutDict, withDict } = readings(text, 'suchte', d);
    expect(withoutDict.candidates.map((c) => c.morph.Mood)).toEqual(['Ind', 'Sub']);
    expect(withDict.candidates.map((c) => c.morph.Mood)).toEqual(['Ind', 'Sub']);
  });

  it('plans the sentences that threw (a dictionary of the entries involved), and the adapter exposes refine', () => {
    expect(typeof de.refine).toBe('function');
    const d = dict(
      entry('hatte', { pos: 'VERB', formOf: [{ lemma: 'haben', tags: PRETERITE }] }),
      entry('vorgeschoben', { pos: 'ADJ', glosses: ['advanced, pushed forward'] }),
      entry('vorgeschoben', { pos: 'VERB', formOf: [{ lemma: 'vorschieben', tags: ['form-of', 'participle', 'past'] }] }),
      entry('kopf', { pos: 'NOUN', written: 'Kopf', glosses: ['head'] }),
      entry('machte', { pos: 'VERB', formOf: [{ lemma: 'machen', tags: PRETERITE }, { lemma: 'machen', tags: SUBJ_II }] }),
      entry('ausgeschlafen', { pos: 'VERB', glosses: ['well rested'] }),
    );
    const texts = ['Gregor hatte den Kopf vorgeschoben.', 'Sie hatte nicht ausgeschlafen.', 'Er machte es, weil sie hatte ausgeschlafen.'];
    for (const t of texts) expect(() => planDocument(docOf(t), registry, { dictionary: d, dictionaryId: 'd1' })).not.toThrow();
  });
});
