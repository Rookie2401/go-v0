/**
 * Stage 0 rules on small synthetic packs: every validator check fires when it should, romanization fades by evidence and
 * retires for good, answer keys cannot contradict the decoder, and answer matching is forgiving only where it should be.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { StoreEventBus, createMemoryStore } from '../../src/core';
import type { Stage0DecodeAnswered, Stage0Scene } from '../../src/core';
import { createStage0, foldStage0, matchAnswer, packsFrom, validatePack } from '../../src/stage0';

const reg = createAdapterRegistry();
const PROV = { authoring: 'ai-drafted', drafter: 'test', review: { status: 'unreviewed' } };
const A = { status: 'needed' };
const world = { version: 1, characters: [{ id: 'ana', role: '', names: { es: 'Ana', hi: 'मीरा' } }], places: [], things: [], arc: [] };

function pack(lang: 'es' | 'hi', files: Record<string, unknown>) {
  const mods: Record<string, unknown> = { '../../data/stage0/world.json': world };
  for (const [k, v] of Object.entries(files)) mods[`../../data/stage0/${lang}/${k}.json`] = v;
  return packsFrom(mods);
}
const esScene = (id: string, lines: Array<[string, string]>, extra: Partial<Stage0Scene> = {}) => ({
  id, lang: 'es', kind: 'scene', version: 1, title: { en: id }, world: { characters: [] }, listening: true, provenance: PROV,
  lines: lines.map(([text, en], i) => ({ id: `l${i + 1}`, text, en, audio: A })),
  introduces: { words: [], constructions: [] }, represents: [],
  checks: [{ id: 'c1', lines: ['l1'], kind: 'meaning-choice', question: { en: 'q' }, options: [{ en: 'a' }, { en: 'b' }], answer: 0 }],
  ...extra,
});
const codes = (issues: Array<{ severity: string; code: string }>) => issues.filter((i) => i.severity === 'error').map((i) => i.code);

describe('Stage 0 validator', () => {
  const minimalExit = { id: 'es-exit-a', provenance: PROV, reading: { lines: [{ id: 'r1', text: 'Ana tiene agua.', en: 'x', audio: A }], checks: [{ id: 'q', lines: ['r1'], kind: 'meaning-choice', question: { en: 'q' }, options: [{ en: 'a' }, { en: 'b' }], answer: 0 }] }, listening: { lines: [], checks: [] }, writing: [{ id: 'w1', kind: 'recall', prompt: 'p', basedOn: [], accept: [{ text: 'Hola' }] }, { id: 'w2', kind: 'recall', prompt: 'p', basedOn: [], accept: [{ text: 'Hola' }] }], speaking: [{ id: 'sp', prompt: 'p', model: 'Hola' }] };
  const path = (steps: unknown[]) => ({ lang: 'es', version: 1, steps, next: [] });

  it('a clean small pack has no errors', () => {
    const { packs } = pack('es', {
      'scenes/es-a': esScene('es-a', [['Ana tiene agua.', 'Ana has water.'], ['Ana bebe agua.', 'Ana drinks water.']]),
      'exit/es-exit-a': { ...minimalExit, reading: { ...minimalExit.reading, lines: [{ id: 'r1', text: 'Ana bebe agua, Ana tiene agua.', en: 'x', audio: A }] } },
      path: path([{ id: 'a', kind: 'scene', ref: 'es-a' }, { id: 'exit', kind: 'exit' }]),
      coverage: { entries: [] },
    });
    expect(codes(validatePack(packs.get('es')!, reg.get('es'), world as never))).toEqual([]);
  });

  it('catches duplicates, broken references, missing English, unreviewed claims, an early scene with too many new words, and exit material that is not unseen', () => {
    const big = esScene('es-a', [['Ana tiene agua, café, pan, arroz, una mesa y una llave.', 'x'], ['', '']]);
    const { packs } = pack('es', {
      'scenes/es-a': { ...big, provenance: { ...PROV, review: { status: 'reviewed' } }, checks: [{ id: 'c1', lines: ['l9'], kind: 'meaning-choice', question: { en: 'q' }, options: [{ en: 'a' }], answer: 3 }] },
      'scenes/es-b': esScene('es-a', [['Hola.', 'Hello.']]),
      'exit/es-exit-a': { ...minimalExit, reading: { ...minimalExit.reading, lines: [{ id: 'r1', text: 'Ana tiene agua, café, pan, arroz, una mesa y una llave.', en: 'x', audio: A }] } },
      path: path([{ id: 'a', kind: 'scene', ref: 'es-a' }, { id: 'b', kind: 'scene', ref: 'missing' }, { id: 'exit', kind: 'exit' }]),
      coverage: { entries: [] },
    });
    const c = codes(validatePack(packs.get('es')!, reg.get('es'), world as never));
    for (const code of ['missing-support', 'missing-field', 'review-without-reviewer', 'stale-review', 'broken-reference', 'invalid-value', 'too-many-new-words', 'not-unseen']) expect(c, code).toContain(code);
  });

  it('catches a construction before its prerequisite unless it is marked intentional', () => {
    const coverage = { entries: [{ id: 'x.a', kind: 'grammar', label: 'a', prerequisites: [] }, { id: 'x.b', kind: 'grammar', label: 'b', prerequisites: ['x.a'] }] };
    const mk = (intentional: string[]) => pack('es', {
      'scenes/es-a': esScene('es-a', [['Ana tiene agua.', 'x']], { represents: ['x.b'], intentional }),
      'exit/es-exit-a': { ...minimalExit, reading: { ...minimalExit.reading, lines: [{ id: 'r1', text: 'Ana tiene agua, agua.', en: 'x', audio: A }] } },
      path: path([{ id: 'a', kind: 'scene', ref: 'es-a' }, { id: 'exit', kind: 'exit' }]), coverage,
    }).packs.get('es')!;
    expect(codes(validatePack(mk([]), reg.get('es'), world as never))).toContain('prerequisite-missing');
    expect(codes(validatePack(mk(['x.b']), reg.get('es'), world as never))).not.toContain('prerequisite-missing');
  });

  it('catches the language checker objecting to a line', () => {
    const { packs } = pack('es', {
      'scenes/es-a': esScene('es-a', [['Yo tiene agua.', 'x']]),
      'exit/es-exit-a': minimalExit,
      path: path([{ id: 'a', kind: 'scene', ref: 'es-a' }, { id: 'exit', kind: 'exit' }]), coverage: { entries: [] },
    });
    expect(codes(validatePack(packs.get('es')!, reg.get('es'), world as never))).toContain('checker-finding');
  });

  it('Hindi: an answer key that contradicts the decoder is refused; romanization that never retires is refused', () => {
    const sound = { id: 'hi-snd', lang: 'hi', kind: 'sounds', version: 1, title: { en: 't' }, features: ['matra:ा'], words: [{ text: 'पानी', en: 'water' }], explanation: { short: 's' }, provenance: PROV,
      checks: [{ id: 'd1', kind: 'which-reading', word: 'पानी', options: ['pānī', 'panee'], answer: 1 }] };
    const { packs } = pack('hi', {
      'sounds/hi-snd': sound,
      'scenes/hi-a': { ...esScene('hi-a', [['पानी।', 'Water.']]), lang: 'hi' },
      path: { lang: 'hi', version: 1, steps: [{ id: 'snd', kind: 'sounds', ref: 'hi-snd' }, { id: 'a', kind: 'scene', ref: 'hi-a' }, { id: 'exit', kind: 'exit' }], next: [] },
      coverage: { entries: [] },
    });
    const c = codes(validatePack(packs.get('hi')!, reg.get('hi'), world as never));
    expect(c).toContain('answer-contradicts-decoder');
    expect(c).toContain('support-never-retires'); // a 3-step path cannot retire romanization at step 15
  });
});

describe('Stage 0 support fading (Hindi romanization)', () => {
  it('shows a reading under words whose letters are not yet secure, drops it once decoded unaided, and retires it after its step', async () => {
    const steps: Array<{ id: string; kind: string; ref?: string }> = [{ id: 'snd', kind: 'sounds', ref: 'hi-snd' }, { id: 'a', kind: 'scene', ref: 'hi-a' }];
    for (let i = 0; i < 18; i++) steps.push({ id: `pad${i}`, kind: 'scene', ref: 'hi-a' });
    steps.push({ id: 'exit', kind: 'exit' });
    const { packs } = pack('hi', {
      'sounds/hi-snd': { id: 'hi-snd', lang: 'hi', kind: 'sounds', version: 1, title: { en: 't' }, features: ['matra:ा', 'matra:ी'], words: [{ text: 'पानी', en: 'water' }], explanation: { short: 's' }, provenance: PROV, checks: [{ id: 'd1', kind: 'which-reading', word: 'पानी', options: ['pānī', 'panā'], answer: 0 }] },
      'scenes/hi-a': { ...esScene('hi-a', [['पानी।', 'Water.']]), lang: 'hi' },
      path: { lang: 'hi', version: 1, steps, next: [] }, coverage: { entries: [] },
    });
    const store = createMemoryStore();
    const bus = new StoreEventBus(store, () => new Date().toISOString());
    const s0 = createStage0({ store, bus, adapters: reg, content: { packs } as never });
    const before = await s0.presentation('u', 'hi', 'a', 'none');
    expect(before.transliteration.l1).toEqual(['पानी']);
    await s0.answerDecode('u', 'hi', 'snd', 'd1', 0, false, 'none');
    await s0.answerDecode('u', 'hi', 'snd', 'd1', 0, false, 'none');
    const after = await s0.presentation('u', 'hi', 'a', 'none');
    expect(after.transliteration).toEqual({});
    expect(after.reasons.join(' ')).toMatch(/on your own/);
    // a decode right WITH romanization on screen does not count toward secure
    const st = foldStage0('hi', await bus.history({ userId: 'u' }));
    expect(st.features.get('matra:ा')!.secure).toBe(true);
    const d = (await bus.history({ userId: 'u', types: ['Stage0DecodeAnswered'] })) as Stage0DecodeAnswered[];
    expect(d[0].features).toEqual(expect.arrayContaining(['letter:प', 'matra:ा', 'letter:न', 'matra:ी']));
    // past the retirement step: none, whatever the evidence
    const late = await s0.presentation('fresh-learner', 'hi', 'pad16', 'none');
    expect(late.transliteration).toEqual({});
    expect(late.reasons.join(' ')).toMatch(/stepped aside for good/);
  });
});

describe('Stage 0 — Thai specifics', () => {
  const thPack = (checks: unknown[]) => {
    const steps: Array<{ id: string; kind: string; ref?: string }> = [{ id: 'snd', kind: 'sounds', ref: 'th-snd' }];
    for (let i = 0; i < 26; i++) steps.push({ id: `a${i}`, kind: 'scene', ref: 'th-a' });
    steps.push({ id: 'exit', kind: 'exit' });
    const mods: Record<string, unknown> = {
      '../../data/stage0/th/sounds/th-snd.json': { id: 'th-snd', lang: 'th', kind: 'sounds', version: 1, title: { en: 't' }, features: ['class:mid'], words: [{ text: 'กิน', en: 'eat' }], explanation: { short: 's' }, provenance: PROV, checks },
      '../../data/stage0/th/scenes/th-a.json': { ...esScene('th-a', [['กินข้าว', 'Eat rice.']]), lang: 'th' },
      '../../data/stage0/th/path.json': { lang: 'th', version: 1, steps, next: [] },
      '../../data/stage0/th/coverage.json': { entries: [] },
    };
    return packsFrom(mods).packs.get('th')!;
  };
  it('a tone answer must match the decoder, and word boundaries must lie inside the phrase', () => {
    const p = thPack([
      { id: 't1', kind: 'which-tone', word: 'กิน', options: ['mid', 'high', 'rising'], answer: 1 },
      { id: 'g1', kind: 'segment', word: 'กินข้าว', boundaries: [9] },
    ]);
    const c = codes(validatePack(p, reg.get('th'), world as never));
    expect(c).toContain('answer-contradicts-decoder');
    expect(c).toContain('invalid-value');
  });
  it('word gaps show until segmentation is secure, then step aside', async () => {
    const p = thPack([{ id: 'g1', kind: 'segment', word: 'กินข้าว', boundaries: [3] }]);
    const store = createMemoryStore();
    const bus = new StoreEventBus(store, () => new Date().toISOString());
    const s0 = createStage0({ store, bus, adapters: reg, content: { packs: new Map([['th', p]]) } as never });
    expect((await s0.presentation('u', 'th', 'a0', 'none')).segmentation).toBe(true);
    for (let i = 0; i < 3; i++) expect((await s0.answerDecode('u', 'th', 'snd', 'g1', [3], false, 'none')).correct).toBe(true);
    const after = await s0.presentation('u', 'th', 'a0', 'none');
    expect(after.segmentation).toBe(false);
    expect(after.reasons.join(' ')).toMatch(/find the words yourself/);
  });
});

describe('Stage 0 answer matching', () => {
  it('ignores case, punctuation and spacing; personal slots; accents give a note; Thai ignores spaces', () => {
    expect(matchAnswer('es', '¡me LLAMO   carla!', [{ text: 'Me llamo {x}' }])).toMatchObject({ accepted: true, personal: ['carla'] });
    expect(matchAnswer('es', 'cuanto cuesta el pan', [{ text: 'Cuánto cuesta el pan' }])).toMatchObject({ accepted: true, spellingNote: expect.stringMatching(/marks/) });
    expect(matchAnswer('es', 'Me gusta el pan', [{ text: 'No me gusta el pan' }]).accepted).toBe(false);
    expect(matchAnswer('th', 'ผม ชื่อ แซม ครับ', [{ text: 'ผมชื่อ{x}ครับ', speakerForm: 'm' }, { text: 'ฉันชื่อ{x}ค่ะ', speakerForm: 'f' }], 'm').accepted).toBe(true);
    expect(matchAnswer('th', 'ฉันชื่อแซมค่ะ', [{ text: 'ผมชื่อ{x}ครับ', speakerForm: 'm' }, { text: 'ฉันชื่อ{x}ค่ะ', speakerForm: 'f' }], 'm')).toMatchObject({ accepted: false, spellingNote: expect.stringMatching(/other speaker/) });
    expect(matchAnswer('hi', 'मेरा नाम सैम है', [{ text: 'मेरा नाम {x} है' }]).accepted).toBe(true);
  });
});
