/**
 * Norwegian compounds taken apart. MACHINE-DRAFTED rules, not checked by a native speaker.
 *
 * Head-final: the last part decides gender, plural and inflection (et kjøkkenbord, kjøkkenbordet). A compound is split ONLY
 * into parts the lexicon knows: non-final parts are nouns (with the linking element they take: ∅, -s-, -e-), verb stems
 * (spise-rom, skrive-bord) or adjectives (stor-by); the head is a noun form of the lexicon (so an inflected head works:
 * bilnøkkelen). Every part has at least three letters (two for by, øy, sø, tå, ku, ås, ei); the head has four unless it is
 * in a short list (bok, hus, bil, tid, dag, sted, mann, by, rom). A function word is never a part. Words the lexicon itself
 * holds are never split into guesses (the whole-word lexicon entry wins); a listed non-compound is never split (bilde,
 * stolen, sykkel, ballett, fjern, kjæreste …). Names are not split. The reading of an unknown compound is `unconfirmed` at
 * 0.55; a compound the lexicon holds keeps its own lemma and gets its parts beside it.
 */
import type { WordPart } from '../../core';
import type { NoLexicon } from './lexicon';

export interface NoDecomposition { parts: WordPart[]; headLemma: string; headForm: string; prefix: string; confidence: number; lexical: boolean; fuge: string[] }

/** Words that look like compounds and are not. */
export const NEVER_SPLIT: ReadonlySet<string> = new Set([
  'bilde', 'bildet', 'bilder', 'bildene', 'stolen', 'stolene', 'sykkel', 'sykkelen', 'ballett', 'fjern', 'kjæreste', 'kjæresten', 'kjærester',
  'bukse', 'buksen', 'busker', 'buss', 'bussen', 'ansikt', 'ansiktet', 'barnet', 'barnebarn', 'mannen', 'menn', 'sted', 'stedet',
  'forstå', 'forstår', 'forsto', 'bestemme', 'bestemt', 'beslutte', 'tallerken', 'tallerkenen', 'kirken', 'kirkegård', 'mandag', 'tirsdag',
  'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag', 'hverdag', 'imidlertid', 'likevel', 'allikevel', 'fordi', 'derfor', 'dessuten',
  'altså', 'bortsett', 'blant', 'ennå', 'allerede', 'nettopp', 'fortsatt', 'forresten', 'ganske', 'hjelpe', 'spørsmål', 'arbeide', 'arbeider',
  'biskop', 'teater', 'butikken', 'søsken', 'kjeller', 'kjelleren', 'finger', 'fingeren', 'sommer', 'sommeren', 'vinteren', 'hovedstad',
]);

const SHORT_HEADS = new Set(['bok', 'hus', 'bil', 'tid', 'dag', 'sted', 'mann', 'by', 'rom', 'øye', 'tre', 'vei', 'sal', 'ord', 'dør', 'hår', 'land', 'ben']);
const SHORT_FIRST = new Set(['by', 'øy', 'sø', 'tå', 'ku', 'ås', 'ei', 'sjø', 'bo', 'gud', 'lys', 'sol', 'hav', 'ild', 'tro']);
const SUFFIXES = new Set(['het', 'ing', 'else', 'skap', 'dom', 'lig', 'sjon', 'tet', 'sk', 'isk', 'som', 'bar', 'ende', 'ning', 'inne', 'ske', 'sel']);
const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('nb');

interface FirstPart { base: string; link: string; lemma: string; pos: 'NOUN' | 'VERB' | 'ADJ' }
interface Index {
  first: Map<string, FirstPart[]>;
  /** noun form → {lemma, gender} */
  heads: Map<string, Array<{ lemma: string; gender?: string }>>;
  stop: Set<string>;
}

const INDEXES = new WeakMap<NoLexicon, Index>();

function add(map: Map<string, FirstPart[]>, key: string, part: FirstPart): void {
  const list = map.get(key);
  if (!list) map.set(key, [part]);
  else if (!list.some((p) => p.lemma === part.lemma && p.link === part.link && p.pos === part.pos)) list.push(part);
}

function build(lex: NoLexicon): Index {
  const first = new Map<string, FirstPart[]>();
  const heads = new Map<string, Array<{ lemma: string; gender?: string }>>();
  const stop = new Set<string>();
  for (const w of lex.words) if (['ADP', 'CONJ', 'SCONJ', 'PRON', 'DET', 'PART', 'AUX', 'INTJ'].includes(w.pos) || (w.pos === 'ADV' && w.form.length <= 3)) stop.add(norm(w.form));
  for (const n of lex.nouns) {
    const base = norm(n.lemma);
    if (n.pluralOnly || base.length < 3 && !SHORT_FIRST.has(base)) continue;
    if (SUFFIXES.has(base)) continue;
    for (const link of ['', 's', 'e']) {
      if (link === 's' && /[sxz]$/.test(base)) continue;
      if (link === 'e' && /e$/.test(base)) continue;
      add(first, base + link, { base, link, lemma: n.lemma, pos: 'NOUN' });
    }
    if (/e$/.test(base) && base.length >= 5) add(first, base.slice(0, -1), { base: base.slice(0, -1), link: '', lemma: n.lemma, pos: 'NOUN' });
  }
  for (const v of lex.verbs) {
    if (v.deponent || v.lemma.length < 5) continue;
    const stem = v.lemma.replace(/e$/, '');
    if (stem.length < 3) continue;
    add(first, `${stem}e`, { base: stem, link: 'e', lemma: v.lemma, pos: 'VERB' });
    add(first, stem, { base: stem, link: '', lemma: v.lemma, pos: 'VERB' });
  }
  for (const a of lex.adjectives) {
    const base = norm(a.lemma);
    if (base.length < 3 || SUFFIXES.has(base) || a.invariable) continue;
    add(first, base, { base, link: '', lemma: a.lemma, pos: 'ADJ' });
  }
  for (const n of lex.nouns) {
    if (n.proper) continue;
    const forms = [n.lemma, ...n.plural, ...n.defSg.map((d) => d.form), ...n.defPl];
    for (const f of forms) {
      const k = norm(f);
      const list = heads.get(k) ?? [];
      if (!list.some((h) => h.lemma === n.lemma)) list.push({ lemma: n.lemma, gender: n.gender });
      heads.set(k, list);
    }
  }
  return { first, heads, stop };
}

function indexOf(lex: NoLexicon): Index {
  let idx = INDEXES.get(lex);
  if (!idx) { idx = build(lex); INDEXES.set(lex, idx); }
  return idx;
}

interface Seg { start: number; end: number; kind: 'component' | 'link' | 'head'; lemma?: string; pos?: 'NOUN' | 'VERB' | 'ADJ' }
interface Plan { segs: Seg[]; comps: number; headLen: number; links: number; verbs: number }

const better = (a: Plan, b: Plan): boolean =>
  a.comps !== b.comps ? a.comps < b.comps : a.headLen !== b.headLen ? a.headLen > b.headLen : a.links !== b.links ? a.links < b.links : a.verbs < b.verbs;

function plan(w: string, idx: Index, forceSplit: boolean): Plan | undefined {
  const memo = new Map<number, Plan | null>();
  const go = (pos: number, top: boolean, depth: number): Plan | null => {
    if (!top) { const m = memo.get(pos); if (m !== undefined) return m; }
    const rest = w.slice(pos);
    let best: Plan | null = null;
    const offer = (p: Plan): void => { if (!best || better(p, best)) best = p; };
    if (!(top && forceSplit) && rest.length >= 3 && !idx.stop.has(rest)) {
      const hs = idx.heads.get(rest);
      if (hs && (rest.length >= 4 || SHORT_HEADS.has(rest))) offer({ segs: [{ start: pos, end: w.length, kind: 'head', lemma: hs[0].lemma, pos: 'NOUN' }], comps: 1, headLen: rest.length, links: 0, verbs: 0 });
    }
    if (depth < 2) {
      for (let k = 2; k <= rest.length - 3; k++) {
        const pre = rest.slice(0, k);
        if (idx.stop.has(pre) && !SHORT_FIRST.has(pre)) continue;
        const entries = idx.first.get(pre);
        if (!entries) continue;
        if (k < 3 && !SHORT_FIRST.has(pre)) continue;
        const tail = go(pos + k, false, depth + 1);
        if (!tail) continue;
        const sorted = [...entries].sort((a, b) => (a.link ? 1 : 0) - (b.link ? 1 : 0) || (a.pos === 'NOUN' ? 0 : 1) - (b.pos === 'NOUN' ? 0 : 1));
        const e = sorted[0];
        const baseEnd = pos + e.base.length;
        const segs: Seg[] = [{ start: pos, end: baseEnd, kind: 'component', lemma: e.lemma, pos: e.pos }];
        if (e.link) segs.push({ start: baseEnd, end: pos + k, kind: 'link' });
        offer({ segs: [...segs, ...tail.segs], comps: 1 + tail.comps, headLen: tail.headLen, links: (e.link ? 1 : 0) + tail.links, verbs: (e.pos === 'NOUN' ? 0 : 1) + tail.verbs });
      }
    }
    if (!top) memo.set(pos, best);
    return best;
  };
  return go(0, true, 0) ?? undefined;
}

/**
 * A compound taken apart, or undefined when no decomposition is backed by known words. `surface` is the written word;
 * a name (capital letter in the middle of a sentence) must not be passed in.
 */
export function decomposeCompound(surface: string, lex: NoLexicon): NoDecomposition | undefined {
  const written = surface.normalize('NFC');
  if (written.length < 7 || !/^\p{L}+$/u.test(written)) return undefined;
  const w = norm(written);
  if (w.length !== written.length || NEVER_SPLIT.has(w)) return undefined;
  const idx = indexOf(lex);
  const lexical = lex.has(w);
  const found = plan(w, idx, lexical);
  if (!found || found.comps < 2 || found.comps > 3) return undefined;
  const last = found.segs.length - 1;
  const parts: WordPart[] = found.segs.map((s, k): WordPart => {
    const text = written.slice(s.start, s.end);
    if (s.kind === 'link') return { text, start: s.start, end: s.end, kind: 'link', role: 'linking element' };
    const isHead = k === last;
    const p: WordPart = { text, start: s.start, end: s.end, kind: isHead ? 'head' : 'component', lemma: s.lemma, pos: s.pos };
    p.role = isHead ? 'head: decides the gender and the kind of thing' : s.pos === 'VERB' ? 'first part (verb stem)' : s.pos === 'ADJ' ? 'first part (adjective)' : 'first part';
    return p;
  });
  const head = found.segs[last];
  const prefix = found.segs.slice(0, -1).map((s) => written.slice(s.start, s.end)).join('');
  return {
    parts, headLemma: head.lemma as string, headForm: written.slice(head.start), prefix,
    confidence: lexical ? 0.8 : Math.max(0.4, 0.55 - 0.05 * (found.comps - 2)), lexical,
    fuge: found.segs.filter((s) => s.kind === 'link').map((s) => written.slice(s.start, s.end)),
  };
}

/** Lemmas (lower case) of the components and the head of a compound, or []. */
export function componentLemmas(surface: string, lex: NoLexicon): string[] {
  const d = decomposeCompound(surface, lex);
  return d ? d.parts.filter((p) => p.lemma).map((p) => norm(p.lemma as string)) : [];
}
