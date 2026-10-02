/**
 * Causative verbs by rule (package H2, docs/PLAN12.md). MACHINE-DRAFTED from the author's own knowledge of Hindi.
 *
 * First causative: base stem + आ, with the regular changes to the base — a long vowel shortens (बोल → बुला, सीख → सिखा,
 * देख → दिखा), a plain consonant stem keeps its vowel (कर → करा, बन → बना, पढ़ → पढ़ा, सुन → सुना, सिल → सिला), a stem
 * with an inherent a before its last consonant loses the long ā it had (जाग → जगा), and a vowel-final base takes ला
 * (खा → खिला, पी → पिला, दे → दिला, सो → सुला). Second causative: the same base + वा (करवा, बनवा, दिखवा, खिलवा).
 *
 * Analysis runs the rules backwards: from a causative stem it proposes the bases it could have come from and keeps
 * the first one the word list vouches for as a verb. A causative is only ever derived from a vouched base.
 */
import { kindOf } from './morph-orth';
import type { Ctx } from './morph-types';

export interface Causative { base: string; kind: 'first' | 'second' }

const NUKTA = '़';
const isConsonant = (ch: string | undefined): boolean => ch !== undefined && kindOf(ch) === 'C' && ch !== NUKTA;

/** Consonant-final bases a stem X (without the causative -ा) could come from. */
function consonantBases(x: string): string[] {
  const out = [x];
  let j = x.length - 1;
  if (x[j] === NUKTA) j--;
  if (j < 1) return out;
  const prev = x[j - 1];
  const head = x.slice(0, j - 1);
  const tail = x.slice(j);
  if (prev === 'ु') out.push(head + 'ो' + tail, head + 'ू' + tail);
  else if (prev === 'ि') out.push(head + 'ी' + tail, head + 'े' + tail, head + 'ै' + tail);
  else if (isConsonant(prev)) out.push(x.slice(0, j) + 'ा' + tail);
  return out;
}

/** Vowel-final bases for a stem X that ends in -ल after ि / ु (खिल → खा, पी, दे; सुल → सो). */
function vowelBases(x: string): string[] {
  if (x.length < 3 || !x.endsWith('ल')) return [];
  const y = x.slice(0, -1);
  const head = y.slice(0, -1);
  if (!isConsonant(head[head.length - 1])) return [];
  if (y.endsWith('ि')) return [head + 'ा', head + 'ी', head + 'े'];
  if (y.endsWith('ु')) return [head + 'ो', head + 'ू'];
  return [];
}

/** The base infinitive a causative stem comes from, when the word list vouches for it as a verb. */
export function causativeBase(stem: string, ctx: Ctx): Causative | undefined {
  if (!ctx.hasList || stem.length < 3 || !stem.endsWith('ा')) return undefined;
  const tries: Array<{ x: string; kind: 'first' | 'second' }> = [];
  if (stem.endsWith('वा') && stem.length >= 4) tries.push({ x: stem.slice(0, -2), kind: 'second' });
  tries.push({ x: stem.slice(0, -1), kind: 'first' });
  for (const t of tries) {
    if (kindOf(t.x) !== 'C') continue;
    for (const b of [...consonantBases(t.x), ...vowelBases(t.x)]) {
      const inf = b + 'ना';
      if (inf !== stem + 'ना' && ctx.knownVerb(inf)) return { base: inf, kind: t.kind };
    }
  }
  return undefined;
}
