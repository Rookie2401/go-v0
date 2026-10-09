// @vitest-environment node
/**
 * Spanish through the reader's parser and the analyser's own sentence splitter. Every assertion is what adapter-es@12 really
 * does; where it does not do what a learner would need, the test is an `it.fails` named "LIMIT: ..." with a comment saying
 * what is missing, so the limit is counted and cannot be forgotten.
 */
import { describe, expect, it } from 'vitest';
import { esAdapter } from '../../src/adapters/es';
import { cardOf, mark, wordsOf } from './helpers';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);

describe('Spanish: conjugated verbs go back to their lemma', () => {
  it.each([
    ['Los niños «leen» los libros.', 'leer', 'third person plural, present indicative'],
    ['Ayer «hablé» con mi madre.', 'hablar', 'first person singular, preterite indicative'],
    ['La niña está contenta porque «llueve».', 'llover', 'third person singular, present indicative'],
    ['Quiero que ella «coma» pan.', 'comer', 'third person singular, present subjunctive'],
    ['Yo «estaba» cansado.', 'estar', 'first person singular, imperfect indicative'],
  ])('%s -> %s', (marked, lemma, morphology) => {
    const c = cardOf(marked, 'es');
    expect(c).toMatchObject({ languageId: 'es', lemma, pos: expect.stringMatching(/VERB|AUX/), morphology });
    expect(c.itemIds[0]).toMatch(new RegExp(`^lemma:es:${lemma}:`));
  });

  it('a form only the rules generate is marked as a rule reading, not as a word-list hit; the listed forms are', () => {
    expect(cardOf('Los niños «leen» los libros.', 'es').provenance).toBe('rule');
    expect(cardOf('El libro «está» en la mesa.', 'es').provenance).toBe('lexicon');
  });

  it('voseo (the Honduran target) is read as second person singular, with its construction named', () => {
    const c = cardOf('Vos «tenés» una casa.', 'es');
    expect(c).toMatchObject({ lemma: 'tener', morphology: 'second person singular, present indicative' });
    expect(ids(c)).toContain('voseo');
  });

  it('perfect tense and the gerund progressive tie the auxiliary and the participle together', () => {
    expect(ids(cardOf('«Hemos» dicho la verdad.', 'es'))).toContain('perfect-tense');
    expect(ids(cardOf('Yo estaba «comiendo» cuando llegaste.', 'es'))).toContain('estar-gerund');
  });
});

describe('Spanish: accents are meaningful, and Unicode is normalised (NFC)', () => {
  it('está (estar) and esta (this) are different words with different readings', () => {
    expect(cardOf('El libro «está» en la mesa.', 'es')).toMatchObject({ lemma: 'estar', pos: 'AUX' });
    expect(cardOf('«Esta» mesa es grande.', 'es')).toMatchObject({ lemma: 'este', pos: 'DET', gloss: 'this' });
  });

  it('a decomposed accent (a + combining acute) is composed before the lookup and gives the same card as the composed form', () => {
    const composed = cardOf('El libro «está» en la mesa.', 'es');
    const decomposed = parseSelection({ surface: 'está', languageId: 'es', context: { kind: 'none', confidence: 0 } });
    expect(decomposed.surface).toBe('está');
    expect(decomposed.lemma).toBe(composed.lemma);
    expect(decomposed.formId).toBe('form:es:está');
  });

  it('ñ and the inverted marks: niños is one word and ¿Cómo estás? gives Cómo and estás', () => {
    expect(wordsOf(esAdapter, 'Los niños leen.')).toEqual(['Los', 'niños', 'leen']);
    expect(wordsOf(esAdapter, '¿Cómo estás?')).toEqual(['Cómo', 'estás']);
    expect(cardOf('¿«Cómo» estás?', 'es')).toMatchObject({ lemma: 'cómo', pos: 'ADV', gloss: 'how' });
  });
});

describe('Spanish: clitics attach to the verb', () => {
  it('Dámelo = dar + me + lo, a command; both pronouns are named and both constructions found', () => {
    const c = cardOf('«Dámelo», por favor.', 'es');
    expect(c).toMatchObject({ lemma: 'dar', morphology: 'second person singular, imperative' });
    expect(c.syntaxNotes).toEqual(['dá: from dar, VERB', 'me: indirect object pronoun', 'lo: direct object pronoun']);
    expect(ids(c)).toEqual(expect.arrayContaining(['enclitic-pronoun', 'double-object-pronouns']));
  });

  it('an infinitive with an attached pronoun: dártelo is dar (infinitive), irme is ir', () => {
    expect(cardOf('Quiero «dártelo» mañana.', 'es')).toMatchObject({ lemma: 'dar', morphology: 'infinitive' });
    const irme = cardOf('Tengo que «irme» ahora.', 'es');
    expect(irme).toMatchObject({ lemma: 'ir', morphology: 'infinitive' });
    expect(irme.syntaxNotes).toContain('me: object pronoun');
  });
});

describe('Spanish: idioms are phrase units where the pack lists them', () => {
  it('a word inside a listed idiom shows the idiom: hambre in tiene hambre -> tener hambre', () => {
    const c = cardOf('Ella tiene «hambre».', 'es');
    expect(c.lemma).toBe('hambre');
    expect(c.phrases).toEqual([expect.objectContaining({ display: 'tener hambre', kind: 'idiom' })]);
  });

  it('selecting the whole idiom takes the phrase entry as the card: hace falta -> hacer falta', () => {
    const c = cardOf('«Hace falta» mucho trabajo.', 'es');
    expect(c).toMatchObject({ lemma: 'hacer falta', provenance: 'lexicon', tokenCount: 2 });
    expect(c.notes.join(' ')).toMatch(/Matches the phrase entry "hacer falta" \(idiom\)/);
    expect(c.basis).toContain('phrase list');
    expect(c.itemIds.some((i) => i.startsWith('phrase:es:'))).toBe(true);
  });

  it('a construction is a phrase unit too: ir a + infinitive, tener que + infinitive', () => {
    expect(cardOf('Vamos a «tirar» la casa por la ventana.', 'es').phrases.map((p) => p.display)).toContain('ir a …');
    expect(cardOf('Tengo que «irme» ahora.', 'es').phrases.map((p) => p.display)).toContain('tener que …');
  });

  // LIMIT: a listed idiom with a word between its parts (tiene mucha hambre) is found for a single word inside it, but
  // selecting the whole stretch does not take the idiom: the entry's token positions skip "mucha", so the card shows each
  // word on its own with the weakest word's confidence.
  it.fails('LIMIT: selecting "tiene mucha hambre" takes the idiom tener hambre', () => {
    const c = cardOf('Ella «tiene mucha hambre».', 'es');
    expect(c.lemma).toBe('tener hambre');
  });

  // LIMIT: "echarse a llorar" is not in the phrase list, so selecting it gives three separate words.
  it.fails('LIMIT: selecting "se echó a llorar" is read as one phrase', () => {
    expect(cardOf('Ella «se echó a llorar».', 'es').phrases).not.toHaveLength(0);
  });
});

describe('Spanish: sentence segmentation (adapter.segmentSentences)', () => {
  it('inverted marks and abbreviations: ¿Cómo estás? Bien. and Sr. Pérez stay whole', () => {
    expect(esAdapter.segmentSentences('¿Cómo estás? Estoy bien. Gracias.').map((s) => s.text.trim())).toEqual(['¿Cómo estás?', 'Estoy bien.', 'Gracias.']);
    expect(esAdapter.segmentSentences('El Sr. Pérez vive aquí. Ella no.').map((s) => s.text.trim())).toEqual(['El Sr. Pérez vive aquí.', 'Ella no.']);
  });

  it('every span is an exact slice of the text', () => {
    const text = '¡Hola!  ¿Qué tal?\nBien.';
    for (const s of esAdapter.segmentSentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe('Spanish: ambiguity is kept, and what is not decided is a LIMIT (counted)', () => {
  it('como is read as comer (I eat) at 0.7 with the conjunction kept as an alternative', () => {
    const c = cardOf('Yo «como» pan.', 'es');
    expect(c).toMatchObject({ lemma: 'comer', confidence: 0.7 });
    expect(c.alternatives.map((a) => a.lemma)).toContain('como');
  });

  // LIMIT: in "Yo como pan" the subject pronoun yo and the object pan make the conjunction reading impossible, but the
  // analyser keeps the conjunction as an alternative (0.4): subject/verb compatibility is not used to prune readings.
  it.fails('LIMIT: como after yo has no conjunction alternative', () => {
    expect(cardOf('Yo «como» pan.', 'es').alternatives).toHaveLength(0);
  });

  it('the markers are consistent', () => {
    const m = mark('Yo «como» pan.');
    expect(m.sentence.slice(m.start, m.end)).toBe('como');
  });
});
