/// <reference types="node" />
/**
 * How one gold item is judged against the Hindi adapter (used by npm run hi:eval-gold and by tests).
 * See scripts/eval-hi-gold.mts for what "pass", "fail" and "left open" mean.
 */
import { createAdapterRegistry } from '../src/adapters';
import { decodeHindi } from '../src/adapters/hindi/pronunciation';
import { transliterateHindi } from '../src/adapters/hindi/translit';
import type { GoldItem } from './hi-gold-lib.mts';

export const hi = createAdapterRegistry().get('hi');
const nfc = (s: string) => s.normalize('NFC');
const skeleton = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
const holds = (morph: Record<string, string>, want: Record<string, string>): boolean =>
  Object.entries(want).every(([k, v]) => morph[k] !== undefined && morph[k].split(',').some((x) => v.split(',').includes(x)));

export interface Outcome { verdict: 'pass' | 'fail' | 'open'; failures: string[] }

export function judge(item: GoldItem): Outcome {
  const failures: string[] = [];
  let open = false;
  const sentence = nfc(item.sentence);
  if (item.sentences !== undefined) {
    const n = hi.segmentSentences(sentence).filter((s) => s.text.trim().length > 0).length;
    if (n !== item.sentences) failures.push(`split into ${n} sentence(s), expected ${item.sentences}`);
  }
  const tokens = hi.tokenize(sentence);
  const analyses = hi.analyze(tokens);
  for (const want of item.tokens ?? []) {
    const hits = tokens.map((t, i) => (t.surface === nfc(want.surface) ? i : -1)).filter((i) => i >= 0);
    const i = hits[want.nth ?? 0];
    if (i === undefined) { failures.push(`"${want.surface}" is not a token of the sentence (tokens: ${tokens.filter((t) => t.isWord).map((t) => t.surface).join(' | ')})`); continue; }
    const first = analyses[i].candidates[0];
    const got = first ? `${first.lemma}/${first.pos} ${JSON.stringify(first.morph)}` : 'no reading';
    if (want.lemma !== undefined && first?.lemma !== nfc(want.lemma)) failures.push(`${want.surface}: lemma ${first?.lemma ?? '—'}, expected ${want.lemma} (${got})`);
    if (want.pos !== undefined && first?.pos !== want.pos && !(want.pos === 'VERB' && first?.pos === 'AUX')) failures.push(`${want.surface}: ${first?.pos ?? '—'}, expected ${want.pos} (${got})`);
    if (want.feats && !(first && holds(first.morph, want.feats))) failures.push(`${want.surface}: features ${JSON.stringify(first?.morph ?? {})}, expected ${JSON.stringify(want.feats)}`);
    if (want.parts) {
      const parts = first?.parts?.map((p) => p.text) ?? [];
      if (parts.join('+') !== want.parts.map(nfc).join('+')) failures.push(`${want.surface}: parts ${parts.join('+') || '—'}, expected ${want.parts.join('+')}`);
    }
    if (want.register && !(first?.register ?? []).includes(want.register as never)) failures.push(`${want.surface}: register ${(first?.register ?? []).join(',') || '—'}, expected ${want.register}`);
    if (want.said !== undefined) {
      const units = decodeHindi(nfc(want.surface));
      const sure = units.length > 0 && units.every((u) => u.confidence >= 0.6 && u.inherentVowel !== 'uncertain');
      const text = skeleton(transliterateHindi(nfc(want.surface)).text);
      if (!sure) open = true;
      else if (text !== want.said) failures.push(`${want.surface}: said "${text}" with confidence, expected "${want.said}"`);
    }
  }
  const key = (p: string[]) => p.map(nfc).join(' ');
  const found = new Set(hi.detectPhrases(tokens, analyses).map((p) => key(p.pattern)));
  for (const p of item.phrases ?? []) if (!found.has(key(p))) failures.push(`unit not found: ${p.join(' ')} (found: ${[...found].join('; ') || 'none'})`);
  for (const p of item.notPhrases ?? []) if (found.has(key(p))) failures.push(`unit found where it is not one: ${p.join(' ')}`);
  const patterns = new Set(hi.detectPatterns(tokens, analyses).map((p) => p.key));
  for (const c of item.constructions ?? []) if (!patterns.has(c)) failures.push(`construction not found: ${c} (found: ${[...patterns].join(', ') || 'none'})`);
  return { verdict: failures.length ? 'fail' : open ? 'open' : 'pass', failures };
}
