import { describe, expect, it } from 'vitest';
import { PACKS, TEAMS } from '../../packages/language-packs/src';
import { MODE_CATEGORIES, PROMPTS, promptById, promptsFor, validatePrompt, validateRegistry } from '../../packages/gotell/src/prompts';
import { PROMPT_CATEGORIES, WRITING_MODES } from '../../packages/gotell/src/types';
import type { WritingPrompt } from '../../packages/gotell/src/types';

const neutral = PROMPTS.filter((p) => p.languageIds.includes('*'));
const count = (c: string, list: WritingPrompt[] = neutral) => list.filter((p) => p.category === c).length;

describe('registry', () => {
  it('every prompt validates and ids are unique', () => {
    expect(validateRegistry()).toEqual([]);
    for (const p of PROMPTS) expect(validatePrompt(p), p.promptId).toEqual([]);
    expect(new Set(PROMPTS.map((p) => p.promptId)).size).toBe(PROMPTS.length);
  });

  it('has at least the required prompts per category', () => {
    expect(count('personal-background')).toBeGreaterThanOrEqual(5);
    expect(count('mission-communication')).toBeGreaterThanOrEqual(5);
    expect(count('testimony')).toBeGreaterThanOrEqual(6);
    expect(count('scripture-theology')).toBeGreaterThanOrEqual(6);
    expect(count('general')).toBeGreaterThanOrEqual(5);
    expect(neutral.length).toBeGreaterThanOrEqual(27);
    for (const c of PROMPT_CATEGORIES) expect(count(c, PROMPTS)).toBeGreaterThan(0);
  });

  it('carries the listed topics', () => {
    for (const id of [
      'personal-background.introduce-self', 'personal-background.describe-family', 'personal-background.explain-education', 'personal-background.describe-interests', 'personal-background.explain-travel',
      'mission-communication.why-team-visiting', 'mission-communication.describe-work', 'mission-communication.express-gratitude', 'mission-communication.explain-belief', 'mission-communication.introduce-church-activity',
      'testimony.early-life', 'testimony.initial-understanding', 'testimony.understanding-of-sin', 'testimony.understanding-of-christ', 'testimony.a-change', 'testimony.faith-now',
      'scripture-theology.summarise-passage', 'scripture-theology.forgiveness', 'scripture-theology.repentance', 'scripture-theology.grace', 'scripture-theology.prayer', 'scripture-theology.christian-hope',
      'general.narrate-event', 'general.describe-yesterday', 'general.explain-decision', 'general.compare-situations', 'general.future-intention',
    ]) expect(promptById(id), id).toBeDefined();
  });

  it('every prompt is machine-drafted, unreviewed and says who must review it', () => {
    for (const p of PROMPTS) {
      expect(p.validation.authorship).toBe('machine-drafted');
      expect(p.validation.reviewed).toBe(false);
      expect(p.validation.reviewNeeded).toBe('native speaker / field worker');
    }
  });

  it('Albanian variants use real pack constructions and attested frames; neutral prompts carry none', () => {
    const sq = PROMPTS.filter((p) => p.languageIds.includes('sq'));
    expect(sq.length).toBeGreaterThanOrEqual(15);
    const known = new Set([...PACKS.sq.grammar.constructions.map((c) => c.id), ...PACKS.sq.grammar.features.map((f) => f.key)]);
    for (const p of sq) {
      expect(p.teams).toEqual(['albania']);
      expect(p.promptId.endsWith('.sq')).toBe(true);
      expect(p.grammarTargets.length).toBeGreaterThan(0);
      for (const t of p.grammarTargets) expect(known.has(t), t).toBe(true);
      expect(Object.keys(TEAMS)).toContain(p.teams[0]);
    }
    expect(sq.some((p) => (p.frames?.length ?? 0) > 0)).toBe(true);
    for (const p of neutral) { expect(p.grammarTargets).toEqual([]); expect(p.frames).toBeUndefined(); }
  });

  it('the validator rejects an invented frame, a level label, a first-person instruction and an ordered section', () => {
    const base = PROMPTS.find((p) => p.promptId === 'general.compare-situations.sq')!;
    expect(validatePrompt({ ...base, frames: ['Unë shkoj në ___.'] }).join()).toMatch(/not match a sentence attested/);
    expect(validatePrompt({ ...base, instruction: 'Write at B1 level.' }).join()).toMatch(/level label/);
    expect(validatePrompt({ ...base, instruction: 'Describe my life.' }).join()).toMatch(/first person/);
    expect(validatePrompt({ ...base, grammarTargets: ['no-such-thing'] }).join()).toMatch(/not a sq construction/);
    expect(validatePrompt({ ...base, section: 'step-2' }).join()).toMatch(/plain topic tag/);
    expect(validatePrompt({ ...base, validation: { authorship: 'machine-drafted', reviewed: true } }).join()).toMatch(/cannot be marked reviewed/);
    const neu = PROMPTS.find((p) => p.promptId === 'general.narrate-event')!;
    expect(validatePrompt({ ...neu, grammarTargets: ['Tense'] }).join()).toMatch(/language-neutral/);
  });

  it('no prompt text carries a CEFR label', () => {
    const text = JSON.stringify(PROMPTS);
    expect(text).not.toMatch(/CEFR/);
    expect(text).not.toMatch(/\b[ABC][12]\b/);
  });

  it('cultural notes for Albania are short and neutral', () => {
    const notes = [...new Set(PROMPTS.flatMap((p) => p.culturalNotes))];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.length).toBeLessThan(330);
    const all = notes.join(' ');
    expect(all).toMatch(/Muslim, Orthodox Christian, Catholic and Bektashi/);
    expect(all).toMatch(/do not assume/i);
  });
});

describe('promptsFor', () => {
  it('filters by language', () => {
    const es = promptsFor({ languageId: 'es', mode: 'free' });
    expect(es.length).toBe(neutral.length);
    expect(es.every((p) => p.languageIds.includes('*'))).toBe(true);
    const sq = promptsFor({ languageId: 'sq', mode: 'free' });
    expect(sq.some((p) => p.promptId.endsWith('.sq'))).toBe(true);
  });

  it('shows the Albanian variant in place of its neutral base', () => {
    const ids = promptsFor({ languageId: 'sq', mode: 'free' }).map((p) => p.promptId);
    expect(ids).toContain('personal-background.introduce-self.sq');
    expect(ids).not.toContain('personal-background.introduce-self');
    expect(ids).toContain('personal-background.explain-education.sq'); // has a variant
    expect(ids).toContain('testimony.understanding-of-sin'); // has none, so the neutral prompt stays
  });

  it('filters by team', () => {
    expect(promptsFor({ languageId: 'sq', teamId: 'albania', mode: 'free' }).length).toBe(promptsFor({ languageId: 'sq', mode: 'free' }).length);
    const hn = promptsFor({ languageId: 'sq', teamId: 'honduras', mode: 'free' });
    expect(hn.every((p) => !p.promptId.endsWith('.sq'))).toBe(true);
    expect(hn.length).toBeGreaterThan(0);
  });

  it('filters by mode and category', () => {
    const t = promptsFor({ languageId: 'es', mode: 'testimony' });
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((p) => MODE_CATEGORIES.testimony.includes(p.category))).toBe(true);
    expect(t.some((p) => p.category === 'general')).toBe(false);
    const g = promptsFor({ languageId: 'es', mode: 'free', category: 'general' });
    expect(g).toHaveLength(5);
    expect(g.every((p) => p.category === 'general')).toBe(true);
    for (const m of WRITING_MODES) expect(promptsFor({ languageId: 'es', mode: m }).length, m).toBeGreaterThan(0);
  });

  it('promptById finds and misses', () => {
    expect(promptById('general.narrate-event')?.category).toBe('general');
    expect(promptById('nope')).toBeUndefined();
  });
});

describe('testimony prompts: optional, any order, no invented experience', () => {
  const testimony = PROMPTS.filter((p) => p.category === 'testimony');
  const FIRST_PERSON = /\b(?:I|I’m|I'm|me|my|mine|we|our|us)\b/;

  it('carry a topic tag and no position or order', () => {
    expect(testimony.length).toBeGreaterThanOrEqual(6);
    for (const p of testimony) {
      expect(p.section, p.promptId).toBeDefined();
      expect(p.section).toMatch(/^[a-z][a-z-]*$/);
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(['order']));
      expect(Object.keys(p).some((k) => /^(order|step|index|position|sequence|requires|after|before)$/i.test(k))).toBe(false);
      expect(p.instruction).not.toMatch(/\b(?:first,|then,|next,|finally|step \d|part \d)\b/i);
    }
    const base = testimony.filter((p) => p.languageIds.includes('*'));
    expect(new Set(base.map((p) => p.section)).size).toBe(base.length);
  });

  it('say they are optional', () => {
    for (const p of testimony) {
      expect(p.instruction).toMatch(/Write what is true for you; skip what does not apply\./);
    }
  });

  it('are usable in any order: mode results do not depend on registry order', () => {
    const a = promptsFor({ languageId: 'es', mode: 'testimony' }).map((p) => p.promptId).sort();
    const reversed = promptsFor({ languageId: 'es', mode: 'testimony' }, [...PROMPTS].reverse()).map((p) => p.promptId).sort();
    expect(reversed).toEqual(a);
    for (const p of promptsFor({ languageId: 'es', mode: 'testimony' })) expect(validatePrompt(p)).toEqual([]);
  });

  it('contain no first-person experience text and no frames', () => {
    for (const p of [...testimony, ...PROMPTS.filter((q) => q.category === 'scripture-theology')]) {
      for (const text of [p.goal, p.instruction, ...p.culturalNotes]) expect(text, `${p.promptId}: ${text}`).not.toMatch(FIRST_PERSON);
      expect(p.frames).toBeUndefined();
    }
  });

  it('Scripture prompts ask for the writer’s own understanding and supply no doctrine', () => {
    for (const p of PROMPTS.filter((q) => q.category === 'scripture-theology')) {
      expect(p.instruction, p.promptId).toMatch(/your own|you choose|as you understand|to you/i);
      expect(p.instruction).not.toMatch(/\b(?:is defined as|means that God|the Bible teaches that)\b/i);
    }
  });
});
