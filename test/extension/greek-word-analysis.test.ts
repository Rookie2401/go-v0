// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { elAdapter } from '../../src/adapters/el';
import { greekWordAnalysis } from '../../src/adapters/greek/word-analysis';
import { parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { setBody, stubLayout } from './dom';

const present = { VerbForm: 'Fin', Tense: 'Pres', Voice: 'Act', Mood: 'Ind', Person: '1', Number: 'Sing' };
const future1 = { VerbForm: 'Fin', Tense: 'Fut', Voice: 'Act', Mood: 'Ind', Person: '1', Number: 'Sing' };
const future2 = { ...future1, Person: '2' };
const present3 = { ...present, Person: '3' };

describe('Koine Greek lexical and inflected meanings', () => {
  it('keeps the citation gloss distinct from the first-person present form', () => {
    const a = greekWordAnalysis({ surface: 'ἀγαπῶ', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: present, source: 'MorphGNT', confidence: 0.92 });
    expect(a.lexicalMeaning?.text).toBe('to love');
    expect(a.inflectedMeaning?.text).toBe('I love');
    expect(a.contextualMeaning).toBeNull();
  });

  it('distinguishes the first-person future', () => {
    expect(greekWordAnalysis({ surface: 'ἀγαπήσω', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: future1 }).inflectedMeaning?.text).toBe('I will love');
  });

  it('distinguishes the second-person future without a sentence claim', () => {
    const a = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: future2 });
    expect(a.inflectedMeaning?.text).toBe('You will love');
    expect(a.contextualMeaning).toBeNull();
  });

  it('does not apply the verse rendering to a different form or another reference', () => {
    const wrongPerson = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: future1, references: ['GAL.5.14'] });
    const wrongReference = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: future2, references: ['ROM.13.9'] });
    expect(wrongPerson.contextualMeaning).toBeNull();
    expect(wrongReference.contextualMeaning).toBeNull();
  });

  it('keeps a third-person present reading and marks a genuine alternative', () => {
    const a = greekWordAnalysis({ surface: 'ἀγαπᾷ', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: present3,
      alternatives: [{ morph: { ...present3, Mood: 'Sub' }, confidence: 0.7 }] });
    expect(a.inflectedMeaning?.text).toBe('He, she, or it loves');
    expect(a.ambiguity.some((x) => x.includes('Tense=Pres') && x.includes('Mood=Sub'))).toBe(true);
  });

  it('renders the verse-specific shall separately from its literal future', () => {
    const sentence = 'ὁ γὰρ πᾶς νόμος ἐν ἑνὶ λόγῳ πεπλήρωται, ἐν τῷ· ἀγαπήσεις τὸν πλησίον σου ὡς σεαυτόν.';
    registerAnalyser('el', elAdapter);
    const start = sentence.indexOf('ἀγαπήσεις');
    const model = parseSelection({ surface: 'ἀγαπήσεις', languageId: 'el', context: { kind: 'sentence', confidence: 1, sentence, selStart: start, selEnd: start + 'ἀγαπήσεις'.length, references: ['GAL.5.14'] } });
    expect(model.wordAnalysis?.inflectedMeaning?.text).toBe('You will love');
    expect(model.wordAnalysis?.contextualMeaning?.text).toBe('You shall love');

    restoreDom = stubLayout();
    setBody('<main></main>');
    const ui = createCardUI({ doc: document, speech: null });
    ui.show(model, { rect: { top: 100, left: 20, right: 120, bottom: 120, width: 100, height: 20 }, viewport: { width: 800, height: 600 }, rtl: false, source: 'range' });
    const main = ui.root()?.querySelector('.rows')?.textContent ?? '';
    expect(main).toContain('You shall love');
    expect(main).not.toContain('Literal inflected meaning');
    expect(main).not.toContain('I love');
    expect(main.match(/Galatians 5:14/g)).toHaveLength(1); // the one source line keeps its citation
    expect(main).not.toContain('Morphology remains ambiguous');
    (ui.root()!.querySelector('.deeperBtn') as HTMLButtonElement).click();
    const meanings = ui.root()!.querySelector('[data-layer="meaning"]')!.textContent ?? '';
    expect(meanings).toContain('literal meaning');
    expect(meanings).toContain('You will love');
    expect(meanings).toContain('context meaning');
    expect(meanings).toContain('Galatians 5:14');
    expect(meanings).toContain('lemma meaning');
    expect(meanings).toContain('to love');
    ui.destroy();
  });

  it('uses the compiled MorphGNT row for an NFC, sentence-free ἀγαπήσεις lookup and does not turn it into shall', () => {
    registerAnalyser('el', elAdapter);
    const model = parseSelection({ surface: 'Ἀγαπήσεις', languageId: 'el', context: { kind: 'none', confidence: 0 } });
    expect(model.wordAnalysis?.normalizedForm).toBe('Ἀγαπήσεις'.normalize('NFC'));
    expect(model.wordAnalysis?.inflectedMeaning?.text).toBe('You will love');
    expect(model.wordAnalysis?.contextualMeaning).toBeNull();
    expect(model.gloss).toBe('You will love');
  });
});

let restoreDom: (() => void) | undefined;
afterEach(() => { restoreDom?.(); restoreDom = undefined; registerAnalyser('el', elAdapter); });
