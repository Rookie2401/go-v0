// @vitest-environment jsdom
/**
 * Korean in GoReview (brief XVII, XVIII; the auditor's G3), over the REAL pieces: the real pack facts (public/dict/ko and the stem lexicon's shards),
 * the real exercise builders, the real device Repository (`openLocalRepository`, with the Korean adapter resolving units on the device), the real
 * shell (`createApp`) and its real flashcard screens.
 *
 * THE DECK UNDER TEST (the units are read from the lexicon at run time, never typed):
 *   (i)   `lemma:ko:시간:NOUN`  a main-set word (bare lemma, "time")
 *   (ii)  `lemma:ko:눈<n>:NOUN`  a DECIDED homonym: the entry for "snow" (the cue 눈이 와요 decided it)
 *   (iii) `lemma:ko:눈:NOUN`   the UNDECIDED reading: the bare lemma, credited when nothing decides (눈이 예뻐요)
 *
 * WOULD SKIP on a machine without the built data (public/dict/ko, public/lexicon/ko): everything but the Alphabet block.
 * A fault of the PRODUCT is `it.fails` with the place in the comment above it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCardAdded, createFsrsScheduler, evidenceFor, foldDeckItems, ratingFor, registry, resolveBuilder } from '../../packages/goreview/src';
import { BUILDERS } from '../../packages/goreview/src/exercises';
import type { Exercise } from '../../packages/goreview/src';
import { FAMILY_DIMENSION, type ExerciseFamily } from '../../packages/goreview/src/types';
import { ALPHABET_LANGUAGES, alphabetCards, alphabetDeckFor, alphabetFacts, isAlphabetUnit } from '../../packages/goreview/app/alphabetDeck';
import { createApp, type AppHandle } from '../../packages/goreview/app/app';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { unitLabel } from '../../packages/goreview/app/format';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { beginSession, loadReviewModel } from '../../packages/goreview/app/workspace';
import { parseCardId } from '../../packages/repository-contract/src';
import { openLocalRepository } from '../../packages/repository-local/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { PACKS } from '../../packages/language-packs/src/registry';
import { koAdapter } from '../../src/adapters/ko';
import { flush, until } from '../golearn-app/helpers';
import { DICT_PRESENT, SHARDS_PRESENT, SNOW } from '../support/korean/lexicon';
import { ctxOf, fakeAudio } from './exercises/support';

const DATA = DICT_PRESENT && SHARDS_PRESENT;
const SUPERSCRIPT = /[⁰¹²³⁴-⁹]/u;
const hex = (s: string): string => Buffer.from(s, 'utf8').toString('hex');
const fileFetch = (async (input: RequestInfo | URL) => {
  const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;

const NOW = '2026-11-25T10:00:00.000Z';
const clock = (): string => NOW;
const TIME = 'lemma:ko:시간:NOUN';
const UNDECIDED = 'lemma:ko:눈:NOUN';
const decidedSnow = (): string => `lemma:ko:${SNOW()}:NOUN`;
const FAMILIES = Object.keys(FAMILY_DIMENSION) as ExerciseFamily[];
type Unavailable = { unavailable: true; reason: string };

let repo: Awaited<ReturnType<typeof openLocalRepository>>;
let learnerId = '';
let enrolmentId = '';
let deviceId = '';
const facts = DATA ? packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' }) : undefined!;
const unitFacts = async (unitId: string) => (await facts('ko', repo.api)!.factsFor(unitId, 'ko'))!;
const target = (unitId: string, family: ExerciseFamily) => ({ unitId, unitKind: 'lexeme', languageId: 'ko', dimension: FAMILY_DIMENSION[family] }) as never;
async function build(unitId: string, family: ExerciseFamily, audio?: ReturnType<typeof fakeAudio>): Promise<Exercise | Unavailable> {
  return (await BUILDERS[family].build(target(unitId, family), await unitFacts(unitId), ctxOf(audio ? { audio } : {}))) as Exercise | Unavailable;
}

beforeAll(async () => {
  if (!DATA) return;
  repo = await openLocalRepository({ area: createMemoryArea(), now: clock, adapters: { ko: koAdapter } as never });
  const id = await repo.identity();
  learnerId = id.learnerId; deviceId = id.deviceId;
  const enrol = await repo.api.enrol({ languageId: 'ko', packId: 'pack:ko', packVersion: '1', goals: [{ kind: 'reading' }] });
  if (!enrol.ok) throw new Error(enrol.message);
  enrolmentId = enrol.data.enrolment.enrolmentId;
  // the device resolves the Korean units (the Korean adapter is linked in): 시간이 → 시간, 눈이 → 눈 and every numbered entry
  for (const surface of ['시간이', '눈이']) expect((await repo.api.lookup({ languageId: 'ko', surface })).ok).toBe(true);
});
afterAll(async () => { if (DATA) await repo.close(); });

describe.skipIf(!DATA)('Korean exercises: the bare headword on the front, the right meanings on the back', () => {
  it('the three units exist on the device under their exact ids (the numbered entry is a unit of its own)', async () => {
    for (const unitId of [TIME, decidedSnow(), UNDECIDED]) {
      const u = await repo.api.unit(unitId);
      expect(u.ok, unitId).toBe(true);
      expect(u.ok && u.data.unit.unitId, 'the id is returned byte for byte').toBe(unitId);
    }
    expect(decidedSnow(), 'the cue-decided entry is a numbered lemma, not the bare one').not.toBe(UNDECIDED);
  });

  it('(i) 시간: a written-recognition card asks about the headword and accepts its meanings', async () => {
    const e = (await build(TIME, 'written-recognition')) as Exercise;
    expect(e.prompt.stimulusText).toBe('시간');
    expect(e.answerKey.accepted).toEqual(expect.arrayContaining(['time']));
    expect(JSON.stringify([e.prompt, e.answerKey])).not.toMatch(SUPERSCRIPT);
  });

  it('(ii) the decided homonym: the front is the bare headword, the answer is snow ALONE', async () => {
    const e = (await build(decidedSnow(), 'written-recognition')) as Exercise;
    expect(e.target.unitId).toBe(decidedSnow());
    expect(e.prompt.stimulusText).toBe('눈');
    expect(e.prompt.instruction).toBe('What does “눈” mean?');
    expect(e.answerKey.accepted).toEqual(['snow']);
    expect(JSON.stringify([e.prompt, e.answerKey])).not.toMatch(SUPERSCRIPT);
    expect(unitLabel(decidedSnow())).toBe('눈');
  });

  it('(iii) the undecided bare item: the front is the bare headword, the back names every meaning of the spelling', async () => {
    const e = (await build(UNDECIDED, 'written-recognition')) as Exercise;
    expect(e.prompt.stimulusText).toBe('눈');
    const shown = JSON.stringify([e.answerKey.explanation, e.answerKey.accepted]);
    expect(shown).toMatch(/eye/);
    expect(shown).toMatch(/snow/);
    expect(shown).toMatch(/scale/);
    expect(shown).not.toMatch(SUPERSCRIPT);
  });

  // FAULT (G3: the question accepts only some meanings): the facts for the bare 눈 carry every entry's meaning (the second entry labelled
  // "(noun, entry 2) snow": packages/language-packs/src/runtime.ts gloss labels), but the written-recognition builder's accepted list is made of the first
  // entry's senses and the analyser's merged line ("eye; eyesight / snow / scale / bud"): "snow", "scale" and "bud" ALONE are not accepted. A learner who
  // answers "snow" to the undecided card is marked wrong although the card's own explanation says 눈 means snow among other things.
  // (packages/goreview/src/exercises/written-recognition.ts and shared.ts, the accepted-answer assembly; the label prefix "(noun, entry N)" hides later entries.)
  it.fails('(iii) the undecided item accepts "snow" and "eye" and "scale" each as a correct answer, not only the first entry\'s senses', async () => {
    const e = (await build(UNDECIDED, 'written-recognition')) as Exercise;
    for (const meaning of ['eye', 'snow', 'scale']) expect(e.answerKey.accepted, meaning).toContain(meaning);
  });

  it('no exercise built for any of the three asks something a Korean learner cannot answer: no number to type, no superscript in a prompt, an answer or an explanation', async () => {
    const built: string[] = [];
    for (const unitId of [TIME, decidedSnow(), UNDECIDED]) {
      for (const family of FAMILIES) {
        const e = await build(unitId, family);
        if ('unavailable' in e) { expect(e.reason, `${unitId} ${family}`).toBeTruthy(); continue; }
        built.push(`${unitId}|${family}`);
        expect(JSON.stringify([e.prompt, e.answerKey]), `${unitId} ${family}`).not.toMatch(SUPERSCRIPT);
        expect(e.answerKey.accepted.some((a) => /\d/.test(a)), 'no accepted answer is a number').toBe(false);
        expect(e.prompt.instruction ?? '').not.toMatch(/number|entry \d|which one/i);
      }
    }
    // a provisional Korean pack makes the meaning-of-a-word card for each of the three; the other families are withheld with their reasons (the hand-back lists them)
    expect(built).toEqual(expect.arrayContaining([`${TIME}|written-recognition`, `${decidedSnow()}|written-recognition`, `${UNDECIDED}|written-recognition`]));
  });

  it('audio: a listening exercise, where GoListen has a Korean source, is given the bare headword and expects it back', async () => {
    const src = fakeAudio('recorded');
    const e = await build(decidedSnow(), 'audio-transcription', src);
    if ('unavailable' in e) { expect(e.reason).toBeTruthy(); return; } // withheld for a provisional pack: an honest reason is all there is to check
    expect(src.requests.map((r) => r.text)).toEqual(['눈']);
    expect(e.answerKey.accepted).toEqual(['눈']);
  });
});

// ───────────────────────────── the real shell, the real flashcards ─────────────────────────────
describe.skipIf(!DATA)('the three cards on the real GoReview screens', () => {
  let app: AppHandle | undefined;
  let root: HTMLElement;
  afterAll(() => { app?.destroy(); });

  it('a session over the deck shows each card\'s front and back; a homonym number appears on none; the undecided back shows every meaning', async () => {
    const cards = [TIME, decidedSnow(), UNDECIDED];
    const events = cards.map((unitId) => buildCardAdded({ learnerId, enrolmentId, languageId: 'ko', at: NOW, deviceId, producerVersion: 'test', unitId, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner' }));
    expect((await repo.api.appendEvents(events)).ok).toBe(true);
    // automatic admission needs knowledge beyond New: the learner marked each word Familiar on its card
    const marks = cards.map((itemId, n) => ({ id: `sess-mark-${n}`, v: 1, learnerId, enrolmentId, languageId: 'ko', at: NOW, producer: { app: 'golearn-ext', version: 't', deviceId }, kind: 'ItemMarked', subject: { itemIds: [itemId] }, payload: { mark: 'familiar' }, dedupeKey: `sess-mark-${n}` }));
    expect((await repo.api.appendEvents(marks as never)).ok).toBe(true);
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, factsFor: facts, now: clock, random: () => 0.5 });
    document.body.innerHTML = ''; root = document.createElement('div'); document.body.append(root);
    app = createApp(root, {
      win: window, doc: document, fetch: fileFetch, area: createMemoryArea(), config: { serviceUrl: 'https://repository.invalid' }, createApi: () => repo.api,
      local: async () => repo, engine, audio: null, now: () => new Date(clock()), newId: (() => { let n = 0; return () => `id-${++n}`; })(), random: () => 0.5, appVersion: 'test', autoSync: false,
    } as never);
    await app.ready();
    const model = (await loadReviewModel(app.ctx))!;
    expect(model.deck.map((d) => d.unitId).sort()).toEqual([...cards].sort());
    for (const d of model.deck) {
      expect(d.itemId).toBe(`card:written-recognition:${d.unitId}`);
      expect(hex(parseCardId(d.itemId)?.unitId ?? '')).toBe(hex(d.unitId));
    }
    const session = await beginSession(app.ctx, model);
    expect(session.ok, session.ok ? '' : session.message).toBe(true);
    if (!session.ok) return;
    app.ctx.run.active = session.run;
    await app.go('review/session'); await flush(20);
    const seen = new Map<string, { front: string; back: string; tools: string }>();
    for (let guard = 0; guard < 6; guard++) {
      const ex = root.querySelector<HTMLElement>('#session .exercise');
      if (!ex) break;
      const item = ex.dataset.item ?? '';
      const front = ex.textContent ?? '';
      const tools = root.querySelector('#item-tools')?.textContent ?? '';
      root.querySelector<HTMLButtonElement>('#flip-card')!.click();
      const back = (root.querySelector('#session .exercise')?.textContent ?? '') + ' ' + (root.querySelector('#revealed-answer')?.textContent ?? '');
      seen.set(item, { front, back, tools });
      root.querySelector<HTMLElement>('[data-grade="good"]')!.click();
      await until(() => !ex.isConnected, 8000);
    }
    expect([...seen.keys()].sort()).toEqual(cards.map((u) => `card:written-recognition:${u}`).sort());
    for (const [item, s] of seen) expect(`${s.front}${s.back}${s.tools}`, item).not.toMatch(SUPERSCRIPT);
    const time = seen.get(`card:written-recognition:${TIME}`)!;
    expect(time.front).toContain('시간');
    expect(time.back).toMatch(/time/);
    const snow = seen.get(`card:written-recognition:${decidedSnow()}`)!;
    expect(snow.front).toContain('눈');
    expect(snow.back).toMatch(/snow/);
    expect(snow.back, 'the decided card does not show the other meanings').not.toMatch(/eye|scale|bud/);
    const all = seen.get(`card:written-recognition:${UNDECIDED}`)!;
    expect(all.front).toContain('눈');
    expect(all.back, 'G3: the undecided back shows EVERY meaning of the spelling').toMatch(/eye/);
    expect(all.back).toMatch(/snow/);
    expect(all.back).toMatch(/scale/);
    // three cards, three schedules: none merged with another
    const deck = foldDeckItems(await app.ctx.events('ko'), createFsrsScheduler({ desiredRetention: 0.9 }), { languageId: 'ko', now: clock() });
    expect(deck.map((d) => d.unitId).sort()).toEqual([...cards].sort());
    expect(deck.map((d) => d.unitId + ':' + d.schedule.reps + ':' + d.schedule.phase).join(' ; '), 'each card was reviewed once').toBe(deck.map((d) => d.unitId + ':1:learning').join(' ; '));
  }, 120_000);
});

// ───────────────────────────── identity: the same bytes on the review side's hops ─────────────────────────────
describe.skipIf(!DATA)('a numbered unit id on the review side\'s hops', () => {
  it('the device store keeps distinct knowledge rows for 눈, 눈¹ and the snow entry, each under its exact id', async () => {
    const ids = [UNDECIDED, 'lemma:ko:눈¹:NOUN', decidedSnow()];
    const mk = (itemId: string, n: number) => ({
      id: `kn-${n}`, v: 1, learnerId, enrolmentId, languageId: 'ko', at: NOW, producer: { app: 'golearn-ext', version: 't', deviceId }, kind: 'ItemMarked',
      subject: { itemIds: [itemId] }, payload: { mark: 'familiar' }, dedupeKey: `kn-${n}`,
    });
    expect((await repo.api.appendEvents(ids.map(mk) as never)).ok).toBe(true);
    const rows = await repo.api.knowledge(ids);
    expect(rows.ok).toBe(true);
    const got = rows.ok ? rows.data.knowledge.map((k) => k.unitId) : [];
    expect(got.map(hex).sort()).toEqual(ids.map(hex).sort());
  });

  it('the card id travels through a history address and back: encode, decode, parse', () => {
    const itemId = `card:written-recognition:${decidedSnow()}`;
    const href = `#/review/history/${encodeURIComponent(itemId)}`;                  // screens/reviewDetails.ts:247, myvocab.ts:139
    const decoded = decodeURIComponent(href.slice('#/review/history/'.length));    // screens/history.ts:56
    expect(decoded).toBe(itemId);
    expect(hex(parseCardId(decoded)?.unitId ?? '')).toBe(hex(decidedSnow()));
    expect(JSON.parse(JSON.stringify({ itemId }))).toEqual({ itemId });
    expect(itemId.normalize('NFC')).toBe(itemId);
  });
});

// ───────────────────────────── the Alphabet deck ─────────────────────────────
describe('the Alphabet deck for Korean, through the real alphabet-deck code', () => {
  it('offers its 40 rows: one card each, unique ids, a glyph and a back, as a saved deck beside the others', () => {
    expect(ALPHABET_LANGUAGES).toContain('ko');
    expect(Object.keys(PACKS)).toContain('ko');
    const cards = alphabetCards('ko');
    expect(cards).toHaveLength(40);
    expect(new Set(cards.map((c) => c.unitId)).size).toBe(40);
    for (const c of cards) {
      expect(c.glyph.trim().length).toBeGreaterThan(0);
      expect(c.back.trim().length).toBeGreaterThan(0);
      expect(c.unitId.startsWith('class:ko-alphabet:')).toBe(true);
      expect(isAlphabetUnit(c.unitId)).toBe(true);
      expect(unitLabel(c.unitId)).toBe(c.glyph);
      expect(c.back.length).toBeLessThanOrEqual(140);
    }
    expect(cards.map((c) => c.glyph).join('')).toMatch(/[ㄱ-ㅣ]/u);   // jamo, as the learner meets them
    const deck = alphabetDeckFor('ko', undefined, NOW)!;
    expect(deck).toBeTruthy();
    expect(deck.id).toBe('alphabet:ko');
    expect(alphabetFacts(cards[0].unitId, 'ko')!.unit.label).toBe(cards[0].glyph);
    expect(alphabetFacts(cards[0].unitId, 'ru'), 'another language\'s letters are not this language\'s').toBeUndefined();
  });

  it('every card builds as a flashcard with the real written-recognition builder, showing the letter and accepting its back', async () => {
    const builder = resolveBuilder(registry as never, 'written-recognition')!;
    for (const card of alphabetCards('ko')) {
      const built = await builder.build({ unitId: card.unitId, unitKind: 'lexeme', languageId: 'ko', dimension: 'written-recognition' } as never, alphabetFacts(card.unitId, 'ko')!, ctxOf());
      expect('unavailable' in built, card.glyph).toBe(false);
      if (!('unavailable' in built)) {
        expect(built.responseMode, card.glyph).toBe('typed-or-self');
        expect(built.prompt.stimulusText).toBe(card.glyph);
        expect(built.answerKey.accepted.length).toBeGreaterThan(0);
      }
    }
  });
});
