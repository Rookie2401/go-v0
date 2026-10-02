/**
 * German compounds taken apart (package GC). A compound is split ONLY into words the lexicon (or the caller's `isWord`)
 * knows: first parts are nouns (with the linking element they take: Leben-s-, Bund-es-, Kind-er-), verb stems
 * (Wohn-zimmer, Lese-buch) or adjectives (Groß-stadt); the LAST part is the head and must be a noun form the engine
 * knows (so an inflected head works: Haus-aufgaben). Every component has at least three letters; the split with the
 * fewest parts wins, then the longest head, then the fewest linking elements. A derivational suffix (-ung, -heit,
 * -keit, -schaft, -lich, -bar …) is never a part of its own, so a derived word is not split inside.
 * Machine-drafted rules, not checked by a native speaker.
 */
import type { WordPart } from '../../core';
import { analyzeGermanForm } from './morphology';
import type { DeLexiconView } from './types';

export interface Decomposition { parts: WordPart[]; confidence: number; lexical: boolean }

const LINKS = ['s', 'es', 'n', 'en', 'e', 'er', 'ens'] as const;
/** Endings that make a word out of another and are not words themselves. */
const SUFFIXES = new Set([
  'ung', 'heit', 'keit', 'schaft', 'lich', 'bar', 'nis', 'tum', 'chen', 'lein', 'sam', 'haft', 'los', 'ig', 'isch', 'tion', 'tät', 'ismus', 'ist', 'in', 'ling', 'end', 'ern', 'eln',
]);

const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de');
const cap = (s: string): string => (s ? s[0].toLocaleUpperCase('de') + s.slice(1) : s);

interface FirstPart { base: string; link: string; lemma: string; pos: 'NOUN' | 'VERB' | 'ADJ' }

interface Index {
  first: Map<string, FirstPart[]>;
  /** Known noun forms (written as a noun, capital first) → lemma, or '' for none. */
  heads: Map<string, string>;
}

const INDEXES = new WeakMap<DeLexiconView, Index>();

function linkAllowed(base: string, link: string): boolean {
  if (!link) return true;
  const last = base[base.length - 1];
  switch (link) {
    case 'n': return last === 'e';
    case 'en': return last !== 'e';
    case 'e': return last !== 'e';
    case 'ens': return last === 'e' || last === 'z';
    case 's': case 'es': return last !== 's' && last !== 'ß' && last !== 'e';
    default: return true;
  }
}

function addFirst(map: Map<string, FirstPart[]>, key: string, part: FirstPart): void {
  const list = map.get(key);
  if (!list) map.set(key, [part]);
  else if (!list.some((p) => p.lemma === part.lemma && p.link === part.link && p.pos === part.pos)) list.push(part);
}

function buildIndex(lex: DeLexiconView): Index {
  const first = new Map<string, FirstPart[]>();
  for (const n of lex.allNouns()) {
    const base = norm(n.lemma);
    if (base.length < 3 || SUFFIXES.has(base)) continue;
    if (n.gender === 'pl') { addFirst(first, base, { base, link: '', lemma: n.lemma, pos: 'NOUN' }); continue; }
    for (const link of ['', ...LINKS]) if (linkAllowed(base, link)) addFirst(first, base + link, { base, link, lemma: n.lemma, pos: 'NOUN' });
    // a noun in -e often loses it as a first part: Schule → Schul-buch
    if (base.length >= 5 && base.endsWith('e')) addFirst(first, base.slice(0, -1), { base: base.slice(0, -1), link: '', lemma: n.lemma, pos: 'NOUN' });
    // a plural that is not the lemma plus a linking element (Häuser, Bücher, Länder, Städte) is a first part as it stands
    if (n.plural) {
      const p = norm(n.plural);
      if (p !== base && p.length >= 3 && !LINKS.some((l) => p === base + l)) addFirst(first, p, { base: p, link: '', lemma: n.lemma, pos: 'NOUN' });
    }
  }
  for (const v of lex.allVerbs()) {
    if (v.prefix || v.reflexive) continue;
    const lemma = norm(v.lemma);
    const stem = lemma.endsWith('eln') || lemma.endsWith('ern') ? lemma.slice(0, -1) : lemma.endsWith('en') ? lemma.slice(0, -2) : '';
    if (stem.length < 3 || SUFFIXES.has(stem)) continue;
    addFirst(first, stem, { base: stem, link: '', lemma: v.lemma, pos: 'VERB' });
    addFirst(first, `${stem}e`, { base: stem, link: 'e', lemma: v.lemma, pos: 'VERB' });
  }
  for (const a of lex.allAdjectives()) {
    const base = norm(a.lemma);
    if (base.length < 3 || SUFFIXES.has(base)) continue;
    addFirst(first, base, { base, link: '', lemma: a.lemma, pos: 'ADJ' });
  }
  return { first, heads: new Map() };
}

function indexOf(lex: DeLexiconView): Index {
  let idx = INDEXES.get(lex);
  if (!idx) { idx = buildIndex(lex); INDEXES.set(lex, idx); }
  return idx;
}

/** The lemma of a noun the engine knows by this written form (capital first), '' when none. */
function headLemma(tail: string, lex: DeLexiconView, idx: Index, isWord?: (lemma: string) => boolean): string {
  const key = cap(tail);
  let hit = idx.heads.get(key);
  if (hit === undefined) {
    hit = analyzeGermanForm(key, lex).find((r) => r.pos === 'NOUN' && r.lemmaKnown)?.lemma ?? '';
    idx.heads.set(key, hit);
  }
  if (hit) return hit;
  return isWord && isWord(key) ? key : '';
}

interface Seg { start: number; end: number; kind: 'component' | 'link' | 'head'; lemma?: string; pos?: 'NOUN' | 'VERB' | 'ADJ' }
interface Plan { segs: Seg[]; comps: number; headLen: number; links: number; verbs: number }

const better = (a: Plan, b: Plan): boolean =>
  a.comps !== b.comps ? a.comps < b.comps : a.headLen !== b.headLen ? a.headLen > b.headLen : a.links !== b.links ? a.links < b.links : a.verbs < b.verbs;

function plan(w: string, lex: DeLexiconView, idx: Index, isWord: ((lemma: string) => boolean) | undefined, forceSplit: boolean): Plan | undefined {
  const memo = new Map<number, Plan | null>();
  const go = (pos: number, top: boolean): Plan | null => {
    if (!top) { const m = memo.get(pos); if (m !== undefined) return m; }
    const rest = w.slice(pos);
    let best: Plan | null = null;
    const offer = (p: Plan): void => { if (!best || better(p, best)) best = p; };
    if (!(top && forceSplit) && rest.length >= 3 && !SUFFIXES.has(rest)) {
      const lemma = headLemma(rest, lex, idx, isWord);
      if (lemma && !SUFFIXES.has(norm(lemma))) offer({ segs: [{ start: pos, end: w.length, kind: 'head', lemma, pos: 'NOUN' }], comps: 1, headLen: rest.length, links: 0, verbs: 0 });
    }
    for (let k = 3; k <= rest.length - 3; k++) {
      const pre = rest.slice(0, k);
      const entries: FirstPart[] = [...(idx.first.get(pre) ?? [])];
      if (isWord) {
        for (const link of ['', ...LINKS]) {
          if (link && !pre.endsWith(link)) continue;
          const base = link ? pre.slice(0, -link.length) : pre;
          if (base.length < 3 || SUFFIXES.has(base) || !linkAllowed(base, link)) continue;
          if (!entries.some((e) => e.base === base && e.link === link) && isWord(cap(base))) entries.push({ base, link, lemma: cap(base), pos: 'NOUN' });
        }
      }
      if (!entries.length) continue;
      const tail = go(pos + k, false);
      if (!tail) continue;
      // the best reading of this prefix: no link before a link, a noun before a verb stem or an adjective
      entries.sort((a, b) => (a.link ? 1 : 0) - (b.link ? 1 : 0) || (a.pos === 'NOUN' ? 0 : 1) - (b.pos === 'NOUN' ? 0 : 1));
      const e = entries[0];
      const baseEnd = pos + e.base.length;
      const segs: Seg[] = [{ start: pos, end: baseEnd, kind: 'component', lemma: e.lemma, pos: e.pos }];
      if (e.link) segs.push({ start: baseEnd, end: pos + k, kind: 'link' });
      offer({ segs: [...segs, ...tail.segs], comps: 1 + tail.comps, headLen: tail.headLen, links: (e.link ? 1 : 0) + tail.links, verbs: (e.pos === 'NOUN' ? 0 : 1) + tail.verbs });
    }
    if (!top) memo.set(pos, best);
    return best;
  };
  return go(0, true) ?? undefined;
}

/**
 * A compound taken apart, or undefined when no decomposition is backed by known words. Parts carry kind 'component',
 * 'link' and 'head'; `lexical` is true when the whole word is itself in the lexicon. `isWord` lets a caller widen
 * what counts as a known part beyond the lexicon (a dictionary-backed test); by default only lexicon words count.
 */
export function decomposeCompound(
  surface: string, lex: DeLexiconView, isWord?: (lemma: string) => boolean,
): { parts: WordPart[]; confidence: number; lexical: boolean } | undefined {
  const written = surface.normalize('NFC');
  if (written.length < 6 || !/^\p{L}+$/u.test(written)) return undefined;
  const w = norm(written);
  if (w.length !== written.length) return undefined;
  const idx = indexOf(lex);
  const lexical = !!headLemma(w, lex, idx, undefined);
  // a word of the list is split only when it is long enough for a compound of two real words
  if (lexical && w.length < 7) return undefined;
  const found = plan(w, lex, idx, isWord, lexical);
  if (!found || found.comps < 2) return undefined;
  const last = found.segs.length - 1;
  const parts: WordPart[] = found.segs.map((s, k): WordPart => {
    const text = written.slice(s.start, s.end);
    if (s.kind === 'link') return { text, start: s.start, end: s.end, kind: 'link', role: 'linking element' };
    const isHead = k === last;
    const p: WordPart = { text, start: s.start, end: s.end, kind: isHead ? 'head' : 'component', lemma: s.lemma, pos: s.pos };
    p.role = isHead ? 'head: decides the gender and the kind of thing' : s.pos === 'VERB' ? 'first part (verb stem)' : s.pos === 'ADJ' ? 'first part (adjective)' : 'first part';
    return p;
  });
  const comps = found.comps;
  return { parts, confidence: lexical ? 0.8 : Math.max(0.4, 0.55 - 0.05 * (comps - 2)), lexical };
}

/** The lemmas of the components and the head of a compound (lower case), or [] when it is not one. */
export function componentLemmas(surface: string, lex: DeLexiconView): string[] {
  const d = decomposeCompound(cap(surface), lex);
  return d ? d.parts.filter((p) => p.lemma).map((p) => norm(p.lemma as string)) : [];
}
