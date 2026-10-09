import { describe, expect, it } from 'vitest';
import { PACKS } from '../../packages/language-packs/src';
import { PROMPTS, constructionKeysOf, guidanceFor, guidancePackFor, promptById, promptsFor, selectPrompt, weakTargetsOf } from '../../packages/gotell/src/prompts';
import type { GuidancePack } from '../../packages/gotell/src/prompts';
import { profile } from './helpers';

const sqPack = guidancePackFor('sq');
const get = (id: string) => promptById(id)!;

describe('guidance', () => {
  it('for a first-sentences writer gives a pattern and familiar words, and no model paragraph', () => {
    const p = get('personal-background.describe-family.sq');
    const g = guidanceFor(p, profile({ productive: ['lemma:sq:nënë:NOUN', 'lemma:sq:shtëpi:NOUN', 'lemma:sq:ujë:NOUN', 'lemma:sq:libër:NOUN'] }), sqPack);
    expect(g.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(g.suggestions.length).toBeLessThanOrEqual(3);
    expect(g.suggestions[0]).toMatch(/pattern/i);
    expect(g.suggestions[0]).toMatch(/Ana pi ujë\./); // the pack's own tutorial example, quoted as a pattern
    expect(g.suggestions[1]).toMatch(/nënë/);
    expect(g.lead.split(/[.!?]/).filter(Boolean)).toHaveLength(1);
    // vocabulary: only family and home words match the prompt's domains
    expect(g.vocabulary.map((v) => v.label)).toEqual(['nënë', 'shtëpi']);
    // no paragraph-length text anywhere, and no sentence of Albanian of its own
    for (const s of [g.lead, ...g.suggestions]) expect(s.length, s).toBeLessThan(330);
    expect(g.honesty.join(' ')).toMatch(/your own record/);
    expect(g.honesty.join(' ')).toMatch(/machine-drafted/);
    expect(g.honesty.join(' ')).toMatch(/nothing here is a model answer/);
  });

  it('never offers a word the writer has only read', () => {
    const p = get('personal-background.describe-family.sq');
    const g = guidanceFor(p, profile({ productive: [], recognisedOnly: ['lemma:sq:nënë:NOUN'] }), sqPack);
    expect(g.vocabulary).toEqual([]);
    expect(g.suggestions.join(' ')).not.toMatch(/nënë/);
    expect(g.suggestions[1]).toMatch(/no words you have used yourself/);
  });

  it('picks the describing pattern for a prompt that targets the linking article', () => {
    const g = guidanceFor(get('general.compare-situations.sq'), profile(), sqPack);
    expect(g.suggestions[0]).toMatch(/Shkolla është e bukur\./);
  });

  it('for a short-paragraph writer notes weak targets of the prompt', () => {
    const p = get('mission-communication.explain-belief.sq'); // negation-nuk, linking-article-adjective
    const g = guidanceFor(p, profile({ band: { level: 'short-paragraph', basis: ['x'] }, weakConstructions: ['syntax:sq:negation-nuk'], recurringErrors: ['agreement', 'case'] }), sqPack);
    expect(g.watchFor.map((w) => w.constructionId)).toEqual(['negation-nuk']);
    expect(g.watchFor[0].why).toMatch(/more misses than hits/);
    expect(g.watchFor[0].why).toMatch(/machine-drafted/);
    expect(g.watchFor[0].why).toContain(PACKS.sq.grammar.constructions.find((c) => c.id === 'negation-nuk')!.explain);
    expect(g.suggestions[0]).toMatch(/negation-nuk/);
    expect(g.suggestions.join(' ')).toMatch(/agreement, case/);
    expect(g.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('only flags weak constructions that are among the prompt’s targets', () => {
    const p = get('general.narrate-event.sq'); // Tense
    const g = guidanceFor(p, profile({ band: { level: 'short-paragraph', basis: ['x'] }, weakConstructions: ['syntax:sq:negation-nuk', 'morph:sq:VERB:Mood=Ind|Tense=Pres'] }), sqPack);
    expect(g.watchFor.map((w) => w.constructionId)).toEqual(['Tense']);
  });

  it('for a connected-paragraphs writer gives linking and register notes', () => {
    const g = guidanceFor(get('testimony.faith-now'), profile({ band: { level: 'connected-paragraphs', basis: ['x'] } }), guidancePackFor('es'));
    expect(g.suggestions.join(' ')).toMatch(/Link your sentences/);
    expect(g.suggestions.join(' ')).toMatch(/register/);
    expect(g.watchFor).toEqual([]);
    expect(g.vocabulary).toEqual([]); // the pack cannot tell
  });

  it('works with a bare pack that knows nothing', () => {
    const bare: GuidancePack = { explainConstruction: () => undefined, explainFeature: () => undefined };
    const g = guidanceFor(get('general.narrate-event.sq'), profile({ weakConstructions: ['morph:sq:VERB:Tense=Past'], productive: ['lemma:sq:ujë:NOUN'] }), bare);
    expect(g.watchFor).toHaveLength(1);
    expect(g.watchFor[0].why).not.toMatch(/pack’s note/);
    expect(g.suggestions.length).toBeGreaterThan(0);
  });

  it('never produces a model paragraph or a level label for any prompt, language or band', () => {
    for (const level of ['first-sentences', 'short-paragraph', 'connected-paragraphs'] as const) {
      for (const p of PROMPTS) {
        const g = guidanceFor(p, profile({ band: { level, basis: [] }, productive: ['lemma:sq:nënë:NOUN'], weakConstructions: ['syntax:sq:negation-nuk'] }), guidancePackFor(p.languageIds[0] === '*' ? 'sq' : p.languageIds[0]));
        const all = [g.lead, ...g.suggestions, ...g.honesty, ...g.watchFor.map((w) => w.why)];
        expect(g.suggestions.length).toBeLessThanOrEqual(3);
        for (const s of [g.lead, ...g.suggestions]) expect(s.length, `${p.promptId}: ${s}`).toBeLessThan(420);
        expect(all.join(' ')).not.toMatch(/CEFR|\b[ABC][12]\b/);
      }
    }
  });
});

describe('construction keys', () => {
  it('maps unit ids to prompt target keys', () => {
    expect(constructionKeysOf('syntax:sq:negation-nuk')).toEqual(['negation-nuk']);
    expect(constructionKeysOf('morph:sq:NOUN:Case=Acc|Definite=Def|Number=Sing')).toEqual(expect.arrayContaining(['Case', 'Definite', 'Number', 'definite-accusative-singular']));
    expect(constructionKeysOf('morph:sq:NOUN:Definite=Def|Number=Plur')).toContain('definite-plural');
    expect(constructionKeysOf('lemma:sq:libër:NOUN')).toEqual([]);
    expect(weakTargetsOf(get('personal-background.describe-interests.sq'), profile({ weakConstructions: ['morph:sq:NOUN:Case=Acc|Definite=Def|Number=Sing'] }))).toEqual(['definite-accusative-singular']);
  });
});

describe('selectPrompt', () => {
  const rnd = () => 0;
  const sq = promptsFor({ languageId: 'sq', mode: 'free' });

  it('prefers a prompt whose grammar targets overlap the writer’s weak constructions, and says so', () => {
    const w = profile({ weakConstructions: ['syntax:sq:negation-nuk'], band: { level: 'short-paragraph', basis: [] } });
    const s = selectPrompt(sq, w, 'free', { random: rnd })!;
    expect(s.prompt.grammarTargets).toContain('negation-nuk');
    expect(s.basis).toBe('weak-construction');
    expect(s.reason).toMatch(/negation-nuk/);
    expect(s.reason).toMatch(/harder for you/);
  });

  it('then prefers prompts not yet seen', () => {
    const w = profile({ weakConstructions: ['syntax:sq:negation-nuk'] });
    const first = selectPrompt(sq, w, 'free', { random: rnd })!;
    const second = selectPrompt(sq, w, 'free', { random: rnd, avoid: [first.prompt.promptId] })!;
    expect(second.prompt.promptId).not.toBe(first.prompt.promptId);
    const seenAll = selectPrompt(sq, profile(), 'free', { random: rnd, avoid: sq.map((p) => p.promptId) })!;
    expect(seenAll.basis).toBe('revisit');
    expect(seenAll.reason).toMatch(/already seen/);
    const none = selectPrompt(sq, profile(), 'free', { random: rnd })!;
    expect(none.basis).toBe('unseen');
    expect(none.reason).toMatch(/Chosen/);
  });

  it('with no weakness, avoids seen prompts and states why', () => {
    const s = selectPrompt(sq, profile(), 'free', { random: rnd, avoid: ['personal-background.introduce-self.sq'] })!;
    expect(s.prompt.promptId).not.toBe('personal-background.introduce-self.sq');
    expect(s.basis).toBe('unseen');
    expect(s.reason).toMatch(/not tried it yet/);
  });

  it('respects the mode and the writer’s band, and uses the random source', () => {
    const t = selectPrompt(PROMPTS, profile({ languageId: 'es' }), 'testimony', { random: rnd })!;
    expect(['testimony', 'scripture-theology', 'personal-background', 'mission-communication']).toContain(t.prompt.category);
    expect(t.prompt.languageIds).toContain('*');
    expect(t.prompt.difficulty).toBe('first-sentences'); // matches the writer's band when one exists
    const a = selectPrompt(PROMPTS, profile({ languageId: 'es' }), 'free', { random: () => 0 })!;
    const b = selectPrompt(PROMPTS, profile({ languageId: 'es' }), 'free', { random: () => 0.999 })!;
    expect(a.prompt.promptId).not.toBe(b.prompt.promptId);
  });

  it('returns nothing when no prompt fits', () => {
    expect(selectPrompt([], profile(), 'free', { random: rnd })).toBeUndefined();
    expect(selectPrompt(PROMPTS.filter((p) => p.category === 'general'), profile(), 'testimony', { random: rnd })).toBeUndefined();
  });
});
