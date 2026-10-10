/**
 * Norwegian contextual syntax (Linguistic Engine V2, Stage 4): shallow dependency relations between the words of ONE sentence, for
 * Bokmål (nb) and Nynorsk (nn) alike (the standard only changes which word forms the lexicon knows; the rules read the readings
 * `analyze` already chose). MACHINE-DRAFTED rules, no parser model, deterministic, pure; nothing here is checked by a native speaker.
 *
 * The pass, in order: (1) the best reading of each token; (2) CLAUSES: a subordinating word (at, fordi, når, om, da, dersom, hvis,
 * mens, før, forat ...), a relative som, an interrogative after a verb (hvorfor, hva), a coordinating og / men / eller before a new
 * finite verb, or a second finite verb with its own subject (no marker: "noe jeg ikke forstår") opens a clause; a comma closes the
 * open clauses that have their finite verb; (3) inside each clause: noun phrases (article / possessive / number / adjectives /
 * genitive + noun, postposed possessive "synden min", pronouns), prepositional phrases, adverbs, the verb group (modal + infinitive,
 * ha / være / bli + participle, å + infinitive); (4) the verb-second order assigns subject and objects (a case-marked pronoun
 * decides, otherwise the position, and what the position cannot decide stays as an alternative); (5) the clauses are hung on each
 * other (ccomp, advcl, acl, conj) and punctuation on the clause head.
 *
 * Honesty: a word the rules cannot place gets no relation (and a note); a word the word list does not know is never used as a head
 * or a dependent unless the engine's own guess (a name, a compound) gave it a reading, and then the confidence is capped.
 * Imports: values only from core/syntax (a value import from core would pull the retired course into the extension bundle).
 */
import type { AnalyzedToken, PartOfSpeech, RawToken } from '../../core';
import { RELATION_WORDS, type ClauseSpan, type DependencyRelation, type SyntaxAlternative, type SyntaxAnalysis, type SyntaxRelation } from '../../core/syntax';
import type { NoStandard } from './types';

type Rel = DependencyRelation;

interface Wd {
  i: number;
  s: string;
  n: string;
  word: boolean;
  pos?: PartOfSpeech;
  lemma: string;
  m: Record<string, string>;
  /** The engine guessed this reading (name, compound): relations to it are capped. */
  unconf: boolean;
  unit?: { role: string; head: number; display: string };
}

const MODALS = new Set(['kunne', 'ville', 'skulle', 'måtte', 'burde', 'tore', 'turde', 'torde', 'turva', 'trenge', 'trengje']);
const PERFECT = new Set(['ha', 'hava', 'være', 'vere', 'vera']);
const PASSIVE = new Set(['bli', 'verte', 'verta']);
const COPULAS = new Set(['være', 'vere', 'vera', 'bli', 'verte', 'verta']);
const TIME_NOUNS = new Set(['dag', 'morgen', 'morgon', 'kveld', 'natt', 'uke', 'år', 'gang', 'tid', 'måned', 'helg', 'time', 'stund', 'sommer', 'sommar', 'vinter', 'høst', 'haust', 'påske', 'jul', 'sekund', 'minutt']);
const WH = new Set(['hvem', 'hva', 'hvorfor', 'hvordan', 'hvor', 'når', 'hvilken', 'hvilket', 'hvilke', 'kven', 'kva', 'kvifor', 'korleis', 'kvar', 'kor', 'kva for', 'kvi']);
const COORD = new Set(['og', 'eller', 'men', 'samt', 'ellers']);
const DEGREE_ADV = new Set(['ikke', 'ikkje', 'svært', 'veldig', 'meget', 'så', 'so', 'for', 'ganske', 'mer', 'mest', 'litt', 'helt', 'altfor', 'ytterst', 'også', 'òg', 'aldri', 'ikkje', 'særleg', 'svært']);
const DEM_PRON = new Set(['den', 'det', 'de', 'dei', 'denne', 'dette', 'disse']);
const QUANT_PRON = new Set(['alle', 'noen', 'noe', 'mange', 'begge', 'ingen', 'noko', 'nokon', 'mange', 'få']);
const PRED_ADV = new Set(['der', 'her', 'hjemme', 'heime', 'borte', 'ute', 'inne', 'oppe', 'nede', 'bra', 'ferdig', 'dit', 'dar']);
const NAMING = new Set(['hete', 'heite', 'heita']);
const NEG_ADV = new Set(['ikke', 'ikkje']);
const CONSEC = new Set(['så', 'so', 'slik', 'sånn', 'slikt']);
const SUB_FRONT_OK = new Set(['at', 'fordi', 'når', 'da', 'dersom', 'hvis', 'om', 'mens', 'siden', 'før', 'etter', 'forat', 'sidan', 'då', 'om', 'viss', 'medan', 'fyrr', 'til', 'enn', 'såframt', 'sjølv', 'selv']);

const splitVals = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const has = (w: Wd | undefined, k: string, v: string): boolean => !!w && splitVals(w.m[k]).includes(v);
const isVerbal = (w: Wd | undefined): boolean => !!w && w.word && (w.pos === 'VERB' || w.pos === 'AUX');
const isPunctBoundary = (s: string): boolean => /^[,;:–—]$|^-$/.test(s);
const isFinalPunct = (s: string): boolean => /^[.!?…]+$/.test(s);

/** Do two sets of values (comma lists) share an element? Empty = unknown = compatible. */
function compat(a: string | undefined, b: string | undefined): boolean {
  const x = splitVals(a);
  const y = splitVals(b);
  if (!x.length || !y.length) return true;
  return x.some((v) => y.includes(v));
}

interface Cl {
  id: number;
  kind: 'main' | 'sub' | 'rel' | 'coord';
  start: number;
  end: number;
  marker?: number;
  parent?: Cl;
  fin?: number;
  /** The most recent coordinated clause hung under this one (the next conjunct hangs on it). */
  last?: Cl;
  prev?: Cl;
  irel?: boolean;
  whMarker?: boolean;
  /** "hva som skjedde": the som right after the question word (it marks the verb; the question word is the subject) */
  somAfterWh?: number;
  toks: number[];
}

interface Item {
  kind: 'np' | 'adjp' | 'pp' | 'adv' | 'verb' | 'part' | 'cc' | 'intj' | 'other';
  head: number;
  first: number;
  last: number;
  adp?: number;
  wh?: boolean;
  plain?: boolean; // a single-token noun phrase
  conj?: boolean;
  absorbed?: boolean;
}

function pronounKind(w: Wd): 'nom' | 'acc' | 'free' | 'none' {
  return (w.pos !== 'PRON' ? 'none' : has(w, 'Case', 'Nom') && !has(w, 'Case', 'Acc') ? 'nom' : has(w, 'Case', 'Acc') && !has(w, 'Case', 'Nom') ? 'acc' : 'free');
}

/** One sentence. */
function syntaxOfOne(std: NoStandard, tokens: RawToken[], analyses: AnalyzedToken[], offset = 0): SyntaxAnalysis {
  const n = tokens.length;
  const analyzer = analyses[0]?.analyzer ?? `adapter-${std}`;
  const W: Wd[] = tokens.map((t, i) => {
    const a = analyses[i];
    const c = a?.candidates?.[0];
    const base: Wd = { i, s: t.surface, n: t.normalized, word: t.isWord, lemma: c?.lemma ?? t.normalized, m: c?.morph ?? {}, unconf: false };
    if (t.isWord && c?.pos) {
      base.pos = c.pos;
      base.unconf = !!c.unconfirmed || c.notes?.nameGuess === 'true';
      if (c.unit && c.unit.pieces.length > 1 && c.unit.head !== i + offset && c.unit.head - offset >= 0 && c.unit.head - offset < n) base.unit = { role: c.unit.role, head: c.unit.head - offset, display: c.unit.display };
    }
    return base;
  });
  const words = W.filter((w) => w.word);
  const rels = new Map<number, SyntaxRelation>();
  const notes: string[] = [];
  const surf = (i: number): string => tokens[i].surface;
  const q = (i: number): string => `“${surf(i)}”`;

  const labelFor = (rel: Rel, head?: number): string => {
    const h = head !== undefined ? q(head) : '';
    switch (rel) {
      case 'root': return 'the main word of the sentence';
      case 'nsubj': return `subject of ${h}`;
      case 'obj': return `direct object of ${h}`;
      case 'iobj': return `indirect object (the receiver) of ${h}`;
      case 'obl': return `adverbial phrase of ${h} (place, time, manner or a prepositional object)`;
      case 'case': return `preposition introducing ${h}`;
      case 'det': return `article or determiner of ${h}`;
      case 'amod': return `adjective describing ${h}`;
      case 'nmod': return `noun phrase modifying ${h}`;
      case 'aux': return `auxiliary verb of ${h}`;
      case 'cop': return `copula (“is / are / become”) linking ${h} to its subject`;
      case 'mark': return `word that opens the clause of ${h}`;
      case 'advmod': return `adverb modifying ${h}`;
      case 'advcl': return `adverbial clause of ${h}`;
      case 'acl': return `clause describing ${h}`;
      case 'ccomp': return `clause that is the content of ${h}`;
      case 'xcomp': return `open complement of ${h} (an infinitive, or a predicate without its own subject)`;
      case 'conj': return `coordinated with ${h}`;
      case 'cc': return `coordinating word (“and / but / or”) before ${h}`;
      case 'nummod': return `number of ${h}`;
      case 'vocative': return `the person addressed (to ${h})`;
      case 'discourse': return `interjection or discourse word attached to ${h}`;
      case 'appos': return `apposition to ${h}`;
      case 'compound': return `particle of the particle verb ${h}`;
      case 'flat': return `second part of the name ${h}`;
      case 'punct': return 'punctuation';
      default: return RELATION_WORDS[rel];
    }
  };

  const add = (dep: number, head: number | undefined, rel: Rel, basis: string[], confidence: number, opts: { alts?: SyntaxAlternative[]; status?: 'generated' | 'conflicted'; label?: string } = {}): void => {
    if (rels.has(dep) || dep === head) return;
    const b = [...basis];
    let conf = confidence;
    if (W[dep].unconf || (head !== undefined && W[head]?.unconf)) {
      conf = Math.min(conf, 0.6);
      b.push('One of the two words is not in the word list; its part of speech is a guess, so this attachment is too.');
    }
    const r: SyntaxRelation = {
      dependent: dep, ...(head !== undefined ? { head } : {}), relation: rel, label: opts.label ?? labelFor(rel, head), basis: b.length ? b : ['attached by the word-order rules'],
      confidence: Math.round(conf * 100) / 100, status: opts.alts?.length ? 'conflicted' : opts.status ?? 'generated',
    };
    if (opts.alts?.length) r.alternatives = opts.alts;
    rels.set(dep, r);
  };

  // ───────────────────────────── 1. clauses ─────────────────────────────
  const firstWord = tokens.findIndex((t) => t.isWord);
  const root: Cl = { id: 0, kind: 'main', start: Math.max(firstWord, 0), end: n - 1, toks: [] };
  const clauses: Cl[] = [root];
  const stack: Cl[] = [root];
  const owner: Array<Cl | undefined> = new Array(n).fill(undefined);
  const prevWordIdx = (i: number): number => { for (let j = i - 1; j >= 0; j--) if (W[j].word) return j; return -1; };

  const closeAt = (cl: Cl, at: number): void => { cl.end = Math.max(at - 1, cl.start); };
  const open = (kind: Cl['kind'], i: number, marker: number | undefined, parent: Cl, extra: Partial<Cl> = {}): Cl => {
    const c: Cl = { id: clauses.length, kind, start: i, end: n - 1, marker, parent, toks: [], ...extra };
    clauses.push(c);
    stack.push(c);
    return c;
  };

  /** A finite verb form in the clause's own right: Fin and neither an infinitive nor a participle reading. */
  const strictFinite = (w: Wd): boolean => isVerbal(w) && has(w, 'VerbForm', 'Fin') && !has(w, 'VerbForm', 'Inf') && !has(w, 'VerbForm', 'Part');
  /** Will the clause that starts after a coordinator have its own finite verb? (the first verb reading found decides) */
  const coordClauseAhead = (i: number): boolean => {
    for (let j = i + 1; j < n; j++) {
      const t = W[j];
      if (!t.word) { if (isPunctBoundary(t.s)) return false; continue; }
      if (t.pos === 'SCONJ' || (t.pos === 'CONJ' && COORD.has(t.n)) || (t.pos === 'PRON' && t.n === 'som')) return false;
      if (isVerbal(t)) { const p = W[prevWordIdx(j)]; return has(t, 'VerbForm', 'Fin') && !(p && p.pos === 'PART'); }
    }
    return false;
  };
  const nominalHead = (w: Wd | undefined): boolean => !!w && w.word && (w.pos === 'NOUN' || w.pos === 'PROPN' || (w.pos === 'PRON' && !has(w, 'PronType', 'Rel') && !has(w, 'PronType', 'Int')));

  for (let i = 0; i < n; i++) {
    const w = W[i];
    if (!w.word) {
      if (isPunctBoundary(w.s)) while (stack.length > 1 && stack[stack.length - 1].fin !== undefined) closeAt(stack.pop()!, i);
      continue;
    }
    let top = stack[stack.length - 1];
    const isFirstOfClause = (): boolean => !top.toks.length;

    if (w.pos === 'SCONJ' && w.n !== 'som' && (SUB_FRONT_OK.has(w.n) || true)) {
      const c = open('sub', i, i, top);
      owner[i] = c; c.toks.push(i);
      continue;
    }
    if (w.n === 'som' && w.pos === 'PRON' && top.whMarker && top.marker !== undefined && prevWordIdx(i) === top.marker) {
      top.somAfterWh = i;
      owner[i] = top; top.toks.push(i);
      continue;
    }
    if (w.n === 'som' && w.pos === 'PRON') {
      const c = open('rel', i, i, top);
      owner[i] = c; c.toks.push(i);
      continue;
    }
    if (w.pos === 'SCONJ' && w.n === 'som') {
      // comparative som (samme som, like som): opens a clause only when a finite verb follows before any boundary
      let verb = false;
      for (let j = i + 1; j < n && !verb; j++) { if (!W[j].word && isPunctBoundary(W[j].s)) break; if (strictFinite(W[j])) verb = true; if (W[j].pos === 'SCONJ') break; }
      if (verb) { const c = open('sub', i, i, top); owner[i] = c; c.toks.push(i); continue; }
    }
    if ((w.pos === 'ADV' || w.pos === 'PRON') && WH.has(w.lemma) && top.fin !== undefined && i > 0 && W[i - 1].word && !isFirstOfClause()) {
      const p = W[i - 1];
      if (isVerbal(p) || (p.pos === 'ADV' && (NEG_ADV.has(p.n) || !!p.unit)) || (p.pos === 'PRON' && has(p, 'Case', 'Acc'))) {
        const c = open('sub', i, i, top, { whMarker: true });
        owner[i] = c; c.toks.push(i);
        continue;
      }
    }
    if (w.pos === 'CONJ' && (w.n === 'så' || w.n === 'so') && top.fin !== undefined && i + 1 < n && W[i + 1].word && W[i + 1].pos && !isVerbal(W[i + 1])) {
      const c = open('sub', i, i, top);
      owner[i] = c; c.toks.push(i);
      continue;
    }
    if (w.pos === 'CONJ' && COORD.has(w.n)) {
      if (top.fin !== undefined && coordClauseAhead(i)) {
        const prevCl = top.last ?? top;
        const c = open('coord', i, i, top, { prev: prevCl });
        top.last = c;
        owner[i] = c; c.toks.push(i);
        continue;
      }
      owner[i] = top; top.toks.push(i);
      continue;
    }
    // a verb: finite or not
    if (isVerbal(w)) {
      const prev = W[prevWordIdx(i)];
      const afterA = !!prev && prev.pos === 'PART';
      const finiteHere = has(w, 'VerbForm', 'Fin') && !afterA && (top.fin === undefined || strictFinite(w));
      if (finiteHere && top.fin === undefined) {
        top.fin = i;
      } else if (finiteHere && top.fin !== undefined) {
        // a second finite verb in one clause: either an unmarked clause with its own subject right before it ("noe jeg ikke forstår"),
        // or the verb of the enclosing clause after an embedded one ("Mannen som står der er min far", "Når han kommer går jeg")
        let j = i - 1;
        while (j >= 0 && W[j].word && owner[j] === top && W[j].pos === 'ADV') j--;
        const subjectLike = j >= 0 && W[j].word && owner[j] === top && nominalHead(W[j]) && j > (top.marker ?? -1)
          && (pronounKind(W[j]) === 'nom' || (top.marker === undefined && pronounKind(W[j]) !== 'acc'));
        if (subjectLike) {
          let s = j;
          if (W[j].pos === 'NOUN' || W[j].pos === 'PROPN') while (s - 1 >= 0 && W[s - 1].word && owner[s - 1] === top && (W[s - 1].pos === 'DET' || W[s - 1].pos === 'ADJ' || W[s - 1].pos === 'NUM')) s--;
          const c = open('rel', s, undefined, top, { irel: true });
          c.fin = i;
          for (let k = s; k < i; k++) if (owner[k] === top) { owner[k] = c; top.toks = top.toks.filter((x) => x !== k); c.toks.push(k); }
          top = c;
        } else {
          while (stack.length > 1 && stack[stack.length - 1].fin !== undefined) closeAt(stack.pop()!, i);
          top = stack[stack.length - 1];
          if (top.fin === undefined) top.fin = i;
        }
      }
    }
    owner[i] = top;
    top.toks.push(i);
  }
  while (stack.length > 1) closeAt(stack.pop()!, n);
  for (const c of clauses) c.toks.sort((a, b) => a - b);

  // ───────────────────────────── 2. phrases inside a clause ─────────────────────────────

  /** det ↔ noun agreement: [ok, plain-words basis] */
  const detAgree = (d: Wd, nn: Wd): [boolean, string] => {
    const g = compat(d.m.Gender, nn.m.Gender);
    const num = compat(d.m.Number, nn.m.Number);
    const dn = `${d.s} (${[splitVals(d.m.Gender).join('/').toLowerCase(), splitVals(d.m.Number).join('/').toLowerCase()].filter(Boolean).join(', ') || 'no gender or number'})`;
    const nns = `${nn.s} (${[splitVals(nn.m.Gender).join('/').toLowerCase(), splitVals(nn.m.Number).join('/').toLowerCase(), splitVals(nn.m.Definite).join('/').toLowerCase()].filter(Boolean).join(', ') || 'form unknown'})`;
    if (g && num) return [true, `${dn} agrees with ${nns} in gender and number`];
    return [false, `${dn} does not agree with ${nns} in ${!g ? 'gender' : 'number'}: the form is wrong, a different noun is meant, or the word list has a variant`];
  };

  const parseItems = (C: Cl): Item[] => {
    const L = C.toks.filter((t) => t !== C.marker && !(C.kind === 'coord' && t === C.marker));
    const items: Item[] = [];
    let p = 0;
    const tw = (k: number): Wd | undefined => (k < L.length ? W[L[k]] : undefined);
    const known = (w: Wd | undefined): w is Wd => !!w && !!w.pos;
    /** the token at position k+1 of L sits right after the one at k in the sentence (no comma or clause between) */
    const adj = (k: number): boolean => k + 1 < L.length && L[k + 1] === L[k] + 1;

    /** noun phrase starting at position k; returns [item, next position] or undefined */
    const parseNP = (k: number): [Item, number] | undefined => {
      const mods: number[] = [];
      let r = k;
      for (;;) {
        const t = tw(r);
        if (!known(t)) break;
        const nx = adj(r) ? tw(r + 1) : undefined;
        if (t.pos === 'DET' || t.pos === 'NUM') { mods.push(L[r]); r++; continue; }
        if (t.pos === 'ADJ') { mods.push(L[r]); r++; continue; }
        if (t.pos === 'ADV' && known(nx) && nx.pos === 'ADJ' && DEGREE_ADV.has(t.n)) { mods.push(L[r]); r++; continue; }
        if (t.pos === 'PRON' && DEM_PRON.has(t.lemma) && known(nx) && (nx.pos === 'NOUN' || nx.pos === 'NUM' || (nx.pos === 'ADJ' && adj(r + 1) && known(tw(r + 2)) && tw(r + 2)!.pos === 'NOUN') || (nx.pos === 'ADJ' && /e$/.test(nx.n) && has(nx, 'Definite', 'Def')))) { mods.push(L[r]); r++; continue; }
        if (t.pos === 'PRON' && QUANT_PRON.has(t.lemma) && known(nx) && (nx.pos === 'NOUN' || nx.pos === 'ADJ')) { mods.push(L[r]); r++; continue; }
        if ((t.pos === 'NOUN' || t.pos === 'PROPN') && has(t, 'Case', 'Gen') && known(nx) && (nx.pos === 'NOUN' || nx.pos === 'ADJ' || nx.pos === 'DET' || nx.pos === 'PROPN')) { mods.push(L[r]); r++; continue; }
        break;
      }
      const t = tw(r);
      let head: number | undefined;
      let kind: Item['kind'] = 'np';
      let end = r;
      if (known(t) && (t.pos === 'NOUN' || t.pos === 'PROPN') && (r === k || adj(r - 1))) {
        head = L[r];
        end = r + 1;
        // a name of several words: Per Hansen
        while (t.pos === 'PROPN' && adj(end - 1) && known(tw(end)) && tw(end)!.pos === 'PROPN' && !tw(end)!.unconf === !t.unconf) { add(L[end], head, 'flat', ['a name written as two capitalised words'], 0.8); end++; }
        // postposed possessive: synden min, hjertet mitt, Son sin
        const pp = adj(end - 1) ? tw(end) : undefined;
        if (known(pp) && pp.pos === 'DET' && has(pp, 'Poss', 'Yes') && t.pos === 'NOUN') {
          const [ok, why] = detAgree(pp, t);
          const dd = has(t, 'Definite', 'Def') ? ['double definiteness: the noun already carries its definite ending, the possessive follows it'] : ['the possessive follows the noun (Son sin)'];
          add(L[end], head, 'det', [...dd, why], ok ? 0.88 : 0.6);
          end++;
        }
      } else if (known(t) && t.pos === 'PRON' && !has(t, 'PronType', 'Rel') && (r === k || adj(r - 1)) && mods.every((m) => W[m].pos === 'DET' || W[m].pos === 'NUM' || W[m].pos === 'ADV')) {
        head = L[r];
        end = r + 1;
        const nx = adj(end - 1) ? tw(end) : undefined;
        if (known(nx) && nx.pos === 'PRON' && (nx.lemma === 'selv' || nx.lemma === 'sjølv')) { add(L[end], head, 'appos', ['selv / sjølv follows the pronoun it stresses (oss selv)'], 0.8); end++; }
      } else if (mods.length) {
        // elliptical phrase: the last modifier is the head (den enbårne, mange, alle, trofast)
        const lastMod = mods[mods.length - 1];
        const lw = W[lastMod];
        head = lastMod;
        mods.pop();
        end = r;
        kind = lw.pos === 'ADJ' && !mods.some((m) => W[m].pos === 'DET' || W[m].pos === 'NUM' || W[m].pos === 'PRON') ? 'adjp' : 'np';
      } else return undefined;
      const hw = W[head];
      for (const m of mods) {
        const mw = W[m];
        if (mw.pos === 'DET' || (mw.pos === 'NUM' && /^(en|ein|ei|et|eit)$/.test(mw.n))) {
          const [ok, why] = mw.pos === 'NUM' ? [true, `${mw.s} is the indefinite article (en / ei / et), the same word as “one”; the noun’s gender is not checked`] as [boolean, string] : detAgree(mw, hw);
          const dbl = has(hw, 'Definite', 'Def') && (DEM_PRON.has(mw.lemma) || has(mw, 'Poss', 'Yes'));
          const basis = [why];
          if (dbl) basis.push('double definiteness: den / det / de (or a possessive) before the noun and the definite ending on the noun together');
          if (has(mw, 'PronType', 'Art')) basis.unshift('indefinite article before its noun');
          add(m, head, 'det', basis, ok ? 0.9 : 0.6);
        } else if (mw.pos === 'NUM') add(m, head, 'nummod', ['a number before the noun it counts'], 0.88);
        else if (mw.pos === 'ADJ') {
          const ok = hw.pos !== 'NOUN' || (compat(mw.m.Number, hw.m.Number) && (!(has(mw, 'Definite', 'Def') && !has(mw, 'Definite', 'Ind')) || has(hw, 'Definite', 'Def') || splitVals(hw.m.Definite).length === 0));
          add(m, head, 'amod', [`adjective ${surf(m)} stands directly before ${surf(head)} and describes it`, ok ? 'the adjective form fits the noun’s number and definiteness' : 'the adjective form does not clearly fit the noun’s number or definiteness'], ok ? 0.88 : 0.65);
        } else if (mw.pos === 'ADV') { const adjAfter = mods.find((x) => x > m && W[x].pos === 'ADJ'); add(m, adjAfter ?? head, 'advmod', ['a degree word before the adjective'], 0.85); }
        else if (mw.pos === 'NOUN' || mw.pos === 'PROPN') add(m, head, 'nmod', ['genitive -s: the owner stands before the thing owned'], 0.8);
        else if (mw.pos === 'PRON') add(m, head, 'det', ['a quantifier / demonstrative pronoun used before a noun'], 0.7);
      }
      return [{ kind, head, first: Math.min(L[k], head), last: L[end - 1] ?? head, plain: end - k === 1, wh: has(hw, 'PronType', 'Int') }, end];
    };

    while (p < L.length) {
      const idx = L[p];
      const w = W[idx];
      if (!w.pos) { p++; continue; } // unknown word: no item, no relation
      if (w.unit && (w.unit.role === 'particle' || /^reflexive/.test(w.unit.role))) { items.push({ kind: 'other', head: idx, first: idx, last: idx }); p++; continue; }
      if (w.pos === 'ADP') {
        const r = parseNP(p + 1);
        if (r && !(W[L[p + 1]]?.unit)) {
          add(idx, r[0].head, 'case', ['a preposition stands directly before the noun phrase it introduces'], 0.92);
          items.push({ kind: 'pp', head: r[0].head, first: idx, last: r[0].last, adp: idx, wh: r[0].wh });
          p = r[1];
          continue;
        }
        if (w.n === 'for' && idx === firstWord) items.push({ kind: 'adv', head: idx, first: idx, last: idx });
        else items.push({ kind: 'other', head: idx, first: idx, last: idx, adp: idx });
        p++;
        continue;
      }
      if (w.pos === 'NOUN' || w.pos === 'PROPN' || w.pos === 'DET' || w.pos === 'NUM' || w.pos === 'ADJ' || w.pos === 'PRON') {
        const r = parseNP(p);
        if (r) { items.push(r[0]); p = r[1]; continue; }
        items.push({ kind: 'other', head: idx, first: idx, last: idx }); p++; continue;
      }
      if (w.pos === 'ADV') {
        const nx = adj(p) ? tw(p + 1) : undefined;
        if (known(nx) && nx.pos === 'ADJ' && DEGREE_ADV.has(w.n)) {
          const r = parseNP(p);
          if (r) { items.push(r[0]); p = r[1]; continue; }
        }
        items.push({ kind: 'adv', head: idx, first: idx, last: idx, wh: has(w, 'PronType', 'Int') || WH.has(w.lemma) });
        p++;
        continue;
      }
      if (w.pos === 'VERB' || w.pos === 'AUX') { items.push({ kind: 'verb', head: idx, first: idx, last: idx }); p++; continue; }
      if (w.pos === 'PART') { items.push({ kind: 'part', head: idx, first: idx, last: idx }); p++; continue; }
      if (w.pos === 'CONJ') { items.push({ kind: COORD.has(w.n) ? 'cc' : 'adv', head: idx, first: idx, last: idx }); p++; continue; }
      if (w.pos === 'INTJ') { items.push({ kind: 'intj', head: idx, first: idx, last: idx }); p++; continue; }
      items.push({ kind: 'other', head: idx, first: idx, last: idx });
      p++;
    }

    // a comma list that ends with "og": mel, vann, salt og gjær -> every member hangs on the first
    for (let k = 0; k + 1 < items.length; k++) {
      const a = items[k];
      const b = items[k + 1];
      if (a.kind !== 'np' || b.kind !== 'np' || tokens[a.last + 1]?.surface !== ',' || b.first !== a.last + 2) continue;
      let j = k + 1;
      while (j + 1 < items.length && items[j].kind === 'np' && items[j + 1].kind === 'np' && tokens[items[j].last + 1]?.surface === ',' && items[j + 1].first === items[j].last + 2) j++;
      if (items[j].kind === 'np' && items[j + 1]?.kind === 'cc' && items[j + 2]?.kind === 'np') {
        add(b.head, a.head, 'conj', ['a comma-separated list of noun phrases that ends with “og / eller”: the members are coordinated'], 0.8);
        a.last = b.last;
        items.splice(k + 1, 1);
        k--;
      }
    }
    // phrase coordination: X og Y of the same kind
    for (let k = 1; k + 1 < items.length; k++) {
      const a = items[k - 1];
      const cc = items[k];
      const b = items[k + 1];
      if (cc.kind !== 'cc' || a.absorbed) continue;
      const same = a.kind === b.kind && ['np', 'adjp', 'pp', 'verb', 'adv'].includes(a.kind);
      if (!same) continue;
      add(b.head, a.head, 'conj', [`“${surf(cc.head)}” joins two ${a.kind === 'np' ? 'noun phrases' : a.kind === 'adjp' ? 'adjectives' : a.kind === 'pp' ? 'prepositional phrases' : a.kind === 'verb' ? 'verbs' : 'adverbs'} of the same kind`], 0.85);
      add(cc.head, b.head, 'cc', ['coordinating word right before the second of the two joined words'], 0.9);
      a.last = b.last;
      items.splice(k, 2);
      k--;
    }
    return items;
  };

  // ───────────────────────────── 3. a clause: verbs, arguments ─────────────────────────────
  interface Info { C: Cl; items: Item[]; pred?: number; subj?: number; verbs: number[]; head0?: number; lastVerb?: number }
  const info = new Map<number, Info>();
  const nominalPos = (it: Item): boolean => it.kind === 'np';

  const analyseClause = (C: Cl): Info => {
    const items = parseItems(C);
    const inf: Info = { C, items, verbs: [] };
    const verbItems = items.filter((it) => it.kind === 'verb' && !it.absorbed);
    const f = C.fin;
    const allVerbs = verbItems.map((v) => v.head);
    const startK = f !== undefined ? Math.max(allVerbs.indexOf(f), 0) : 0;
    const before = f !== undefined ? allVerbs.slice(0, startK) : [];
    const chain = allVerbs.slice(startK);
    inf.verbs = chain;
    const aå = (v: number): boolean => { const k = items.findIndex((it) => it.head === v && it.kind === 'verb'); return k > 0 && items[k - 1].kind === 'part'; };

    // links in the verb chain
    type Link = 'aux' | 'xcomp';
    const linkOf = (a: number, b: number): { link: Link; why: string; conf: number } => {
      const wa = W[a]; const wb = W[b];
      const infB = has(wb, 'VerbForm', 'Inf') && !has(wb, 'VerbForm', 'Part') ? true : has(wb, 'VerbForm', 'Inf') && !has(wb, 'VerbForm', 'Fin');
      const partB = has(wb, 'VerbForm', 'Part');
      if (aå(b)) return { link: 'xcomp', why: `“å” marks ${surf(b)} as an infinitive that depends on ${surf(a)}`, conf: 0.85 };
      if (MODALS.has(wa.lemma) && (infB || has(wb, 'VerbForm', 'Inf'))) return { link: 'aux', why: `${surf(a)} is a modal verb; the infinitive ${surf(b)} follows without “å”`, conf: 0.92 };
      if ((PERFECT.has(wa.lemma) || wa.lemma === 'ha') && partB) return { link: 'aux', why: `${surf(a)} + the participle ${surf(b)} makes the perfect tense`, conf: 0.9 };
      if (PASSIVE.has(wa.lemma) && partB) return { link: 'aux', why: `${surf(a)} + the participle ${surf(b)} makes the passive`, conf: 0.85 };
      if ((PERFECT.has(wa.lemma) || PASSIVE.has(wa.lemma)) && infB && !COPULAS.has(wb.lemma)) return { link: 'aux', why: `${surf(a)} + an infinitive`, conf: 0.6 };
      if (COPULAS.has(wa.lemma) && (infB || partB)) return { link: 'aux', why: `${surf(a)} + ${surf(b)}`, conf: 0.6 };
      return { link: 'xcomp', why: `${surf(b)} is a bare infinitive or participle after the verb ${surf(a)}`, conf: 0.5 };
    };
    const links = chain.slice(0, -1).map((v, k) => linkOf(v, chain[k + 1]));
    const runHead = (k: number): number => { let j = k; while (j < links.length && links[j].link === 'aux') j++; return j; };
    const head0 = chain.length ? chain[runHead(0)] : undefined;
    inf.head0 = head0;
    inf.lastVerb = chain.length ? chain[chain.length - 1] : undefined;

    // ---- argument candidates
    const fIdx = f ?? (chain.length ? chain[0] : undefined);
    const preOf = (it: Item): boolean => fIdx !== undefined && it.first < fIdx;
    /** a single name or noun between commas (or between a comma and the end of the sentence): the person addressed */
    const isVocative = (it: Item): boolean => {
      if (!it.plain || !(W[it.head].pos === 'NOUN' || W[it.head].pos === 'PROPN') || C.kind === 'sub') return false;
      const l = tokens[it.first - 1];
      const r = tokens[it.last + 1];
      const leftEdge = !l || (!l.isWord && /^[,;:!?.]$/.test(l.surface));
      const rightEdge = !r || (!r.isWord && /^[,;:!?.]$/.test(r.surface));
      const comma = (!!l && l.surface === ',') || (!!r && r.surface === ',');
      return leftEdge && rightEdge && comma && (it.first > 0 || !!r);
    };
    /** a noun phrase after a comma that follows a noun, and ends at a comma or the end: an apposition ("sin Sønn, den enbårne") */
    const apposOf = (it: Item): number | undefined => {
      if (it.kind !== 'np' || it.first === 0 || it.first <= (C.fin ?? -1)) return undefined;
      const l = tokens[it.first - 1];
      const r = tokens[it.last + 1];
      if (!l || l.isWord || l.surface !== ',' || (r && r.isWord)) return undefined;
      let pj = prevWordIdx(it.first - 1);
      if (pj > 0 && W[pj].pos === 'DET' && has(W[pj], 'Poss', 'Yes') && W[pj - 1].pos === 'NOUN') pj--;
      const pw = pj >= 0 ? W[pj] : undefined;
      return pw && (pw.pos === 'NOUN' || pw.pos === 'PROPN') && !isVocative(it) && W[it.head].pos !== 'PRON' ? pj : undefined;
    };
    const nominals = items.filter((it) => nominalPos(it) && !isVocative(it) && apposOf(it) === undefined);
    for (const it of items) { const a = apposOf(it); if (a !== undefined) add(it.head, a, 'appos', [`${surf(it.head)} stands after a comma and restates ${surf(a)}`], 0.6); }
    const timeBare = (it: Item): boolean => it.kind === 'np' && W[it.head].pos === 'NOUN' && TIME_NOUNS.has(W[it.head].lemma) && it.first !== it.head
      && (/^(hver|hvert|kvar|kvart|denne|dette|neste|forrige)$/.test(W[it.first].n) || (preOf(it) && (W[it.first].pos === 'DET' || W[it.first].pos === 'NUM')));
    const isTime = new Set(nominals.filter(timeBare).map((it) => it.head));
    const args = nominals.filter((it) => !isTime.has(it.head));

    // copula: find the predicate
    let copPred: Item | undefined;
    let subjItem: Item | undefined;
    let altSubj: { item: Item; why: string } | undefined;
    const runK = chain.length ? runHead(0) : -1;
    const copVerb = runK >= 0 ? chain[runK] : undefined;
    const isCop = copVerb !== undefined && COPULAS.has(W[copVerb].lemma);

    const pre = args.filter(preOf);
    const post = args.filter((a) => !preOf(a));
    const unmarked = (it: Item): boolean => { const w = W[it.head]; return w.pos === 'NOUN' || w.pos === 'PROPN' || (w.pos === 'PRON' && pronounKind(w) === 'free') || (w.pos === 'DET' || w.pos === 'NUM' || w.pos === 'ADJ'); };
    const nomPron = (it: Item): boolean => W[it.head].pos === 'PRON' && pronounKind(W[it.head]) === 'nom';
    const accPron = (it: Item): boolean => W[it.head].pos === 'PRON' && pronounKind(W[it.head]) === 'acc';
    const subjBasis: string[] = [];
    let subjConf = 0.8;
    const relOf = new Map<Item, { rel: Rel; why: string[]; conf: number; alts?: SyntaxAlternative[] }>();

    const mainish = C.kind === 'main' || C.kind === 'coord';
    const imperative = f !== undefined && has(W[f], 'Mood', 'Imp') && !has(W[f], 'Mood', 'Ind');

    const pickSubject = (): void => {
      let s: Item | undefined;
      const wh = (it: Item): boolean => !!it.wh;
      if (isCop && pre.length && wh(pre[0]) && post.length) { copPred = pre[0]; s = post[0]; subjBasis.push(`the question word ${surf(pre[0].head)} is what is asked about; the noun phrase after the verb is the subject`); subjConf = 0.75; }
      else if (C.kind === 'coord' && !pre.length && !items.some((it) => it.first < (fIdx as number) && it.kind !== 'cc' && it.head !== C.marker)) {
        const nom = post.find(nomPron);
        if (nom) { s = nom; subjBasis.push(`${surf(nom.head)} is a subject-case pronoun after the verb`); subjConf = 0.85; }
        else subjBasis.push('the coordinated clause starts straight with its verb: it shares the subject of the clause before');
      }
      else if (mainish || C.irel) {
        if (pre.length) {
          const p0 = pre[0];
          const postNom = post.find(nomPron);
          if (accPron(p0)) { s = post.find((it) => !accPron(it)); if (!s) s = undefined; relOf.set(p0, { rel: 'obj', why: [`${surf(p0.head)} is an object form (not “${W[p0.head].n === 'meg' ? 'jeg' : 'subject form'}”), so it is not the subject`], conf: 0.88 }); }
          else if (!nomPron(p0) && postNom && !isCop) {
            s = postNom;
            { const naming = f !== undefined && NAMING.has(W[f].lemma); relOf.set(p0, { rel: naming ? 'xcomp' : 'obj', why: [naming ? `${surf(f as number)} (“is called”) takes the name or word asked for as its complement: ${surf(p0.head)} is that complement` : `${surf(postNom.head)} is a subject form and stands after the verb, so the noun phrase before the verb is the fronted object`], conf: naming ? 0.75 : 0.8 }); }
            subjBasis.push(`${surf(postNom.head)} is a subject-case pronoun (jeg, du, han, hun, vi, de ...)`); subjConf = 0.88;
          } else {
            s = p0;
            if (nomPron(p0)) { subjBasis.push(`${surf(p0.head)} is a subject-case pronoun`); subjConf = 0.92; }
            else subjBasis.push('the first noun phrase before the finite verb is the subject (verb-second order)');
            // the order decides, the form does not: another unmarked noun phrase after the verb could be the subject instead
            const other = post.find(unmarked);
            if (other && unmarked(p0) && !nomPron(p0) && !isCop && !imperative) {
              subjConf = 0.7;
              altSubj = { item: other, why: `both ${surf(p0.head)} and ${surf(other.head)} have the same form as subject and object; the usual order (subject first, verb second) makes ${surf(p0.head)} the subject, but a fronted object is possible` };
            }
          }
        } else if (post.length && !imperative) {
          const nom = post.find(nomPron);
          s = nom ?? post[0];
          if (nom) { subjBasis.push(`${surf(nom.head)} is a subject-case pronoun after the verb (inversion: a question, or something else stands first)`); subjConf = 0.9; }
          else { subjBasis.push('after the finite verb comes the subject when something else stands first or the sentence is a question'); subjConf = 0.72; }
        } else if (post.length && imperative) {
          const nom = post.find(nomPron);
          if (nom) { s = nom; subjBasis.push(`${surf(nom.head)} is a subject-case pronoun after an imperative-shaped verb`); subjConf = 0.8; }
        }
      } else {
        // subordinate / relative clause: subject before the finite verb
        if (pre.length) { s = pre[0]; subjBasis.push(`in a clause with a ${C.kind === 'rel' ? 'relative' : 'subordinating'} word the subject stands before the finite verb`); subjConf = nomPron(pre[0]) ? 0.92 : 0.85; }
        else if (C.kind === 'rel' && C.marker !== undefined) { /* the gap is the subject: som stands for it */ }
        else if (post.length) { const nom = post.find(nomPron); s = nom ?? post[0]; subjBasis.push('no noun phrase before the verb: the first one after it is taken as subject'); subjConf = 0.6; }
      }
      subjItem = s;
    };
    pickSubject();

    // the predicate of a copula clause
    if (isCop && !copPred) {
      const rest = items.filter((it) => (it.kind === 'adjp' || it.kind === 'pp' || (it.kind === 'np' && it !== subjItem && !isTime.has(it.head)) || (it.kind === 'adv' && PRED_ADV.has(W[it.head].n))) && it.first > (copVerb as number));
      copPred = rest[0];
    }
    if (isCop && copPred && copPred !== subjItem) {
      // the predicate is the head of the clause; the copula depends on it
    } else if (isCop) copPred = undefined;

    const pred: number | undefined = copPred ? copPred.head : head0 ?? (items.find((it) => (it.kind === 'np' && !isVocative(it)) || it.kind === 'adjp' || it.kind === 'pp' || it.kind === 'intj')?.head);
    inf.pred = pred;
    inf.subj = subjItem?.head;

    // ---- verb chain relations
    const auxHeadFor = (k: number): number => (isCop && copPred && runHead(k) === runK ? copPred.head : chain[runHead(k)]);
    chain.forEach((v, k) => {
      if (k < links.length && links[k].link === 'aux') {
        add(v, auxHeadFor(k), 'aux', [links[k].why], links[k].conf);
      } else if (k > 0 && links[k - 1].link === 'xcomp') {
        const prevRunHead = isCop && copPred && chain[k - 1] === copVerb ? copPred.head : chain[k - 1];
        const mk = items.findIndex((it) => it.head === v && it.kind === 'verb');
        if (mk > 0 && items[mk - 1].kind === 'part') add(items[mk - 1].head, v, 'mark', ['“å” marks the infinitive'], 0.92);
        add(v, prevRunHead, 'xcomp', [links[k - 1].why], links[k - 1].conf);
      }
    });
    // the head of the first run is the copula: it hangs on the predicate
    if (isCop && copPred && copVerb !== undefined) add(copVerb, copPred.head, 'cop', [`${surf(copVerb)} (“is / are / become”) links the subject to ${surf(copPred.head)}, which says what the subject is or does`], 0.9);
    // an infinitive with å before the finite verb ("Å lese er viktig") is the subject
    for (const v of before) {
      if (aå(v)) {
        const mk = items.findIndex((it) => it.head === v && it.kind === 'verb');
        add(items[mk - 1].head, v, 'mark', ['“å” marks the infinitive'], 0.92);
        if (pred !== undefined) add(v, pred, 'nsubj', ['an infinitive phrase with “å” before the finite verb is the subject of the sentence'], 0.7);
      }
    }

    // the verb a phrase belongs to: the nearest preceding verb that is not an auxiliary, else the head of the first run
    const nonAux = chain.filter((_v, k) => !(k < links.length && links[k].link === 'aux'));
    const lexVerbs = nonAux.filter((v) => !(isCop && copPred && v === copVerb));
    const verbForAdv = (pos: number): number | undefined => {
      let best: number | undefined;
      for (const v of lexVerbs) if (v < pos) best = v;
      return best ?? (isCop && copPred ? copPred.head : head0 ?? pred);
    };
    const verbFor = (pos: number): number | undefined => {
      let best: number | undefined;
      for (const v of lexVerbs) if (v < pos) best = v;
      return best ?? (isCop && copPred && !lexVerbs.length ? copPred.head : lexVerbs.length ? lexVerbs[lexVerbs.length - 1] : head0 ?? pred);
    };
    const subjHead = isCop && copPred ? copPred.head : head0;

    // ---- subject and objects
    const taken = new Set<Item>();
    if (subjItem && subjHead !== undefined) {
      taken.add(subjItem);
      const alts: SyntaxAlternative[] | undefined = altSubj ? [{ head: subjHead, relation: 'obj', confidence: 0.2, why: altSubj.why }] : undefined;
      add(subjItem.head, subjHead, 'nsubj', subjBasis.length ? subjBasis : ['subject by word order'], subjConf, { alts });
    }
    // time nouns without a preposition are adverbials
    for (const it of nominals) if (isTime.has(it.head) && pred !== undefined) { taken.add(it); add(it.head, verbForAdv(it.head) ?? pred, 'obl', [`${surf(it.head)} names a time; a time noun on its own (without a preposition) works as an adverbial`], 0.75); }
    for (const [it, r] of relOf) {
      if (taken.has(it) || it === copPred) continue;
      const h = verbFor(it.head) ?? pred;
      if (h !== undefined && (r.rel === 'obj' || r.rel === 'xcomp') && !(isCop && copPred && !lexVerbs.length)) { taken.add(it); add(it.head, h, r.rel, r.why, r.conf); }
    }
    // relative / question word that heads its clause as an object
    const rest = args.filter((it) => !taken.has(it) && it !== copPred);
    const restBare = rest.filter((it) => it.head !== subjItem?.head);
    if (altSubj) {
      const o = altSubj.item;
      if (!taken.has(o) && subjItem) {
        const h = verbFor(o.head) ?? pred;
        if (h !== undefined) {
          taken.add(o);
          add(o.head, h, 'obj', ['a noun phrase after the verb that is not the subject is its object'], 0.65, { alts: [{ head: h, relation: 'nsubj', confidence: 0.2, why: altSubj.why }] });
        }
      }
    }
    const objs = restBare.filter((it) => !taken.has(it));
    if (objs.length && !(isCop && copPred && !lexVerbs.length)) {
      if (objs.length >= 2 && (accPron(objs[0]) || (W[objs[0].head].pos === 'PRON' && pronounKind(W[objs[0].head]) !== 'none')) && objs[0].last < objs[1].first) {
        const h0 = verbFor(objs[0].head) ?? pred;
        if (h0 !== undefined) {
          add(objs[0].head, h0, 'iobj', [`${surf(objs[0].head)} stands right after the verb and before another noun phrase: the receiver (“gave ${surf(objs[0].head)} …”)`], accPron(objs[0]) ? 0.85 : 0.7);
          add(objs[1].head, h0, 'obj', ['the second noun phrase after the verb is the thing given'], 0.8);
          taken.add(objs[0]); taken.add(objs[1]);
          for (const it of objs.slice(2)) notes.push(`“${surf(it.head)}” is a third bare noun phrase after one verb; the rules did not place it.`);
        }
      } else {
        const it0 = objs[0];
        const h = verbFor(it0.head) ?? pred;
        if (h !== undefined) {
          const reflex = W[it0.head].pos === 'PRON' && has(W[it0.head], 'Reflex', 'Yes');
          add(it0.head, h, NAMING.has(W[h].lemma) && W[it0.head].pos === 'PROPN' ? 'xcomp' : 'obj', [accPron(it0) ? `${surf(it0.head)} is an object-case pronoun` : 'a noun phrase after the verb that is not the subject is its direct object', ...(reflex ? ['reflexive pronoun'] : [])], accPron(it0) ? 0.9 : 0.78);
          taken.add(it0);
          if (objs.length >= 2) {
            const it1 = objs[1];
            if (it0.last < it1.first && W[it1.head].pos !== 'PRON') { add(it1.head, h, 'obj', ['a second noun phrase right after the first: the first is the receiver, this is the thing given'], 0.5, { status: 'conflicted' }); taken.add(it1); relReassign(it0.head, 'iobj'); }
            else if (objs.length >= 2) notes.push(`“${surf(it1.head)}” is another bare noun phrase after the object; the rules did not place it.`);
          }
        }
      }
    }
    {
      const r0 = [...rels.values()].find((r) => r.relation === 'obj' && W[r.dependent].pos === 'PRON' && has(W[r.dependent], 'Case', 'Acc') && tokens[r.dependent + 1] !== undefined);
      const embedded = r0 && clauses.some((c2) => c2.parent === C && (c2.kind === 'sub') && c2.start === r0.dependent + 1 && (c2.whMarker || W[c2.start].n === 'at') && r0.head === (inf.head0 ?? r0.head));
      if (r0 && embedded) relReassign(r0.dependent, 'iobj');
    }
    function relReassign(dep: number, rel: Rel): void { const r = rels.get(dep); if (r) { r.relation = rel; r.label = labelFor(rel, r.head); r.basis.push(rel === 'iobj' ? 'an object pronoun right before a clause or a second noun phrase is the receiver (“tell ME what …”)' : ''); r.basis = r.basis.filter(Boolean); r.confidence = Math.min(r.confidence, 0.7); } }

    // ---- prepositional phrases, adverbs, rest
    const nominalItemsBefore = (pos: number): Item | undefined => { let best: Item | undefined; for (const it of items) if (it.last < pos && (it.kind === 'np' || it.kind === 'pp')) best = it; const between = items.some((x) => x.first > (best?.last ?? -1) && x.last < pos && x !== best && (x.kind === 'verb' || x.kind === 'adv' || x.kind === 'part')); return between ? undefined : best; };
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.kind === 'pp') {
        if (rels.has(it.head)) continue;
        const prev = nominalItemsBefore(it.first);
        const verb = verbForAdv(it.head) ?? pred;
        const prevNp = prev && prev.kind === 'np' && !(isTime.has(prev.head)) && W[prev.head].pos !== 'PRON' ? prev : undefined;
        const prepNm = W[it.adp as number].n;
        if (it === copPred) continue;
        const nominalPred = verb !== undefined && !isVerbal(W[verb]) && W[verb].pos !== 'ADJ';
        if (nominalPred && verb !== undefined) {
          add(it.head, prevNp ? prevNp.head : verb, 'nmod', ['a prepositional phrase in a sentence without a verb the rules know: it modifies the noun before it'], 0.6);
        } else if (prevNp && preOf(prevNp) && prevNp === subjItem) {
          add(it.head, prevNp.head, 'nmod', [`the prepositional phrase follows the noun ${surf(prevNp.head)} directly in the first position of the sentence: it belongs to the noun`], 0.6, { alts: verb !== undefined ? [{ head: verb, relation: 'obl', confidence: 0.3, why: 'it could also modify the verb' }] : undefined });
        } else if (prevNp && verb !== undefined) {
          const nounFirst = prepNm === 'av' || prepNm === 'til';
          const nounAlt: SyntaxAlternative = { head: prevNp.head, relation: 'nmod', confidence: nounFirst ? 0.45 : 0.3, why: `“${surf(it.adp as number)} ${surf(it.head)}” follows the noun phrase ${surf(prevNp.head)} directly; it could belong to that noun instead of the verb` };
          add(it.head, verb, 'obl', [`the prepositional phrase stands after the verb and its object: attached to the verb ${surf(verb)} by default`], 0.62, { alts: [nounAlt] });
        } else if (verb !== undefined && !isVerbal(W[verb]) && W[verb].pos !== 'ADJ') {
          add(it.head, verb, 'nmod', ['a prepositional phrase after a noun phrase, in a sentence without a verb the rules know: it modifies the noun'], 0.6);
        } else if (verb !== undefined) {
          add(it.head, verb, 'obl', ['a prepositional phrase after the verb is an adverbial or the verb’s prepositional object'], 0.78);
        }
      } else if (it.kind === 'adv') {
        if (rels.has(it.head)) continue;
        const h = pred;
        const w = W[it.head];
        if (h === undefined) continue;
        if (it.head === C.marker) continue;
        if (it.head === firstWord && w.n === 'for' && C === root && items.some((x) => x.kind === 'verb')) { add(it.head, h, 'cc', ['sentence-initial “for” before a full clause: a coordinating word (“for / because”)'], 0.6); continue; }
        add(it.head, h, 'advmod', [NEG_ADV.has(w.n) ? 'the negation modifies the predicate of its clause' : 'an adverb modifies the predicate of its clause'], 0.84);
      } else if (it.kind === 'adjp' && it !== copPred && it.head !== subjItem?.head) {
        if (rels.has(it.head)) continue;
        const v = verbFor(it.head) ?? pred;
        if (v !== undefined && v !== it.head) add(it.head, v, 'xcomp', ['an adjective after a verb that is not “be”: a predicate complement (jeg har det bra)'], 0.5);
      } else if (it.kind === 'intj') {
        if (pred !== undefined && pred !== it.head) add(it.head, pred, 'discourse', ['an interjection / greeting'], 0.8);
      } else if (it.kind === 'np' && isVocative(it) && pred !== undefined && pred !== it.head) {
        add(it.head, pred, 'vocative', ['a name between commas (or between a comma and the end) is the person addressed'], 0.7);
      } else if (it.kind === 'other' && it.adp !== undefined && !rels.has(it.head)) {
        // a stranded preposition ("... du tror på"): a particle of the nearest verb
        const v = verbFor(it.head);
        if (v !== undefined) add(it.head, v, 'compound', ['the preposition has no noun phrase after it in this clause: it belongs to the verb as a particle'], 0.5);
      } else if (it.kind === 'other' && W[it.head].unit && /^reflexive/.test(W[it.head].unit!.role)) {
        const u = W[it.head].unit!;
        add(it.head, u.head, 'expl', [`${surf(it.head)} is the reflexive pronoun of the verb unit “${u.display}”`], 0.8);
      } else if (it.kind === 'other' && W[it.head].unit && W[it.head].unit!.role === 'particle') {
        const u = W[it.head].unit!;
        add(it.head, u.head, 'compound', [`${surf(it.head)} is the particle of the particle verb “${u.display}”`], 0.85);
      }
    }
    // a verb-less fragment: its first phrase is the head; the other phrases hang on it
    return inf;
  };

  for (const C of clauses) info.set(C.id, analyseClause(C));

  // ───────────────────────────── 4. the clauses on each other ─────────────────────────────
  const predOf = (C: Cl | undefined): number | undefined => (C ? info.get(C.id)?.pred : undefined);
  let rootPred: number | undefined = predOf(root);
  if (rootPred === undefined) for (const C of clauses) { const p = predOf(C); if (p !== undefined) { rootPred = p; break; } }

  const lastNominalBefore = (host: Cl, pos: number): Item | undefined => {
    const hi = info.get(host.id);
    if (!hi) return undefined;
    let best: Item | undefined;
    for (const it of hi.items) if (it.last < pos && (it.kind === 'np' || it.kind === 'pp')) best = it;
    if (!best) return undefined;
    // nothing but punctuation may stand between it and the clause
    for (let k = best.last + 1; k < pos; k++) if (W[k].word && owner[k] === host && k !== best.last) return undefined;
    return best;
  };

  for (const C of clauses) {
    const P = predOf(C);
    if (C === root) continue;
    const parent = C.parent as Cl;
    const hostPred = predOf(parent);
    if (P === undefined) {
      if (C.marker !== undefined && W[C.marker].pos) notes.push(`The clause opened by “${surf(C.marker)}” has no verb the rules could find; it was not attached.`);
      continue;
    }
    const markerWord = C.marker !== undefined ? W[C.marker] : undefined;
    if (C.kind === 'coord') {
      const prevPred = predOf(C.prev);
      if (prevPred !== undefined) {
        add(P, prevPred, 'conj', [`a new clause (with its own finite verb) joined by “${surf(C.marker as number)}” to the one before`], 0.82);
        add(C.marker as number, P, 'cc', ['coordinating word that opens the second clause'], 0.9);
      }
    } else if (C.kind === 'rel') {
      const host = lastNominalBefore(parent, C.marker ?? C.start);
      if (host) {
        add(P, host.head, 'acl', [C.marker !== undefined ? `“som” opens a clause that describes ${surf(host.head)}, the noun phrase right before it` : `a clause with its own subject and finite verb right after ${surf(host.head)} and no conjunction: a relative clause without “som”`], C.marker !== undefined ? 0.78 : 0.6);
        if (C.marker !== undefined) add(C.marker, P, 'mark', ['relative som opens the clause; it stands for the subject or object of the verb inside'], 0.85);
      } else if (hostPred !== undefined && C.marker !== undefined) {
        add(P, hostPred, 'advcl', ['“som” without a noun phrase before it: taken as an adverbial clause of the verb'], 0.45);
        add(C.marker, P, 'mark', ['relative som opens the clause'], 0.7);
      }
    } else if (C.kind === 'sub') {
      if (hostPred === undefined) continue;
      const mw = markerWord;
      if (C.whMarker && mw) {
        add(P, hostPred, 'ccomp', [`the question word “${surf(mw.i)}” after the verb opens an embedded question that is the content of ${surf(hostPred)}`], 0.78);
        const ci = info.get(C.id) as Info;
        if (C.somAfterWh !== undefined) { add(mw.i, P, 'nsubj', ['the question word is followed by “som”: it stands for the subject of the embedded verb'], 0.7); add(C.somAfterWh, P, 'mark', ['“som” after a question word opens the verb of the embedded question'], 0.7); }
        else if (mw.pos === 'ADV') add(mw.i, P, 'advmod', ['an interrogative adverb modifies the verb of its own clause'], 0.85);
        else add(mw.i, P, ci.subj !== undefined ? 'obj' : 'nsubj', [ci.subj !== undefined ? 'the clause already has a subject, so the question word is the object' : 'the clause has no other subject: the question word is it'], 0.7);
      } else if (mw) {
        const n0 = mw.n;
        const hostInfo = info.get((parent).id);
        const frontedBefore = hostInfo && hostInfo.C.fin !== undefined && C.start < hostInfo.C.fin;
        const hostWords = parent.toks.filter((t) => t < C.start);
        const consec = n0 === 'at' && hostWords.some((t) => CONSEC.has(W[t].n) && W[t].pos !== 'PRON');
        let rel: Rel = 'advcl';
        let why = `“${surf(mw.i)}” opens an adverbial clause (time, reason, condition) of ${surf(hostPred)}`;
        let conf = 0.82;
        let alts: SyntaxAlternative[] | undefined;
        if (n0 === 'at' && !consec && !frontedBefore) { rel = 'ccomp'; why = `“${surf(mw.i)}” opens a clause that tells what ${surf(hostPred)} says, thinks or shows`; conf = 0.8; }
        else if (n0 === 'at' && consec) { rel = 'advcl'; why = `“så / slik … at” (so … that): the at-clause gives the result; it is adverbial`; conf = 0.7; }
        else if (n0 === 'at') { rel = 'advcl'; why = `a fronted “at” clause stands before the verb of ${surf(hostPred)}`; conf = 0.65; }
        else if ((n0 === 'om') && !frontedBefore) { rel = 'ccomp'; why = `“om” (whether) after the verb opens an indirect question`; conf = 0.65; alts = [{ head: hostPred, relation: 'advcl', confidence: 0.25, why: '“om” can also open an adverbial clause (“whether or not”)' }]; }
        else if (n0 === 'så' || n0 === 'so') { rel = 'advcl'; why = `“${surf(mw.i)}” (so that) opens a result clause of ${surf(hostPred)}`; conf = 0.7; }
        else if ((n0 === 'som') && mw.pos === 'SCONJ') { rel = 'advcl'; why = '“som” (as, like) opens a comparison clause'; conf = 0.55; }
        add(P, hostPred, rel, [why], conf, { alts });
        add(mw.i, P, 'mark', ['subordinating word at the start of its clause'], 0.9);
      }
    }
  }

  // sentence-initial "for" (the old "for" = because / and so) is a coordinator of the whole sentence
  const firstW = words[0];
  if (firstW && firstW.n === 'for' && rootPred !== undefined && !rels.has(firstW.i) && (firstW.pos === 'ADV' || firstW.pos === 'ADP' || firstW.pos === 'CONJ')) {
    const nxt = words[1];
    if (nxt && (nxt.pos === 'ADV' || nxt.pos === 'PRON' || nxt.pos === 'NOUN' || nxt.pos === 'PROPN' || nxt.pos === 'DET')) add(firstW.i, rootPred, 'cc', ['sentence-initial “for” before a full clause: a coordinating word (“for / because”)'], 0.6);
  }
  // a phrase-level conjunction before the first word of the sentence, or one left over
  for (const C of clauses) {
    const inf = info.get(C.id);
    if (!inf || inf.pred === undefined) continue;
    for (const it of inf.items) if (it.kind === 'cc' && !rels.has(it.head)) {
      const k = inf.items.indexOf(it);
      if (k === 0) add(it.head, inf.pred, 'cc', ['a coordinating word at the start of its clause'], 0.6);
    }
  }
  // ── the root
  if (rootPred !== undefined) add(rootPred, undefined, 'root', [W[rootPred].pos === 'VERB' || W[rootPred].pos === 'AUX' ? 'the main verb of the main clause' : 'the main word of the sentence: no finite verb, so its first phrase is taken'], isVerbal(W[rootPred]) ? 0.92 : (info.get(0)?.items.some((x) => x.kind === 'verb') ? 0.85 : 0.5));

  // ── punctuation
  for (let i = 0; i < n; i++) {
    const t = W[i];
    if (t.word || rels.has(i) || !/\S/.test(t.s)) continue;
    let head: number | undefined;
    if (isFinalPunct(t.s) || i === n - 1) head = rootPred;
    else {
      for (let j = i + 1; j < n; j++) if (W[j].word) { head = predOf(owner[j]) ?? rootPred; break; }
      head ??= rootPred;
    }
    if (head !== undefined && head !== i) add(i, head, 'punct', ['punctuation hangs on the main word of its clause'], 0.95);
  }

  // ── unattached words
  const lemmaOf = (w: Wd): string => w.s;
  let attachedWords = 0;
  for (const w of words) {
    if (rels.has(w.i)) { attachedWords++; continue; }
    notes.push(!w.pos ? `“${lemmaOf(w)}” is not in the word list, so the rules left it without a relation.` : `“${lemmaOf(w)}” (${w.pos}) could not be attached by the rules.`);
  }
  if (words.length > 28) notes.push('A long sentence: the rules read it clause by clause and may have lost track of the longer dependencies.');

  const spans: ClauseSpan[] = clauses.map((C) => {
    const kind: ClauseSpan['kind'] = C.kind === 'main' ? 'main' : C.kind === 'sub' ? 'subordinate' : C.kind === 'rel' ? 'relative' : 'coordinate';
    const labels: Record<ClauseSpan['kind'], string> = { main: 'main clause', subordinate: C.whMarker ? 'embedded question' : 'subordinate clause', relative: C.marker !== undefined ? 'relative clause (som)' : 'relative clause without som', coordinate: 'coordinated clause', quote: 'quotation' };
    const lastTok = C.toks.length ? C.toks[C.toks.length - 1] : C.end;
    const firstTok = C.toks.length ? C.toks[0] : C.start;
    return { start: firstTok, end: Math.max(C.end, lastTok), kind, ...(C.marker !== undefined ? { marker: C.marker } : {}), label: labels[kind] };
  });

  const relations = [...rels.values()].sort((a, b) => a.dependent - b.dependent);
  // the card finds the clause of a word with `find`: the innermost span must come first
  spans.sort((a, b) => (a.end - a.start) - (b.end - b.start) || a.start - b.start);
  return {
    languageId: std,
    analyzer: `${analyzer}:syntax`,
    tokens: tokens.map((t) => t.surface),
    relations,
    clauses: spans,
    notes,
    attached: words.length ? Math.round((attachedWords / words.length) * 1000) / 1000 : 0,
  };
}

/**
 * Contextual syntax of a Norwegian sentence. A selection that holds several sentences (a full stop, ! or ? followed by more words) is
 * read sentence by sentence, each with its own root, and the results are joined with the token indexes of the whole selection.
 */
export function norwegianSyntax(std: NoStandard, tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const cuts: number[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].isWord || !/^[.!?…]+$/.test(tokens[i].surface)) continue;
    let j = i + 1;
    while (j < tokens.length && !tokens[j].isWord && /^[»”"’')\]]$/.test(tokens[j].surface)) j++;
    if (j < tokens.length && tokens[j].isWord) { cuts.push(j); i = j - 1; }
  }
  if (!cuts.length) return syntaxOfOne(std, tokens, analyses);
  const bounds = [0, ...cuts, tokens.length];
  const parts = bounds.slice(0, -1).map((b, k) => ({ at: b, a: syntaxOfOne(std, tokens.slice(b, bounds[k + 1]), analyses.slice(b, bounds[k + 1]), b) }));
  const words = tokens.filter((t) => t.isWord).length;
  const attachedWords = parts.reduce((n, p) => n + Math.round(p.a.attached * tokens.slice(p.at, p.at + p.a.tokens.length).filter((t) => t.isWord).length), 0);
  const shift = (p: { at: number }, r: SyntaxRelation): SyntaxRelation => ({
    ...r, dependent: r.dependent + p.at, ...(r.head !== undefined ? { head: r.head + p.at } : {}),
    ...(r.alternatives ? { alternatives: r.alternatives.map((x) => ({ ...x, ...(x.head !== undefined ? { head: x.head + p.at } : {}) })) } : {}),
  });
  return {
    languageId: std,
    analyzer: parts[0].a.analyzer,
    tokens: tokens.map((t) => t.surface),
    relations: parts.flatMap((p) => p.a.relations.map((r) => shift(p, r))),
    clauses: parts.flatMap((p) => (p.a.clauses ?? []).map((c) => ({ ...c, start: c.start + p.at, end: c.end + p.at, ...(c.marker !== undefined ? { marker: c.marker + p.at } : {}) }))),
    notes: ['The selection holds more than one sentence; each sentence was read on its own and has its own main word.', ...parts.flatMap((p) => p.a.notes)],
    attached: words ? Math.round((attachedWords / words) * 1000) / 1000 : 0,
  };
}
