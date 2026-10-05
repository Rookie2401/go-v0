/**
 * Stage 0 engine on the REAL engines (adapters, importer, GoLearn), with the Spanish pack: scenes become Texts; reading,
 * rescue, listening and production reach GoLearn as their ordinary events and stay separate; the exit gate uses unseen
 * material, records exposure at once and never feeds GoLearn.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComprehensionReported, ProductionRecorded, Stage0CheckAnswered } from '../../src/core';
import { createStage0, foldStage0, sceneTextId } from '../../src/stage0';
import type { Stage0ServiceImpl } from '../../src/stage0';
import { makeApp, makeClock, seedUser } from '../integration/harness';

const U = 'zero-es';

let app: ReturnType<typeof makeApp>;
let s0: Stage0ServiceImpl;
let clock: ReturnType<typeof makeClock>;

beforeEach(async () => {
  clock = makeClock();
  app = makeApp({ clock });
  await seedUser(app.store, U, 'honduras-es');
  s0 = createStage0({ store: app.store, bus: app.bus, adapters: app.adapters, clock: clock.now }).forUser(U);
  await s0.ensureTexts('es');
});

const events = (types: string[]) => app.bus.history({ userId: U, types: types as never });

describe('Stage 0 — scenes are ordinary texts', () => {
  it('imports every scene as an unpublished Text with stable sentence ids, and only once', async () => {
    const pack = s0.pack('es')!;
    for (const scene of pack.scenes.values()) {
      const t = await app.store.texts.get(sceneTextId('es', scene));
      expect(t, scene.id).toBeTruthy();
      expect(t!.published).toBe(false); // AI-drafted, unreviewed: never authoritative curriculum
      const st = await s0.sceneText('es', scene.id);
      for (const l of scene.lines) expect((await app.store.sentences.get(st!.sentenceIds[l.id]))?.text).toBe(l.text);
    }
    const before = (await app.store.texts.all()).length;
    await s0.ensureTexts('es');
    expect((await app.store.texts.all()).length).toBe(before);
  });
});

describe('Stage 0 — evidence stays separate and honest', () => {
  it('a check answered right before any English is reading evidence; after English it is not', async () => {
    await s0.lineSeen(U, 'es', 's03', 'l2');
    const r1 = await s0.answerCheck(U, 'es', 's03', 'c1', 0, 'read', 'none');
    expect(r1).toEqual({ correct: true, rescued: false });
    await app.golearn.settled();
    const reports = (await events(['ComprehensionReported'])) as ComprehensionReported[];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ modality: 'reading', degree: 'all', scope: 'sentence' });
    const cafe = await app.golearn.getItemState(U, 'form:es:café');
    expect(cafe!.reading.level).not.toBe('unseen');
    expect(cafe!.listening.level).toBe('unseen'); // reading is not listening

    await s0.lineSeen(U, 'es', 's03', 'l3');
    await s0.supportUsed(U, 'es', 's03', 'english', ['l3']);
    const r2 = await s0.answerCheck(U, 'es', 's03', 'c2', 0, 'read', 'none');
    expect(r2).toEqual({ correct: true, rescued: true });
    expect((await events(['ComprehensionReported'])).length).toBe(1); // no new demonstration after rescue
    expect((await events(['EnglishRescueRevealed'])).length).toBe(1); // the rescue reached GoLearn as itself
  });

  it('understanding by ear counts as listening only with a native recording; a computer voice is practice', async () => {
    await s0.answerCheck(U, 'es', 'r1', 'c1', 0, 'listen-only', 'computer-voice');
    expect(await events(['ComprehensionReported'])).toEqual([]);
    const st = await s0.state(U, 'es');
    expect(st.meters.listening.computerVoice).toEqual({ correct: 1, answered: 1 });
    expect(st.meters.listening.native).toEqual({ correct: 0, answered: 0 });
    await s0.answerCheck(U, 'es', 'r1', 'c2', 0, 'listen-only', 'native');
    const reports = (await events(['ComprehensionReported'])) as ComprehensionReported[];
    expect(reports.map((r) => r.modality)).toEqual(['listening']);
  });

  it('a wrong answer is recorded and demonstrates nothing', async () => {
    const r = await s0.answerCheck(U, 'es', 's03', 'c3', 0, 'read', 'none');
    expect(r.correct).toBe(false);
    expect(await events(['ComprehensionReported'])).toEqual([]);
    const checks = (await events(['Stage0CheckAnswered'])) as Stage0CheckAnswered[];
    expect(checks[0]).toMatchObject({ correct: false, channel: 'read', rescuedBefore: false });
  });

  it('production: copying is weak evidence, recall without a model is independent, his own name is not language evidence', async () => {
    const copy = await s0.submitProduction(U, 'es', 's01', 'p1', 'Me llamo Sam.', ['model']);
    expect(copy.accepted).toBe(true);
    const own = await s0.submitProduction(U, 'es', 's01', 'p2', 'Me llamo Carla', []);
    expect(own.accepted).toBe(true);
    const recall = await s0.submitProduction(U, 'es', 's04', 'p2', 'No, gracias. Quiero agua.', []);
    expect(recall.accepted).toBe(true);
    const prod = (await events(['ProductionRecorded'])) as ProductionRecorded[];
    expect(prod.some((p) => p.itemId === 'form:es:sam' && p.kind === 'copied')).toBe(true);
    expect(prod.some((p) => p.itemId === 'form:es:carla')).toBe(false);
    expect(prod.some((p) => p.itemId === 'form:es:quiero' && p.kind === 'independent')).toBe(true);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(U, 'form:es:gracias'))!.writing.level).not.toBe('unseen');
  });

  it('speaker forms: the learner\'s own first-person forms follow the form he chose', async () => {
    await s0.setSpeakerForm(U, 'es', 'f');
    expect((await s0.submitProduction(U, 'es', 's06', 'p1', 'Estoy cansada', [])).accepted).toBe(true);
    const other = await s0.submitProduction(U, 'es', 's06', 'p1', 'Estoy cansado', []);
    expect(other.accepted).toBe(false);
    expect(other.feedback).toMatch(/other speaker/);
  });

  it('a missing accent is accepted with a spelling note and recorded as no evidence for the misspelt form', async () => {
    const r = await s0.submitProduction(U, 'es', 's10', 'p1', 'cuanto cuesta el pan', []);
    expect(r.accepted).toBe(true);
    expect(r.feedback).toMatch(/spelled with its marks/);
    expect((await events(['ProductionRecorded'])).length).toBe(0);
  });
});

describe('Stage 0 — progress, fading and the path', () => {
  it('a step is secure only when its checks were understood without English and its tasks were produced', async () => {
    let o = await s0.overview(U, 'es');
    expect(o.next?.id).toBe('s01');
    expect(o.contentStatus).toMatch(/AI model/);
    await s0.answerCheck(U, 'es', 's01', 'c1', 0, 'read', 'none');
    await s0.answerCheck(U, 'es', 's01', 'c2', 0, 'read', 'none');
    await s0.completeStep(U, 'es', 's01');
    o = await s0.overview(U, 'es');
    expect(o.steps[0].status).toBe('done'); // tasks not produced yet
    await s0.submitProduction(U, 'es', 's01', 'p1', 'Me llamo Sam', ['model']);
    await s0.submitProduction(U, 'es', 's01', 'p2', 'Me llamo Ana', []);
    o = await s0.overview(U, 'es');
    expect(o.steps[0].status).toBe('secure');
    expect(o.next?.id).toBe('s02');
  });

  it('presentation: English is always on request; pictures leave when reading is independent; a review uses its channel', async () => {
    const p = await s0.presentation(U, 'es', 's03', 'computer-voice');
    expect(p).toMatchObject({ english: 'on-request', pictures: true, channel: 'read+listen', highlightNew: true });
    expect(p.reasons.join(' ')).toMatch(/computer voice/);
    const r = await s0.presentation(U, 'es', 'r1', 'none');
    expect(r.channel).toBe('read');
    expect((await s0.presentation(U, 'es', 'r1', 'computer-voice')).channel).toBe('listen-first');
    for (let i = 0; i < 10; i++) await s0.answerCheck(U, 'es', 's05', ['c1', 'c2', 'c3'][i % 3], [0, 0, 0][i % 3], 'read', 'none');
    expect((await s0.presentation(U, 'es', 's07', 'none')).pictures).toBe(false);
  });

  it('state is a pure function of the log', async () => {
    await s0.answerCheck(U, 'es', 's03', 'c1', 0, 'read', 'none');
    await s0.submitProduction(U, 'es', 's03', 'p1', 'Ana tiene agua', ['model']);
    const a = foldStage0('es', await app.bus.history({ userId: U }));
    const b = foldStage0('es', [...(await app.bus.history({ userId: U }))].reverse());
    expect(JSON.stringify([...a.steps.keys()])).toBe(JSON.stringify([...b.steps.keys()]));
    expect(a.meters).toEqual(b.meters);
  });
});

describe('Stage 0 — exit gate', () => {
  it('unseen forms, exposure at start, listening honestly unavailable, protected from GoLearn', async () => {
    const before = (await events(['SentenceViewed', 'ComprehensionReported', 'ProductionRecorded'])).length;
    const a = await s0.startExit(U, 'es', { microphone: true });
    expect(a.unseen).toBe(true);
    expect(a.unavailable).toEqual(['listening']); // no native recordings exist
    const form = s0.exitForm('es', a.formId)!;
    for (const c of form.reading.checks) await s0.answerExit(U, 'es', a.attemptId, 'reading', c.id, { choice: c.answer, lookups: 0 });
    await s0.answerExit(U, 'es', a.attemptId, 'writing', form.writing[0].id, { text: 'Luis está en el mercado' });
    await s0.answerExit(U, 'es', a.attemptId, 'writing', form.writing[1].id, { text: 'Me llamo Carla y vivo en Tegucigalpa' });
    await s0.answerExit(U, 'es', a.attemptId, 'speaking', form.speaking[0].id, { recordingId: 'rec-1', selfCheck: 'like-model' });
    const res = await s0.finishExit(U, 'es', a.attemptId);
    expect(res.verdict).toBe('ready-provisional');
    expect(res.sections.find((s) => s.section === 'listening')!.status).toBe('unavailable');
    expect((await events(['SentenceViewed', 'ComprehensionReported', 'ProductionRecorded'])).length).toBe(before);

    // the next attempt gets the other form; once both are used, a form is reused and honestly not "unseen"
    const b = await s0.startExit(U, 'es', { microphone: true });
    expect(b.formId).not.toBe(a.formId);
    expect(b.unseen).toBe(true);
    const c = await s0.startExit(U, 'es', { microphone: true });
    expect(c.unseen).toBe(false);
  });

  it('a failed reading section says not-yet and names what to work on', async () => {
    const a = await s0.startExit(U, 'es', { microphone: false });
    const form = s0.exitForm('es', a.formId)!;
    for (const c of form.reading.checks) await s0.answerExit(U, 'es', a.attemptId, 'reading', c.id, { choice: (c.answer + 1) % c.options.length });
    const res = await s0.finishExit(U, 'es', a.attemptId);
    expect(res.verdict).toBe('not-yet');
    expect(res.verdictDetail).toMatch(/reading/);
    expect(res.sections.find((s) => s.section === 'speaking')!.status).toBe('unavailable');
  });

  it('privacy: another learner cannot act on this learner\'s Stage 0', async () => {
    const other = createStage0({ store: app.store, bus: app.bus, adapters: app.adapters, clock: clock.now }).forUser('someone-else');
    await expect(other.answerCheck(U, 'es', 's01', 'c1', 0, 'read', 'none')).rejects.toThrow(/not permitted/);
    await expect(other.overview(U, 'es')).rejects.toThrow(/not permitted/);
  });
});
