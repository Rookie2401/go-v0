/**
 * The productive engine's parts: catalog self-consistency, the ladder of help, learner goals, spontaneous use (P7),
 * the testimony map, and the GoTell → GoLearn signal.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../../src/adapters';
import type { LanguageCode, TellAttemptSubmitted } from '../../../src/core';
import { CATALOG_GOALS, HINT_LABEL, assessLanguage, assessMeaning, catalogGoals, catalogModel, learnerGoal, nextStep } from '../../../src/gotell';
import { productiveGaps } from '../../../src/golearn/productive';
import { hintToModel, makePracticeWorld, meet, say, taskFor } from './world';

const reg = createAdapterRegistry();
const LANGS: LanguageCode[] = ['es', 'de', 'hi', 'sq', 'th'];

describe('catalog', () => {
  it('goals carry meaning only; every model wording is labelled unreviewed', () => {
    for (const g of CATALOG_GOALS) {
      expect(g.components.length).toBeGreaterThan(0);
      expect(g.meaning).toMatch(/^[A-Z][^]*[.?]$/);
      expect(JSON.stringify(g)).not.toMatch(/[ऀ-ॿ฀-๿]/); // no target-language text inside a goal
    }
    for (const lang of LANGS) for (const g of catalogGoals(lang)) expect(catalogModel(g.id, lang)).toMatchObject({ review: 'unreviewed', origin: 'catalog' });
  });

  it('each model wording carries its meaning and the real checker finds nothing in it (all five languages)', () => {
    for (const lang of LANGS) {
      const a = reg.get(lang);
      expect(catalogGoals(lang).length).toBeGreaterThanOrEqual(13);
      for (const g of catalogGoals(lang)) {
        const m = catalogModel(g.id, lang)!;
        const meaning = assessMeaning(a, lang, g, m.text);
        expect({ lang, goal: g.id, success: meaning.success, missing: meaning.missing }).toEqual({ lang, goal: g.id, success: true, missing: [] });
        expect({ lang, goal: g.id, findings: assessLanguage(a, m.text).findings.map((f) => f.message) }).toEqual({ lang, goal: g.id, findings: [] });
      }
    }
  });

  it('the Spanish model wordings address "you" in the course voice (voseo), never tú', () => {
    const texts = catalogGoals('es').map((g) => catalogModel(g.id, 'es')!.text);
    expect(texts).toContain('¿Creés en Jesús?');
    expect(texts).toContain('Quiero compartir esto con vos.');
    for (const t of texts) expect(t).not.toMatch(/(crees|tienes|eres|quieres|puedes|contigo|tú|tu|ti)/iu);
  });

  it('meaning is judged apart from language: polarity, missing ideas, key-term substitution, English words', () => {
    const es = reg.get('es');
    const notSin = CATALOG_GOALS.find((g) => g.id === 'goal:t.not-understand-sin')!;
    expect(assessMeaning(es, 'es', notSin, 'Entendía mi pecado.').polarity).toBe('missing-negation');
    const believe = CATALOG_GOALS.find((g) => g.id === 'goal:t.believe-jesus')!;
    const swap = assessMeaning(es, 'es', believe, 'Confío en Jesús.');
    expect(swap.missing).toEqual(['believe']);
    expect(swap.otherKeyTerms).toEqual(['trust']);
    const hi = reg.get('hi');
    const mixed = assessMeaning(hi, 'hi', believe, 'मैं Jesus पर विश्वास करता हूँ।');
    expect(mixed.knownLanguageWords).toEqual(['Jesus']);
    expect(mixed.success).toBe(false);
  });
});

describe('the ladder of help', () => {
  it('climbs one smallest step at a time for a missing idea, and ends with the model', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, 'goal:t.believe-jesus');
    expect(t.nextHint).toEqual({ kind: 'restatement', label: HINT_LABEL.restatement });
    await say(w.practice, t.taskId, 'Yo en Jesús.');
    const kinds: string[] = [];
    let task = t;
    for (let i = 0; i < 15; i++) {
      const before = (await w.practice.task('A', t.taskId))!;
      if (!before.nextHint) break;
      task = await w.practice.hint('A', t.taskId);
      const step = task.assistance.at(-1)!;
      expect(step.kind).toBe(before.nextHint.kind); // the label promised what came
      kinds.push(step.kind);
    }
    expect(kinds).toEqual(['conceptual-hint', 'english-cue', 'first-letter-cue', 'lemma-supplied', 'sentence-frame', 'gap-completion', 'recognition-choice', 'full-model']);
    const tiers = task.assistance.map((s) => s.tier);
    expect(tiers).toEqual(['cue', 'cue', 'cue', 'scaffold', 'scaffold', 'scaffold', 'scaffold', 'model']);
    expect(task.assistance.find((s) => s.kind === 'first-letter-cue')!.content).toMatch(/starts with "C…"/i);
    expect(task.assistance.find((s) => s.kind === 'recognition-choice')!.options).toContain('Creo');
    expect(task.nextHint).toBeUndefined();
    expect(task.assistance.at(-1)!.content).toBe('Creo en Jesús.');
  });

  it('the first hint jumps to a frame for a meaning far from his reading (the task still starts free)', async () => {
    const w = await makePracticeWorld();
    const t = await taskFor(w.practice, 'goal:t.saved-by-grace');
    expect(t.assistance).toEqual([]);
    const h = await w.practice.hint('A', t.taskId);
    expect(h.assistance[0].kind).toBe('sentence-frame');
    expect(h.assistance[0].content).toContain('___');
  });

  it('works in Thai and Hindi: graphemes, not code units, and frames over the real segmentation', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'th', ['เชื่อ', 'พระเยซู']);
    const th = await taskFor(w.practice, 'goal:t.believe-jesus', 'th');
    await say(w.practice, th.taskId, 'ฉันในพระเยซู');
    const thTask = await hintToModel(w.practice, 'A', th.taskId);
    expect(thTask.assistance.find((s) => s.kind === 'first-letter-cue')!.content).toContain('"เ…"');
    expect(thTask.assistance.find((s) => s.kind === 'gap-completion')!.content).toBe('ฉัน___ในพระเยซู');
    meet(w, 'A', 'hi', ['विश्वास', 'यीशु']);
    const hi = await taskFor(w.practice, 'goal:t.believe-jesus', 'hi');
    await say(w.practice, hi.taskId, 'मैं यीशु पर करता हूँ।');
    const hiTask = await hintToModel(w.practice, 'A', hi.taskId);
    expect(hiTask.assistance.find((s) => s.kind === 'first-letter-cue')!.content).toContain('"वि…"');
    expect(hiTask.assistance.at(-1)!.content).toMatch(/Masculine forms/);
  });

  it('language problems get "look again" before the correction, one finding at a time', () => {
    const es = reg.get('es');
    const goal = CATALOG_GOALS.find((g) => g.id === 'goal:t.believe-jesus')!;
    const text = 'Yo creer en Jesús.';
    const meaning = assessMeaning(es, 'es', goal, text);
    const language = assessLanguage(es, text);
    const last = { meaning, language, text } as never;
    const first = nextStep({ goal, lang: 'es', adapter: es, last, shown: [] })!;
    expect(first.kind).toBe('issue-flagged');
    expect(first.revealedItemIds).toEqual([]);
    const second = nextStep({ goal, lang: 'es', adapter: es, last, shown: [{ ...first, id: 'h1', at: '' }] })!;
    expect(second.kind).toBe('morphological-correction');
    expect(second.revealedItemIds).toContain('form:es:creo');
  });
});

describe('learner goals', () => {
  it('accepts a meaning whose ideas GoTell can recognise, refuses one it cannot assess', async () => {
    const w = await makePracticeWorld();
    const ok = await w.practice.defineGoal('A', 'es', { meaning: 'I trust God now.' });
    expect(ok.ok && ok.goal.components.map((c) => c.concept)).toEqual(['trust', 'jesus', 'now']);
    const again = await w.practice.defineGoal('A', 'es', { meaning: 'I trust  God now.' });
    expect(again.ok && ok.ok && again.goal.id === ok.goal.id).toBe(true);
    expect((await w.events(['TellGoalDefined'])).length).toBe(1);
    const no = await w.practice.defineGoal('A', 'es', { meaning: 'I like pizza.' });
    expect(no.ok).toBe(false);
    expect(learnerGoal({ meaning: "I didn't understand grace" }, 'A').ok && (learnerGoal({ meaning: "I didn't understand grace" }, 'A') as { goal: { negated: boolean } }).goal.negated).toBe(true);
    // offered for practice, with no catalog model: the ladder ends earlier, honestly
    const goals = await w.practice.goals('A', 'es');
    expect(goals.some((g) => g.source === 'learner')).toBe(true);
  });
});

describe('spontaneous use (P7) and the testimony map', () => {
  it('his own testimony sentence promotes to P7; a copied model or a suggested sentence does not', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús', 'cambió', 'vida']);
    // the model for "Jesus changed my life" is shown in practice, then typed into the testimony: copied, not spontaneous
    const t = await taskFor(w.practice, 'goal:t.jesus-changed-me');
    const shown = await hintToModel(w.practice, 'A', t.taskId);
    await w.practice.close('A', t.taskId);
    const g = w.gotell.forUser('A');
    const testimony = await g.getOrCreateTestimony('A', 'es');
    await g.acceptRevision(testimony.id, `${shown.assistance.at(-1)!.content} Creo en Jesús desde niño.`);
    const states = await w.practice.states('A', 'es');
    expect(states.find((s) => s.goalId === 'goal:t.jesus-changed-me')!.level).toBe(0);
    const believe = states.find((s) => s.goalId === 'goal:t.believe-jesus')!;
    expect(believe.level).toBe(7);
    expect(believe.spontaneous?.text).toBe('Creo en Jesús desde niño.');
    expect(believe.rule).toMatch(/^P7/);

    const map = await w.practice.testimonyMap('A', 'es');
    const node = map.nodes.find((n) => n.goal.id === 'goal:t.believe-jesus')!;
    expect(node.inTestimony[0]).toMatchObject({ own: true, text: 'Creo en Jesús desde niño.' });
    const short = map.deliveries.find((d) => d.length === 'short')!;
    expect(short.inTestimony).toContain('goal:t.believe-jesus');
    expect(short.inTestimony).toContain('goal:t.jesus-changed-me'); // the sentence is in his testimony …
    expect(short.canSayAlone).not.toContain('goal:t.jesus-changed-me'); // … but he has not shown he can say it alone
    expect(map.nodes.map((n) => n.goal.order)).toEqual([...map.nodes.map((n) => n.goal.order)].sort((a, b) => a! - b!));
  });
});

describe('GoTell → GoLearn', () => {
  it('failed attempts report the met items for the missing idea; an independent success clears them', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, 'goal:t.believe-jesus');
    const fail = (await say(w.practice, t.taskId, 'Yo en Jesús.')).attempt;
    expect(fail.gapItemIds).toEqual(['form:es:creo']);
    const ctx = { bus: w.bus, clock: w.now };
    expect([...(await productiveGaps(ctx, 'A'))]).toEqual(['form:es:creo']);
    expect([...(await productiveGaps(ctx, 'B'))]).toEqual([]);
    await w.practice.close('A', t.taskId);
    w.jumpMinutes(45);
    const t2 = await taskFor(w.practice, 'goal:t.believe-jesus');
    await say(w.practice, t2.taskId, 'Creo en Jesús.');
    expect([...(await productiveGaps(ctx, 'A'))]).toEqual([]);
    expect(((await w.events(['TellAttemptSubmitted'])) as TellAttemptSubmitted[])).toHaveLength(2);

    // gaps older than the window are forgotten
    const v = await makePracticeWorld();
    meet(v, 'A', 'es', ['creo', 'jesús']);
    const u = await taskFor(v.practice, 'goal:t.believe-jesus');
    await say(v.practice, u.taskId, 'Yo en Jesús.');
    v.jumpDays(22);
    expect([...(await productiveGaps({ bus: v.bus, clock: v.now }, 'A'))]).toEqual([]);
  });
});
