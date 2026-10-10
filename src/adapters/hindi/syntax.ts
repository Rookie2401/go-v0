/**
 * Hindi contextual syntax (Linguistic Engine V2, Stage 4): shallow dependencies between the words of one sentence, from
 * the adapter's own readings and verb groups. Machine-drafted from general knowledge of Hindi grammar, not checked by a
 * native speaker; every relation is `generated` and says in `basis` what it relied on.
 *
 * Shape of the rules. Hindi is verb-final, so the verb groups (`buildVerbGroups`) cut the sentence into clauses: the words
 * between one group and the next are the arguments of the later group. Inside such a span the words are chunked into
 * noun phrases (modifiers + head + postpositions, a genitive linking two phrases), and the chunks are then given a function
 * by their case marker (ने agent, को dative or object, other postpositions oblique) and, for the bare ones, by agreement
 * with the verb. Where agreement and order do not decide, both readings are kept as `alternatives`. Clauses are linked by
 * their opening words (कि, अगर / जब, जो, और). A word nothing covers gets no relation. Nothing here reads a dictionary or a
 * corpus; the tables below are short closed lists.
 */
import type { AnalyzedToken, PartOfSpeech, RawToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import { RELATION_WORDS } from '../../core/syntax';
import { makeCtx, type Ctx } from './construction-ctx';
import { detectHindiPhrases } from './phrases';
import { HINDI_VECTOR_VERBS, feat, type C, type VerbGroup } from './verb-group';

export const HINDI_SYNTAX_ANALYZER = 'hindi-syntax@1';

const nfc = (s: string): string => s.normalize('NFC');
const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean).map(nfc));

// ───────────────────────────── closed lists ─────────────────────────────
const GEN = set('का के की');
const LIGHT_ADP = set('ने को से में पर तक का के की');
const LOCATIVE = set('में पर पास के');
const DEGREE = set('बहुत काफ़ी काफी बेहद ज़्यादा ज्यादा कम सबसे बिलकुल बिल्कुल ज़रा जरा थोड़ा इतना उतना जितना कितना और अधिक');
const NEGATION = set('नहीं नही न मत ना');
const PARTICLES = set('ही भी तो जी सा सी भर');
const DEM_LEMMAS = set('यह वह ये वे यही वही');
const IND_DET = set('कोई कुछ सब हर कौन कितना');
const CORRELATIVE = /^(वह|वे|वही|वो|उस|उन|उसे|उन्हें|उसने|उन्होंने|उसका|उसको|उससे|उसमें|उसी)$/u;
const POSS_SURFACE = /^(मेरा|मेरे|मेरी|तेरा|तेरे|तेरी|हमारा|हमारे|हमारी|तुम्हारा|तुम्हारे|तुम्हारी|आपका|आपके|आपकी|उसका|उसके|उसकी|इसका|इसके|इसकी|उनका|उनके|उनकी|इनका|इनके|इनकी|किसका|किसके|किसकी|जिसका|जिसके|जिसकी|अपना|अपने|अपनी)$/u;
/** Verbs whose experiencer stands in the dative (को): the thing felt or owned agrees with the verb. */
const DATIVE_SUBJECT = set('लगना चाहिए पड़ना भाना सूझना दिखना मिलना आना होना');
const SUB_FRONT = set('जब अगर यदि जैसे चाहे जबकि');
const SUB_BACK = set('क्योंकि ताकि');

/** Nouns that, after इस / उस / हर …, name the time or manner of the action rather than a doer or a thing done. */
const ADVERBIAL_NOUNS = set('प्रकार तरह समय दिन रात बार साल वर्ष सप्ताह महीना सुबह शाम दोपहर');
const ARGUMENT_ADP = set('को से में पर तक');
const MOTION = set('जाना आना पहुँचना लौटना चलना भागना निकलना उतरना चढ़ना पहुंचना');
const TIME_NOUNS = set('सुबह शाम रात दोपहर दिन समय तारीख हफ़्ता सप्ताह महीना साल वर्ष बार');
const SPEECH = set('कहना बोलना पूछना बताना सोचना समझना जानना सुनना लिखना');
const RELATIONAL_ADJ = set('समान सदृश तुल्य');
const LVC_VERBS = set('करना देना लेना मारना पाना');
const NUMBER_WORDS = set('एक दो तीन चार पाँच छह छः सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस तीस चालीस पचास साठ सत्तर अस्सी नब्बे सौ हज़ार लाख करोड़');
const AGR_WORDS: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Sing: 'singular', Plur: 'plural', '1': 'first person', '2': 'second person', '3': 'third person' };

// ───────────────────────────── feature sets ─────────────────────────────
interface FS { G: Set<string>; N: Set<string>; P: Set<string> }
const emptyFS = (): FS => ({ G: new Set(), N: new Set(), P: new Set() });
const addAll = (to: Set<string>, vals: Iterable<string>): void => { for (const v of vals) to.add(v); };
interface Verdict { state: 'agrees' | 'clash' | 'unknown'; matched: string[] }

function compare(a: FS, b: FS, keys: Array<keyof FS>): Verdict {
  const matched: string[] = [];
  let clash = false;
  for (const k of keys) {
    if (a[k].size === 0 || b[k].size === 0) continue;
    const common = [...a[k]].filter((v) => b[k].has(v));
    if (common.length === 0) clash = true;
    else matched.push(...common.map((v) => AGR_WORDS[v] ?? v));
  }
  return { state: clash ? 'clash' : matched.length > 0 ? 'agrees' : 'unknown', matched: [...new Set(matched)] };
}

function fsOf(cands: readonly C[], pos?: PartOfSpeech[]): FS {
  const out = emptyFS();
  for (const c of cands) {
    if (pos && (!c.pos || !pos.includes(c.pos))) continue;
    addAll(out.G, feat(c, 'Gender'));
    addAll(out.N, feat(c, 'Number'));
    addAll(out.P, feat(c, 'Person'));
  }
  return out;
}

// ───────────────────────────── structures ─────────────────────────────
type Kind = 'np' | 'pron' | 'adj' | 'adv' | 'neg' | 'num' | 'poss';
const NOMINAL_KINDS = new Set<Kind>(['np', 'pron', 'num', 'poss']);

interface Chunk {
  head: number;
  first: number;
  last: number;
  kind: Kind;
  adps: number[];
  /** ने / को / से … / "के पास"; for a pronoun the case inside its own spelling (उसने → ने). */
  caseKey?: string;
  genitive?: boolean;
  conjOf?: Chunk;
  coordinated?: boolean;
  voc?: boolean;
  rel?: boolean;
  /** A name closed by an honorific (शर्मा जी): the next name is a new one. */
  closed?: boolean;
}

interface Loose { i: number; kind: 'part' | 'qa' | 'intj' | 'sconj' | 'adp' | 'conj' }
interface Leading { voc?: number; ki?: number; sub: number[]; cc: number[]; adv: number[]; corr?: number; adp: number[]; punct: number[]; fixed: number[] }
const emptyLead = (): Leading => ({ sub: [], cc: [], adv: [], adp: [], punct: [], fixed: [] });

interface Cl {
  k: number;
  g?: VerbGroup;
  tokens: number[];
  from: number;
  to: number;
  lead: Leading;
  copular: boolean;
  pred?: number;
  chunks: Chunk[];
  loose: Loose[];
  isRel: boolean;
  ante?: number;
  headed: boolean;
  nonFinite?: 'conv' | 'inf' | 'infobl';
  vocs: Chunk[];
  /** A "having done" clause: its first direct-case word is the subject of the clause after it. */
  lent?: Chunk;
  lentFrames?: Chunk[];
  /** Direct speech: a clause with no joining word after a verb of saying. */
  quote?: boolean;
  /** The clause has a ने-marked doer (or continues one that had it). */
  ergAgent?: boolean;
  /** The words that opened the clause or belong to it, for the clause spans. */
  own: number[];
}

/**
 * "होते हैं", "हुआ था": a participle of होना followed by a finite होना is one group, but the shared group builder keeps
 * them apart (a form of होना never continues a group that ends in होना). Here they are joined, the finite one as the helper.
 */
function mergeBeGroups(gs: VerbGroup[]): VerbGroup[] {
  const out: VerbGroup[] = [];
  for (const g of gs) {
    const prev = out[out.length - 1];
    const joins = prev && prev.main.lemma === 'होना' && prev.elems.length === 1 && (prev.main.kind === 'ipf' || prev.main.kind === 'pf')
      && g.main.lemma === 'होना' && g.elems.length === 1 && ['pres', 'past', 'fut', 'sub', 'fin'].includes(g.main.kind) && g.start === prev.end + 1;
    if (!joins) { out.push(g); continue; }
    const helper = { ...g.main, role: 'aux' as const };
    const idx = [...prev.tokenIndexes, ...g.tokenIndexes].sort((a, b) => a - b);
    out[out.length - 1] = { ...prev, elems: [prev.elems[0], helper], aux: [helper], tenseAux: helper, tokenIndexes: idx, end: g.end, particles: [...prev.particles, ...g.particles], core: prev.elems[0] };
  }
  return out;
}

// ───────────────────────────── main ─────────────────────────────
export function hindiSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const ctx: Ctx = makeCtx(tokens, analyses);
  const rels = new Map<number, SyntaxRelation>();
  const notes: string[] = [];
  const surf = (i: number): string => tokens[i]?.surface ?? '';
  const isWord = (i: number): boolean => !!tokens[i]?.isWord;
  const cands = (i: number): C[] => ctx.cands(i);
  const top = (i: number): C | undefined => cands(i)[0];
  const posOf = (i: number): PartOfSpeech | undefined => top(i)?.pos;
  const lemmaOf = (i: number): string => nfc(top(i)?.lemma ?? tokens[i]?.normalized ?? '');
  const normOf = (i: number): string => nfc(tokens[i]?.normalized ?? '');
  const pronType = (i: number): string | undefined => top(i)?.morph.PronType;

  const LABEL: Partial<Record<DependencyRelation, (h: string) => string>> = {
    nsubj: (h) => `subject of "${h}"`, obj: (h) => `direct object of "${h}"`, iobj: (h) => `the person affected (dative) with "${h}"`,
    obl: (h) => `adverbial phrase of "${h}" (place, time, means, source)`, nmod: (h) => `noun that belongs with "${h}"`,
    amod: (h) => `describes "${h}"`, det: (h) => `points at or quantifies "${h}"`, case: (h) => `postposition of "${h}"`,
    aux: (h) => `helping verb of "${h}"`, cop: (h) => `"is" linking the subject to "${h}"`, mark: (h) => `introduces the clause of "${h}"`,
    advmod: (h) => `adverb of "${h}"`, advcl: (h) => `clause that gives the circumstance of "${h}"`, acl: (h) => `clause that describes "${h}"`,
    ccomp: (h) => `clause that is what "${h}" says, knows or wants`, xcomp: (h) => `complement of "${h}"`, conj: (h) => `coordinated with "${h}"`,
    cc: (h) => `joins "${h}" to what came before`, nummod: (h) => `number of "${h}"`, discourse: (h) => `emphasis or tone on "${h}"`,
    vocative: (h) => `the one addressed by "${h}"`, flat: (h) => `part of the name "${h}"`, fixed: (h) => `part of a fixed phrase with "${h}"`,
    punct: (h) => `punctuation of "${h}"`, appos: (h) => `explains "${h}"`, dep: (h) => `attached to "${h}", relation not decided`,
  };
  const labelFor = (relation: DependencyRelation, head?: number): string => {
    if (relation === 'root') return 'the main word of the sentence';
    const f = LABEL[relation];
    return head !== undefined && f ? f(surf(head)) : RELATION_WORDS[relation];
  };

  /** Does attaching dep under head close a loop (head already hangs below dep)? */
  const loops = (dep: number, head: number): boolean => {
    let h: number | undefined = head;
    for (let n = 0; h !== undefined && n <= tokens.length; n++) {
      if (h === dep) return true;
      h = rels.get(h)?.head;
    }
    return false;
  };

  /** Attach `dep` to `head`; the first rule that reaches a word keeps it. */
  function put(dep: number, head: number | undefined, relation: DependencyRelation, basis: string[], confidence: number, alts?: SyntaxAlternative[]): boolean {
    if (rels.has(dep) || dep === head || dep < 0 || dep >= tokens.length) return false;
    if (head !== undefined && loops(dep, head)) return false;
    const alternatives = alts?.filter((a) => a.head !== dep);
    rels.set(dep, {
      dependent: dep,
      ...(head !== undefined ? { head } : {}),
      relation,
      label: labelFor(relation, head),
      basis: basis.length > 0 ? basis : ['rule'],
      confidence: Math.round(Math.min(0.95, Math.max(0.2, confidence)) * 100) / 100,
      ...(alternatives && alternatives.length > 0 ? { alternatives } : {}),
      status: alternatives && alternatives.length > 0 ? 'conflicted' : 'generated',
    });
    return true;
  }
  const alt = (relation: DependencyRelation, head: number | undefined, confidence: number, why: string): SyntaxAlternative => ({ relation, ...(head !== undefined ? { head } : {}), confidence, why });

  // दो ("two") before a noun is not the command "give": the shared group builder keeps both readings
  const notNumeral = (g: VerbGroup): boolean => {
    const i = g.main.i;
    const nx = tokens[i + 1];
    return !(g.elems.length === 1 && NUMBER_WORDS.has(nfc(tokens[i].normalized)) && posOf(i) !== 'VERB' && nx?.isWord && (posOf(i + 1) === 'NOUN' || posOf(i + 1) === 'ADJ'));
  };
  const groups = mergeBeGroups(ctx.groups.filter(notNumeral));
  const predHeadAlts = new Map<number, SyntaxAlternative[]>();
  const loosePending: number[] = [];
  let lvcCache: { get(i: number): number | undefined; gloss: Map<number, string> } | undefined;

  // ───────── agreement ─────────
  const nominalFS = (ch: Chunk): FS => {
    const out = fsOf(cands(ch.head), ['NOUN', 'PROPN', 'PRON', 'NUM', 'DET', 'ADJ']);
    if (posOf(ch.head) !== 'PRON' && out.P.size === 0) out.P.add('3');
    if (ch.coordinated) { out.N.clear(); out.N.add('Plur'); out.G.clear(); out.P.clear(); out.P.add('3'); }
    return out;
  };

  const verbFS = (g: VerbGroup | undefined): FS => {
    const out = emptyFS();
    if (!g) return out;
    const carriers = g.elems.filter((e) => e.kind === 'ipf' || e.kind === 'pf' || e.kind === 'prog');
    const part = carriers[carriers.length - 1];
    const finE = g.tenseAux ?? [...g.elems].reverse().find((e) => ['pres', 'past', 'fut', 'sub', 'fin', 'imp'].includes(e.kind));
    const partFS = part ? fsOf(cands(part.i).filter((c) => c.lemma === part.lemma), ['VERB', 'AUX']) : emptyFS();
    const finFS = finE ? fsOf(cands(finE.i).filter((c) => c.lemma === finE.lemma && (c.morph.VerbForm ?? '').includes('Fin')), ['VERB', 'AUX']) : emptyFS();
    addAll(out.G, partFS.G);
    if (!part) addAll(out.G, finFS.G);
    const commonN = [...partFS.N].filter((v) => finFS.N.has(v));
    addAll(out.N, commonN.length > 0 ? commonN : partFS.N.size > 0 ? partFS.N : finFS.N);
    addAll(out.P, finFS.P);
    return out;
  };

  const agreeWith = (ch: Chunk, vfs: FS, keys: Array<keyof FS> = ['G', 'N', 'P']): Verdict => compare(nominalFS(ch), vfs, keys);
  const sayAgree = (v: Verdict): string => (v.matched.length > 0 ? v.matched.join(' ') : 'person and number');

  // ───────── clause spans ─────────
  const clauses: Cl[] = [];
  const isCopular = (g: VerbGroup): boolean => g.main.lemma === 'होना' && g.elems.every((e, k) => k === 0 || e.lemma === 'होना');
  const nonFiniteKind = (g: VerbGroup): Cl['nonFinite'] => {
    if (g.elems.length !== 1) return undefined;
    const kd = g.main.kind;
    return kd === 'conv' ? 'conv' : kd === 'inf' ? 'inf' : kd === 'infobl' ? 'infobl' : undefined;
  };
  const buildClause = (k: number, g: VerbGroup | undefined, from: number, to: number): Cl => {
    const tk: number[] = [];
    for (let i = from; i <= to; i++) if (!g || !g.tokenIndexes.includes(i)) tk.push(i);
    return { k, g, tokens: tk, from, to: g ? g.end : to, lead: emptyLead(), copular: g ? isCopular(g) : false, chunks: [], loose: [], vocs: [], isRel: false, headed: false, nonFinite: g ? nonFiniteKind(g) : undefined, own: [] };
  };
  if (groups.length === 0) clauses.push(buildClause(0, undefined, 0, tokens.length - 1));
  else {
    groups.forEach((g, k) => {
      const cl = buildClause(k, g, k === 0 ? 0 : groups[k - 1].end + 1, g.start - 1);
      if (k === groups.length - 1) { for (let i = g.end + 1; i < tokens.length; i++) cl.tokens.push(i); cl.to = tokens.length - 1; }
      clauses.push(cl);
    });
  }

  // ───────── words that open a clause ─────────
  const prevSub = (k: number): boolean => k > 0 && clauses.slice(0, k).some((c) => c.lead.sub.some((i) => SUB_FRONT.has(lemmaOf(i))));

  function parseLead(cl: Cl, span: number[]): number[] {
    let q = 0;
    const lead = cl.lead;
    for (; q < span.length; q++) {
      const i = span[q];
      if (!isWord(i)) {
        if (/^[,;:।॥“”"'‘’()\-–—…]$/u.test(surf(i))) { lead.punct.push(i); continue; }
        break;
      }
      const p = posOf(i);
      const lem = lemmaOf(i);
      const after = span[q + 1];
      if (cl.k > 0 && lead.voc === undefined && lead.sub.length === 0 && lead.cc.length === 0 && lead.ki === undefined && lead.punct.length > 0 && (p === 'NOUN' || p === 'PROPN') && after !== undefined && !isWord(after) && surf(after) === ',') { lead.voc = i; continue; }
      if (lem === 'और' && p !== 'SCONJ') lead.cc.push(i);
      else if (lem === 'कि' && p === 'SCONJ') lead.ki = i;
      else if (p === 'SCONJ') lead.sub.push(i);
      else if (lem === 'इसलिए') lead.adv.push(i);
      else if (p === 'CONJ') lead.cc.push(i);
      else if (cl.k > 0 && lead.corr === undefined && (lem === 'तो' || lem === 'तब') && prevSub(cl.k)) lead.corr = i;
      else if (p === 'ADP' && lead.sub.length === 1 && lemmaOf(lead.sub[0]) === 'जब' && lem === 'तक') lead.fixed.push(i);
      else if (p === 'ADP' && cl.k > 0 && lead.sub.length === 0 && lead.ki === undefined && lead.cc.length === 0 && (clauses[cl.k - 1].nonFinite === 'inf' || clauses[cl.k - 1].nonFinite === 'infobl')) lead.adp.push(i);
      else break;
    }
    return span.slice(q);
  }

  // ───────── noun phrases ─────────
  const isNominalPos = (p?: PartOfSpeech): boolean => p === 'NOUN' || p === 'PROPN' || p === 'PRON';
  const relPron = (i: number): boolean => isWord(i) && posOf(i) === 'PRON' && pronType(i) === 'Rel';

  /** The case a pronoun carries inside its own spelling (उसने, मुझे, उसमें). */
  function fusedCase(i: number): string | undefined {
    const c = top(i);
    if (!c || c.pos !== 'PRON') return undefined;
    if (c.morph.Case === 'Erg') return 'ने';
    if (c.morph.Case === 'Dat') return 'को';
    if (c.parts && c.parts.length >= 2) {
      const last = c.parts[c.parts.length - 1];
      const l = nfc(last.lemma ?? last.text);
      if (LIGHT_ADP.has(l) || last.pos === 'ADP') return l;
    }
    return undefined;
  }

  function agreeText(adj: number, noun: number): { basis: string; ok: boolean } {
    const a = compare(fsOf(cands(adj), ['ADJ', 'DET', 'NUM']), fsOf(cands(noun), ['NOUN', 'PROPN']), ['G', 'N']);
    if (a.state === 'agrees') return { basis: `${surf(adj)} agrees with ${surf(noun)} (${a.matched.join(' ')})`, ok: true };
    if (a.state === 'clash') return { basis: `${surf(adj)} stands before ${surf(noun)} but its gender or number differs (the adjective may be invariable)`, ok: false };
    return { basis: `${surf(adj)} stands directly before the noun ${surf(noun)}; the forms do not show agreement`, ok: true };
  }

  /** Does the genitive word agree with the possessed noun? (का: masculine singular; के: masculine plural or oblique; की: feminine) */
  function genitiveAgreement(genWord: number, noun: number): { basis: string; ok: boolean } {
    const s = normOf(genWord);
    const ending = s.endsWith('ी') ? 'Fem' : s.endsWith('े') ? 'MascObl' : s.endsWith('ा') ? 'MascSing' : '';
    const nc = cands(noun).filter((c) => c.pos === 'NOUN' || c.pos === 'PROPN');
    const n = fsOf(nc);
    if (ending === '' || n.G.size === 0) return { basis: `${surf(genWord)} links the two nouns; the possessed noun shows no gender to check`, ok: true };
    const pl = n.N.has('Plur') && !n.N.has('Sing');
    const obl = nc.length > 0 && nc.every((c) => feat(c, 'Case').length > 0 && !feat(c, 'Case').includes('Dir'));
    const ok = ending === 'Fem' ? n.G.has('Fem') : n.G.has('Masc') && (ending === 'MascObl' ? pl || obl : !pl && !obl);
    const form = ending === 'Fem' ? 'feminine' : ending === 'MascObl' ? 'masculine plural or oblique' : 'masculine singular';
    return ok
      ? { basis: `${surf(genWord)} is the ${form} form and ${surf(noun)} fits it: a genitive agrees with the thing owned, not with the owner`, ok: true }
      : { basis: `${surf(genWord)} is the ${form} form but ${surf(noun)} does not fit it; the pair is kept because a genitive stands before the noun it belongs to`, ok: false };
  }

  type Pend = { i: number; t: 'adj' | 'poss' | 'num' | 'det' | 'deg'; viaDeg?: number; alts?: SyntaxAlternative[] };

  function chunkTokens(cl: Cl, list: number[]): void {
    let pend: Pend[] = [];
    let last: Chunk | undefined;
    let pendingConj: number | undefined;
    let pendingVoc: number | undefined;
    let sinceBreak = false;

    const flushPend = (): void => {
      const rest = pend;
      pend = [];
      for (const m of rest) {
        const kind: Kind = m.t === 'adj' || m.t === 'deg' ? 'adj' : m.t === 'num' ? 'num' : m.t === 'poss' ? 'poss' : 'pron';
        const ch: Chunk = { head: m.i, first: m.viaDeg ?? m.i, last: m.i, kind, adps: [] };
        cl.chunks.push(ch);
        last = ch;
      }
    };

    const newHead = (i: number, kind: Kind): Chunk => {
      const ch: Chunk = { head: i, first: i, last: i, kind, adps: [] };
      const fc = kind === 'pron' ? fusedCase(i) : undefined;
      if (fc) ch.caseKey = fc;
      if (kind === 'pron' && pronType(i) === 'Rel') ch.rel = true;
      for (const m of pend) {
        ch.first = Math.min(ch.first, m.i, m.viaDeg ?? m.i);
        if (m.t === 'adj') { const a = agreeText(m.i, i); put(m.i, i, 'amod', [a.basis], a.ok ? 0.85 : 0.55); }
        else if (m.t === 'num') put(m.i, i, 'nummod', [`${surf(m.i)} is a number standing before the noun it counts`], 0.85);
        else if (m.t === 'det') put(m.i, i, 'det', [`${surf(m.i)} stands before ${surf(i)} and points at or quantifies it`], m.alts ? 0.6 : 0.85, m.alts);
        else if (m.t === 'deg') put(m.i, i, kind === 'adv' ? 'advmod' : 'amod', [kind === 'adv' ? `${surf(m.i)} stands before the adverb ${surf(i)} and sets its degree` : `${surf(m.i)} is a quantity word before the noun ${surf(i)} ("much, many, more")`], 0.7);
        else {
          const a = genitiveAgreement(m.i, i);
          put(m.i, i, 'nmod', [`${surf(m.i)} is a possessive (a genitive of a pronoun); ${a.basis}`], a.ok ? 0.88 : 0.6);
        }
      }
      pend = [];
      if (last?.genitive) {
        const owner = last.conjOf ?? last;
        const genTok = last.adps[last.adps.length - 1];
        const a = genitiveAgreement(genTok, i);
        put(owner.head, i, 'nmod', [`${surf(owner.head)} ${surf(genTok)} marks the owner of ${surf(i)}; ${a.basis}`], a.ok ? 0.88 : 0.6);
        last.genitive = false;
        owner.genitive = false;
        owner.caseKey = undefined;
        ch.first = Math.min(ch.first, owner.first);
        // the owner phrase is now inside this one
        const at = cl.chunks.indexOf(owner);
        if (at >= 0) cl.chunks.splice(at, 1);
        for (const other of cl.chunks) if (other.conjOf === owner) other.conjOf = undefined;
      }
      if (pendingConj !== undefined && last) {
        const prev = last.conjOf ?? last;
        const cc = pendingConj;
        if (put(i, prev.head, 'conj', [`${surf(cc)} joins ${surf(prev.head)} and ${surf(i)} as two of the same kind`], 0.85)) {
          put(cc, i, 'cc', [`${surf(cc)} is the conjunction between the two`], 0.9);
          ch.conjOf = prev;
          prev.coordinated = true;
        }
        pendingConj = undefined;
      }
      if (pendingVoc !== undefined) { put(pendingVoc, i, 'discourse', [`${surf(pendingVoc)} calls out to the one named`], 0.85); ch.voc = true; pendingVoc = undefined; }
      cl.chunks.push(ch);
      last = ch;
      sinceBreak = false;
      return ch;
    };

    /** Two names side by side and a postposition of argument-marking kind after the second: two people, not one name (मीरा नेहा से). */
    const nameThenArgument = (l: number[], q: number): boolean => {
      const nx = l[q + 1];
      return nx !== undefined && isWord(nx) && posOf(nx) === 'ADP' && ARGUMENT_ADP.has(lemmaOf(nx));
    };

    /** A common noun ahead (past adjectives, numbers, possessives) that word p could be the determiner of. */
    const nounAhead = (p: number): number | undefined => {
      for (let q = p + 1; q < list.length; q++) {
        const j = list[q];
        if (!isWord(j)) return undefined;
        const pp = posOf(j);
        if (NUMBER_WORDS.has(lemmaOf(j))) continue;
        if (pp === 'NOUN') return q;
        if (pp === 'ADJ' || pp === 'NUM' || pp === 'DET' || DEGREE.has(lemmaOf(j))) continue;
        return undefined;
      }
      return undefined;
    };

    const attachAdp = (i: number): boolean => {
      if (sinceBreak) return false;
      if (pend.length > 0) {
        const lastMod = pend[pend.length - 1];
        if ((lastMod.t === 'adj' || lastMod.t === 'poss') && (!last || lastMod.i > last.last)) { const keep = pend.slice(0, -1); pend = [lastMod]; flushPend(); pend = keep; }
        else return false;
      }
      if (!last) return false;
      const target = last;
      const lem = lemmaOf(i);
      const heavy = !LIGHT_ADP.has(lem);
      if (target.adps.length === 0) {
        if (heavy && !NOMINAL_KINDS.has(target.kind)) return false;
        target.adps.push(i);
        target.caseKey = lem;
        target.genitive = GEN.has(lem);
        const c = top(target.head);
        const obl = c && feat(c, 'Case').length > 0 && !feat(c, 'Case').includes('Dir') ? ' (the oblique form, as a postposition needs)' : '';
        put(i, target.head, 'case', [`${surf(i)} is a postposition standing right after ${surf(target.head)}${obl}`], 0.92);
        return true;
      }
      const prevLem = lemmaOf(target.adps[target.adps.length - 1]);
      if ((GEN.has(prevLem) && heavy) || (heavy === false && !LIGHT_ADP.has(prevLem)) || (GEN.has(prevLem) && !GEN.has(lem) && LIGHT_ADP.has(lem)) || (lem === 'से' && (prevLem === 'में' || prevLem === 'पर'))) {
        target.adps.push(i);
        target.caseKey = target.adps.map((a) => lemmaOf(a)).join(' ');
        target.genitive = GEN.has(lem) && !GEN.has(prevLem);
        put(i, target.head, 'case', [`${surf(i)} completes the compound postposition ${target.adps.map(surf).join(' ')}`], 0.88);
        return true;
      }
      return false;
    };

    for (let p = 0; p < list.length; p++) {
      const i = list[p];
      if (!isWord(i)) {
        if (/^[,;:।॥?!]$/u.test(surf(i))) { flushPend(); sinceBreak = true; }
        continue;
      }
      const c = top(i);
      const pos = c?.pos;
      const lem = lemmaOf(i);
      const norm = normOf(i);

      if (!c) {
        const nxt = list[p + 1];
        if (nxt !== undefined && isWord(nxt) && posOf(nxt) === 'ADP') newHead(i, 'np');
        else notes.push(`"${surf(i)}" is not in the word list and no rule places it.`);
        continue;
      }

      if (pos === 'ADP') {
        if (!attachAdp(i)) {
          // a relational word with nothing before it (ऊपर, बाहर, पास …) is an adverb of place
          if (!LIGHT_ADP.has(lem)) newHead(i, 'adv'); else cl.loose.push({ i, kind: 'adp' });
        }
        continue;
      }
      if (pos === 'CONJ' && norm === 'पर' && last && !sinceBreak && last.adps.length === 0 && attachAdp(i)) continue;

      if (DEGREE.has(lem) && lem !== 'और' && (pos === 'NOUN' || pos === 'ADJ' || pos === 'ADV')) {
        const nxt = list[p + 1];
        const nxtPos = nxt !== undefined && isWord(nxt) ? posOf(nxt) : undefined;
        if (nxtPos === 'ADV') { put(i, nxt, 'advmod', [`${surf(i)} stands before the adverb ${surf(nxt)} and sets its degree`], 0.85); continue; }
        if (nxtPos === 'ADJ' || nounAhead(p) !== undefined) { pend.push({ i, t: 'deg' }); continue; }
        newHead(i, 'adv');
        continue;
      }
      if (NUMBER_WORDS.has(lem) && (pos === 'NOUN' || pos === 'NUM' || pos === 'ADJ')) {
        const nx = list[p + 1];
        if (nounAhead(p) !== undefined || (nx !== undefined && isWord(nx) && posOf(nx) === 'ADJ')) pend.push({ i, t: 'num' });
        else newHead(i, 'num');
        continue;
      }
      if (pos === 'NOUN' || pos === 'PROPN') {
        if (pos === 'PROPN' && last && !sinceBreak && pend.length === 0 && posOf(last.head) === 'PROPN' && !last.closed && last.last === list[p - 1] && last.adps.length === 0 && last.kind === 'np' && !last.conjOf && !nameThenArgument(list, p)) {
          if (put(i, last.head, 'flat', [`${surf(i)} follows the name ${surf(last.head)} directly: one name in two words`], 0.8)) { last.last = i; continue; }
        }
        newHead(i, 'np');
        continue;
      }
      if (pos === 'PRON' && (lem === 'सब' || lem === 'दोनों' || lem === 'सभी') && last && !sinceBreak && pend.length === 0 && last.last === list[p - 1] && last.adps.length === 0 && posOf(last.head) === 'PRON' && !last.closed) {
        if (put(i, last.head, 'appos', [`${surf(i)} follows the pronoun ${surf(last.head)} and adds to it ("we all", "you both")`], 0.75)) { last.last = i; last.closed = true; continue; }
      }
      if (pos === 'PRON') {
        const pt = pronType(i);
        const fused = fusedCase(i);
        const obliqueBare = c.morph.Case === 'Obl' && !fused;
        const q = nounAhead(p);
        const nounTok = q !== undefined ? list[q] : undefined;
        const detable = lem !== 'कौन' && (DEM_LEMMAS.has(lem) || IND_DET.has(lem) || lem === 'क्या' || pt === 'Rel' || pt === 'Int' || pt === 'Ind');
        const afterKyaNoun = q !== undefined ? list.slice(q + 1).filter((j) => isWord(j) && !PARTICLES.has(normOf(j))) : [];
        if (lem === 'क्या' && p === list.findIndex((j) => isWord(j)) && cl.chunks.length === 0 && pend.length === 0 && (nounTok === undefined || q !== p + 1 || afterKyaNoun.length > 0)) {
          const later = list.slice(p + 1).filter((j) => isWord(j) && (isNominalPos(posOf(j)) || posOf(j) === 'ADJ'));
          if (later.length > 0) { cl.loose.push({ i, kind: 'qa' }); continue; }
        }
        if (nounTok !== undefined && detable && !fused && (lem !== 'क्या' || (q === p + 1 && afterKyaNoun.length === 0))) {
          const after = list.slice(q! + 1).filter((j) => isWord(j) && !PARTICLES.has(normOf(j)));
          const dem = DEM_LEMMAS.has(lem) && !obliqueBare;
          let asDet = true;
          let alts: SyntaxAlternative[] | undefined;
          const nxtAfterNoun = list[q! + 1];
          const adpAfter = nxtAfterNoun !== undefined && isWord(nxtAfterNoun) && posOf(nxtAfterNoun) === 'ADP';
          const hasOblForm = DEM_LEMMAS.has(lem) || lem === 'जो' || lem === 'कोई';
          if (adpAfter && !obliqueBare && hasOblForm) asDet = false;
          else if (adpAfter && !obliqueBare && (lem === 'सब' || lem === 'कुछ') && !fsOf(cands(nounTok), ['NOUN']).N.has('Plur')) asDet = false;
          else if (adpAfter && !obliqueBare && (lem === 'सब' || lem === 'कुछ')) alts = [alt('nsubj', cl.g?.main.i, 0.4, `${surf(i)} could be a pronoun of its own (everyone, something) with ${surf(nounTok)} a separate phrase: the noun carries a postposition`)];
          if (!asDet) { /* pronoun + separate noun */ }
          else if (dem) {
            const identifying = cl.copular && cl.g?.main.kind !== 'pf';
            if (identifying && after.length === 0) asDet = false;
            else if (!cl.copular && after.length === 0) alts = [alt('nsubj', cl.g?.main.i, 0.4, `${surf(i)} could be a pronoun of its own ("that one ... ${surf(nounTok)}") with ${surf(nounTok)} a separate word; the forms do not decide`)];
          }
          if (asDet) { pend.push({ i, t: 'det', alts }); continue; }
        }
        newHead(i, 'pron');
        continue;
      }
      if (pos === 'DET') {
        if (c.morph.Poss === 'Yes' || POSS_SURFACE.test(norm)) pend.push({ i, t: 'poss' });
        else if (nounAhead(p) !== undefined) pend.push({ i, t: 'det' });
        else newHead(i, 'pron');
        continue;
      }
      if (pos === 'NUM') {
        const nx = list[p + 1];
        if (nounAhead(p) !== undefined || (nx !== undefined && isWord(nx) && posOf(nx) === 'ADJ')) pend.push({ i, t: 'num' });
        else newHead(i, 'num');
        continue;
      }
      if (pos === 'ADJ' && RELATIONAL_ADJ.has(lem) && last?.genitive && !sinceBreak && pend.length === 0 && attachAdp(i)) continue;
      if (pos === 'ADJ') {
        const prevM = pend[pend.length - 1];
        if (pendingConj !== undefined && prevM && prevM.t === 'adj') {
          put(i, prevM.i, 'conj', [`${surf(pendingConj)} joins two adjectives that describe the same noun`], 0.8);
          put(pendingConj, i, 'cc', [`${surf(pendingConj)} is the conjunction between the two adjectives`], 0.9);
          pendingConj = undefined;
          continue;
        }
        if (pendingConj !== undefined && !prevM && last && !sinceBreak && nounAhead(p) === undefined) { newHead(i, 'adj'); continue; }
        if (prevM && prevM.t === 'deg' && prevM.i === list[p - 1]) {
          pend.pop();
          put(prevM.i, i, 'advmod', [`${surf(prevM.i)} stands before the adjective ${surf(i)} and sets its degree`], 0.88);
          pend.push({ i, t: 'adj', viaDeg: prevM.i });
          continue;
        }
        if (DEGREE.has(lem)) {
          const nxt = list[p + 1];
          if ((nxt !== undefined && isWord(nxt) && (posOf(nxt) === 'ADJ' || posOf(nxt) === 'ADV')) || nounAhead(p) !== undefined) { pend.push({ i, t: 'deg' }); continue; }
        }
        pend.push({ i, t: 'adj' });
        continue;
      }
      if (pos === 'ADV' || pos === 'PART') {
        if ((norm === 'जी' || lem === 'जी') && pos === 'PART' && last && !sinceBreak && pend.length === 0 && last.last === list[p - 1] && (last.kind === 'np') && last.adps.length === 0) {
          if (put(i, last.head, 'flat', [`${surf(i)} is the honorific particle after ${surf(last.head)}: one respectful way of naming a person`], 0.8)) { last.last = i; last.closed = true; continue; }
        }
        if (NEGATION.has(norm) || NEGATION.has(lem)) { cl.chunks.push({ head: i, first: i, last: i, kind: 'neg', adps: [] }); continue; }
        if (PARTICLES.has(norm) && pos === 'PART') {
          const prevTok = list[p - 1];
          if (last && !sinceBreak && pend.length === 0 && prevTok !== undefined && (prevTok === last.last || last.adps.includes(prevTok))) put(i, last.head, 'discourse', [`${surf(i)} is a particle that stresses ${surf(last.head)}, the phrase just before it`], 0.85);
          else cl.loose.push({ i, kind: 'part' });
          continue;
        }
        if (DEGREE.has(lem) || DEGREE.has(norm)) {
          const nxt = list[p + 1];
          if (nxt !== undefined && isWord(nxt) && posOf(nxt) === 'ADV') { put(i, nxt, 'advmod', [`${surf(i)} stands before the adverb ${surf(nxt)} and sets its degree`], 0.85); continue; }
          if (nxt !== undefined && isWord(nxt) && posOf(nxt) === 'ADJ') { pend.push({ i, t: 'deg' }); continue; }
          if (pos === 'ADV' && nounAhead(p) !== undefined) { pend.push({ i, t: 'deg' }); continue; }
        }
        newHead(i, 'adv');
        continue;
      }
      if (pos === 'CONJ') {
        if (last || pend.length > 0) pendingConj = i;
        else cl.loose.push({ i, kind: 'conj' });
        continue;
      }
      if (pos === 'INTJ') {
        if (lem === 'हे' || lem === 'ओ' || lem === 'अरे') pendingVoc = i;
        else cl.loose.push({ i, kind: 'intj' });
        continue;
      }
      if (pos === 'SCONJ') { cl.loose.push({ i, kind: 'sconj' }); continue; }
      notes.push(`"${surf(i)}" (${pos ?? 'no part of speech'}) is not covered by a rule here.`);
    }
    flushPend();
    if (pendingVoc !== undefined) cl.loose.push({ i: pendingVoc, kind: 'intj' });
    if (pendingConj !== undefined) cl.loose.push({ i: pendingConj, kind: 'conj' });
  }

  // ───────── process the spans in order, carrying a relative clause's antecedent forward ─────────
  let carryTokens: number[] = [];
  let carryLead: Leading | undefined;
  let carryAnte: number | undefined;
  clauses.forEach((cl) => {
    const span = [...carryTokens, ...cl.tokens];
    let list: number[];
    if (carryTokens.length > 0) {
      // the carried words came after this clause's opening words: they were already past them
      list = span;
      if (carryLead) cl.lead = carryLead;
    } else list = parseLead(cl, span);
    carryTokens = [];
    carryLead = undefined;
    // a relative pronoun after other words: the words before it belong to the NEXT clause (the one the relative clause sits inside)
    let split = -1;
    let seenWord = false;
    for (let q = 0; q < list.length; q++) {
      if (!isWord(list[q])) continue;
      if (relPron(list[q]) && seenWord) { split = q; break; }
      seenWord = true;
    }
    if (split > 0 && cl.g && cl.k < clauses.length - 1) {
      carryTokens = list.slice(0, split);
      carryLead = cl.lead;
      cl.lead = emptyLead();
      list = list.slice(split);
      cl.isRel = true;
      for (let q = carryTokens.length - 1; q >= 0; q--) if (isWord(carryTokens[q]) && isNominalPos(posOf(carryTokens[q]))) { cl.ante = carryTokens[q]; break; }
      if (cl.ante === undefined) cl.isRel = false;
    } else if (list.length > 0 && list.find((j) => isWord(j)) !== undefined && relPron(list.find((j) => isWord(j)) as number) && cl.g) cl.isRel = true;
    void carryAnte;
    cl.own = list;
    chunkTokens(cl, list);
    assign(cl);
  });
  // carried words with no clause left to take them: a verbless fragment
  if (carryTokens.length > 0) {
    const cl = buildClause(clauses.length, undefined, carryTokens[0], carryTokens[carryTokens.length - 1]);
    cl.tokens = carryTokens;
    if (carryLead) cl.lead = carryLead;
    cl.own = carryTokens;
    clauses.push(cl);
    chunkTokens(cl, carryTokens);
    assign(cl);
  }

  // ───────── giving the chunks of a clause their functions ─────────
  function auxBasis(g: VerbGroup, e: VerbGroup['elems'][number]): string[] {
    const m = g.main.surface;
    if (e.role === 'vector') return [`${e.surface} is a vector verb after ${m}: ${HINDI_VECTOR_VERBS[e.lemma] ?? 'it colours the main verb'}`];
    if (e.lemma === 'होना') return [`${e.surface} is the form of "to be" that carries the tense and person after ${m}`];
    if (e.lemma === 'रहना') return [`${e.surface} (रहना) after ${m} makes it continuous`];
    if (e.lemma === 'जाना' && g.flags.passive) return [`${e.surface} (जाना) after the participle ${m} makes the passive`];
    if (e.lemma === 'सकना') return [`${e.surface} (सकना) after ${m} adds "can"`];
    if (e.lemma === 'पड़ना') return [`${e.surface} (पड़ना) after the infinitive ${m} adds "has to"`];
    if (e.lemma === 'चाहना' || e.lemma === 'चाहिए') return [`${e.surface} after the infinitive ${m} adds "wants to / should"`];
    if (e.lemma === 'लगना') return [`${e.surface} (लगना) after the oblique infinitive ${m} adds "began to"`];
    if (e.lemma === 'देना') return [`${e.surface} (देना) after the oblique infinitive ${m} adds "let"`];
    return [`${e.surface} is a helping verb in the verb group of ${m}`];
  }

  function attachGroup(g: VerbGroup, headTok: number, copular: boolean): void {
    g.elems.forEach((e, k) => {
      if (k === 0 && !copular) return;
      if (copular && k === 0) return;
      put(e.i, headTok, 'aux', auxBasis(g, e), 0.88);
    });
    for (const p of g.particles) {
      const n = normOf(p);
      if (NEGATION.has(n)) put(p, headTok, 'advmod', [`${surf(p)} negates the verb group it stands in`], 0.88);
      else put(p, headTok, 'discourse', [`${surf(p)} is a particle inside the verb group, stressing the verb`], 0.8);
    }
  }

  /** The case of a chunk: its own, or the case marker after the last word of a coordination. */
  function caseOf(c: Chunk, all: Chunk[]): string | undefined {
    if (c.caseKey) return c.caseKey;
    const tail = all.filter((x) => x.conjOf === c && x.caseKey);
    return tail.length > 0 ? tail[tail.length - 1].caseKey : undefined;
  }

  /** noun -> the light verb it forms a complex predicate with (the phrase detector's collocations). */
  function lvcPartners(): { get(i: number): number | undefined; gloss: Map<number, string> } {
    if (lvcCache) return lvcCache;
    const map = new Map<number, number>();
    const gloss = new Map<number, string>();
    for (const ph of detectHindiPhrases(tokens, analyses)) {
      if (ph.kind !== 'collocation' || ph.tokenIndexes.length !== 2) continue;
      map.set(ph.tokenIndexes[0], ph.tokenIndexes[1]);
      if (ph.gloss) gloss.set(ph.tokenIndexes[0], ph.gloss);
    }
    lvcCache = { get: (i) => map.get(i), gloss };
    return lvcCache;
  }

  function assign(cl: Cl): void {
    const g = cl.g;
    const all = cl.chunks;
    const mainsAll = all.filter((c) => !c.conjOf && c.kind !== 'neg');
    // a name or noun set off by commas at the start: the one spoken to
    const isVoc = (c: Chunk): boolean => {
      if (c.voc) return true;
      if (c.kind !== 'np' || c.adps.length > 0 || c.conjOf || (posOf(c.head) !== 'PROPN' && posOf(c.head) !== 'NOUN')) return false;
      const before = tokens[c.first - 1];
      const after = tokens[Math.max(c.last, ...c.adps) + 1];
      const startOk = before === undefined || (!before.isWord && /^[,;:"“”]$/u.test(before.surface)) || tokens.slice(0, c.first).every((t) => !t.isWord);
      const endOk = after !== undefined && !after.isWord && after.surface === ',';
      const others = mainsAll.some((o) => o !== c && NOMINAL_KINDS.has(o.kind));
      return startOk && endOk && (others || g?.main.kind === 'imp' || g?.core.kind === 'imp');
    };
    cl.vocs = mainsAll.filter(isVoc);
    const mains = mainsAll.filter((c) => !cl.vocs.includes(c));
    const negs = all.filter((c) => c.kind === 'neg');
    const eCase = (c: Chunk): string | undefined => caseOf(c, all);
    const bare = (c: Chunk): boolean => !eCase(c) && NOMINAL_KINDS.has(c.kind);
    const vfs = verbFS(g);
    const withLoose = (pred: number | undefined): void => { cl.pred = pred; };

    // ── no verb group: a sentence of nouns
    if (!g) {
      const predC = [...mains].reverse().find((c) => c.kind !== 'adv' || mains.length === 1) ?? mains[mains.length - 1];
      if (predC) withLoose(predC.head);
      else {
        const intj = cl.loose.find((l) => l.kind === 'intj');
        if (intj) withLoose(intj.i);
      }
      for (const c of mains) if (c.head !== cl.pred) notes.push(`"${surf(c.head)}" stands in a sentence without a verb; no rule places it.`);
      return;
    }

    // ── the verb group itself
    const attachNegs = (head: number): void => {
      for (const n of negs) put(n.head, head, 'advmod', [`${surf(n.head)} is a negative word in the clause`], 0.88);
    };

    if (cl.copular) {
      const cop = g.main.i;
      const bareNp = (c: Chunk): boolean => bare(c) && c.kind !== 'adj';
      const advs = mains.filter((c) => c.kind === 'adv');
      const core0 = mains.filter((c) => c.kind !== 'adv');
      const core = mains[mains.length - 1]?.kind === 'adv' || core0.length === 0 ? mains : core0;
      const lastC = core[core.length - 1];
      const locativeBefore = core.slice(0, -1).some((c) => {
        const k = eCase(c);
        return k !== undefined && (k === 'को' || k.split(' ').some((w) => LOCATIVE.has(w) && w !== 'के') || k.includes('पास'));
      });
      let predHead: number;
      let subject: Chunk | undefined;
      const others = core.filter((c) => c !== lastC);
      if (lastC && bareNp(lastC) && (locativeBefore || core.length === 1)) {
        // "घर में एक लड़का है", "मेरे पास किताब है", "बच्चे को भूख है": the thing named last is the one that exists or is had
        predHead = cop;
        subject = lastC;
        const v = agreeWith(lastC, vfs, ['N']);
        put(lastC.head, cop, 'nsubj', [`${surf(lastC.head)} names the thing that exists, happens or is had${core.length === 1 ? ' (the only phrase before the verb)' : ': a place or owner stands first, the thing last'}`, ...(v.state === 'agrees' ? [`it agrees with ${surf(cop)} (${sayAgree(v)})`] : [])], 0.8);
        for (const c of others) assignOblique(c, cop, true);
      } else if (lastC) {
        predHead = lastC.head;
        const rest = core.filter((c) => c !== lastC);
        const cands2 = rest.filter(bareNp);
        const lastIsBareNominal = bareNp(lastC);
        let chosen: Chunk | undefined;
        const alts: SyntaxAlternative[] = [];
        if (cands2.length === 1) { chosen = cands2[0]; }
        else if (cands2.length > 1) {
          const scored = cands2.map((c, idx) => {
            const v = agreeWith(c, vfs, ['N', 'P']);
            return { c, idx, score: (v.state === 'agrees' ? 2 : v.state === 'clash' ? -2 : 0) + (posOf(c.head) === 'PRON' ? 0.5 : 0) - idx * 0.1 };
          }).sort((a, b) => b.score - a.score);
          chosen = scored[0].c;
          if (scored[1] && scored[1].score >= scored[0].score - 0.3) alts.push(alt('obl', cop, 0.35, `${surf(scored[1].c.head)} could be the subject instead: two direct-case words stand before ${surf(cop)}`));
        }
        if (chosen) {
          const v = agreeWith(chosen, vfs, ['N', 'P']);
          const pronoun = posOf(chosen.head) === 'PRON';
          const swap = lastIsBareNominal && cands2.length === 1;
          const a2: SyntaxAlternative[] = swap && !pronoun ? [alt('root', undefined, pronoun ? 0.25 : 0.4, `${surf(chosen.head)} could be the description and ${surf(lastC.head)} the subject: two direct-case nouns before ${surf(cop)} do not say which is which`)] : alts;
          const basis = [`${surf(chosen.head)} is the direct-case noun or pronoun that the description is said of${v.state === 'agrees' ? `; it agrees with ${surf(cop)} (${sayAgree(v)})` : ''}`, ...(pronoun && swap ? ['a pronoun (यह, वह, मैं …) before a noun and the copula is the subject of an identifying sentence'] : [])];
          put(chosen.head, predHead, 'nsubj', basis, pronoun ? 0.85 : swap ? 0.65 : 0.8, a2);
          subject = chosen;
        }
        for (const c of rest) if (c !== chosen && !(c.conjOf)) assignOblique(c, predHead, true);
        put(cop, predHead, 'cop', [`${surf(cop)} is "to be" and links the subject to ${surf(predHead)}`], 0.9);
        const predAlts = lastIsBareNominal && subject && cands2.length === 1 ? [alt('nsubj', subject.head, 0.4, `${surf(lastC.head)} could be the subject if ${surf(subject.head)} is the description`)] : undefined;
        if (predAlts && !rels.has(predHead)) predHeadAlts.set(predHead, predAlts);
      } else {
        predHead = cop;
      }
      for (const ad of advs) if (ad.head !== predHead) put(ad.head, predHead, 'advmod', [`${surf(ad.head)} is an adverb of the clause`], 0.8);
      cl.pred = predHead;
      // the tense helpers after "होता" and the like
      g.elems.forEach((e, k) => { if (k > 0) put(e.i, predHead, 'aux', auxBasis(g, e), 0.85); });
      for (const p of g.particles) {
        if (NEGATION.has(normOf(p))) put(p, predHead, 'advmod', [`${surf(p)} negates the sentence`], 0.88);
        else put(p, predHead, 'discourse', [`${surf(p)} is a particle stressing the verb`], 0.8);
      }
      attachNegs(predHead);
      return;
    }

    // ── a verb with its helpers
    const P = g.main.i;
    cl.pred = P;
    attachGroup(g, P, false);
    attachNegs(P);
    const kindCore = g.core.kind;
    const imperative = g.main.kind === 'imp' || kindCore === 'imp';
    const agent0 = mains.find((c) => eCase(c) === 'ने');
    const isConv = cl.nonFinite === 'conv' || cl.nonFinite === 'infobl';
    const agent = isConv ? undefined : agent0;
    let datives = mains.filter((c) => eCase(c) === 'को');
    let bares = mains.filter(bare);
    const datSubjectVerb = g.elems.some((e) => DATIVE_SUBJECT.has(e.lemma) && (e.lemma !== 'होना' || e === g.main) && e.role !== 'aux') || g.flags.obligation || g.flags.wanting;
    const used = new Set<Chunk>();
    // इस प्रकार, उस दिन, इस बार: an adverbial, when another direct-case word can be the doer
    const hasDet = (c: Chunk): boolean => [...rels.values()].some((r) => r.head === c.head && (r.relation === 'det' || r.relation === 'amod' || r.relation === 'nummod' || r.relation === 'nmod'));
    const advNps = bares.filter((c) => c.kind === 'np' && ADVERBIAL_NOUNS.has(lemmaOf(c.head)) && hasDet(c));
    if (advNps.length > 0 && bares.length > advNps.length) {
      for (const c of advNps) { used.add(c); put(c.head, P, 'obl', [`${surf(c.head)} after a pointing word (इस प्रकार, उस दिन …) names the manner or time of the action`], 0.75); }
      bares = bares.filter((c) => !advNps.includes(c));
    }

    // शाम को, सुबह को: a time, not the one affected
    for (const c of datives.filter((d) => TIME_NOUNS.has(lemmaOf(d.head)))) { used.add(c); put(c.head, P, 'obl', [`${surf(c.head)} is a time word with को: when the action happens`], 0.8); }
    datives = datives.filter((c) => !used.has(c));
    // noun + light verb (काम करना, विश्वास करना): the noun is part of the verb
    if (LVC_VERBS.has(g.main.lemma)) {
      const ph = lvcPartners();
      for (const c of mains) {
        if (used.has(c) || eCase(c) || (c.kind !== 'np' && c.kind !== 'adj')) continue;
        if (ph.get(c.head) === P) { used.add(c); put(c.head, P, 'compound', [`${surf(c.head)} and ${surf(P)} make one verb meaning "${ph.gloss.get(c.head) ?? 'a complex predicate'}"`], 0.8); }
      }
      if (g.main.lemma === 'करना') {
        const gap = (c: Chunk): boolean => tokens.slice(Math.max(c.last, ...c.adps) + 1, g.start).every((t) => !t.isWord || NEGATION.has(nfc(t.normalized)) || PARTICLES.has(nfc(t.normalized)));
        const pre = mains.filter((c) => !used.has(c) && !eCase(c) && ((c.kind === 'np' && posOf(c.head) === 'NOUN') || c.kind === 'adj') && c.last < g.start && gap(c)).pop();
        if (pre) { used.add(pre); put(pre.head, P, 'compound', [`${surf(pre.head)} stands directly before ${surf(P)} (करना): a noun or adjective plus करना usually forms one verb (a complex predicate)`], 0.6, [alt(pre.kind === 'adj' ? 'xcomp' : 'obj', P, 0.35, `${surf(pre.head)} could be the object of करना`)]); }
      }
      bares = bares.filter((c) => !used.has(c));
    }
    if (isConv) {
      // "having done" or "in order to": the doer and the framing words (time, manner) before it belong to the verb that follows
      const subj = agent0 ?? (bares[0] && (bares.length >= 2 || (posOf(bares[0].head) === 'PRON' && top(bares[0].head)?.morph.Case !== 'Obl')) ? bares[0] : undefined);
      if (subj) { cl.lent = subj; used.add(subj); bares = bares.filter((c) => c !== subj); }
      const lead0 = mains[0];
      cl.lentFrames = mains.filter((c) => !used.has(c) && c !== subj && ((subj !== undefined && c.first < subj.first) || (c === lead0 && posOf(c.head) === 'PRON' && eCase(c) === 'को') || (c.kind === 'adv' && c.adps.length === 0) || TIME_NOUNS.has(lemmaOf(c.head))));
      for (const c of cl.lentFrames) used.add(c);
      bares = bares.filter((c) => !used.has(c));
    }
    const objRel: DependencyRelation = MOTION.has(g.main.lemma) ? 'obl' : 'obj';
    const objWhy = (c: Chunk): string => (objRel === 'obl' ? `${surf(c.head)} is a bare place noun with the motion verb ${g.main.lemma}: where it goes` : `${surf(c.head)} is the other direct-case word, so it is the object`);
    const ergDropped = !agent && cl.k > 0 && clauses[cl.k - 1].ergAgent === true && g.core.kind === 'pf' && bares.length > 0 && bares.every((c) => c.kind === 'np');
    cl.ergAgent = !!agent0 || ergDropped;
    const takeObj = (c: Chunk, why: string[], conf: number, alts?: SyntaxAlternative[]): void => { used.add(c); put(c.head, P, 'obj', why, conf, alts); };

    if (agent || ergDropped) {
      if (agent) {
      used.add(agent);
      const fused = agent.adps.length === 0;
      put(agent.head, P, 'nsubj', [fused ? `${surf(agent.head)} contains ने: it marks the doer of a perfective verb` : `${surf(agent.head)} is marked by ने: the doer of a perfective verb`, 'ergative: the verb agrees with the object, not with this subject'], 0.92);
      }
      const objs = bares;
      if (objs.length > 0) {
        const ranked = objs.map((c, idx) => ({ c, idx, v: agreeWith(c, vfs, ['G', 'N']) }));
        const pick = ranked.find((r) => r.v.state === 'agrees') ?? ranked[0];
        takeObj(pick.c, [...(agent ? [] : ['the doer (marked by ne) is the same as in the clause before and is left out']), pick.v.state === 'agrees' ? `${surf(pick.c.head)} is the direct-case noun and the verb agrees with it (${sayAgree(pick.v)}): in a ne sentence the object is what the verb agrees with` : `${surf(pick.c.head)} is the direct-case noun left once the doer marked by ne is taken; the verb form does not show agreement with it`], pick.v.state === 'agrees' ? 0.88 : 0.7);
        for (const r of ranked) if (r.c !== pick.c) { used.add(r.c); put(r.c.head, P, 'obl', [`${surf(r.c.head)} is a second direct-case word in a ne sentence: read as an adverbial (time, manner) rather than a second object`], 0.4, [alt('obj', P, 0.35, 'it could be a second object')]); }
      }
      datives.forEach((c, n) => {
        used.add(c);
        if (objs.length > 0 && n === 0) put(c.head, P, 'iobj', [`${surf(c.head)} is marked by को beside a direct object: the one the action is done for or to`], 0.85);
        else takeObj(c, [`${surf(c.head)} is marked by को and no other object stands: the definite object`], 0.8);
      });
    } else if (datives.length > 0 && datSubjectVerb) {
      const d = datives[0];
      used.add(d);
      put(d.head, P, 'iobj', [`${surf(d.head)} is marked by को with a verb of feeling, owing or having (${g.main.lemma}): the dative experiencer plays the role of subject`], 0.85);
      const cand = bares.map((c) => ({ c, v: agreeWith(c, vfs, ['G', 'N']) })).sort((a, b) => (b.v.state === 'agrees' ? 1 : 0) - (a.v.state === 'agrees' ? 1 : 0));
      if (cand.length > 0) {
        const b = cand[0];
        used.add(b.c);
        put(b.c.head, P, 'nsubj', [`${surf(b.c.head)} is what the verb agrees with${b.v.state === 'agrees' ? ` (${sayAgree(b.v)})` : ''}: with a dative experiencer the thing felt or owed is the grammatical subject`], b.v.state === 'agrees' ? 0.85 : 0.7);
        for (const r of cand.slice(1)) { used.add(r.c); put(r.c.head, P, 'obj', [`${surf(r.c.head)} is a further direct-case noun`], 0.4); }
      }
      for (const c of datives.slice(1)) { used.add(c); put(c.head, P, 'obl', [`${surf(c.head)} is a second को phrase`], 0.4); }
    } else if (imperative) {
      for (const c of bares) {
        used.add(c);
        if (posOf(c.head) === 'PRON' && top(c.head)?.morph.Person === '2') put(c.head, P, 'nsubj', [`${surf(c.head)} is the "you" addressed by the command`], 0.8);
        else takeObj(c, [`${surf(c.head)} is a direct-case noun in a command: the doer is "you", so this is the object`], 0.7);
      }
      datives.forEach((c) => takeObj(c, [`${surf(c.head)} is marked by को: the object of the command`], 0.75));
    } else if (bares.length > 0) {
      const scored = bares.map((c, idx) => ({ c, idx, v: agreeWith(c, vfs) })).map((r) => ({ ...r, s: (r.v.state === 'agrees' ? 2 : r.v.state === 'clash' ? -2 : 0) + (posOf(r.c.head) === 'PRON' && top(r.c.head)?.morph.Person && top(r.c.head)?.morph.Person !== '3' ? 0.3 : 0) - r.idx * 0.1 }));
      const order = [...scored].sort((a, b) => b.s - a.s);
      if (bares.length === 1) {
        const r = scored[0];
        used.add(r.c);
        if (r.v.state === 'clash' && objRel === 'obl') {
          put(r.c.head, P, 'obl', [`${surf(r.c.head)} does not agree with the verb and the verb is a motion verb (${g.main.lemma}): where it goes`], 0.55, [alt('obj', P, 0.35, 'it could be an object')]);
        } else if (r.v.state === 'clash') {
          // a noun that cannot be the subject of this verb form: the doer is left out and the noun is the object
          put(r.c.head, P, 'obj', [`${surf(r.c.head)} does not agree with the verb (${g.core.surface})`, 'a Hindi subject may be left out, so the noun is read as the object'], 0.6, [alt('nsubj', P, 0.35, 'the verb form may agree through a reading the table does not list')]);
        } else {
          put(r.c.head, P, 'nsubj', [`${surf(r.c.head)} is the only direct-case word before the verb${r.v.state === 'agrees' ? ` and the verb agrees with it (${sayAgree(r.v)})` : ''}`], r.v.state === 'agrees' ? 0.88 : 0.72);
        }
      } else {
        const s = order[0];
        const o = order[1];
        used.add(s.c);
        const clear = s.s - o.s >= 1.5;
        const subjAlts = clear ? undefined : [alt('obj', P, 0.35, `${surf(o.c.head)} and ${surf(s.c.head)} are both direct-case and the verb's agreement does not tell them apart; the first is read as the subject by word order`)];
        put(s.c.head, P, 'nsubj', [clear ? `${surf(s.c.head)} agrees with the verb (${sayAgree(s.v)}) and ${surf(o.c.head)} does not` : `${surf(s.c.head)} stands first among the direct-case words (subject before object)`], clear ? 0.85 : 0.6, subjAlts);
        used.add(o.c);
        put(o.c.head, P, objRel, [clear || objRel === 'obl' ? objWhy(o.c) : `${surf(o.c.head)} stands after the subject among the direct-case words (object)`], objRel === 'obl' ? 0.65 : clear ? 0.82 : 0.6, clear ? undefined : [alt('nsubj', P, 0.35, `${surf(s.c.head)} could be the object if ${surf(o.c.head)} is the subject`)]);
        for (const r of order.slice(2)) { used.add(r.c); put(r.c.head, P, 'obl', [`${surf(r.c.head)} is a third direct-case word: read as an adverbial`], 0.4); }
      }
      for (const d of datives) {
        used.add(d);
        const hasObj = [...rels.values()].some((r) => r.head === P && r.relation === 'obj');
        if (hasObj) put(d.head, P, 'iobj', [`${surf(d.head)} is marked by को beside a direct object: the receiver`], 0.82);
        else put(d.head, P, 'obj', [`${surf(d.head)} is marked by को and no other object stands: the definite object`], 0.78, [alt('obl', P, 0.3, 'को can also mark a goal or time')]);
      }
    } else {
      for (const d of datives) { used.add(d); put(d.head, P, 'obj', [`${surf(d.head)} is marked by को and no other noun stands: the definite object`], 0.75); }
    }

    for (const c of mains) {
      if (used.has(c)) continue;
      assignOblique(c, P, false);
    }
    cl.pred = P;
  }

  /** Chunks with a postposition other than ने / को, adverbs, adjectives left over. */
  function assignOblique(c: Chunk, head: number, copularCtx: boolean): void {
    const key = caseOf(c, cl_all(c));
    if (c.kind === 'adv') {
      if (c.adps.length > 0) put(c.head, head, 'obl', [`${surf(c.head)} is an adverb with a postposition (${c.adps.map(surf).join(' ')}): an adverbial phrase`], 0.75);
      else put(c.head, head, 'advmod', [`${surf(c.head)} is an adverb of the clause`], 0.8);
      return;
    }
    if (c.kind === 'adj') { put(c.head, head, copularCtx ? 'advmod' : 'xcomp', [`${surf(c.head)} is an adjective with no noun to describe: it says how the subject is or becomes`], 0.6); return; }
    if (key === undefined) { put(c.head, head, 'obl', [`${surf(c.head)} is a further direct-case word: read as an adverbial (time, manner)`], 0.4); return; }
    if (key === 'ने') { put(c.head, head, 'nsubj', [`${surf(c.head)} is marked by ने: the doer`], 0.8); return; }
    if (key === 'को') { put(c.head, head, 'iobj', [`${surf(c.head)} is marked by को: the one affected or addressed`], 0.75); return; }
    if (c.genitive || GEN.has(key)) { put(c.head, head, 'obl', [`${surf(c.head)} ${key} has no noun after it to belong to`], 0.4); return; }
    put(c.head, head, 'obl', [`${surf(c.head)} is followed by the postposition ${key}: an adverbial phrase (place, source, means, time)`], 0.85);
  }
  function cl_all(c: Chunk): Chunk[] {
    for (const cl of clauses) if (cl.chunks.includes(c)) return cl.chunks;
    return [c];
  }

  // ───────── words kept aside: particles, question word, interjections ─────────
  for (const cl of clauses) {
    for (const l of cl.loose) {
      const nextChunk = cl.chunks.filter((c) => !c.conjOf && c.first > l.i).sort((a, b) => a.first - b.first)[0];
      if (l.kind === 'part') {
        const target = nextChunk?.head ?? cl.pred;
        if (target !== undefined) put(l.i, target, 'discourse', [`${surf(l.i)} is a stressing particle; no phrase stands right before it, so it is tied to ${nextChunk ? 'the phrase after it' : 'the verb'}`], 0.6);
      } else if (l.kind === 'qa') {
        if (cl.pred !== undefined) put(l.i, cl.pred, 'discourse', [`${surf(l.i)} opens the sentence and a full clause follows: it marks a yes/no question`], 0.7, [alt('obj', cl.pred, 0.3, `${surf(l.i)} could be "what" (the object) if no yes/no question is meant`)]);
      } else if (l.kind === 'intj') {
        loosePending.push(l.i);
      } else if (l.kind === 'conj') {
        notes.push(`"${surf(l.i)}" joins something the rules could not place.`);
      }
    }
  }

  // ───────── linking the clauses ─────────
  const withPred = clauses.filter((c) => c.pred !== undefined);
  /** A chain of conjuncts hangs on the first. */
  const firstConjunct = (tok: number): number => { let h = tok; for (let n = 0; n < 20; n++) { const r = rels.get(h); if (r?.relation === 'conj' && r.head !== undefined) h = r.head; else break; } return h; };
  const predOf = (c: Cl): number => c.pred as number;
  const isMainLike = (c: Cl): boolean => !c.lead.ki && c.lead.sub.length === 0 && !c.isRel && c.nonFinite === undefined;
  const correlativeIn = (c: Cl): number | undefined => {
    const hit = c.chunks.filter((x) => !x.conjOf).find((x) => x.kind === 'pron' && CORRELATIVE.test(lemmaOf(x.head)) || CORRELATIVE.test(normOf(x.head)));
    return hit?.head;
  };
  const lastNominal = (c: Cl): number | undefined => {
    const ch = [...c.chunks].reverse().find((x) => !x.conjOf && NOMINAL_KINDS.has(x.kind) && x.kind !== 'num');
    return ch?.head;
  };

  const hasCcomp = (c: Cl): boolean => [...rels.values()].some((r) => r.head === predOf(c) && r.relation === 'ccomp');
  withPred.forEach((cl, idx) => {
    const prev = idx > 0 ? withPred[idx - 1] : undefined;
    const next = withPred[idx + 1];
    const pred = predOf(cl);
    const L = cl.lead;
    const set = (head: number | undefined, rel: DependencyRelation, basis: string[], conf: number): boolean => {
      if (head === undefined) return false;
      const ok = put(pred, head, rel, basis, conf);
      if (ok) cl.headed = true;
      return ok;
    };
    const prevFree = withPred.slice(0, idx).reverse().find((c) => !c.headed && !c.isRel);
    const prevMain = withPred.slice(0, idx).reverse().find((c) => !c.isRel);
    // leading adpositions belong to the clause before (after an infinitive: पढ़ने के लिए)
    if (L.voc !== undefined && prevMain) put(L.voc, predOf(prevMain), 'vocative', [`${surf(L.voc)} stands between commas after the clause ${surf(predOf(prevMain))}: the one spoken to`], 0.7, [alt('nsubj', pred, 0.25, `${surf(L.voc)} could belong to the clause after it`)]);
    if (prev) for (const a of L.adp) put(a, predOf(prev), 'case', [`${surf(a)} follows the verb form ${surf(predOf(prev))} and marks it (as in "के लिए")`], 0.8);
    if (L.ki !== undefined && prevMain) {
      if (set(predOf(prevMain), 'ccomp', [`${surf(L.ki)} opens a clause that says what ${surf(predOf(prevMain))} reports`], 0.85)) put(L.ki, pred, 'mark', [`${surf(L.ki)} (कि) introduces a clause`], 0.92);
    } else if (L.sub.length > 0) {
      const mk = L.sub[0];
      const mlem = lemmaOf(mk);
      const mainNext = withPred.slice(idx + 1).find(isMainLike);
      const conditional = mlem === 'अगर' || mlem === 'यदि';
      let ok = false;
      if (SUB_BACK.has(mlem)) ok = set(prevFree ? predOf(prevFree) : undefined, 'advcl', [`${surf(mk)} gives the reason or purpose of the clause before`], 0.82);
      else {
        const fronted = !!mainNext && (conditional || mainNext.lead.corr !== undefined || !prevFree);
        if (fronted) ok = set(predOf(mainNext as Cl), 'advcl', [`${surf(mk)} opens its clause: it comes before the main clause it gives the condition or time of`], 0.82);
        else if (prevFree) ok = set(predOf(prevFree), 'advcl', [`${surf(mk)} follows the main clause and gives its circumstance`], 0.75);
      }
      if (!ok && mainNext) ok = set(predOf(mainNext), 'advcl', [`${surf(mk)} opens the clause that gives the circumstance of the clause after it`], 0.7);
      put(mk, pred, 'mark', [`${surf(mk)} is the subordinating word that opens its clause`], 0.92);
      for (const f of L.fixed) put(f, mk, 'fixed', [`${surf(f)} completes the fixed pair ${surf(mk)} ${surf(f)} ("until")`], 0.85);
    } else if (cl.isRel) {
      let head: number | undefined;
      let basis = '';
      if (cl.ante !== undefined) { head = cl.ante; basis = `जो-clause: ${surf(cl.ante)} stands right before the relative pronoun and is what the clause describes`; }
      else if (next && correlativeIn(next) !== undefined) { head = correlativeIn(next); basis = `correlative: the जो clause is picked up by ${surf(head as number)} in the next clause`; }
      else if (prevMain && lastNominal(prevMain) !== undefined) { head = lastNominal(prevMain); basis = `the relative clause follows the main clause and describes ${surf(head as number)}`; }
      if (head !== undefined) set(head, 'acl', [basis], 0.78);
      else if (next) set(predOf(next), 'advcl', ['a relative clause with nothing it points back to: read as a free relative ("whoever …")'], 0.5);
    } else if (cl.nonFinite && next) {
      const nx = predOf(next);
      if (cl.nonFinite === 'conv' || cl.nonFinite === 'infobl') {
        if (cl.nonFinite === 'conv') set(nx, 'advcl', [`${surf(pred)} is a "having done" form: its action comes before the next verb ${surf(nx)}`], 0.82);
        else set(nx, 'advcl', [`${surf(pred)} is an oblique infinitive (with a postposition or before one): the purpose or reason of ${surf(nx)}`], 0.7);
        for (const f of cl.lentFrames ?? []) assignOblique(f, nx, false);
        // a joining word before a "having done" clause joins the clause it belongs to
        if (L.cc.length > 0 && prevMain) {
          if (put(nx, firstConjunct(predOf(prevMain)), 'conj', [`${surf(L.cc[0])} opens a sentence part that ends in ${surf(nx)}: it is joined to ${surf(firstConjunct(predOf(prevMain)))}`], 0.7)) { put(L.cc[0], nx, 'cc', [`${surf(L.cc[0])} is the conjunction before ${surf(nx)}'s group of words`], 0.85); next.headed = true; }
        }
        if (cl.lent) {
          const takenRel = [...rels.values()].find((r) => r.head === nx && r.relation === 'nsubj');
          // "वह पढ़ने के लिए स्कूल जाता है": a pronoun in front and a lone place noun after a verb of motion — the pronoun is the doer
          if (takenRel && posOf(cl.lent.head) === 'PRON' && posOf(takenRel.dependent) === 'NOUN' && next.g && MOTION.has(next.g.main.lemma) && next.chunks.filter((c) => !c.conjOf && NOMINAL_KINDS.has(c.kind) && !c.caseKey).length === 1) {
            rels.delete(takenRel.dependent);
            put(takenRel.dependent, nx, 'obl', [`${surf(takenRel.dependent)} is a bare place noun with the motion verb ${surf(nx)}: where it goes; the doer is ${surf(cl.lent.head)}, in front of the earlier verb`], 0.6, [alt('nsubj', nx, 0.35, 'it could be the doer if the pronoun belongs to the earlier verb')]);
          }
          const taken = [...rels.values()].some((r) => r.head === nx && r.relation === 'nsubj');
          if (!taken) put(cl.lent.head, nx, 'nsubj', [`${surf(cl.lent.head)} stands before the non-finite form ${surf(pred)} but is the doer of ${surf(nx)}: both verbs share one subject`], 0.7, [alt('obj', pred, 0.3, `${surf(cl.lent.head)} could be the object of ${surf(pred)}`)]);
          else put(cl.lent.head, pred, 'obj', [`${surf(cl.lent.head)} is the direct-case word before ${surf(pred)}; the clause after has its own subject`], 0.5);
        }
      } else if (next.copular || next.g?.flags.obligation || next.g?.elems.some((e) => DATIVE_SUBJECT.has(e.lemma))) set(nx, 'nsubj', [`${surf(pred)} is an infinitive standing before ${surf(nx)}: the act named is what is said of`], 0.65);
      else set(nx, 'xcomp', [`${surf(pred)} is an infinitive completing ${surf(nx)}`], 0.65);
    } else if (L.cc.length > 0 && prev) {
      const cc = L.cc[0];
      if (set(firstConjunct(predOf(prev)), 'conj', [`${surf(cc)} joins this clause to ${surf(firstConjunct(predOf(prev)))}: the two are of the same rank`], 0.82)) put(cc, pred, 'cc', [`${surf(cc)} is the conjunction opening the second clause`], 0.9);
    } else if (prevFree?.g && SPEECH.has(prevFree.g.main.lemma) && prevFree.nonFinite === undefined && !hasCcomp(prevFree)) {
      if (set(predOf(prevFree), 'ccomp', [`${surf(pred)} follows a verb of saying (${surf(predOf(prevFree))}) with no joining word: what was said`], 0.65)) cl.quote = true;
    }
    else if (prevFree && cl.nonFinite === undefined && prevFree.nonFinite === undefined && L.punct.some((q) => surf(q) === ',') && !cl.headed && !rels.has(pred)) {
      // after a quoted clause: inside the quote the clauses are siblings, after the closing mark they continue the sentence
      const quoteOver = L.punct.some((q) => /^[”’]$/u.test(surf(q)));
      const sibling = prev && !quoteOver && rels.get(predOf(prev))?.relation === 'ccomp' && rels.get(predOf(prev))?.head === predOf(prevFree) ? prev : undefined;
      set(sibling ? predOf(sibling) : firstConjunct(predOf(prevFree)), 'conj', [`${surf(pred)} follows ${surf(predOf(prevFree))} after a comma with no joining word: a list of actions`], 0.55);
    }
    if (L.cc.length > 0 && !rels.has(L.cc[0])) put(L.cc[0], pred, 'cc', [`${surf(L.cc[0])} opens the clause with nothing before it to join`], 0.5);
    if (L.corr !== undefined) put(L.corr, pred, 'mark', [`${surf(L.corr)} answers the clause before it (अगर … तो, जब … तब)`], 0.8);
    for (const a of L.adv) put(a, pred, 'advmod', [`${surf(a)} ("therefore") ties this clause to the one before`], 0.7);
    for (const q of L.punct) if (!rels.has(q)) { /* punctuation is handled at the end */ }
  });

  for (const cl of clauses) {
    if (cl.pred === undefined) continue;
    for (const v of cl.vocs) put(v.head, cl.pred, 'vocative', [`${surf(v.head)} stands apart between commas: the one spoken to`], v.voc ? 0.85 : 0.7, v.voc ? undefined : [alt('nsubj', cl.pred, 0.3, `${surf(v.head)} could be the subject if the commas only set off an aside`)]);
  }
  // clauses side by side with nothing joining them
  const free = withPred.filter((c) => !c.headed && !rels.has(predOf(c)));
  let rootTok: number | undefined;
  free.forEach((c, n) => {
    const p = predOf(c);
    if (n === 0) { rootTok = p; put(p, undefined, 'root', ['the main word of the last clause that no other clause depends on'], 0.9); }
  });
  free.slice(1).forEach((c) => {
    const p = predOf(c);
    if (rootTok !== undefined) put(p, rootTok, 'conj', ['clause beside the main clause with no joining word (a comma or a pause)'], 0.5);
  });
  if (rootTok === undefined && withPred.length > 0) {
    // a ring of clauses (cannot happen with the guards): take the last
    const p = predOf(withPred[withPred.length - 1]);
    if (!rels.has(p)) { rootTok = p; put(p, undefined, 'root', ['the last clause'], 0.5); } else { let h = p; while (rels.get(h)?.head !== undefined) h = rels.get(h)?.head as number; rootTok = h; }
  }
  if (rootTok === undefined) {
    // no clause at all: an interjection or a word on its own
    const w = loosePending[0] ?? tokens.findIndex((t) => t.isWord && top(tokens.indexOf(t)) !== undefined);
    if (w !== undefined && w >= 0) { rootTok = w; put(w, undefined, 'root', ['the only phrase of the sentence'], 0.6); loosePending.shift(); }
  }
  for (const i of loosePending) if (rootTok !== undefined) put(i, rootTok, 'discourse', [`${surf(i)} is an exclamation or greeting standing apart from the clause`], 0.7);
  for (const [h, alts] of predHeadAlts) {
    const r = rels.get(h);
    if (r && !r.alternatives) { r.alternatives = alts; r.status = 'conflicted'; }
  }
  // leftover relative / subordinate markers inside a clause
  for (const cl of clauses) for (const l of cl.loose) if (l.kind === 'sconj' && cl.pred !== undefined) put(l.i, cl.pred, 'mark', [`${surf(l.i)} is a subordinating word inside the clause`], 0.5);

  // ───────── punctuation ─────────
  const owner = (i: number): number | undefined => {
    for (const cl of clauses) if (cl.pred !== undefined && i >= (cl.own[0] ?? cl.from) && i <= cl.to) return cl.pred;
    return rootTok;
  };
  tokens.forEach((t, i) => {
    if (t.isWord || !/^[\p{P}\p{S}]+$/u.test(t.surface)) return;
    const final = i === tokens.length - 1 || tokens.slice(i + 1).every((x) => !x.isWord);
    const head = final ? rootTok : owner(i);
    if (head !== undefined) put(i, head, 'punct', [final ? 'punctuation ending the sentence' : 'punctuation inside the clause'], 0.95);
  });

  // ───────── the clause spans ─────────
  const spans: ClauseSpan[] = [];
  for (const cl of clauses) {
    if (cl.pred === undefined) continue;
    const toks = [...cl.own, ...(cl.g?.tokenIndexes ?? []), ...cl.lead.sub, ...(cl.lead.ki !== undefined ? [cl.lead.ki] : []), ...cl.lead.cc].filter((i) => isWord(i));
    if (toks.length === 0) continue;
    const kind: ClauseSpan['kind'] = cl.quote ? 'quote' : cl.isRel ? 'relative' : cl.lead.ki !== undefined || cl.lead.sub.length > 0 || cl.nonFinite ? 'subordinate' : cl.lead.cc.length > 0 ? 'coordinate' : 'main';
    const marker = cl.lead.ki ?? cl.lead.sub[0] ?? cl.lead.cc[0] ?? (cl.isRel ? cl.chunks.find((c) => c.rel)?.head : undefined);
    spans.push({
      start: Math.min(...toks), end: Math.max(...toks), kind, ...(marker !== undefined ? { marker } : {}),
      label: kind === 'quote' ? 'what was said (direct speech)' : kind === 'relative' ? 'relative clause (जो …)' : kind === 'subordinate' ? (cl.lead.ki !== undefined ? 'clause after कि' : cl.nonFinite ? 'verb form standing for a clause' : 'subordinate clause') : kind === 'coordinate' ? 'clause joined by a conjunction' : 'main clause',
    });
  }

  // ───────── the result ─────────
  const relations = [...rels.values()].sort((a, b) => a.dependent - b.dependent);
  const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  const unattached = wordIdx.filter((i) => !rels.has(i));
  if (unattached.length > 0) notes.push(`No relation for: ${unattached.map((i) => surf(i)).join(', ')}.`);
  if (groups.length === 0) notes.push('No verb found: the sentence is read as a phrase.');
  if (wordIdx.length > 40) notes.push('A long sentence: the clause rules were written for sentences up to about 40 words.');
  const attachedWords = wordIdx.filter((i) => rels.has(i)).length;
  return {
    languageId: 'hi',
    analyzer: HINDI_SYNTAX_ANALYZER,
    tokens: tokens.map((t) => t.surface),
    relations,
    ...(spans.length > 0 ? { clauses: spans } : {}),
    notes: [...new Set(notes)],
    attached: wordIdx.length === 0 ? 0 : Math.round((attachedWords / wordIdx.length) * 1000) / 1000,
  };
}
