/**
 * Albanian contextual syntax, part 2: noun phrases. Everything that depends on a noun (or a pronoun) is attached here, before
 * any clause is looked at: the words before it (një, a number, a demonstrative, the article të of "të dielën"), the linking
 * article + adjective or possessive after it (i / e / të / së agreeing with the noun), a genitive noun with its article,
 * a possessive (im, juaj), a bare adjective; then the preposition of each phrase and the "and" between phrases.
 *
 * The linking article is the one place where Albanian agreement decides a head: "dhomë të madhe" is attached to the noun the
 * article agrees with in gender and number. When two nouns of the chain agree (a genitive chain: "motra e vëllait të madh"),
 * the nearest wins and the other stays as an alternative. Machine-drafted rules, not checked by a native speaker.
 */
import type { SyntaxAlternative } from '../../core/syntax';
import { inter, isQuantAdv, isSubMarkerWord, numText, type State, type W } from './syntax-core';

const ART_FORMS = new Set(['e', 'i', 'të', 'së']);
const DET_CHAIN = new Set(['det', 'num', 'dem']);
const GENDER_WORDS: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const genderText = (w: W): string => (w.genders.length === 1 ? (GENDER_WORDS[w.genders[0]] ?? w.genders[0]) : 'masculine or feminine');

export function buildNPs(st: State): void {
  const { tokens, W } = st;
  const cons = (j: number): boolean => j >= 0 && j < tokens.length && tokens[j].isWord && !!W[j];
  const kindAt = (j: number): string => (cons(j) ? W[j]!.k : '');

  // ── 1. heads and the words before them ──
  const modifiesNoun = (i: number): boolean => {
    let j = i + 1;
    while (cons(j) && DET_CHAIN.has(W[j]!.k)) j++;
    return kindAt(j) === 'noun';
  };
  const heads: number[] = [];
  for (const i of st.words) {
    const w = W[i]!;
    if (w.k === 'noun' || w.k === 'pron') heads.push(i);
    else if ((w.k === 'dem' || w.k === 'det' || w.k === 'num') && !modifiesNoun(i)) heads.push(i);
  }
  const headSet = new Set(heads);
  for (const h of heads) {
    const hw = W[h]!;
    let start = h;
    for (let j = h - 1; cons(j); j--) {
      const w = W[j]!;
      if (headSet.has(j)) break;
      // an article + adjective before the noun ("e dashur gjyshe" = dear grandmother)
      if (w.unit?.role === 'head' && w.k === 'adj' && j === h - 1 && hw.k === 'noun') {
        const a = Math.min(...w.unit.pieces);
        const before = a - 1;
        const afterCopula = cons(before) && W[before]!.k === 'verb' && W[before]!.lemma === 'jam';
        if (a < j && cons(a) && W[a]!.k === 'art' && !afterCopula) {
          st.put(j, h, 'amod', [`'${tokens[a].surface} ${tokens[j].surface}' (article + adjective) stands directly before the noun '${tokens[h].surface}'`], 0.7);
          st.put(a, j, 'det', [`'${tokens[a].surface}' is the linking article of '${tokens[j].surface}'`], 0.85);
          for (let q = a; q <= j; q++) st.headOf.set(q, h);
          start = a; j = a; continue;
        }
        break;
      }
      let rel: 'det' | 'nummod' | undefined;
      let why = '';
      if ((w.k === 'det' || w.k === 'dem') && (hw.k === 'noun' || hw.k === 'det') && (w.k !== 'dem' || inter(w.nums, hw.nums))) {
        rel = 'det';
        why = w.k === 'dem' ? `'${tokens[j].surface}' (this / that) stands before the noun and agrees with it in number` : `'${tokens[j].surface}' is a determiner before the noun`;
      } else if (w.k === 'num' && hw.k === 'noun') { rel = 'nummod'; why = `'${tokens[j].surface}' is a number before the noun`; }
      else if (w.k === 'te' && j === h - 1 && (hw.k === 'noun' || hw.k === 'det')) { rel = 'det'; why = `'${tokens[j].surface}' directly before a noun is the linking article, not the verb particle (no verb follows it)`; }
      else if (w.k === 'adv' && isQuantAdv(w.s) && hw.k === 'noun' && !(hw.defs.length > 0 && hw.defs.every((d) => d === 'Def'))) {
        st.put(j, h, 'det', [`'${tokens[j].surface}' (much / many) stands directly before the noun`], 0.6, [{ head: h, relation: 'advmod', confidence: 0.3, why: 'a quantity word is also an adverb' }]);
        start = j; st.headOf.set(j, h); continue;
      }
      if (!rel) break;
      st.put(j, h, rel, [why], 0.85);
      start = j;
      st.headOf.set(j, h);
    }
    st.np.set(h, { h, start, end: h });
    st.headOf.set(h, h);
    st.startAt.set(start, h);
  }

  // ── 2. what follows a head ──
  const scanned = new Set<number>();
  const extend = (chain: number[], to: number): void => {
    for (const c of chain) { const n = st.np.get(c)!; if (to > n.end) n.end = to; }
  };
  const agreeingTargets = (chain: number[], art: W): number[] => chain.filter((c) => inter(art.genders, W[c]!.genders) && inter(art.nums, W[c]!.nums));
  const pickTarget = (chain: number[], art: W): { target: number; alts: SyntaxAlternative[]; sure: boolean; note: string } => {
    const ok = agreeingTargets(chain, art);
    if (!ok.length) return { target: chain[0], alts: [], sure: false, note: `no noun in the phrase clearly agrees with '${art.c?.lemma ?? art.s}'; the nearest noun is taken` };
    const t = ok[0];
    const alts: SyntaxAlternative[] = ok.slice(1).map((o) => ({ head: o, relation: 'amod' as const, confidence: 0.3, why: `'${tokens[o].surface}' agrees with the article in gender and number as well` }));
    return { target: t, alts, sure: ok.length === 1, note: `the article agrees with '${tokens[t].surface}' (${genderText(W[t]!)}, ${numText(W[t]!)})` };
  };

  const scan = (h: number): void => {
    scanned.add(h);
    const chain: number[] = [h];
    let p = st.np.get(h)!.end + 1;
    while (cons(p)) {
      const w = W[p]!;
      if (w.k === 'art' && w.unit) {
        const u = w.unit.head;
        const uw = W[u];
        if (!uw || u < p) break;
        const t = pickTarget(chain, w);
        const rel = uw.k === 'adj' ? 'amod' : 'det';
        const alts = chain.length > 1 ? t.alts : [];
        st.put(u, t.target, rel, [`'${tokens[p].surface} ${tokens[u].surface}' is a linking article with its ${uw.k === 'adj' ? 'adjective' : 'possessive'}, standing after the noun`, t.note], t.sure ? 0.9 : chain.length > 1 ? 0.65 : 0.8, alts);
        st.put(p, u, 'det', [`'${tokens[p].surface}' is the linking article of '${tokens[u].surface}'`, t.note], 0.9);
        extend(chain, u);
        for (let j = p; j <= u; j++) st.headOf.set(j, chain[0] === h ? h : chain[0]);
        p = u + 1;
        continue;
      }
      if (w.k === 'adv' && !w.wh && cons(p + 1) && W[p + 1]!.k === 'art' && W[p + 1]!.unit && W[p + 1]!.unit!.head > p) {
        const u = W[p + 1]!.unit!.head;
        st.put(p, u, 'advmod', [`'${tokens[p].surface}' stands before the article + adjective '${tokens[p + 1].surface} ${tokens[u].surface}' and strengthens it`], 0.8);
        p++;
        continue;
      }
      if (w.k === 'poss' && !w.unit) {
        const t = pickTarget(chain, w);
        st.put(p, t.target, 'det', [`'${tokens[p].surface}' is a possessive standing after the noun`, `it agrees with '${tokens[t.target].surface}'`], 0.8, chain.length > 1 ? t.alts.map((a) => ({ ...a, relation: 'det' as const })) : []);
        extend(chain, p);
        st.headOf.set(p, h);
        p++;
        continue;
      }
      if ((w.k === 'art' && !w.unit) || (w.k === 'clitic' && ART_FORMS.has(w.s) && kindAt(p - 1) === 'noun')) {
        const g = st.startAt.get(p + 1);
        const gw = g === undefined ? undefined : W[g];
        if (g === undefined || !gw || scanned.has(g) || gw.k === 'dem' || gw.k === 'det') break;
        const genOk = gw.cases.length === 0 || gw.cases.some((c) => c === 'Gen' || c === 'Dat' || c === 'Abl');
        const t = pickTarget(chain, w);
        const reading = w.k === 'clitic' ? `'${tokens[p].surface}' could be a short pronoun, but a noun phrase follows it directly, so it is the linking article` : `'${tokens[p].surface}' is a linking article`;
        const conf = (genOk ? 0.85 : 0.55) * (w.k === 'clitic' ? 0.9 : 1) * (t.sure ? 1 : chain.length > 1 ? 0.8 : 0.95);
        st.put(g, t.target, 'nmod', [reading, genOk ? `'${tokens[g].surface}' has the genitive form (${w.cases.length ? 'case ' : ''}${gw.cases.join('/')})` : `'${tokens[g].surface}' does not show a genitive form, so this is less certain`, t.note], conf, chain.length > 1 ? t.alts.map((a) => ({ ...a, relation: 'nmod' as const })) : []);
        st.put(p, g, 'det', [`'${tokens[p].surface}' is the linking article of the genitive '${tokens[g].surface}'`], 0.9);
        const gn = st.np.get(g)!;
        gn.inner = true;
        scanned.add(g);
        for (let j = p; j <= gn.end; j++) st.headOf.set(j, g);
        chain.unshift(g);
        extend(chain, gn.end);
        p = gn.end + 1;
        continue;
      }
      if (w.k === 'adj' && !w.unit && w.c?.notes?.articulated !== 'yes' && inter(w.nums, W[chain[0]]!.nums)) {
        st.put(p, chain[0], 'amod', [`'${tokens[p].surface}' is an adjective (it takes no linking article) directly after the noun`], 0.65);
        extend(chain, p);
        st.headOf.set(p, h);
        p++;
        continue;
      }
      break;
    }
  };
  for (const h of heads) if (!scanned.has(h)) scan(h);

  // ── 3. prepositions ──
  for (const j of st.words) {
    const w = W[j]!;
    if (w.k !== 'adp' || !cons(j + 1)) continue;
    const h = st.startAt.get(j + 1);
    if (h === undefined) continue;
    const np = st.np.get(h)!;
    if (np.pp !== undefined) continue;
    const gov = w.c?.notes?.governs;
    const govText = typeof gov === 'string' ? gov : undefined;
    const caseOk = !govText || W[h]!.cases.length === 0 || W[h]!.cases.includes(govText);
    const fits = govText ? `'${tokens[j].surface}' takes the ${{ Nom: 'nominative', Acc: 'accusative', Abl: 'ablative', Gen: 'genitive' }[govText] ?? govText}${caseOk ? ` and '${tokens[h].surface}' has that case (${W[h]!.cases.join('/') || 'unmarked'})` : `, which '${tokens[h].surface}' does not show`}` : '';
    if (st.put(j, h, 'case', [`'${tokens[j].surface}' is a preposition directly before the noun phrase '${tokens[h].surface}'`, fits], caseOk ? 0.92 : 0.7)) {
      np.pp = j;
      st.headOf.set(j, h);
    }
  }

  // ── 4. "and" between phrases ──
  const conjFirst = (a: number): number => {
    let x = a;
    for (let n = 0; n < 20; n++) { const r = st.rel.get(x); if (r?.relation === 'conj' && r.head !== undefined) x = r.head; else break; }
    return x;
  };
  for (const c of st.words) {
    const w = W[c]!;
    if (w.k !== 'cc' || !['dhe', 'ose'].includes(w.s) || !cons(c - 1) || !cons(c + 1)) continue;
    const prev = W[c - 1]!;
    const next = W[c + 1]!;
    // two adjectives ("i lodhur dhe i lumtur", "e vjetër dhe e bukur")
    if (prev.k === 'adj' && ((next.k === 'art' && next.unit) || next.k === 'adj')) {
      const n = next.k === 'art' ? next.unit!.head : next.i;
      const first = conjFirst(prev.i);
      if (st.put(n, first, 'conj', [`'${tokens[c].surface}' joins two adjectives of the same kind`], 0.85)) st.put(c, n, 'cc', [`'${tokens[c].surface}' stands before the second adjective`], 0.9);
      continue;
    }
    const a = st.headOf.get(c - 1);
    // "… verb … and <noun> verb": 'and' joins two clauses, not two nouns (syntax.ts splits the clause there)
    {
      let verbBefore = false;
      for (let j = c - 1; j >= 0 && tokens[j].isWord && !isSubMarkerWord(tokens[j].normalized); j--) if (W[j]!.k === 'verb' || W[j]!.k === 'ptcp') { verbBefore = true; break; }
      const nh = st.startAt.get(c + 1);
      let verbAfter = false;
      if (nh !== undefined) for (let j = st.np.get(nh)!.end + 1; cons(j) && !isSubMarkerWord(tokens[j].normalized); j++) { const k = W[j]!.k; if (k === 'verb' || k === 'ptcp') { verbAfter = true; break; } if (k !== 'clitic' && k !== 'neg' && k !== 'adv' && k !== 'te' && k !== 'fut' && k !== 'prog') break; }
      if (verbBefore && verbAfter) continue;
    }
    let n0 = c + 1;
    if (next.k === 'adp') n0 = c + 2;
    const n = cons(n0) ? st.startAt.get(n0) : undefined;
    if (a === undefined || n === undefined || a === n) continue;
    const first = conjFirst(a);
    if (st.put(n, first, 'conj', [`'${tokens[c].surface}' joins the noun phrases '${tokens[first].surface}' and '${tokens[n].surface}'`, 'the second is attached to the first (the usual convention for coordination)'], 0.85)) {
      st.put(c, n, 'cc', [`'${tokens[c].surface}' stands before the second of two coordinated noun phrases`], 0.9);
      st.np.get(n)!.inner = true;
    }
  }
}
