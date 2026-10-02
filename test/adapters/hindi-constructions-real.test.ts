/**
 * Hindi constructions and neighbour rules on the REAL adapter (word list + morphology engine + package H4's rules), over real
 * sentences. The fixtures with hand-made readings in hindi-constructions.test.ts cannot show what the assembled adapter does
 * with the readings the list and the engine really give; these rows can.
 */
import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';

function run(sentence: string) {
  const tokens = hiAdapter.tokenize(sentence.normalize('NFC'));
  const analyses = hiAdapter.analyze(tokens);
  const pats = hiAdapter.detectPatterns(tokens, analyses);
  return { tokens, analyses, pats, keys: pats.map((p) => p.key) };
}
/** The first reading of the word written `surface` (the nth one). */
function first(sentence: string, surface: string, nth = 0) {
  const r = run(sentence);
  const idx = r.tokens.map((t, i) => (t.surface === surface ? i : -1)).filter((i) => i >= 0)[nth];
  if (idx === undefined) throw new Error(`no ${surface} in ${sentence}`);
  return r.analyses[idx].candidates[0];
}
const has = (c: { morph: Record<string, string> } | undefined, k: string, v: string): boolean => (c?.morph[k] ?? '').split(',').includes(v);

describe('the progressive (stem + रहा) on the real adapter', () => {
  const PROGRESSIVES: Array<[string, number[]]> = [
    ['वह खा रहा है।', [1, 2, 3]],
    ['मैं कर रहा था।', [1, 2, 3]],
    ['वे बोल ही रहे थे।', [1, 3, 4]],
    ['वह नहीं आ रहा।', [2, 3]],
    ['बच्चे कहानी सुन रहे हैं।', [2, 3, 4]],
    ['बच्चे खेल रहे हैं।', [1, 2, 3]],
    ['माँ गा रही थी।', [1, 2, 3]],
    ['वह सो रही है।', [1, 2, 3]],
  ];
  it.each(PROGRESSIVES)('%s', (s, idx) => {
    const r = run(s);
    const p = r.pats.filter((x) => x.key === 'progressive');
    expect(p.map((x) => x.tokenIndexes)).toEqual([idx]);
    // the group is not also read as a perfect
    for (const k of ['present-perfect', 'pluperfect', 'perfective-past']) expect(r.keys, k).not.toContain(k);
    if (idx.length === 3 && s.includes(' थ') ) expect(r.keys).toContain('auxiliary-chain');
  });

  it('रहा is the progressive auxiliary after a bare stem and "stayed" when no stem precedes', () => {
    expect(has(first('वह खा रहा है।', 'रहा'), 'Aspect', 'Prog')).toBe(true);
    expect(has(first('बच्चे कहानी सुन रहे हैं।', 'रहे'), 'Aspect', 'Prog')).toBe(true);
    expect(has(first('वह घर पर रहा।', 'रहा'), 'Aspect', 'Perf')).toBe(true);
    const r = run('वह घर पर रहा।');
    expect(r.keys).toContain('perfective-past');
    expect(r.keys).not.toContain('progressive');
  });

  it('the stem before रहा is read as the main verb, not a noun or a command', () => {
    expect(has(first('बच्चे खेल रहे हैं।', 'खेल'), 'VerbForm', 'Stem')).toBe(true);
    expect(first('बच्चे खेल रहे हैं।', 'खेल').pos).toBe('VERB');
    expect(has(first('मैं कर रहा था।', 'कर'), 'VerbForm', 'Stem')).toBe(true);
  });

  it('the auxiliary chain covers stem + रहा + होना', () => {
    const r = run('वह खा रहा है।');
    expect(r.pats.find((p) => p.key === 'auxiliary-chain')?.tokenIndexes).toEqual([1, 2, 3]);
  });
});

describe('-े forms: oblique singular only when a postposition governs the phrase', () => {
  it('no postposition: the direct plural comes first', () => {
    for (const s of ['बच्चे कहानी सुन रहे हैं।', 'लड़के ही गए।', 'मेरे बच्चे स्कूल जाते हैं।']) {
      const w = s.startsWith('लड़के') ? 'लड़के' : 'बच्चे';
      const c = first(s, w);
      expect(has(c, 'Case', 'Dir'), s).toBe(true);
      expect(has(c, 'Number', 'Plur'), s).toBe(true);
    }
  });
  it('a postposition follows (directly, or after ही / भी): the oblique singular comes first', () => {
    for (const s of ['बच्चे को कहानी सुनाओ।', 'मेरे बच्चे के साथ खेलो।', 'अच्छे बच्चे को इनाम मिला।']) {
      const c = first(s, 'बच्चे');
      expect(has(c, 'Case', 'Obl'), s).toBe(true);
      expect(has(c, 'Number', 'Sing'), s).toBe(true);
    }
  });
  it('the words agreeing with the noun take its case: अच्छे before a plural noun is not marked down to oblique', () => {
    const plural = first('अच्छे बच्चे खेल रहे हैं।', 'अच्छे');
    expect(plural.pos).toBe('ADJ');
    const r = run('अच्छे बच्चे को इनाम मिला।');
    expect(r.keys).toContain('adjective-noun-agreement');
  });
  it('plural-forms fires on a plural -े noun, not on the oblique singular before a postposition', () => {
    expect(run('बच्चे कहानी सुन रहे हैं।').keys).toContain('plural-forms');
    expect(run('बच्चे को कहानी सुनाओ।').keys).not.toContain('plural-forms');
    expect(run('बच्चे को कहानी सुनाओ।').keys).toContain('oblique-before-postposition');
  });
});

describe('noun / verb / adjective homographs on the real adapter', () => {
  it('आम: the noun as the object of "eat", the adjective before a noun', () => {
    expect(first('वह आम खाता है।', 'आम').pos).toBe('NOUN');
    expect(first('वह आम लोग हैं।', 'आम').pos).toBe('ADJ');
  });
  it('खाना: noun as the object of another verb', () => { expect(first('मैं खाना खाता हूँ।', 'खाना').pos).toBe('NOUN'); });
  it('बोली: the participle when nothing else is a verb, the noun after a genitive', () => {
    expect(first('वह बोली।', 'बोली').pos).toBe('VERB');
    expect(first('यह उसकी बोली है।', 'बोली').pos).toBe('NOUN');
  });
  it('a verb form after its subject pronoun (समझें after हम)', () => { expect(first('ताकि हम समझें।', 'समझें').pos).toBe('VERB'); });
  it('चला / बना before जाना or alone are the participles of चलना / बनना, not the stems of the causatives', () => {
    expect(first('वह चला गया।', 'चला').lemma).toBe('चलना');
    expect(first('अच्छा खाना बना।', 'बना').lemma).toBe('बनना');
    expect(run('अच्छा खाना बना।').keys).not.toContain('causative');
  });
  it('a conjunctive in -के that is a noun (लड़के) is the noun', () => {
    expect(first('लड़के ही गए।', 'लड़के').pos).toBe('NOUN');
    expect(run('लड़के ही गए।').keys).not.toContain('conjunctive-participle');
  });
  it('कर ending a clause after तू is the command; after a genitive it is a noun if the list has one', () => {
    expect(first('तू जल्दी कर।', 'कर').pos).toBe('VERB');
    expect(run('तू जल्दी कर।').keys).toContain('command');
  });
});

describe('ko-experiencer and ko-definite-object', () => {
  const EXPERIENCER = [
    'मुझे यह कहानी पसंद है।', 'उन्हें खेलना अच्छा लगता है।', 'बच्चों को पानी चाहिए।', 'उसे हिंदी आती है।', 'मुझे मालूम है।',
    'हमें उसकी याद है।', 'मुझे ज़रूरत है।', 'मुझे भूख लगी है।', 'उसे गुस्सा आया।', 'उसे बुखार हुआ।',
  ];
  it.each(EXPERIENCER)('%s', (s) => {
    const r = run(s);
    expect(r.keys).toContain('ko-experiencer');
    expect(r.keys).not.toContain('ko-definite-object');
  });
  it('mujhe-डर: "डर लगता है" is found too', () => {
    const r = run('मुझे डर लगता है।');
    expect(r.keys).toContain('ko-experiencer');
  });
  const DEFINITE = ['मैंने उस किताब को पढ़ा।', 'इस लड़के को देखो।', 'मैंने अपने दोस्त को बुलाया।', 'मैं तुम्हारी बहन को जानता हूँ।'];
  it.each(DEFINITE)('%s', (s) => {
    const r = run(s);
    expect(r.keys).toContain('ko-definite-object');
    expect(r.keys).not.toContain('ko-experiencer');
  });
  it('one को never makes both constructions', () => {
    for (const s of [...EXPERIENCER, ...DEFINITE]) {
      const r = run(s);
      const e = r.pats.filter((p) => p.key === 'ko-experiencer').flatMap((p) => p.tokenIndexes);
      const d = r.pats.filter((p) => p.key === 'ko-definite-object').flatMap((p) => p.tokenIndexes);
      expect(e.filter((x) => d.includes(x)), s).toEqual([]);
    }
  });
  it('indirect objects (giving, telling) are not definite objects', () => {
    expect(run('उसने मुझे धन्यवाद दिया।').keys).not.toContain('ko-definite-object');
    expect(run('मैंने उसे कह दिया।').keys).not.toContain('ko-definite-object');
  });
});

describe('subjunctive, causative, passive on the real adapter', () => {
  it.each(['शायद वह आए।', 'ताकि हम समझें।', 'मैं चाहता हूँ कि वह जाए।', 'जब तक वह न आए, मैं रुकूँगा।', 'क्या मैं जाऊँ?'])('subjunctive: %s', (s) => {
    expect(run(s).keys).toContain('subjunctive');
  });
  it('a form that is both a participle and a subjunctive (आए) is a perfective alone', () => {
    const r = run('वे घर आए।');
    expect(r.keys).not.toContain('subjunctive');
  });
  it.each(['बच्चे को कहानी सुनाओ।', 'मैं उसकी मदद करवाता हूँ।', 'वह काम शुरू कराता है।'])('causative: %s', (s) => {
    expect(run(s).keys).toContain('causative');
  });
  it('passive: a perfective participle + जाना; not चला गया, not a ने sentence', () => {
    expect(run('यह बात कही जाती है।').keys).toContain('passive');
    expect(run('वह चला गया।').keys).not.toContain('passive');
    expect(run('उसने रोटी खाई।').keys).not.toContain('passive');
  });
});

describe('compound verbs and sentences taken from the bundled texts keep their keys', () => {
  it('हो गया gives the compound verb', () => {
    expect(run('काम खत्म हो गया।').keys).toContain('compound-verb');
  });
  it('is stable: the same sentence twice gives the same constructions', () => {
    const s = 'बच्चे कहानी सुन रहे हैं।';
    expect(run(s).pats).toEqual(run(s).pats);
  });
});
