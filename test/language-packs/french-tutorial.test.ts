// @vitest-environment node
/**
 * The French orientation and its optional Decoding Sprint: structure only. That every example word is read by the real French
 * analyser is checked by the pack-wide tests once the adapter is registered; nothing here claims the text is natural French.
 */
import { describe, expect, it } from 'vitest';
import { FR_ALPHABET_ROWS, FR_PASSAGE, FR_TUTORIAL } from '../../packages/language-packs/src/tutorial/fr';
import type { TutorialStepKind } from '../../packages/language-packs/src/tutorial/types';
import { FR_TUTORIAL_MINUTES, FR_TUTORIAL_REF, frenchManifest } from '../../packages/language-packs/src/packs/fr';

const KINDS: TutorialStepKind[] = ['alphabet', 'sounds', 'words', 'patterns', 'passage', 'concept', 'practice'];
const step = (id: string) => {
  const s = FR_TUTORIAL.steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};

describe('FR_TUTORIAL', () => {
  it('has its ref, a computed length, and is skippable, machine-drafted and unreviewed', () => {
    expect(FR_TUTORIAL.ref).toBe('tutorial/fr');
    expect(FR_TUTORIAL.languageId).toBe('fr');
    expect(FR_TUTORIAL.estimatedMinutes).toBe(FR_TUTORIAL.steps.reduce((n, s) => n + s.estimatedMinutes, 0));
    expect(FR_TUTORIAL.estimatedMinutes).toBeGreaterThan(0);
    expect(FR_TUTORIAL).toMatchObject({ skippable: true, authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker' });
    expect(FR_TUTORIAL.notice).toMatch(/drafted by an AI model and has not been checked by a native speaker/);
    expect(FR_TUTORIAL.notice).toMatch(/skip it/);
    expect(JSON.stringify(FR_TUTORIAL)).not.toMatch(/native[- ]speaker[- ](verified|reviewed|approved|validated)/i);
  });

  it('opens with select, card and the practice lookup on the validation sentence, and closes with the honesty and sound steps', () => {
    expect(FR_TUTORIAL.steps.slice(0, 3).map((s) => s.id)).toEqual(['select-a-word', 'what-the-card-shows', 'practice-lookup']);
    const p = step('practice-lookup').practice!;
    expect(p).toMatchObject({ sentence: 'Elle lit un livre.', target: 'livre' });
    expect(p.sentence).toContain(p.target);
    const ids = FR_TUTORIAL.steps.map((s) => s.id);
    expect(ids).toContain('honesty-experimental');
    expect(ids[ids.length - 1]).toBe('sound-and-audio');
    expect(step('honesty-experimental').body).toMatch(/3,400 lemmas/);
    expect(step('honesty-experimental').body).toMatch(/not checked by a native speaker/);
    expect(step('sound-and-audio').body).toMatch(/no recordings/);
  });

  it('has the six sprint stages, in order, each a step the types allow', () => {
    const ids = FR_TUTORIAL.steps.map((s) => s.id).filter((id) => id.startsWith('sprint-'));
    expect(ids).toEqual(['sprint-1-recognition', 'sprint-2-vowels', 'sprint-3-silent', 'sprint-4-liaison', 'sprint-5-elision', 'sprint-6-read-now']);
    for (const [i, id] of ids.entries()) expect(step(id).title).toMatch(new RegExp(`stage ${i + 1}\\b`));
    for (const s of FR_TUTORIAL.steps) expect(KINDS, s.id).toContain(s.kind);
  });

  it('says the sprint is optional, and that regional French differs and rules are "usually"', () => {
    expect(step('sprint-1-recognition').body).toMatch(/optional/);
    expect(step('sprint-1-recognition').body).toMatch(/skip all of it and start reading real pages at once/);
    expect(step('sprint-2-vowels').body).toMatch(/Québec, Belgium and Switzerland/);
    expect(step('sprint-2-vowels').body).toMatch(/Usually/);
    expect(step('sprint-4-liaison').body).toMatch(/described here, not heard/);
    expect(step('sprint-4-liaison').body).toMatch(/aspirated h/);
  });

  it('is plain text with unique ids, positive minutes and non-trivial bodies', () => {
    expect(new Set(FR_TUTORIAL.steps.map((s) => s.id)).size).toBe(FR_TUTORIAL.steps.length);
    for (const s of FR_TUTORIAL.steps) {
      expect(s.body, s.id).not.toMatch(/[*_#`]|\]\(|<\w+>/);
      expect(s.body.length, s.id).toBeGreaterThan(40);
      expect(s.estimatedMinutes, s.id).toBeGreaterThan(0);
      for (const e of s.examples ?? []) expect(e.gloss.length, `${s.id}: ${e.surface}`).toBeGreaterThan(0);
    }
  });

  it('keeps stage 1 to the expressions asked for, and stage 4 to the liaison cases', () => {
    const s1 = step('sprint-1-recognition').examples!.map((e) => e.surface).join(' | ');
    for (const w of ['Bonjour', 'Merci', 'Salut', 'Oui', 'Non', 'Je suis', 'C\'est', 'Je veux', 'Je ne sais pas', 'Comment ça va ?']) expect(s1, w).toContain(w);
    const s4 = step('sprint-4-liaison').examples!.map((e) => e.surface);
    for (const w of ['les amis', 'nous avons', 'vous êtes', 'un enfant', 'et elle', 'les héros']) expect(s4, w).toContain(w);
    const s5 = step('sprint-5-elision').body;
    for (const w of ['l\'homme', 'j\'aime', 'c\'est', 'qu\'il', 'n\'est', 'au', 'aux', 'du', 'des']) expect(s5, w).toContain(w);
  });

  it('has a passage of 5 to 7 own sentences, each with a gloss, flagged machine-drafted', () => {
    const p = step('sprint-6-read-now').passage!;
    expect(p).toBe(FR_PASSAGE);
    expect(p).toMatchObject({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker' });
    expect(p.sentences.length).toBeGreaterThanOrEqual(5);
    expect(p.sentences.length).toBeLessThanOrEqual(7);
    for (const s of p.sentences) {
      expect(s.text.length).toBeGreaterThan(5);
      expect(s.gloss.length).toBeGreaterThan(5);
    }
  });

  it('has exactly one practice lookup, so the sprint adds none', () => {
    expect(FR_TUTORIAL.steps.filter((s) => s.practice).map((s) => s.id)).toEqual(['practice-lookup']);
  });
});

describe('FR_ALPHABET_ROWS', () => {
  it('has at least 55 rows with unique glyphs and non-empty backs', () => {
    expect(FR_ALPHABET_ROWS.length).toBeGreaterThanOrEqual(55);
    const glyphs = FR_ALPHABET_ROWS.map((r) => r[0]);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    for (const [g, back] of FR_ALPHABET_ROWS) {
      expect(g.trim().length, g).toBeGreaterThan(0);
      expect(back.trim().length, g).toBeGreaterThan(5);
    }
  });
  it('holds the 26 letters, the accented letters and ligatures, and the spelling patterns of stages 2 and 3', () => {
    const glyphs = new Set(FR_ALPHABET_ROWS.map((r) => r[0]));
    for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect([...glyphs].some((x) => x.startsWith(`${l} `)), l).toBe(true);
    for (const l of ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'ù', 'û', 'ü', 'ç', 'œ', 'æ']) expect(glyphs.has(l), l).toBe(true);
    for (const p of ['ou', 'oi', 'au', 'eau', 'ai', 'ei', 'eu', 'œu', 'an / en', 'on', 'in / ain / ein', 'un', 'gn', 'ch', 'ph', 'th', 'qu', 'ill', 'final -e']) expect(glyphs.has(p), p).toBe(true);
    expect([...glyphs].some((x) => x.startsWith('final d'))).toBe(true);
  });
});

describe('the pack names its orientation by constants (the manifest does not import the tutorial text)', () => {
  it('the constants are the reference and length of the tutorial itself, and the manifest carries them', () => {
    expect(FR_TUTORIAL_REF).toBe(FR_TUTORIAL.ref);
    expect(FR_TUTORIAL_MINUTES).toBe(FR_TUTORIAL.estimatedMinutes);
    expect(frenchManifest().tutorial).toEqual({ ref: FR_TUTORIAL.ref, estimatedMinutes: FR_TUTORIAL.estimatedMinutes, skippable: true });
  });
});
