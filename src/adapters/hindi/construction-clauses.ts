/**
 * Construction detectors about clauses: the relative and its correlative (जो … वह, जब … तब, जहाँ … वहाँ, जैसा … वैसा,
 * जितना … उतना), कि-clauses, conditions (अगर … तो) and conditions contrary to fact. A pair is reported when both halves are
 * there; a relative word on its own is reported with a lower confidence, because the correlative is often left out.
 * Machine-drafted from general knowledge of Hindi grammar, not checked by a native speaker.
 */
import type { PatternCandidate } from '../../core';
import { hit, trust, type Ctx } from './construction-ctx';

interface Pair { key: string; rel: string[]; corr: string[]; alone: number }

const PAIRS: Pair[] = [
  { key: 'jab-tab', rel: ['जब'], corr: ['तब'], alone: 0.65 },
  { key: 'jahaan-vahaan', rel: ['जहाँ', 'जहां'], corr: ['वहाँ', 'वहां'], alone: 0 },
  { key: 'jaisa-vaisa', rel: ['जैसा', 'जैसी', 'जैसे'], corr: ['वैसा', 'वैसी', 'वैसे'], alone: 0 },
  { key: 'jitna-utna', rel: ['जितना', 'जितनी', 'जितने'], corr: ['उतना', 'उतनी', 'उतने'], alone: 0 },
];

export function relativeClauses(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const words = c.tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  const corrDem = (i: number) => !!c.find(i, (r) => r.lemma === 'वह' || r.lemma === 'वही') || ['वह', 'वे', 'वही', 'उसे', 'उसको', 'उन्हें', 'उनको', 'उसने', 'उन्होंने', 'उसका', 'उसकी', 'उसके', 'उनका', 'उनकी', 'उनके', 'उस', 'उन'].includes(c.n(i));
  for (const i of words) {
    const rel = c.find(i, (r) => r.morph.PronType === 'Rel' && (r.pos === 'PRON' || r.pos === 'DET'));
    if (!rel) continue;
    const later = words.find((k) => k > i && corrDem(k));
    out.push(hit('relative-correlative', trust(rel) * (later !== undefined ? 1 : 0.7), later !== undefined ? [i, later] : [i]));
  }
  for (const p of PAIRS) {
    for (const i of words) {
      if (!p.rel.includes(c.n(i))) continue;
      // जैसे can also be "for example": it needs its correlative
      const later = words.find((k) => k > i && p.corr.includes(c.n(k)));
      if (later !== undefined) out.push(hit(p.key, 0.9, [i, later]));
      else if (p.alone > 0) {
        const x = c.cands(i)[0];
        out.push(hit(p.key, x ? p.alone * (x.confidence > 0.5 ? 1 : 0.8) : p.alone * 0.8, [i]));
      }
    }
  }
  return out;
}

export function kiClauses(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i) || c.n(i) !== 'कि') continue;
    const x = c.cands(i)[0];
    if (x && x.pos !== 'SCONJ' && x.pos !== 'CONJ') continue;
    const [from] = c.clause(i);
    let verb = -1;
    for (let k = i - 1; k >= from; k--) {
      if (c.isWord(k) && c.find(k, (r) => r.pos === 'VERB' || r.pos === 'AUX')) { verb = k; break; }
    }
    const saying = verb >= 0 && !!c.find(verb, (r) => ['कहना', 'बताना', 'सोचना', 'जानना', 'मानना', 'समझना', 'देखना', 'सुनना', 'चाहना', 'लगना', 'पूछना', 'होना', 'चाहिए'].includes(r.lemma ?? ''));
    out.push(hit('complement-ki', (x ? trust(x) : 0.7) * (saying ? 1 : 0.85), saying ? [verb, i] : [i]));
  }
  return out;
}

export function conditionals(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const words = c.tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  for (const i of words) {
    if (!['अगर', 'यदि', 'गर'].includes(c.n(i))) continue;
    const x = c.cands(i)[0];
    if (x && x.pos !== 'SCONJ' && x.pos !== 'CONJ') continue;
    const then = words.find((k) => k > i && c.n(k) === 'तो');
    out.push(hit('conditional', (x ? trust(x) : 0.75) * (then !== undefined ? 1 : 0.85), then !== undefined ? [i, then] : [i]));
    // contrary to fact: at least two groups after the condition that are -ता forms with no helping verb
    const bare = c.groups.filter((g) => g.start > i && g.core.kind === 'ipf' && !g.tenseAux && !g.flags.ability);
    const beIpf = c.groups.filter((g) => g.start > i && g.main.lemma === 'होना' && g.main.kind === 'ipf');
    const all = [...new Set([...bare, ...beIpf])].sort((a, b) => a.start - b.start);
    if (all.length >= 2) out.push(hit('contrary-to-fact', 0.8 * Math.min(...all.slice(0, 2).map((g) => g.confidence)), [i, all[0].main.i, all[1].main.i]));
  }
  return out;
}
