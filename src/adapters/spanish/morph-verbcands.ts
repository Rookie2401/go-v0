/**
 * Candidate generation for verb analysis: which endings a verb form can have, and which infinitive stems a changed
 * stem could come from (pienso → pens-, sigo → segu-, empecé → empez-, conozco → conoc-). These only PROPOSE; the
 * engine keeps a candidate only if conjugating it really produces the written form.
 */
import { stripAccents } from './morph-orth';
import { conjugateLemma } from './verbs';

let endings: Map<string, string[]> | undefined;

/**
 * Every ending (accents stripped) a verb form can have after its stem, with the infinitive endings it can belong to
 * ("ábamos" → ar; "iéramos" → er, ir). Built from regular dummy verbs, plus the strong-preterite and -era / -ese
 * endings (any class) that the dummies cannot show.
 */
export function endingClasses(): Map<string, string[]> {
  if (endings) return endings;
  const map = new Map<string, Set<string>>();
  const put = (e: string, cls: string[]) => { const set = map.get(e) ?? new Set<string>(); for (const c of cls) set.add(c); map.set(e, set); };
  for (const [lemma, cls] of [['talar', ['ar']], ['taler', ['er']], ['talir', ['ir', 'ír']]] as const) {
    for (const f of conjugateLemma(lemma)?.forms ?? []) if (f.form.startsWith('tal') && f.form.length > 3) put(stripAccents(f.form.slice(3)), [...cls]);
  }
  const ALL = ['ar', 'er', 'ir', 'ír'];
  for (const e of ['e', 'iste', 'o', 'imos', 'isteis', 'ieron', 'eron', 'endo', 'era', 'eras', 'eramos', 'erais', 'eran', 'erades', 'ese', 'eses', 'esemos', 'eseis', 'esen', 'esedes', 'ere', 'eres', 'eremos', 'ereis', 'eren', 'eredes']) put(e, ALL);
  endings = new Map([...map].map(([k, v]) => [k, [...v]]));
  return endings;
}

type Step = (s: string) => string[];
const last = (s: string, re: RegExp, to: string): string[] => {
  const m = [...s.matchAll(re)].pop();
  return m && m.index !== undefined ? [s.slice(0, m.index) + to + s.slice(m.index + m[0].length)] : [];
};

const STEPS: Step[] = [
  (s) => (s.endsWith('y') ? [s.slice(0, -1)] : []),
  (s) => (s.endsWith('qu') ? [s.slice(0, -2) + 'c'] : []),
  (s) => (s.endsWith('gu') ? [s.slice(0, -1)] : []),
  (s) => (s.endsWith('gü') ? [s.slice(0, -2) + 'gu'] : []),
  (s) => (s.endsWith('zc') ? [s.slice(0, -2) + 'c'] : []),
  (s) => (s.endsWith('z') ? [s.slice(0, -1) + 'c'] : []),
  (s) => (s.endsWith('c') ? [s.slice(0, -1) + 'z'] : []),
  (s) => (s.endsWith('j') ? [s.slice(0, -1) + 'g'] : []),
  (s) => (s.endsWith('g') ? [s + 'u'] : []),
  (s) => (/duj$/.test(s) ? [s.slice(0, -1) + 'c'] : []),
  (s) => last(s, /ie/g, 'e'),
  (s) => last(s, /ie/g, 'i'),
  (s) => last(s, /ue/g, 'o'),
  (s) => last(s, /ue/g, 'u'),
  (s) => last(s, /i/g, 'e'),
  (s) => last(s, /u/g, 'o'),
  (s) => (s.startsWith('ye') ? ['e' + s.slice(2)] : []),
  (s) => (s.startsWith('hue') ? ['o' + s.slice(3)] : []),
];

/** The written stem, with accents removed, and every stem it could descend from by a spelling or stem change (two steps deep). */
const variantCache = new Map<string, string[]>();
export function stemVariants(stem: string): string[] {
  const hit = variantCache.get(stem);
  if (hit) return hit;
  const res = computeVariants(stem);
  if (variantCache.size > 20000) variantCache.clear();
  variantCache.set(stem, res);
  return res;
}

function computeVariants(stem: string): string[] {
  const base = new Set<string>([stem, stripAccents(stem)]);
  let frontier = [...base];
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const s of frontier) for (const step of STEPS) for (const r of step(s)) if (r && !base.has(r)) { base.add(r); next.push(r); }
    frontier = next;
    if (base.size > 60) break;
  }
  return [...base].filter((s) => /[aeiouáéíóú]/.test(s));
}
