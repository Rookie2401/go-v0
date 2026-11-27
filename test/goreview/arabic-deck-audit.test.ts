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

  it('admits no form card at all, and holds the open-class words back until their leading meaning is reviewed (sense-unreviewed)', () => {
    show('today (the figures of the master-format set are in test/deck-audit, set ar)', r);
    expect(r.figures.formCards, `form cards: ${r.cards.filter((c) => c.kind === 'form').map((c) => c.unitId).join(' ')}`).toBe(0);
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
    for (const a of ['to say', 'to advocate', 'to propound', 'to support']) expect(card!.accepted, a).toContain(a);
    // the reviewed exclusion (answer-exclusions.json): "to root" alone means to plant roots, so it is neither accepted nor shown
    expect(card!.accepted).not.toContain('to root');
    expect(card!.glosses.join(' | ').toLowerCase()).not.toMatch(/(^|[,;|]\s*)to root(\s*[,;|]|$)/u);
    expect(card!.glosses.join(' | ')).toContain('to advocate, to propound, to stand up for, to support');
    // the nap entry (root ق ي ل) is another word: none of its senses is an answer
    for (const a of ['to nap', 'To nap', 'to nap.', 'to do something at noon', 'to cancel a contract or a promise']) expect(card!.accepted.map((x) => x.toLowerCase()), a).not.toContain(a.toLowerCase());
    expect(card!.problems).toEqual([]);
  }, 600_000);
});

describe.skipIf(!shardsPresent())('the reviewed answer exclusions cannot rot', () => {
  it('every key names a lemma of the index, with a non-empty excluded string', async () => {
    const { installFullIndex } = await import('../../scripts/ar-deck-limits-lib.mts');
    const { arLemmaRow } = await import('../../src/adapters/arabic/deck');
    const table = JSON.parse(fs.readFileSync(path.resolve('src/adapters/arabic/answer-exclusions.json'), 'utf8')) as { exclude: Record<string, string[]> };
    installFullIndex();
    expect(Object.keys(table.exclude).length).toBeGreaterThan(0);
    for (const [key, list] of Object.entries(table.exclude)) {
      const [head, pos] = key.split('|');
      expect(arLemmaRow(head, pos), `exclusion for ${key}: not an entry of the Arabic index`).toBeDefined();
      expect(list.length).toBeGreaterThan(0);
      for (const x of list) expect(x.trim()).not.toBe('');
    }
  });
});

describe.skipIf(!shardsPresent())('one id per word (the old split: lemma:ar:أسبوع:NOUN beside lemma:ar:أُسْبُوع:NOUN)', () => {
  it('over the development text no credited unit id names a lexeme without its vowels when the index holds it vocalized, and أسبوع is credited once, vocalized', async () => {
    const { installFullIndex } = await import('../../scripts/ar-deck-limits-lib.mts');
    const { installedArabicIndexes } = await import('../../src/adapters/arabic/index-store');
    const { arAdapter } = await import('../../src/adapters/ar');
    const { wordsOfText } = await import('../../packages/golearn-extension/src/active/scan');
    const { arKey, hasTashkil } = await import('../../src/adapters/arabic/text');
    installFullIndex();
    const vocalized = new Set<string>();
    for (const ix of installedArabicIndexes()) for (const [id, row] of Object.entries(ix.lemmas)) if (hasTashkil(row[0]) && id.includes('|')) vocalized.add(`${arKey(row[0])}|${row[2]}`);
    const sentences = fs.readFileSync(path.resolve('data/deck-audit/ar/dev.txt'), 'utf8').split(/\r?\n/u).filter((l) => l && !l.startsWith('#'));
    const ids = new Set<string>();
    for (const t of sentences) for (const w of wordsOfText(t, arAdapter, 'ar')) for (const id of w.ids) ids.add(id);
    const bare = [...ids].filter((id) => { const m = /^lemma:ar:(.*):([A-Z]+)$/u.exec(id); return !!m && !hasTashkil(m[1]) && vocalized.has(`${arKey(m[1])}|${m[2]}`); });
    expect(bare, 'lemma ids without vowels for a lexeme the index holds vocalized').toEqual([]);
    expect([...ids].filter((id) => id.startsWith('lemma:ar:') && arKey(id.slice('lemma:ar:'.length)).startsWith('\u0623\u0633\u0628\u0648\u0639'))).toEqual(['lemma:ar:\u0623\u064F\u0633\u0652\u0628\u064F\u0648\u0639:NOUN']);
    // the same through GoReview's facts: a card for the lexeme, if any, is the vocalized unit
    const r = await runDeckAudit(sentences.map((x, i) => ({ id: `one-id-${i}`, text: x })));
    expect(r.cards.filter((c) => c.kind === 'lemma' && !hasTashkil(c.head) && vocalized.has(`${arKey(c.head)}|${c.pos}`)).map((c) => c.unitId)).toEqual([]);
  }, 600_000);
});

describe.skipIf(!shardsPresent())('no admitted card\'s first meaning stops where the source sense goes on (the auditor\'s test)', () => {
  it('over the development text, the shown first meaning is a whole item (or a run of items) of a sense of the unit\'s own dictionary record, or a reviewed hand gloss; سِوًى, تَوَقَّعَ and أَثْنَاءَ are among the checked words', async () => {
    const { runDeckAudit: masterAudit } = await import('../deck-audit/support');
    const { fragmentWhy } = await import('../deck-audit/fragments');
    const { createPackRuntime } = await import('../../packages/language-packs/src/runtime');
    const { packFor } = await import('../../packages/language-packs/src');
    const { arUnitRecords } = await import('../../src/adapters/arabic/answers');
    const { arAdapter } = await import('../../src/adapters/ar');
    const zlib = await import('node:zlib');
    const sentences = fs.readFileSync(path.resolve('data/deck-audit/ar/dev.txt'), 'utf8').split(/\r?\n/u).filter((l) => l.trim() && !l.startsWith('#'));
    const result = await masterAudit('ar', sentences, {});
    const files = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input), 'http://a.local/'); const f = path.join('public', decodeURIComponent(u.pathname));
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('x', { status: 404 });
      const b = fs.readFileSync(f); return new Response(f.endsWith('.gz') ? zlib.gunzipSync(b) : b);
    }) as typeof fetch;
    const rt = createPackRuntime(packFor('ar')!, { fetch: files, baseUrl: 'http://a.local/' });
    const same = (a: string, b: string): boolean => a === b || (['VERB', 'AUX'].includes(a) && ['VERB', 'AUX'].includes(b)) || (['NOUN', 'PROPN'].includes(a) && ['NOUN', 'PROPN'].includes(b));
    const norm = (t: string): string => { let x = t.toLowerCase(); for (let k = 0; k < 8; k++) { const n = x.replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' '); if (n === x) break; x = n; } return x.replace(/\s+/gu, ' ').trim().replace(/[.\s]+$/u, ''); };
    const items = (t: string): string[] => norm(t).split(/\s*[;,:]\s*/u).map((x) => x.trim()).filter(Boolean);
    const failures: string[] = [];
    const checked = new Set<string>();
    for (const c of result.cards) {
      if (c.kind !== 'lemma' || !c.pos) continue;
      checked.add(c.headword);
      const closed = arAdapter.analyze(arAdapter.tokenize(c.headword)).flatMap((a) => a.candidates).some((x) => x.lemma === c.headword && x.pos === c.pos && x.notes?.glossSource === 'closed');
      if (closed) continue;
      const e = await rt.entry(c.headword, c.pos);
      const recs = arUnitRecords((e?.records ?? []) as Parameters<typeof arUnitRecords>[0], c.headword, c.pos, same);
      const shown = items(c.shown);
      const ok = shown.length > 0 && recs.some((r) => (r.s ?? []).some((s) => {
        const it = items(s.g);
        for (let i = 0; i + shown.length <= it.length; i++) if (shown.every((x, k) => it[i + k] === x)) return true;
        return false;
      }));
      if (!ok) failures.push(`${c.unitId}: shows "${c.shown}"`);
      const why = fragmentWhy(c.shown);
      if (why) failures.push(`${c.unitId}: "${c.shown}" ${why}`);
    }
    for (const w of ['سِوًى', 'تَوَقَّعَ', 'أَثْنَاءَ']) console.log(`checked ${w}: ${checked.has(w) ? 'a card in the development text, whole item' : 'not admitted in the development text'}`);
    if (failures.length) console.log('FRAGMENT-FAILURES', JSON.stringify(failures));
    expect(failures, 'cards whose first meaning stops short of the source sense').toEqual([]);
  }, 1_200_000);
});
