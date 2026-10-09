import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import type { SourceReference } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { buildSelectionEvent } from '../../packages/golearn-extension/src/store';
import {
  candidateWords, chooseWord, encounterFromShare, normaliseSharedPassage, pastedPassage, sharedSourceRef,
  type NormalisedShare, type SharedPassage,
} from '../../packages/golearn-share/src';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const NOW = new Date('2026-10-09T09:30:00.000Z');
const IDENTITY = { learnerId: 'learner-1', enrolmentId: 'enr-1', deviceId: 'dev-1' };
const SESSION = 'share-test-session';
const SQ_SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const SQ_FRAGMENT = `${SQ_SENTENCE} Ai është këtu. Ne flasim shqip.`;

const norm = (text: string, languageHint?: string): NormalisedShare => {
  const r = normaliseSharedPassage({ text, ...(languageHint ? { languageHint } : {}) });
  if (!r.ok) throw new Error(r.message);
  return r;
};

/** The whole chain a share takes: normalise, pick the word if needed, parse with the real parser. */
function lookup(passage: SharedPassage, languageId = 'sq', pick?: string): CardModel {
  const n = norm(passage.text, passage.languageHint);
  if (!n.needsWordChoice) return parseSelection({ surface: n.surface, languageId, context: n.context });
  const word = candidateWords(n, passage.languageHint).find((w) => w.surface === pick);
  if (!word) throw new Error(`no candidate ${pick}`);
  const chosen = chooseWord(n, word)!;
  return parseSelection({ surface: chosen.surface, languageId, context: chosen.context });
}

const passageOf = (text: string, extra: Partial<SharedPassage> = {}): SharedPassage =>
  ({ text, receivedAt: NOW.toISOString(), mechanism: 'web-share-target', ...extra });

/** What a browser lookup would have recorded for the same card and source, reader id and direction. */
function browserEvent(card: CardModel, readerId: string, p: SharedPassage) {
  const source = sharedSourceRef(p) as SourceReference | undefined;
  return buildSelectionEvent({ card, ...(source ? { source } : {}), readerId, identity: IDENTITY, version: '0.1.0', sessionId: SESSION, now: NOW, direction: card.context.direction });
}
function shareEvent(card: CardModel, p: SharedPassage, id: string, extra: object = {}) {
  return encounterFromShare({ card, passage: p, identity: IDENTITY, version: '0.1.0', sessionId: SESSION, now: NOW, id, producerApp: 'golearn-ext', ...extra });
}
/** The share event minus the one field the browser event does not have: the surface inside the application. */
const withoutSurface = <T extends { producer: object }>(e: T): T => ({ ...e, producer: { ...e.producer, surface: undefined } });

describe('the event a share records is the browser lookup’s event', () => {
  it('for a chosen word in a sentence: identical to buildSelectionEvent except the reader id (share-web) and the surface', () => {
    const p = passageOf(SQ_SENTENCE, { url: 'https://reader.example/books/ch3?page=4#x', title: 'Një libër', mechanism: 'web-share-target' });
    const card = lookup(p, 'sq', 'shtëpinë');
    expect(card.context.kind).toBe('sentence');
    const browser = browserEvent(card, 'share-web', p);
    const share = shareEvent(card, p, browser.id);
    expect(withoutSurface(share)).toEqual(browser);
    expect(share.producer.surface).toBe('share');
    expect((share.payload as { readerId: string }).readerId).toBe('share-web');
    expect(share.subject.sourceRef).toEqual({ kind: 'web', title: 'Një libër', locator: '/books/ch3' });
    expect(share.subject.sentenceKey).toBe(card.context.sentenceKey);
  });

  it('for a chosen word in a fragment: carries the fragment hash, no sentence key', () => {
    const p = passageOf(SQ_FRAGMENT, { mechanism: 'android-send', sourceApp: 'com.example.reader' });
    const card = lookup(p, 'sq', 'libër');
    expect(card.context.kind).toBe('fragment');
    const browser = browserEvent(card, 'share-android', p);
    const share = shareEvent(card, p, browser.id);
    expect(withoutSurface(share)).toEqual(browser);
    expect(share.subject.sentenceKey).toBeUndefined();
    expect((share.payload as { fragmentKey?: string }).fragmentKey).toBe(card.context.fragmentKey);
    expect(share.subject.sourceRef).toEqual({ kind: 'ebook', title: undefined, locator: 'app:com.example.reader' });
  });

  it('for a selected word with no context (a text-selection share): kind none and the same shape', () => {
    const p = passageOf('shtëpinë', { mechanism: 'android-process-text' });
    const card = lookup(p);
    expect(card.context.kind).toBe('none');
    const browser = browserEvent(card, 'share-android', p);
    const share = shareEvent(card, p, browser.id);
    expect(withoutSurface(share)).toEqual(browser);
    expect(share.subject.sourceRef).toBeUndefined();
    expect((share.payload as { contextKind: string; contextConfidence: number }).contextKind).toBe('none');
  });

  it('for a pasted word: the reader id is clipboard', () => {
    const p = pastedPassage('shtëpinë', { now: NOW });
    const card = lookup(p);
    const browser = browserEvent(card, 'clipboard', p);
    expect(withoutSurface(shareEvent(card, p, browser.id))).toEqual(browser);
  });

  it('for Spanish, the other language the parser reads', () => {
    const p = passageOf('Yo leo un libro muy bonito en mi casa.', { languageHint: 'es', mechanism: 'ios-share-extension' });
    const card = lookup(p, 'es', 'casa');
    const browser = browserEvent(card, 'share-ios', p);
    expect(withoutSurface(shareEvent(card, p, browser.id))).toEqual(browser);
  });

  it('passes the Repository’s own validation', () => {
    for (const [p, pick] of [[passageOf(SQ_SENTENCE), 'libër'], [passageOf(SQ_FRAGMENT), 'flasim'], [passageOf('shtëpinë'), undefined]] as const) {
      const ev = encounterFromShare({ card: lookup(p, 'sq', pick), passage: p, identity: IDENTITY, version: '0.1.0', sessionId: SESSION, now: NOW });
      expect(validateEvent(ev), JSON.stringify(ev)).toEqual([]);
      expect(ev.kind).toBe('SelectionLookedUp');
      expect(ev.producer.app).toBe('golearn-app');
    }
  });
});

describe('no text in the event', () => {
  it('the passage, its sentence and its title never appear; only the looked-up word, hashes and counts do', () => {
    const p = passageOf(SQ_FRAGMENT, { title: SQ_FRAGMENT, url: 'https://reader.example/read/ch1?quote=Ai+eshte+ketu#:~:text=flasim', sourceApp: 'Reader' });
    const card = lookup(p, 'sq', 'bukur');
    const ev = encounterFromShare({ card, passage: p, identity: IDENTITY, version: '0.1.0', sessionId: SESSION, now: NOW });
    const json = JSON.stringify(ev);
    for (const piece of ['Ai është këtu', 'Ne flasim', 'po lexoj', 'quote=', 'text=flasim', 'page']) expect(json).not.toContain(piece);
    expect(ev.subject.sourceRef).toEqual({ kind: 'web', title: undefined, locator: '/read/ch1' });
    expect((ev.payload as { surface?: string }).surface).toBe('bukur');
    expect(Object.keys(ev.payload).filter((k) => /^(text|sentence|sentencetext|passage|content|body)$/i.test(k))).toEqual([]);
    expect(validateEvent(ev)).toEqual([]);
  });

  it('a long phrase is not stored even as a surface', () => {
    const p = passageOf('Unë po lexoj një libër të bukur në shtëpinë time.');
    const card = parseSelection({ surface: 'po lexoj një libër të bukur', languageId: 'sq', context: { kind: 'none', confidence: 0, direction: 'ltr' } });
    const ev = encounterFromShare({ card, passage: p, identity: IDENTITY, version: '0.1.0', sessionId: SESSION, now: NOW });
    expect((ev.payload as Record<string, unknown>).surface).toBeUndefined();
    expect((ev.payload as Record<string, unknown>).surfaceOmitted).toBe(true);
  });
});
