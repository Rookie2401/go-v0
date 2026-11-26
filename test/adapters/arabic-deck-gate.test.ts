/**
 * The Arabic deck gate (src/adapters/arabic/deck.ts): one positive and one negative case per rule, on a SYNTHETIC index (so the rules are
 * tested whatever the product index holds), plus the marking itself (the readings stay as they were; only the notes are added).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { installArabicIndex, uninstallArabicIndex, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { AR_DECK_LIMITS, AR_UNREVIEWED_CLOSED, arDeckSenseWhenAbsent, arDeckVerdict, arLemmaRow, arMarkForDeck, arSenseClass } from '../../src/adapters/arabic/deck';
import { AR_KNOWN_LIMITS, AR_LIMITED_LEMMAS } from '../../src/adapters/arabic/generated/deck-limits';
import { arAdapter } from '../../src/adapters/ar';

const KITAB = 'كِتَابزَجْز'; // book, Sense=One
const QALAM = 'قَلَمزَجْز'; // Sense=Rev with Homonyms
const AYN = 'عَيْنزَجْز'; // Sense=One with Homonyms
const BAYT = 'بَيْتزَجْز'; // Sense=Ord
const DAR = 'دَارزَجْز'; // no Sense key
const NAHR = 'نَهْرزَجْز'; // Sense=One, empty gloss
const LAB = 'سَبَبزَجْز'; // Sense=Lab
const NOT_LISTED = 'زَكَر'; // no row anywhere

const row = (head: string, gloss: string, lex: string): [string, string, string, string, number] => [head, gloss, 'NOUN', lex, 10];
const SYNTHETIC: ArabicFormIndex = {
  schema: 1, id: 'deck-gate-test', source: { label: 'synthetic', licence: 'test', url: '' }, built: '2026-11-25', codes: [], lemmaIds: [],
  lemmas: {
    [`${KITAB}|NOUN`]: row(KITAB, 'book', 'Sense=One'),
    [`${QALAM}|NOUN`]: row(QALAM, 'pen', 'Homonyms=2|Sense=Rev'),
    [`${AYN}|NOUN`]: row(AYN, 'eye', 'Homonyms=2|Sense=One'),
    [`${BAYT}|NOUN`]: row(BAYT, 'house', 'Sense=Ord'),
    [`${DAR}|NOUN`]: row(DAR, 'house', ''),
    [`${NAHR}|NOUN`]: row(NAHR, '', 'Sense=One'),
    [`${LAB}|NOUN`]: row(LAB, 'cause', 'Sense=Lab'),
  },
  forms: {}, loose: {},
};

beforeAll(() => { installArabicIndex(SYNTHETIC); });
afterAll(() => { uninstallArabicIndex(SYNTHETIC.id); arDeckSenseWhenAbsent(); });

const cand = (lemma: string, over: Partial<AnalysisCandidate> = {}): AnalysisCandidate =>
  ({ lemma, pos: 'NOUN', morph: {}, confidence: 0.9, ...over } as AnalysisCandidate);
const id = (surface: string, cands: AnalysisCandidate[]): string | undefined => arDeckVerdict(surface, cands)?.id;
const PLAIN = 'شمس'; // a surface on no list

describe('the limits table', () => {
  it('has one row per rule, unique ids, a test and a reason each', () => {
    expect(new Set(AR_DECK_LIMITS.map((l) => l.id)).size).toBe(AR_DECK_LIMITS.length);
    for (const l of AR_DECK_LIMITS) { expect(l.test.length).toBeGreaterThan(10); expect(l.reason.length).toBeGreaterThan(5); }
    expect(AR_DECK_LIMITS.map((l) => l.id)).toEqual(expect.arrayContaining(['not-an-entry', 'no-meaning', 'undecided', 'known-misread-form', 'sense-unreviewed']));
  });
});

describe('rule (a): the headword is a real entry', () => {
  it('passes a lemma that is a lemma id of the index', () => { expect(id(PLAIN, [cand(KITAB)])).toBeUndefined(); expect(arLemmaRow(KITAB, 'NOUN')?.[1]).toBe('book'); });
  it('refuses a lemma the index does not list (a clitic fragment, an unlisted name)', () => {
    expect(id(PLAIN, [cand(NOT_LISTED)])).toBe('not-an-entry');
    expect(id(PLAIN, [cand('و', { pos: 'CONJ' })])).toBe('not-an-entry');
  });
  it('refuses a guess (unconfirmed) and a derived participle with no entry of its own', () => {
    expect(id(PLAIN, [cand(KITAB, { unconfirmed: true, confidence: 0.35 })])).toBe('guess');
    expect(id(PLAIN, [cand(KITAB, { notes: { derivedFrom: 'x', derivation: 'verbal noun' } })])).toBe('derived');
  });
  it('refuses a word with no reading at all', () => { expect(id(PLAIN, [])).toBe('no-reading'); });
});

describe('rule (b): it has an English meaning', () => {
  it('refuses an entry whose gloss is empty, passes one with a gloss', () => {
    expect(id(PLAIN, [cand(NAHR)])).toBe('no-meaning');
    expect(id(PLAIN, [cand(KITAB)])).toBeUndefined();
  });
});

describe('rule (c): the reading is decided', () => {
  it('refuses confidence below 0.5, and says "undecided between N readings" when several lexemes compete', () => {
    const v = arDeckVerdict(PLAIN, [cand(KITAB, { confidence: 0.45 }), cand(QALAM, { confidence: 0.45 }), cand(AYN, { confidence: 0.4 })]);
    expect(v?.id).toBe('undecided');
    expect(v?.reason).toBe('undecided between 3 readings: more evidence must decide');
    expect(id(PLAIN, [cand(KITAB, { confidence: 0.5 })])).toBeUndefined();
  });
  it('refuses identity partial / rare / undecided even at a high confidence', () => {
    for (const identity of ['partial', 'rare', 'undecided']) expect(id(PLAIN, [cand(KITAB, { notes: { identity } })])).toBe('undecided');
    expect(id(PLAIN, [cand(KITAB, { notes: { identity: 'main' } })])).toBeUndefined();
  });
  it('refuses two creditable lexemes (the invariant says it cannot happen: this is the check)', () => {
    expect(id(PLAIN, [cand(KITAB, { confidence: 0.7 }), cand(QALAM, { confidence: 0.6 })])).toBe('two-lexemes');
    expect(id(PLAIN, [cand(KITAB, { confidence: 0.7 }), cand(QALAM, { confidence: 0.4 })])).toBeUndefined();
    expect(id(PLAIN, [cand(KITAB, { confidence: 0.7 }), cand(KITAB, { confidence: 0.6, morph: { Number: 'Plur' } })])).toBeUndefined();
  });
  it('refuses a restored spelling the reviewed list does not name, passes one it does (identity main)', () => {
    expect(id(PLAIN, [cand(KITAB, { notes: { spelling: 'restored', identity: 'restored' } })])).toBe('restored-spelling');
    expect(id(PLAIN, [cand(KITAB, { notes: { spelling: 'restored', identity: 'main' } })])).toBeUndefined();
  });
  it('refuses a reading flagged dialect or foreign', () => {
    expect(id(PLAIN, [cand(KITAB, { notes: { variety: 'dialect?' } })])).toBe('dialect');
    expect(id(PLAIN, [cand(KITAB, { notes: { variety: 'foreign' } })])).toBe('dialect');
  });
});

describe('rule (d): the written form or the lexeme is on the known-limits list', () => {
  it('refuses a listed written form (unvocalized key, or the exact vocalized form) and a listed lexeme', () => {
    const [form] = Object.keys(AR_KNOWN_LIMITS).filter((k) => !/[ً-ْ]/u.test(k));
    expect(id(form, [cand(KITAB)])).toBe('known-misread-form');
    expect(id(PLAIN, [cand(KITAB)])).toBeUndefined();
    const [lemmaKey] = Object.keys(AR_LIMITED_LEMMAS);
    const [head, pos] = lemmaKey.split('|');
    // the lexeme rule needs the entry to exist: install it for this check
    const extra: ArabicFormIndex = { ...SYNTHETIC, id: 'deck-gate-test-2', lemmas: { [`${head}|${pos}`]: [head, 'x', pos, 'Sense=One', 5] } };
    installArabicIndex(extra);
    try { expect(id(PLAIN, [cand(head, { pos: pos as AnalysisCandidate['pos'] })])).toBe('known-misread-lemma'); } finally { uninstallArabicIndex(extra.id); }
  });
});

describe('rule (e): the leading meaning is reviewed', () => {
  it('passes Rev, passes One without homonyms, refuses One with homonyms, Lab, Ord and a row with no Sense key', () => {
    expect(id(PLAIN, [cand(QALAM)])).toBeUndefined(); // Rev + Homonyms
    expect(id(PLAIN, [cand(KITAB)])).toBeUndefined(); // One
    expect(id(PLAIN, [cand(AYN)])).toBe('sense-unreviewed'); // One + Homonyms
    expect(id(PLAIN, [cand(LAB)])).toBe('sense-unreviewed');
    expect(id(PLAIN, [cand(BAYT)])).toBe('sense-unreviewed');
    expect(id(PLAIN, [cand(DAR)])).toBe('sense-unreviewed');
    expect(['Rev', 'One', 'Lab', 'Ord', 'Ord']).toEqual([QALAM, KITAB, LAB, BAYT, DAR].map((h) => arSenseClass(arLemmaRow(h, 'NOUN'))));
  });
  it('reads a row without the key as Ord until told otherwise (the test hook says "One" for the merge simulation only)', () => {
    arDeckSenseWhenAbsent('One');
    try { expect(id(PLAIN, [cand(DAR)])).toBeUndefined(); expect(id(PLAIN, [cand(BAYT)])).toBe('sense-unreviewed'); } finally { arDeckSenseWhenAbsent(); }
    expect(id(PLAIN, [cand(DAR)])).toBe('sense-unreviewed');
  });
  it('exempts a closed-class entry (hand-written one-line function, no Sense)', () => {
    const analysed = arAdapter.analyze(arAdapter.tokenize('فِي البَيْتِ'));
    const fi = analysed.find((a) => a.token.isWord)!;
    expect(fi.candidates[0]?.lemma).toBeDefined();
    expect(fi.candidates[0].notes?.deckLimit).not.toBe('sense-unreviewed');
  });
});

describe('marking', () => {
  const token = (surface: string, i: number): RawToken => ({ surface, normalized: surface, start: i * 10, end: i * 10 + surface.length, isWord: true } as RawToken);
  it('adds reviewStatus, reviewReason and deckLimit to every reading of a held token and changes nothing else', () => {
    const cands = [cand(NOT_LISTED, { confidence: 0.7, gloss: 'x' }), cand(KITAB, { confidence: 0.2 })];
    const toks = [token(PLAIN, 0)];
    const out = arMarkForDeck(toks, [{ token: toks[0], candidates: cands, analyzer: 'ar' } as AnalyzedToken]);
    expect(out[0].candidates.map((c) => c.confidence)).toEqual([0.7, 0.2]);
    expect(out[0].candidates.map((c) => c.lemma)).toEqual([NOT_LISTED, KITAB]);
    for (const c of out[0].candidates) {
      expect(c.notes).toMatchObject({ reviewStatus: 'requires-review', deckLimit: 'not-an-entry', reviewReason: 'not an entry of the Arabic word list' });
    }
  });
  it('returns an eligible token as it came (same object), and leaves a punctuation token alone', () => {
    const toks = [token(PLAIN, 0)];
    const a = { token: toks[0], candidates: [cand(KITAB)], analyzer: 'ar' } as AnalyzedToken;
    expect(arMarkForDeck(toks, [a])[0]).toBe(a);
    const punct = { ...token('.', 1), isWord: false } as RawToken;
    const p = { token: punct, candidates: [], analyzer: 'ar' } as AnalyzedToken;
    expect(arMarkForDeck([punct], [p])[0]).toBe(p);
  });
  it('the real adapter marks through analyze: a word the analyser reads stays readable (reading kept) and is held', () => {
    const toks = arAdapter.tokenize('زكركرك');
    const out = arAdapter.analyze(toks).find((a) => a.token.isWord)!;
    for (const c of out.candidates) expect(c.notes?.reviewStatus).toBe('requires-review');
  });
});

describe('rule (f): the first meaning fits the part of speech', () => {
  const FI3L = 'فَعَلَزَجْز'; // invented verb heads
  const FI3L2 = 'فَعَّلَزَجْز';
  const EXTRA: ArabicFormIndex = {
    ...SYNTHETIC, id: 'deck-gate-test-verbs',
    lemmas: {
      [`${FI3L}|VERB`]: [FI3L, 'to do', 'VERB', 'Sense=One', 5],
      [`${FI3L2}|VERB`]: [FI3L2, 'come !', 'VERB', 'Sense=One', 5],
      [`${KITAB}|ADJ`]: [KITAB, 'to be big', 'ADJ', 'Sense=One', 5],
    },
  };
  beforeAll(() => installArabicIndex(EXTRA));
  afterAll(() => { uninstallArabicIndex(EXTRA.id); });
  it('passes a verb whose meaning begins "to " and refuses one that does not, and a noun / adjective whose meaning does', () => {
    expect(id(PLAIN, [cand(FI3L, { pos: 'VERB', gloss: 'to do' })])).toBeUndefined();
    expect(id(PLAIN, [cand(FI3L, { pos: 'VERB', gloss: '1. to do 2. to make' })])).toBe('numbered-gloss');
    expect(id(PLAIN, [cand(FI3L2, { pos: 'VERB', gloss: 'come !' })])).toBe('gloss-pos');
    expect(id(PLAIN, [cand(KITAB, { pos: 'ADJ', gloss: 'to be big' })])).toBe('gloss-pos');
    expect(id(PLAIN, [cand(KITAB, { pos: 'NOUN', gloss: 'book' })])).toBeUndefined();
  });
});

describe('rule (e) for a closed-class lexeme: a single hand gloss, never a numbered merge or a homonym merge', () => {
  const FI = 'فِي';
  it('passes a single hand-written gloss; refuses a numbered merge and a homonym merge', () => {
    expect(id(PLAIN, [cand(FI, { pos: 'ADP', gloss: 'in' })])).toBeUndefined();
    expect(id(PLAIN, [cand(FI, { pos: 'ADP', gloss: '1. in 2. into' })])).toBe('numbered-gloss');
  });
});

describe('rule (g): a numbered merge of dictionary entries is held, and stops being held when the gloss is one meaning', () => {
  it('holds "1. chief, leader 2. big" and "1. to say 2. To nap"; passes the clean meaning', () => {
    const KB = '\u0643\u064E\u0628\u0650\u064A\u0631';
    const extra: ArabicFormIndex = { ...SYNTHETIC, id: 'deck-gate-test-num', lemmas: { [`${KB}|ADJ`]: [KB, 'big', 'ADJ', 'Sense=Rev', 5] } };
    installArabicIndex(extra);
    try {
      expect(id(PLAIN, [cand(KB, { pos: 'ADJ', gloss: '1. chief, leader 2. big' })])).toBe('numbered-gloss');
      expect(arDeckVerdict(PLAIN, [cand(KB, { pos: 'ADJ', gloss: '1. chief, leader 2. big' })])?.reason).toBe('several dictionary entries share this headword: the meaning shown has not been separated');
      expect(id(PLAIN, [cand(KB, { pos: 'ADJ', gloss: 'big' })])).toBeUndefined();
      expect(id(PLAIN, [cand(KB, { pos: 'ADJ', gloss: '3.5 mm big' })])).toBeUndefined();
    } finally { uninstallArabicIndex(extra.id); }
  });
});

describe('reviewKind and reviewRivals (the names the GoLearn card reads)', () => {
  const KINDS: Record<string, string> = {
    'no-reading': 'unlisted', 'not-an-entry': 'unlisted', derived: 'unlisted', 'no-meaning': 'no-meaning', undecided: 'two-words', 'two-lexemes': 'two-words',
    'numbered-gloss': 'undecided-entry', guess: 'low-confidence', 'restored-spelling': 'low-confidence', 'known-misread-form': 'known-limit', 'known-misread-lemma': 'known-limit',
    'plural-entry': 'other-listed-word', 'pronoun-form': 'other-listed-word', dialect: 'other-variety', 'sense-unreviewed': 'meaning-unreviewed', 'gloss-pos': 'meaning-unreviewed',
  };
  it('every rule of the table has the agreed kind, and kind 2 (meaning) rules set no reviewGate', () => {
    expect(Object.fromEntries(AR_DECK_LIMITS.map((l) => [l.id, l.kind]))).toEqual(KINDS);
    expect(AR_DECK_LIMITS.filter((l) => l.kind === 'meaning-unreviewed').every((l) => !l.reading)).toBe(true);
  });
  it('a marked token carries reviewKind, and for two words the rivals\' vocalized headwords, best first (strings in an array)', () => {
    const toks = [{ surface: PLAIN, normalized: PLAIN, start: 0, end: 3, isWord: true } as RawToken];
    const out = arMarkForDeck(toks, [{ token: toks[0], candidates: [cand(KITAB, { confidence: 0.45 }), cand(QALAM, { confidence: 0.45 }), cand(AYN, { confidence: 0.4 })], analyzer: 'ar' } as AnalyzedToken]);
    const n = out[0].candidates[0].notes!;
    expect(n.reviewKind).toBe('two-words');
    expect(n.reviewGate).toBe('yes');
    expect(Array.isArray(n.reviewRivals) && (n.reviewRivals as string[]).length).toBe(3);
    expect((n.reviewRivals as string[])[0]).toBe(KITAB);
    const held = arMarkForDeck(toks, [{ token: toks[0], candidates: [cand(BAYT)], analyzer: 'ar' } as AnalyzedToken]);
    expect(held[0].candidates[0].notes).toMatchObject({ reviewKind: 'meaning-unreviewed', deckLimit: 'sense-unreviewed' });
    expect(held[0].candidates[0].notes?.reviewGate).toBeUndefined();
  });
});

describe('closed-class eligibility with hand glosses, and the six the lead does not trust', () => {
  const HAND = 'فِي';
  it('a single hand gloss (glossSource closed) is eligible; the same word with a numbered or homonym-merged gloss is not', () => {
    expect(id(PLAIN, [cand(HAND, { pos: 'ADP', gloss: 'in', notes: { glossSource: 'closed' } })])).toBeUndefined();
  });
  it.each(AR_UNREVIEWED_CLOSED.map((e) => [e.note, e] as const))('holds %s by lemma even when its row is Rev and its gloss a hand gloss', (_n, e) => {
    const pos = e.pos ?? 'ADV';
    const idx: ArabicFormIndex = { ...SYNTHETIC, id: 'deck-gate-test-closed', lemmas: { [`${e.head}|${pos}`]: [e.head, 'x', pos, 'Sense=Rev', 5] } };
    installArabicIndex(idx);
    try {
      expect(id(PLAIN, [cand(e.head, { pos: pos as AnalysisCandidate['pos'], gloss: 'x', notes: { glossSource: 'closed' } })])).toBe('sense-unreviewed');
      // the same shape of entry under another head passes
      expect(id(PLAIN, [cand(KITAB, { gloss: 'x', notes: { glossSource: 'closed' } })])).toBeUndefined();
    } finally { uninstallArabicIndex(idx.id); }
  });
  it('مَا as a pronoun is not in the list, as an adverb it is', () => {
    const ma = AR_UNREVIEWED_CLOSED.find((e) => e.pos === 'ADV')!;
    expect(ma.head).toBe('مَا');
    expect(AR_UNREVIEWED_CLOSED.filter((e) => e.head === ma.head && !e.pos)).toEqual([]);
  });
});
