// @vitest-environment jsdom
/**
 * Stage 4 wiring (Linguistic Engine V2): when the analyser has syntax rules, the parser puts the selected word's relation
 * on the card (with basis, alternatives, dependents, clause) and the Syntax section of Go deeper shows it; when the rules attach
 * nothing, the card says so instead of guessing; without rules the old role line stays.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzedToken, LanguageAdapter, RawToken, SyntaxAnalysis } from '../../src/core';
import { deAdapter } from '../../src/adapters/de';
import { clearAnalysers, parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { setBody, stubLayout } from './dom';

const SENTENCE = 'Der Hund sieht die Katze.';
const fakeSyntax = (tokens: RawToken[], _analyses: AnalyzedToken[]): SyntaxAnalysis => {
  const words = tokens.map((t) => t.surface);
  const at = (s: string): number => words.indexOf(s);
  return {
    languageId: 'de', analyzer: 'adapter-de@test', tokens: words, attached: 1, notes: ['test rules'],
    clauses: [{ start: 0, end: words.length - 1, kind: 'main', label: 'main clause' }],
    relations: [
      { dependent: at('sieht'), relation: 'root', label: 'the main verb', basis: ['finite verb in second position'], confidence: 0.9, status: 'generated' },
      { dependent: at('Der'), head: at('Hund'), relation: 'det', label: 'article of Hund', basis: ['nominative masculine article'], confidence: 0.9, status: 'generated' },
      { dependent: at('Hund'), head: at('sieht'), relation: 'nsubj', label: "subject of 'sieht'", basis: ['nominative article der', 'agrees 3rd singular'], confidence: 0.8, status: 'generated' },
      { dependent: at('die'), head: at('Katze'), relation: 'det', label: 'article of Katze', basis: ['feminine article'], confidence: 0.9, status: 'generated' },
      { dependent: at('Katze'), head: at('sieht'), relation: 'obj', label: "object of 'sieht'", basis: ['after the verb', 'die is nominative or accusative'], confidence: 0.6, status: 'conflicted',
        alternatives: [{ head: at('sieht'), relation: 'nsubj', confidence: 0.4, why: 'die Katze could also be the subject: the feminine article does not show the case' }] },
    ],
  };
};
const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const sel = (surface: string, syntax?: LanguageAdapter['syntax']) => {
  clearAnalysers();
  // the real German adapter has its own rules since Stage 4; the tests control them explicitly (none, a fake, or throwing)
  const adapter: LanguageAdapter = { ...deAdapter, ...(syntax ? { syntax } : {}) };
  if (!syntax) delete (adapter as { syntax?: unknown }).syntax;
  registerAnalyser('de', adapter);
  const at = SENTENCE.indexOf(surface);
  return parseSelection({ surface, context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + surface.length }, languageId: 'de' });
};

let restore: () => void;
let ui: CardUI;
beforeAll(() => { restore = stubLayout(); setBody('<p>x</p>'); ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: (text, voice) => ({ text, voice }) }); });
afterAll(() => { ui.destroy(); restore(); clearAnalysers(); });

describe('the card model', () => {
  it('carries the relation, its basis, the head, the alternatives and the dependents of the selected word', () => {
    const c = sel('Katze', fakeSyntax);
    expect(c.syntax).toMatchObject({ status: 'conflicted', relation: 'obj', headSurface: 'sieht', attached: 1, analyzer: 'adapter-de@test', clause: 'main clause' });
    expect(c.syntax!.basis).toEqual(['after the verb', 'die is nominative or accusative']);
    expect(c.syntax!.alternatives).toEqual([{ relation: 'nsubj', headSurface: 'sieht', confidence: 0.4, why: 'die Katze could also be the subject: the feminine article does not show the case' }]);
    expect(c.syntax!.dependents).toEqual([{ surface: 'die', relation: 'det', label: 'article of Katze' }]);
    expect(c.role).toBe("object of 'sieht'"); // the role line falls back to the relation's label when the reading has none
    const v = sel('sieht', fakeSyntax);
    expect(v.syntax).toMatchObject({ status: 'generated', relation: 'root', headSurface: undefined });
    expect(v.syntax!.dependents.map((d) => d.surface)).toEqual(['Hund', 'Katze']);
  });
  it('says "none" for a word the rules did not attach, and is absent without rules or without a sentence', () => {
    const c = sel('Katze', (tokens) => ({ languageId: 'de', analyzer: 'x', tokens: tokens.map((t) => t.surface), relations: [], notes: ['nothing modelled'], attached: 0 }));
    expect(c.syntax).toMatchObject({ status: 'none', attached: 0 });
    expect(c.syntax!.notes.some((n) => /could not attach/.test(n))).toBe(true);
    expect(sel('Katze').syntax).toBeUndefined();
    clearAnalysers(); registerAnalyser('de', { ...deAdapter, syntax: fakeSyntax });
    expect(parseSelection({ surface: 'Katze', context: { kind: 'none', confidence: 0 }, languageId: 'de' }).syntax).toBeUndefined();
  });
  it('never throws when the rules throw', () => {
    const c = sel('Katze', () => { throw new Error('boom'); });
    expect(c.syntax).toBeUndefined();
    expect(c.lemma).toBe('Katze');
  });
});

describe('the Syntax section of Go deeper', () => {
  it('shows the relation with its head, the why, the alternatives and the dependents, and names the rules', () => {
    ui.show(sel('Katze', fakeSyntax), anchor);
    const t = ui.root()!.textContent ?? '';
    expect(t).toContain("object of 'sieht' → sieht (obj) · 0.60 · ‼ not decided");
    expect(t).toContain('die is nominative or accusative');
    expect(t).toContain('nsubj → sieht · 0.40: die Katze could also be the subject');
    expect(t).toContain('die: article of Katze (det)');
    expect(t).toContain('Clause: main clause.');
    expect(t).toContain('100% of this sentence');
    expect(t).toContain('Not reviewed by a person');
  });
  it('says the rules could not attach the word, and keeps the old role line without rules', () => {
    ui.show(sel('Katze', (tokens) => ({ languageId: 'de', analyzer: 'x', tokens: tokens.map((t) => t.surface), relations: [], notes: [], attached: 0 })), anchor);
    expect(ui.root()!.textContent).toContain('could not attach this word');
    ui.show(sel('Katze'), anchor);
    expect(ui.root()!.textContent).toContain('role: not available from this analyser');
  });
});
