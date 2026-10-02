/**
 * Shared fixtures for the Hindi morphology tests (package H2). The tests never touch src/adapters/hi.ts: they pass
 * this small word list as `knownLemma` / `lemmaInfo`. All words and expectations are the author's own, machine-drafted.
 */
import { expect } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { analyzeHindiForm, type HindiAnalysis, type HindiAnalyzeOptions, type HindiLemmaInfo } from '../../src/adapters/hindi/morphology';

const m = (extra: Partial<HindiLemmaInfo> = {}): HindiLemmaInfo => ({ pos: 'NOUN', gender: 'm', ...extra });
const f = (extra: Partial<HindiLemmaInfo> = {}): HindiLemmaInfo => ({ pos: 'NOUN', gender: 'f', ...extra });

export const NOUNS: Record<string, HindiLemmaInfo> = {
  लड़का: m({ invariant: false }), कमरा: m({ invariant: false }), बच्चा: m({ invariant: false }), कुत्ता: m({ invariant: false }), घर: m(), दिन: m(), शहर: m(), हाथ: m(), लोग: m(),
  कौआ: m(), कुआँ: m(), सुआ: m(), बीज: m(), दुआ: f(),
  आदमी: m(), हाथी: m(), कवि: m(), भालू: m(), साधु: m(),
  पिता: m({ invariant: true }), राजा: m({ invariant: true }), नेता: m({ invariant: true }), चाचा: m({ invariant: true }), दादा: m({ invariant: true }),
  लड़की: f(), रोटी: f(), नदी: f(), शक्ति: f(), चिड़िया: f(), गुड़िया: f(),
  किताब: f(), रात: f(), आँख: f(), बात: f(), माता: f(), कथा: f(), भाषा: f(), बहू: f(), वस्तु: f(),
};

export const ADJS: Record<string, HindiLemmaInfo> = {
  अच्छा: { pos: 'ADJ' }, छोटा: { pos: 'ADJ' }, बड़ा: { pos: 'ADJ' }, काला: { pos: 'ADJ' },
  समान: { pos: 'ADJ' }, भोला: { pos: 'ADJ' }, पागल: { pos: 'ADJ' }, नया: { pos: 'ADJ' }, पराया: { pos: 'ADJ' }, खोया: { pos: 'ADJ' }, मुरझाया: { pos: 'ADJ' }, घबराया: { pos: 'ADJ' },
  सुंदर: { pos: 'ADJ', invariant: true }, लाल: { pos: 'ADJ', invariant: true },
};

export const VERBS: string[] = [
  'करना', 'जाना', 'आना', 'खाना', 'पीना', 'छूना', 'सोना', 'लेना', 'देना', 'कहना', 'देखना', 'बोलना', 'चलना', 'रहना', 'सुनना', 'पढ़ना',
  'लिखना', 'पाना', 'लाना', 'रोना', 'धोना', 'सीना', 'जीना', 'उठना', 'बैठना', 'पूछना', 'बताना', 'मिलना',
];
const CAUSATIVES: Record<string, string> = { कराना: 'करना', दिखाना: 'देखना', पढ़वाना: 'पढ़ना' };
const AUXILIARIES = new Set(['होना']);

export function knownLemma(lemma: string, pos?: PartOfSpeech): boolean {
  const verb = VERBS.includes(lemma) || lemma in CAUSATIVES || AUXILIARIES.has(lemma);
  if (!pos) return lemma in NOUNS || lemma in ADJS || verb;
  switch (pos) {
    case 'NOUN': return lemma in NOUNS;
    case 'ADJ': return lemma in ADJS;
    case 'VERB': return (VERBS.includes(lemma) || lemma in CAUSATIVES) || lemma === 'होना';
    case 'AUX': return AUXILIARIES.has(lemma);
    default: return false;
  }
}

export function lemmaInfo(lemma: string, pos: PartOfSpeech): HindiLemmaInfo | undefined {
  if (pos === 'NOUN') return NOUNS[lemma];
  if (pos === 'ADJ') return ADJS[lemma];
  if (pos === 'VERB' && lemma in CAUSATIVES) return { pos: 'VERB', causativeOf: CAUSATIVES[lemma] };
  return undefined;
}

/** The word list with gender and invariance (what the adapter will give). */
export const OPTS: HindiAnalyzeOptions = { knownLemma, lemmaInfo };
/** The word list without lemmaInfo: gender and invariance are not given. */
export const NO_INFO: HindiAnalyzeOptions = { knownLemma };

export const read = (form: string, o: HindiAnalyzeOptions = OPTS): HindiAnalysis[] => analyzeHindiForm(form, o);

/** Every key of `want` equals the reading's value. */
export function matches(a: HindiAnalysis, lemma: string, pos: PartOfSpeech | undefined, want: Record<string, string>): boolean {
  return a.lemma === lemma && (pos === undefined || a.pos === pos) && Object.entries(want).every(([k, v]) => a.morph[k] === v);
}

export function expectReading(form: string, lemma: string, pos: PartOfSpeech | undefined, want: Record<string, string>, o: HindiAnalyzeOptions = OPTS): HindiAnalysis {
  const all = read(form, o);
  const hit = all.find((a) => matches(a, lemma, pos, want));
  expect(hit, `${form} → ${lemma} ${pos ?? ''} ${JSON.stringify(want)}; got ${JSON.stringify(all.map((a) => [a.lemma, a.pos, a.morph]))}`).toBeTruthy();
  return hit!;
}

/** A fused word's parts tile the form exactly and each slices out its own text. */
export function expectTiling(form: string, a: HindiAnalysis): void {
  expect(a.parts?.length, `${form}: parts`).toBeGreaterThanOrEqual(2);
  let at = 0;
  for (const p of a.parts!) {
    expect(p.start, `${form}: part ${p.text} starts where the last ended`).toBe(at);
    expect(form.slice(p.start, p.end), `${form}: part text`).toBe(p.text);
    at = p.end;
  }
  expect(at, `${form}: parts cover the form`).toBe(form.length);
}
