/**
 * THE ARABIC DECK AUDIT (the owner's landing condition: "no false words or unknown words that appear in the GoReview deck").
 *
 * An Arabic text written for this test (test/fixtures/arabic/deck-audit.json: 367 words of unvocalized prose in three registers, machine-written
 * and machine-annotated, frozen 2026-11-25, never tuned on) goes through the REAL path (see arabic-deck-audit.support.ts) and EVERY admitted card
 * is checked: the headword is an entry of the index with a meaning; where the gold names the lemma it equals it; the leading meaning (the one
 * GoReview's own facts provider builds, `createFactsProvider` -> `lemmaFacts`) fits the gold meaning, a verb's begins "to ", no leading sense is
 * labelled archaic / obsolete / dated / rare / dialectal / historical while another is not; no fragment; and NO FORM CARD at all.
 *
 * Two runs, both reported:
 *   today   the rules as they stand: the index rows carry no `Sense` key yet, so every open-class lexeme is held back (sense-unreviewed);
 *   merged  a SIMULATION of the index that arrives by merge (rows read as `Sense=One`): it exercises every other rule on the open-class words.
 *           It is a simulation, NOT what is admitted today.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shardsPresent } from '../../scripts/ar-deck-limits-lib.mts';
import { arDeckSenseWhenAbsent } from '../../src/adapters/arabic/deck';
import { REVIEWED_EQUIVALENT_MEANINGS, runDeckAudit, type AuditResult, type AuditText, type GoldSentence } from './arabic-deck-audit.support';

const fixture = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/arabic/deck-audit.json'), 'utf8')) as { frozen: string; _about: string; wordCount: number; sentences: GoldSentence[] };
const TEXTS: AuditText[] = fixture.sentences.map((s) => ({ id: s.id, text: s.text, gold: s.tokens }));
// The auditor's findings AB1, as named cases (their words, my sentences are not needed: each is read alone and in a phrase)
const NAMED = ['أقرأ', 'أطير', 'إن شاء الله', 'تحدث', 'مواطن', 'الجديدة', 'الجزيرة', 'إن'];
const AB1_SURFACES = new Set(['أقرأ', 'أطير', 'شاء', 'تحدث', 'مواطن', 'الجديدة', 'الجزيرة', 'إن']);
const NAMED_TEXTS: AuditText[] = NAMED.map((w, i) => ({ id: `ab1-${i}`, text: w }));

const show = (label: string, r: AuditResult): void => {
  const f = r.figures;
  console.log([
    `ARABIC DECK AUDIT, ${label}: ${r.words} words (${r.distinctWords} distinct); reviewed-equivalent meanings in the table: ${REVIEWED_EQUIVALENT_MEANINGS.length}`,
    `  admitted ${f.admitted} (lemma ${f.admitted - f.formCards}, FORM ${f.formCards}); false ${f.false}; unknown or fragment ${f.unknownOrFragment}; admitted with no gold behind them ${f.unchecked}`,
    `  held back ${f.held} distinct words = ${(100 * f.heldShare).toFixed(1)}% of distinct words; by rule: ${JSON.stringify(f.heldByReason)}`,
    `  readings kept on the card: ${r.candidatesStillThere} of ${r.readingsKept} word tokens still have their readings`,
    ...r.held.filter((h) => /^(intake:|not-recovered|recovery-dropped|no-reading)/u.test(h.limit)).map((h) => `  HELD (${h.limit}) ${h.surface}: ${h.unitIds.join(' ')} -- ${h.reason}`),
    ...r.cards.filter((c) => c.problems.length).map((c) => `  PROBLEM ${c.unitId}: ${c.problems.join(' ; ')}`),
  ].join('\n'));
};

/**
 * THE FIRST-MEANING FINDINGS STILL OPEN (the release manager's list to review: "those lexemes then get a reviewed gloss choice"). A card whose leading meaning
 * the gold contradicts is FALSE under the owner's rule; the target is an empty list. The list is frozen here so that a NEW one fails the suite, and the day a
 * gloss is reviewed the entry must be deleted (the second assertion fails when a listed card is no longer a finding).
 */
const OPEN_MEANING_FINDINGS: string[] = [];
const isMeaning = (p: string): boolean => /leading meaning|does not begin|is labelled|numbered merge|leads with|another entry|more than one entry/u.test(p);

describe.skipIf(!shardsPresent())('the Arabic deck audit: real path, today\'s rules', () => {
  let r: AuditResult;
  beforeAll(async () => { r = await runDeckAudit([...TEXTS, ...NAMED_TEXTS]); }, 900_000);
  afterAll(() => arDeckSenseWhenAbsent());

  it('the fixture is the frozen, machine-written text of 350-450 words', () => {
    expect(fixture.frozen).toBe('2026-11-25');
    expect(fixture._about).toMatch(/MACHINE-WRITTEN and MACHINE-ANNOTATED/u);
    expect(fixture.wordCount).toBeGreaterThanOrEqual(350);
    expect(fixture.wordCount).toBeLessThanOrEqual(450);
    expect(fixture.sentences.reduce((n, s) => n + s.tokens.length, 0)).toBe(fixture.wordCount);
  });

  it('admits no false card, no unknown or fragment card, and NO FORM CARD; every admitted card is checked', () => {
    show('today (index rows with their Sense class)', r);
    expect(r.figures.formCards, `form cards: ${r.cards.filter((c) => c.kind === 'form').map((c) => c.unitId).join(' ')}`).toBe(0);
    const meaning = r.cards.filter((c) => c.problems.some(isMeaning));
    const other = r.cards.filter((c) => c.problems.length && !meaning.includes(c));
    expect(other.map((c) => `${c.unitId}: ${c.problems.join('; ')}`), 'false cards other than a wrong first meaning').toEqual([]);
    expect(meaning.map((c) => c.unitId), 'wrong first meanings: a new one fails; a reviewed one must leave OPEN_MEANING_FINDINGS').toEqual(OPEN_MEANING_FINDINGS);
    expect(r.figures.unknownOrFragment).toBe(0);
  });

  it('holds the open-class words back until their leading meaning is reviewed (sense-unreviewed), and says so', () => {
    expect(r.figures.heldByReason['sense-unreviewed'] ?? 0).toBeGreaterThan(0);
    expect(r.cards.every((c) => c.kind === 'lemma')).toBe(true);
  });

  it('keeps every word readable: held words still have their readings for the GoLearn card', () => {
    expect(r.candidatesStillThere).toBe(r.readingsKept);
  });

  it('AB1: no card exists for any of the eight words the auditor found (undecided words stay readable, none is drilled)', () => {
    const named = new Set(r.cards.filter((c) => c.behind.some((b) => b.sentence.startsWith('ab1-') && AB1_SURFACES.has(b.surface))).map((c) => c.unitId));
    expect([...named], 'cards for the AB1 words').toEqual([]);
  });
});

describe.skipIf(!shardsPresent())('the Arabic deck audit: SIMULATION of the merged index (every row Sense=One)', () => {
  let r: AuditResult;
  beforeAll(async () => { r = await runDeckAudit([...TEXTS, ...NAMED_TEXTS], { senseWhenAbsent: 'One' }); }, 900_000);
  afterAll(() => arDeckSenseWhenAbsent());

  it('reports the cards that would be admitted; form cards, unknown headwords and gold lemma mismatches stay at zero', () => {
    show('SIMULATION: rows without Sense read as One', r);
    expect(r.figures.formCards).toBe(0);
    expect(r.figures.unknownOrFragment).toBe(0);
    expect(r.cards.filter((c) => c.problems.some((p) => /^gold lemma/u.test(p))), 'gold lemma mismatches').toEqual([]);
  });

  it('AB1 in the simulation: still no card for the eight words', () => {
    const named = new Set(r.cards.filter((c) => c.behind.some((b) => b.sentence.startsWith('ab1-') && AB1_SURFACES.has(b.surface))).map((c) => c.unitId));
    expect([...named]).toEqual([]);
  });
});

const MEANING_HOLDS = new Set(['sense-unreviewed', 'gloss-pos', 'no-meaning', 'plural-entry']);

describe.skipIf(!shardsPresent())('the two kinds of hold, proved through the real path', () => {
  let r: AuditResult;
  beforeAll(async () => { r = await runDeckAudit([...TEXTS]); }, 900_000);
  afterAll(() => arDeckSenseWhenAbsent());

  it('kind 2 (a real lemma whose first MEANING is unreviewed): the lemma is still credited, and neither its lemma unit nor a form unit yields a card', () => {
    const held = r.held.filter((h) => MEANING_HOLDS.has(h.limit));
    expect(held.length).toBeGreaterThan(0);
    const cardIds = new Set(r.cards.map((c) => c.unitId));
    for (const h of held) {
      expect(h.unitIds.some((i) => i.startsWith('lemma:ar:')), `${h.surface} keeps its lemma id in the vocabulary`).toBe(true);
      for (const id of h.unitIds) expect(cardIds.has(id), `${h.surface}: ${id}`).toBe(false);
    }
    expect(r.cards.filter((c) => c.kind === 'form')).toEqual([]);
  });

  it('the same lemma becomes card-eligible once its meaning is reviewed: Sense=Ord gives no card, Sense=Rev gives one', async () => {
    const candidates = r.held.filter((h) => h.limit === 'sense-unreviewed').flatMap((h) => h.unitIds.filter((i) => i.startsWith('lemma:ar:'))).slice(0, 6);
    expect(candidates.length).toBeGreaterThan(0);
    const patch = (lex: string): Record<string, string> => Object.fromEntries(candidates.map((id) => { const m = /^lemma:ar:(.*):([A-Z]+)$/u.exec(id)!; return [`${m[1]}|${m[2]}`, lex]; }));
    const texts = candidates.map((id, i) => ({ id: `flip-${i}`, text: /^lemma:ar:(.*):[A-Z]+$/u.exec(id)![1] }));
    const ord = await runDeckAudit(texts, { patchLex: patch('Sense=Ord') });
    expect(ord.cards.filter((c) => candidates.includes(c.unitId))).toEqual([]);
    const rev = await runDeckAudit(texts, { patchLex: patch('Sense=Rev') });
    const admitted = rev.cards.filter((c) => candidates.includes(c.unitId));
    expect(admitted.length, 'at least one of the reviewed lemmas becomes a card').toBeGreaterThan(0);
    expect(admitted.every((c) => c.kind === 'lemma')).toBe(true);
  }, 900_000);
});

describe.skipIf(!shardsPresent())('a headword with several source entries: قَالَ', () => {
  it('shows and accepts the "to say" entry only: its own senses are true answers, the nap entry never is', async () => {
    const r = await runDeckAudit([{ id: 'qala', text: '\u0642\u064E\u0627\u0644\u064E' }]);
    const card = r.cards.find((c) => c.unitId.startsWith('lemma:ar:\u0642\u064E\u0627\u0644\u064E:VERB'));
    expect(card, 'قَالَ is admitted: a reviewed lead, one entry chosen by meaning').toBeDefined();
    expect(card!.glosses[0]).toBe('to say');
    // the printout of the audit's item 1: "to advocate, to propound, to root, to stand up for, to support" is a sense of the SAY record itself (root ق و ل), so these are true answers
    for (const a of ['to say', 'to advocate', 'to propound', 'to root', 'to support']) expect(card!.accepted, a).toContain(a);
    // the nap entry (root ق ي ل) is another word: none of its senses is an answer
    for (const a of ['to nap', 'To nap', 'to nap.', 'to do something at noon', 'to cancel a contract or a promise']) expect(card!.accepted.map((x) => x.toLowerCase()), a).not.toContain(a.toLowerCase());
    expect(card!.problems).toEqual([]);
  }, 600_000);
});
