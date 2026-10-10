/**
 * German contextual syntax (Linguistic Engine V2, Stage 4): shallow dependency relations between the words of ONE sentence,
 * from the readings the adapter already gave (lemma, part of speech, case / gender / number cells, finite or not, separable-verb
 * units). Rule based, deterministic, no data of its own. Written in the Universal Dependencies vocabulary of core/syntax.ts.
 *
 * How it reads a sentence (docs/ecosystem/linguistics/SYNTAX-de.md has the full list):
 *   1. Clauses. Punctuation, a coordinating word that is followed by a finite verb, and the first word decide where a clause
 *      starts: a conjunction (dass, weil, wenn …) or a relative pronoun followed by a verb-final stretch is a subordinate or
 *      relative clause, `um … zu` / `zu` + infinitive is an infinitive clause, a quotation after a colon is a quote clause.
 *   2. Verb group. The finite verb stands second (main clause) or last (subordinate); haben / sein / werden + participle or
 *      infinitive is an auxiliary construction, a modal or another verb + infinitive is an open complement (xcomp), sein as
 *      the only verb is the copula of its predicate. The separable prefix of a unit attaches to the verb as `compound`.
 *   3. Noun phrases. Determiner, numeral, adjectives and an intensifier left of a noun belong to it (agreement as basis).
 *      A genitive noun phrase right behind a noun, a name with -s before a noun, and `und`/`oder` between phrases are attached.
 *   4. Arguments. The subject is the nominative that agrees in person and number with the finite verb (and, with two
 *      candidates, the more clearly nominative, then the first); accusative → obj, dative → iobj, preposition + phrase → obl
 *      (the preposition is `case`; after a two-way preposition the case of the phrase decides motion or location).
 *      Feminine, neuter and plural nouns look alike in nominative and accusative: the reading stays open in `alternatives`.
 *
 * Honesty: a word with no reading gets no relation; a guessed (unconfirmed) reading caps the confidence at 0.5; a rule that
 * cannot decide between two heads or two relations keeps both. Nothing here is verified by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { RELATION_WORDS } from '../../core/syntax';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import { deLexiconView } from './lexicon';

type Rel = DependencyRelation;
export const DE_SYNTAX_ANALYZER = 'syntax-de@1';

// ───────────────────────────── word lists ─────────────────────────────

const COORD = new Set(['und', 'oder', 'aber', 'sondern', 'denn', 'sowie']);
const SUB_COMP = new Set(['dass', 'daß', 'ob']);
const SUB_ADV = new Set(['weil', 'wenn', 'obwohl', 'obgleich', 'obschon', 'damit', 'bevor', 'ehe', 'nachdem', 'sobald', 'solange', 'falls', 'indem', 'sodass', 'seitdem', 'als', 'während', 'da', 'bis', 'seit', 'sofern', 'soweit', 'zumal', 'wohingegen', 'wie', 'je']);
const WH = new Set(['wer', 'wen', 'wem', 'wessen', 'was', 'wo', 'wie', 'warum', 'wann', 'wohin', 'woher', 'wieso', 'weshalb', 'weswegen', 'welcher', 'welche', 'welches', 'welchen', 'welchem', 'womit', 'wofür', 'worauf', 'wovon', 'wozu', 'woran', 'worüber', 'wobei', 'wodurch']);
const REL_FORMS = new Set(['der', 'die', 'das', 'dem', 'den', 'dessen', 'deren', 'denen', 'welcher', 'welche', 'welches', 'welchem', 'welchen']);
const MODALS = new Set(['können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen', 'möchten']);
const DEGREE = new Set(['bisschen', 'wenig', 'sehr', 'ganz', 'so', 'ziemlich', 'besonders', 'total', 'wirklich', 'recht', 'viel', 'etwas', 'fast', 'kaum', 'äußerst', 'extrem', 'richtig', 'echt', 'völlig', 'zu', 'gar', 'unglaublich', 'immer', 'noch']);
const NOT_PREDICATE = new Set(['nicht', 'nie', 'niemals', 'auch', 'nur', 'noch', 'schon', 'sehr', 'ganz', 'so', 'dann', 'jetzt', 'nun', 'heute', 'morgen', 'gestern', 'immer', 'oft', 'manchmal', 'bald', 'wieder', 'doch', 'ja', 'mal', 'eben', 'halt', 'wohl', 'eigentlich', 'also', 'vielleicht', 'leider', 'gern', 'gerne', 'zuerst', 'später', 'früh', 'heutzutage', 'zusammen', 'sofort', 'plötzlich', 'dann', 'danach', 'davor', 'abends', 'morgens']);
const PLACE = new Set(['in', 'an', 'auf', 'bei', 'vor', 'hinter', 'neben', 'unter', 'über', 'zwischen', 'nahe', 'gegenüber']);
const ANSWERS = new Set(['ja', 'nein', 'doch', 'na', 'gern', 'gerne', 'bitte', 'danke', 'okay', 'ok', 'gut', 'genau', 'klar', 'also', 'tja', 'natürlich', 'stimmt', 'richtig']);
const DEICTIC = new Set(['hier', 'da', 'dort']);
const PRED_VERBS = new Set(['aussehen', 'bleiben', 'scheinen', 'wirken', 'klingen']);
const MEASURES = new Set(['Sorte', 'Stück', 'Glas', 'Tasse', 'Flasche', 'Kilo', 'Liter', 'Paar', 'Menge', 'Haufen', 'Scheibe', 'Packung', 'Becher', 'Gramm', 'Kiste', 'Dose', 'Teller', 'Schüssel', 'Meter', 'Kilometer', 'Pfund', 'Art', 'Sack', 'Eimer', 'Korb', 'Tüte']);
const FOCUS = new Set(['nur', 'etwa', 'ungefähr', 'circa', 'genau', 'fast', 'sogar', 'erst', 'mindestens', 'höchstens', 'allein', 'bloß', 'wenigstens']);
const PARTICLES = new Set(['doch', 'mal', 'ja', 'eben', 'halt', 'wohl', 'eigentlich', 'denn', 'bloß', 'nämlich']);
const TIME_NOUNS = new Set(['Tag', 'Abend', 'Morgen', 'Woche', 'Jahr', 'Monat', 'Nacht', 'Mal', 'Minute', 'Stunde', 'Sekunde', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag', 'Mittag', 'Vormittag', 'Nachmittag', 'Sommer', 'Winter', 'Frühling', 'Herbst', 'Moment', 'Augenblick', 'Wochenende']);
const TITLES = new Set(['Frau', 'Herr', 'Doktor', 'Professor', 'Onkel', 'Tante', 'Opa', 'Oma', 'Kollege', 'Kollegin', 'Familie', 'Kapitän', 'Pfarrer', 'Lehrer', 'Lehrerin', 'Kommissar', 'Graf', 'Kaiser', 'König', 'Sankt']);
const COPULA = new Set(['sein', 'werden']);
const OPEN_QUOTE = new Set(['„', '«', '»', '‚']);
const CASE_FULL: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Dat: 'dative', Gen: 'genitive' };
const GEN_FULL: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const NUM_FULL: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const CASE_KEY: Record<string, string> = { N: 'Nom', A: 'Acc', D: 'Dat', G: 'Gen' };
const ALL_CASES = ['Nom', 'Acc', 'Dat', 'Gen'];

// ───────────────────────────── words ─────────────────────────────

interface W {
  i: number; s: string; n: string; word: boolean;
  c?: AnalysisCandidate; cs: AnalysisCandidate[];
  pos: string; lemma: string; m: Record<string, string>;
  cases: string[] | null; genders: string[] | null; numbers: string[] | null; persons: string[] | null;
  guess: boolean; piece: boolean;
}

const list = (v: string | undefined): string[] | null => {
  if (!v) return null;
  const a = v.split(',').filter(Boolean);
  return a.length ? a : null;
};
const compat = (a: string[] | null, b: string[] | null): boolean => !a || !b || a.some((x) => b.includes(x));
const inter = (a: string[] | null, b: string[] | null): string[] | null => (a && b ? a.filter((x) => b.includes(x)) : a ?? b);

function makeWords(tokens: RawToken[], analyses: AnalyzedToken[]): W[] {
  const ws: W[] = tokens.map((t, i) => {
    // a figure (3, 2.5) is a number word for the rules even though the tokenizer does not count it as a word
    const figure = !t.isWord && /^\d+(?:[.,]\d+)*$/.test(t.surface);
    const cs = t.isWord ? analyses[i]?.candidates ?? [] : figure ? [{ pos: 'NUM' as const, morph: {}, confidence: 0.9, lemma: t.surface }] : [];
    const c = cs[0];
    const m = c?.morph ?? {};
    return {
      i, s: t.surface, n: t.normalized, word: t.isWord || figure, c, cs,
      pos: t.isWord ? c?.pos ?? 'X' : figure ? 'NUM' : 'PUNCT',
      lemma: c?.lemma ?? t.normalized, m,
      cases: list(m.Case), genders: list(m.Gender), numbers: list(m.Number), persons: list(m.Person),
      guess: !!c?.unconfirmed,
      piece: !!(c?.unit && c.unit.pieces.length > 1 && c.unit.head !== i),
    };
  });
  // an inflected participle right before a noun is an adjective (die gelesene Zeitung)
  for (const w of ws) {
    if (w.pos !== 'VERB' || w.m.VerbForm !== 'Part' || !/(e|en|er|es|em)$/.test(w.n)) continue;
    const nx = ws[w.i + 1];
    const pv = ws[w.i - 1];
    const pv2 = ws[w.i - 2];
    const attributive = !pv || ['DET', 'ADJ', 'NUM', 'ADP'].includes(pv.pos) || (pv.pos === 'ADV' && !!pv2 && ['DET', 'ADP'].includes(pv2.pos));
    if (attributive && nx && (nx.pos === 'NOUN' || nx.pos === 'PROPN' || nx.pos === 'ADJ')) w.pos = 'ADJ';
  }
  return ws;
}

const isVerbal = (w: W) => (w.pos === 'VERB' || w.pos === 'AUX') && !w.piece;
const finCand = (w: W) => w.cs.find((c) => (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').includes('Fin'));
const finTop = (w: W) => isVerbal(w) && !!w.c && (w.m.VerbForm ?? '').split(',').includes('Fin') && !(w.m.VerbForm ?? '').includes('Inf');

function describe(w: W): string {
  const parts = [
    w.cases ? w.cases.map((c) => CASE_FULL[c] ?? c).join(' or ') : '',
    w.genders ? w.genders.map((g) => GEN_FULL[g] ?? g).join('/') : '',
    w.numbers ? w.numbers.map((g) => NUM_FULL[g] ?? g).join('/') : '',
  ].filter(Boolean);
  return parts.join(' ') || 'form not narrowed';
}

// ───────────────────────────── relation store ─────────────────────────────

class Store {
  readonly map = new Map<number, SyntaxRelation>();
  constructor(readonly ws: W[]) {}
  has(i: number): boolean { return this.map.has(i); }
  set(dep: number, head: number | undefined, relation: Rel, label: string, basis: string[], confidence: number, alts?: SyntaxAlternative[], status: 'generated' | 'conflicted' = 'generated'): void {
    if (this.map.has(dep) || dep === head) return;
    const guess = this.ws[dep]?.guess || (head !== undefined && this.ws[head]?.guess);
    const r: SyntaxRelation = {
      dependent: dep, relation, label: label || RELATION_WORDS[relation],
      basis: basis.length ? basis : ['rule of the German syntax layer'],
      confidence: Math.round(Math.min(confidence, guess ? 0.5 : 1) * 100) / 100,
      // 'conflicted' = not decided: the forms or the order leave a second reading that is more than a remote possibility (0.3 or more)
      status: status === 'generated' && alts?.some((a) => a.confidence >= 0.3) ? 'conflicted' : status,
    };
    if (head !== undefined) r.head = head;
    if (alts && alts.length) r.alternatives = alts;
    this.map.set(dep, r);
  }
}

// ───────────────────────────── structures ─────────────────────────────

interface Chunk {
  head: number; mods: number[]; ps: number; pe: number;
  prep?: number; prep2?: number; pp: boolean;
  conjOf?: Chunk; cc?: number; coord: Chunk[];
  done: boolean;
}

interface Seg {
  idx: number; words: number[]; open: string; close: string;
  kind: 'main' | 'sub' | 'rel' | 'inf' | 'frag';
  link?: 'ccomp' | 'advcl';
  cc?: number; conjMarker?: number; marker?: number; relPron?: number;
  quote: boolean; final: boolean; merged?: boolean; mergedInto?: number; listAt?: Set<number>;
  head?: number; objHost?: number; coordOf?: number;
  nps: number[]; extra: number[];
}

const sentenceFinal = (s: string) => /^[.!?…]+$/.test(s);

// ───────────────────────────── main ─────────────────────────────

export function germanSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const ws = makeWords(tokens, analyses);
  const R = new Store(ws);
  const notes: string[] = [];
  const surf = (i: number) => ws[i].s;
  const q = (i: number) => `‘${ws[i].s}’`;
  const wordCount = tokens.filter((t) => t.isWord).length;
  if (wordCount > 70) notes.push(`This sentence has ${wordCount} words; the rules read it clause by clause and may mis-attach across clauses.`);

  // 0. pieces of a unit (separable verbs): the prefix hangs on the verb
  for (const w of ws) {
    const u = w.c?.unit;
    if (!w.piece || !u) continue;
    const pieces = u.pieces.map((p) => ws[p]?.s).filter(Boolean).join(' … ');
    R.set(w.i, u.head, 'compound', `separable prefix of ${q(u.head)} (${u.display})`, [`'${w.s}' is the separable prefix of the verb ${u.display}: the sentence bracket ${pieces} writes one verb as two words`, `unit from the analysis: ${u.display}`], 0.9);
  }

  // 1. segments
  const segs = segment(ws);
  for (const s of segs) classify(s);
  for (const s of segs) if (s.kind === 'main' && s.final && !(s.cc !== undefined && segs.slice(0, s.idx).some((o) => o.kind === 'sub' || o.kind === 'rel'))) s.final = false;
  mergeMatrix(segs);
  markQuotes(segs);

  // 2. clauses
  for (const s of segs) if (!s.merged) parseSeg(s);

  // 3. root and links between clauses
  link();

  // 4. leftovers
  leftoverCoordination();
  punctuation();
  breakCycles();

  // notes, spans, share
  const attachedWords = tokens.filter((t, i) => t.isWord && R.has(i)).length;
  for (const w of ws) {
    if (!tokens[w.i].isWord || R.has(w.i)) continue;
    notes.push(w.cs.length === 0 ? `No reading for ${q(w.i)}: no relation is guessed for it.` : `Could not attach ${q(w.i)} (${w.pos}): the rules do not cover this use.`);
  }
  const relations = [...R.map.values()].sort((a, b) => a.dependent - b.dependent);
  return {
    languageId: 'de', analyzer: DE_SYNTAX_ANALYZER, tokens: tokens.map((t) => t.surface), relations,
    clauses: spans(), notes: notes.slice(0, 8),
    attached: wordCount ? Math.round((attachedWords / wordCount) * 1000) / 1000 : 0,
  };

  // ───────────── segmentation ─────────────

  function segment(ws: W[]): Seg[] {
    const out: Seg[] = [];
    let cur: Seg | undefined;
    let pend = '';
    const openSeg = (open: string): Seg => {
      const s: Seg = { idx: out.length, words: [], open, close: '', kind: 'main', quote: false, final: false, nps: [], extra: [] };
      out.push(s);
      return s;
    };
    const hasFinAhead = (from: number): boolean => {
      for (let k = from; k < ws.length && ws[k].word; k++) if (finTop(ws[k])) return true;
      return false;
    };
    /** A verb that can only be finite (geht, schläft): an infinitive-or-finite form (kaufen) at the end of a list does not start a new clause. */
    const hasDefiniteFinAhead = (from: number): boolean => {
      for (let k = from; k < ws.length && ws[k].word; k++) {
        const v = ws[k].cs.filter((c) => c.pos === 'VERB' || c.pos === 'AUX');
        if (v.length && ws[k].n !== ws[k].lemma.toLowerCase() && v.every((c) => (c.morph.VerbForm ?? '').split(',').includes('Fin') && !(c.morph.VerbForm ?? '').includes('Inf'))) return true;
      }
      return false;
    };
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (!w.word) {
        // "3. Mai": the dot of an ordinal number is not a boundary
        if (w.s === '.' && ws[i - 1]?.word && /^\d+$/.test(ws[i - 1].s) && ws[i + 1]?.word) continue;
        if (cur) { cur.close += w.s; cur = undefined; }
        else if (out.length) out[out.length - 1].close += w.s;
        pend += w.s;
        continue;
      }
      if (!cur) {
        // "Äpfel, Tomaten und Kartoffeln kaufen": a comma between bare nouns separates list items, not clauses
        const prevSeg = out[out.length - 1];
        const lastW = prevSeg && prevSeg.words.length ? ws[prevSeg.words[prevSeg.words.length - 1]] : undefined;
        if (prevSeg && pend === ',' && lastW && lastW.pos === w.pos && (w.pos === 'NOUN' || w.pos === 'PROPN') && !hasDefiniteFinAhead(i)) {
          // the tail of the list may end in a verb that only looks finite (kaufen): it is the infinitive of the clause before
          for (let k = i; k < ws.length && ws[k].word; k++) if (isVerbal(ws[k]) && ws[k].n === ws[k].lemma.toLowerCase()) ws[k].m = { ...ws[k].m, VerbForm: 'Inf' };
          prevSeg.close = '';
          (prevSeg.listAt ??= new Set()).add(i);
          cur = prevSeg;
        } else cur = openSeg(pend);
        pend = '';
      } else pend = '';
      // a coordinating word with a finite verb on both sides starts a new clause
      if (COORD.has(w.n) && cur.words.length && cur.words.some((k) => finTop(ws[k])) && hasFinAhead(i + 1)) {
        cur = openSeg('');
        cur.cc = i;
      }
      cur.words.push(i);
    }
    return out;
  }

  function verbFinalSeg(s: Seg): boolean {
    const last = ws[s.words[s.words.length - 1]];
    if (!last || !isVerbal(last) || !finCand(last)) return false;
    return finTop(last) || !s.words.some((k) => k !== last.i && finTop(ws[k]));
  }

  function classify(s: Seg): void {
    const first = s.words[0] === s.cc ? 1 : 0;
    if (first === 0 && COORD.has(ws[s.words[0]].n) && s.words.length > 1 && ws[s.words[0]].pos === 'CONJ') s.cc = s.words[0];
    const k0 = s.cc !== undefined && s.words[0] === s.cc ? 1 : 0;
    const w0 = ws[s.words[k0]];
    const w1 = ws[s.words[k0 + 1]];
    s.final = verbFinalSeg(s);
    const afterComma = s.open.includes(',') || s.close.includes(',') && s.idx === 0;
    const hasVerb = s.words.some((k) => isVerbal(ws[k]));
    if (!w0) { s.kind = 'frag'; return; }
    if (!hasVerb) { s.kind = 'frag'; return; }
    const sconj = (SUB_COMP.has(w0.n) || SUB_ADV.has(w0.n)) && (w0.pos === 'SCONJ' || w0.pos === 'CONJ' || w0.n === 'dass' || w0.n === 'daß' || s.final);
    if (sconj && s.final && w0.n !== 'wie' && w0.n !== 'als') { s.kind = 'sub'; s.conjMarker = w0.i; s.marker = w0.i; s.link = SUB_COMP.has(w0.n) ? 'ccomp' : 'advcl'; return; }
    if ((w0.n === 'als' || w0.n === 'wie') && s.final && w1 && afterComma) { s.kind = 'sub'; s.conjMarker = w0.i; s.marker = w0.i; s.link = 'advcl'; return; }
    const relOf = (w: W | undefined) => !!w && REL_FORMS.has(w.n) && (w.cs.some((c) => c.morph.PronType === 'Rel') || w.n.startsWith('welch') || w.n === 'dessen' || w.n === 'deren');
    if (afterComma && s.final) {
      if (s.cc === undefined && relOf(w0) && !(w0.pos === 'DET' && w1 && ['NOUN', 'PROPN', 'ADJ', 'NUM'].includes(w1.pos) && w0.n !== 'dessen' && w0.n !== 'deren')) {
        s.kind = 'rel'; s.relPron = w0.i; s.marker = w0.i; return;
      }
      if (w0.pos === 'ADP' && w1 && relOf(w1)) { s.kind = 'rel'; s.relPron = w1.i; s.marker = w1.i; return; }
      if (WH.has(w0.n)) { s.kind = 'sub'; s.marker = w0.i; s.link = 'ccomp'; return; }
    }
    // infinitive clause: um … zu, ohne … zu, or a bare zu + infinitive with no finite verb of its own
    const zuAt = s.words.findIndex((k) => ws[k].n === 'zu' && ws[k].pos === 'PART');
    const hasZuMarker = s.words.some((k) => ws[k].cs.some((c) => c.parts?.some((p) => p.kind === 'marker' && p.text === 'zu')));
    const noFin = !s.words.some((k) => finTop(ws[k]));
    if ((zuAt >= 0 || hasZuMarker) && noFin && afterComma) { s.kind = 'inf'; if (['um', 'ohne', 'statt', 'anstatt'].includes(w0.n)) { s.marker = w0.i; s.link = 'advcl'; } return; }
    if ((zuAt >= 0 || hasZuMarker) && ['um', 'ohne', 'statt', 'anstatt'].includes(w0.n) && !s.words.slice(0, zuAt).some((k) => finTop(ws[k]))) { s.kind = 'inf'; s.marker = w0.i; s.link = 'advcl'; return; }
    s.kind = 'main';
  }

  /** The first main clause after an opening quotation mark is the quoted words (Paul sagt: „Hallo“); later ones are separate sentences inside the quote. */
  function markQuotes(segs: Seg[]): void {
    let inQ = false;
    let done = false;
    for (const s of segs) {
      if ([...s.open].some((ch) => OPEN_QUOTE.has(ch)) || (/[“"]/.test(s.open) && !tokens.some((t) => t.surface === '„'))) { inQ = true; done = false; }
      if (inQ && !done && s.kind === 'main' && !s.merged) { s.quote = true; done = true; }
      if (inQ && /[“”»"]/.test(s.close) && s.idx > 0) inQ = false;
    }
  }

  // "Das Buch, das ich lese, ist gut": the verbless stretch in front of a relative clause belongs to the verb-first clause after it
  function mergeMatrix(segs: Seg[]): void {
    for (let k = 1; k < segs.length; k++) {
      const m = segs[k];
      if (m.kind !== 'main' || m.merged) continue;
      const k0 = m.cc !== undefined && m.words[0] === m.cc ? 1 : 0;
      if (!finTop(ws[m.words[k0]])) continue;
      let j = k - 1;
      while (j >= 0 && (segs[j].kind === 'rel' || segs[j].kind === 'sub') && segs[j].open.includes(',')) j--;
      if (j === k - 1 || j < 0) continue;
      const f = segs[j];
      if (f.kind !== 'frag' || !f.words.some((x) => ['NOUN', 'PROPN', 'PRON'].includes(ws[x].pos))) continue;
      if (segs[j + 1].kind !== 'rel' && segs[j + 1].kind !== 'sub') continue;
      m.words = [...f.words, ...m.words];
      f.merged = true; f.mergedInto = m.idx;
    }
  }

  // ───────────── one clause ─────────────

  function parseSeg(s: Seg): void {
    const cw = s.words.filter((i) => !ws[i].piece && i !== s.conjMarker && i !== s.cc);
    const posOf = new Map<number, number>();
    cw.forEach((i, p) => posOf.set(i, p));
    const vt = cw.filter((i) => isVerbal(ws[i]));
    // ── finite verb and verb group
    let F: number | undefined;
    if (s.kind !== 'inf') {
      if (s.final) { for (let k = vt.length - 1; k >= 0; k--) if (finCand(ws[vt[k]])) { F = vt[k]; break; } }
      else F = vt.find((i) => finTop(ws[i])) ?? vt.find((i) => !!finCand(ws[i]));
    }
    const nonfin: number[] = [];
    const form = new Map<number, 'fin' | 'inf' | 'part' | 'zuinf'>();
    const zuMark = new Map<number, number>();
    if (F !== undefined) form.set(F, 'fin');
    for (const v of vt) {
      if (v === F) continue;
      const w = ws[v];
      const zu = cw[(posOf.get(v) ?? 0) - 1];
      const zuBefore = zu !== undefined && ws[zu].n === 'zu' && ws[zu].pos === 'PART';
      const attached = w.cs.some((c) => c.parts?.some((p) => p.kind === 'marker' && p.text === 'zu'));
      let f: 'inf' | 'part' | 'zuinf' | undefined;
      for (const c of w.cs) {
        if (c.pos !== 'VERB' && c.pos !== 'AUX') continue;
        const vf = c.morph.VerbForm;
        if (vf === 'Part') { f = 'part'; break; }
        if (vf === 'Inf') { f = zuBefore || attached ? 'zuinf' : 'inf'; break; }
      }
      if (!f && w.n === w.lemma.toLowerCase()) f = zuBefore || attached ? 'zuinf' : 'inf'; // the form of the infinitive: kaufen
      if (!f) { s.extra.push(v); continue; }
      form.set(v, f);
      nonfin.push(v);
      if (zuBefore) zuMark.set(v, zu);
    }
    // two infinitives / participles joined by und (bleiben und trinken): the second hangs on the first, its objects on it
    const conjVerbs: Array<{ v: number; of: number; cc: number }> = [];
    for (let k = nonfin.length - 1; k >= 1; k--) {
      const a = nonfin[k - 1];
      const b = nonfin[k];
      const cc = cw.slice((posOf.get(a) ?? 0) + 1, posOf.get(b)).find((x) => COORD.has(ws[x].n) && ws[x].pos === 'CONJ');
      if (cc !== undefined && form.get(a) === form.get(b)) { conjVerbs.push({ v: b, of: a, cc }); nonfin.splice(k, 1); }
    }
    const chain = F !== undefined ? [F, ...nonfin.slice().reverse()] : nonfin.slice().reverse();
    const auxOf = new Map<number, { to: number; kind: 'perfect' | 'passive' | 'future' }>();
    const lex: number[] = [];
    for (let k = 0; k < chain.length; k++) {
      const A = chain[k];
      const B = chain[k + 1];
      if (B === undefined) { lex.push(A); continue; }
      const la = ws[A].lemma;
      const fb = form.get(B);
      if ((la === 'haben' || la === 'sein') && fb === 'part') auxOf.set(A, { to: B, kind: 'perfect' });
      else if (la === 'werden' && fb === 'part') auxOf.set(A, { to: B, kind: 'passive' });
      else if (la === 'werden' && fb === 'inf') auxOf.set(A, { to: B, kind: 'future' });
      else lex.push(A);
    }
    if (!lex.length) { s.kind = 'frag'; }
    const carrier = new Map<number, number>();
    const car = (i: number) => carrier.get(i) ?? i;

    // ── noun phrases
    const chunks = buildChunks(cw);
    const attachedChunks = new Set<Chunk>();

    // verb facts
    const fcs = F !== undefined ? ws[F].cs.filter((c) => (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').includes('Fin')) : [];
    const agrees = (ch: Chunk): boolean => {
      if (F === undefined) return true;
      return agrOptions(ch).some((a) => fcs.some((c) => compat(a.persons, list(c.morph.Person)) && compat(a.numbers, list(c.morph.Number))));
    };
    const caseSet = (ch: Chunk): string[] => {
      const h = ws[ch.head];
      let cs = h.cases;
      for (const m of ch.mods) {
        const mw = ws[m];
        if (mw.pos === 'DET' && mw.cases) { const x = inter(cs, mw.cases); if (x && x.length) cs = x; }
      }
      return cs ?? ALL_CASES;
    };
    const nomExact = (ch: Chunk) => { const c = caseSet(ch); return c.length === 1 && c[0] === 'Nom'; };
    const isRelChunk = (ch: Chunk) => ch.head === s.relPron;

    // genitive attributes, names with -s, flat names, noun-phrase coordination
    for (let a = 1; a < chunks.length; a++) {
      const X = chunks[a - 1];
      const Y = chunks[a];
      if (Y.pp || X.pe + 1 !== Y.ps || attachedChunks.has(Y)) continue;
      const yh = ws[Y.head];
      const xh = ws[X.head];
      if (xh.pos !== 'NOUN' && xh.pos !== 'PROPN') continue;
      // genitive noun phrase right behind a noun
      const yc = caseSet(Y);
      const ypl = yh.pos === 'NOUN' || yh.pos === 'PROPN';
      if (ypl && yc.includes('Gen') && !Y.prep) {
        const onlyGen = yc.length === 1;
        const detGen = Y.mods.some((m) => ws[m].pos === 'DET' && ws[m].cases?.includes('Gen'));
        if (onlyGen || (detGen && yc.length <= 2 && (X.pp || X.pe + 1 === Y.ps) && !yc.includes('Nom') && !yc.includes('Acc'))) {
          const alt: SyntaxAlternative[] = onlyGen ? [] : [{ relation: 'iobj', confidence: 0.3, why: `${CASE_FULL[yc.find((c) => c !== 'Gen') ?? 'Dat']} is also possible for '${yh.s}', but a noun phrase right behind a noun is usually its genitive attribute` }];
          R.set(Y.head, X.head, 'nmod', `genitive attribute of ${q(X.head)}`, [`'${yh.s}' (${describe(yh)}) stands right behind the noun '${xh.s}' without a preposition`, 'a genitive noun phrase after a noun says whose or what kind of'], onlyGen ? 0.8 : 0.6, alt);
          attachedChunks.add(Y); Y.done = true;
          attachDet(Y);
        }
      }
    }
    // ein Glas Wasser, viele Sorten Brot: a bare noun right behind a measure noun
    for (let a = 1; a < chunks.length; a++) {
      const X = chunks[a - 1];
      const Y = chunks[a];
      if (Y.done || Y.pp || Y.mods.length || X.pe + 1 !== Y.ps || ws[Y.head].pos !== 'NOUN' || ws[X.head].pos !== 'NOUN' || !MEASURES.has(ws[X.head].lemma)) continue;
      R.set(Y.head, X.head, 'nmod', `what ${q(X.head)} consists of`, [`'${ws[X.head].s}' is a measure or kind noun and '${ws[Y.head].s}' follows it with no article (a glass of water)`], 0.65);
      attachedChunks.add(Y); Y.done = true;
    }
    // Pauls Handy
    for (let a = 0; a + 1 < chunks.length; a++) {
      const Y = chunks[a];
      const Z = chunks[a + 1];
      const yh = ws[Y.head];
      if (Y.done || Y.pp || Y.mods.length || yh.pos !== 'PROPN' || !/[sß]$/.test(yh.n) || yh.n === yh.lemma.toLowerCase() || Y.pe + 1 !== Z.ps || ws[Z.head].pos !== 'NOUN') continue;
      if (Z.mods.some((m) => ws[m].pos === 'DET')) continue;
      R.set(Y.head, Z.head, 'nmod', `possessor of ${q(Z.head)}`, [`'${yh.s}' is a name with genitive -s standing before the noun '${ws[Z.head].s}' (Pauls Handy = Paul's phone)`], 0.75);
      attachedChunks.add(Y); Y.done = true;
    }
    // coordination of noun phrases
    for (let a = 1; a < chunks.length; a++) {
      const Y = chunks[a];
      const yStart = Y.ps - (Y.prep !== undefined ? 1 : 0) - (Y.prep2 !== undefined ? 1 : 0);
      const cc = cw[yStart - 1];
      const prev = chunks.slice(0, a).reverse().find((c) => !c.done || c.conjOf === undefined);
      if (prev && !Y.done && !Y.pp && s.listAt?.has(cw[Y.ps]) && prev.pe + 1 === Y.ps && !prev.pp) {
        const X = prev.conjOf ?? prev;
        Y.conjOf = X; X.coord.push(Y);
        R.set(Y.head, X.head, 'conj', `item of a list with ${q(X.head)}`, [`'${ws[Y.head].s}' follows '${ws[prev.head].s}' after a comma: one more item of the enumeration`, 'the first item keeps the role in the sentence; the others hang on it'], 0.75);
        attachedChunks.add(Y);
        continue;
      }
      if (cc === undefined || !prev || !COORD.has(ws[cc].n) || Y.done) continue;
      const X = prev.conjOf ?? prev;
      if (prev.pe + 1 !== yStart - 1) continue;
      Y.conjOf = X; Y.cc = cc; X.coord.push(Y);
      R.set(Y.head, X.head, 'conj', `coordinated with ${q(X.head)}`, [`'${ws[cc].s}' joins the two phrases '${ws[X.head].s}' and '${ws[Y.head].s}'`, 'the first member keeps the role in the sentence; the others hang on it'], 0.8);
      R.set(cc, Y.head, 'cc', `coordinating word before ${q(Y.head)}`, [`'${ws[cc].s}' stands directly before the second member '${ws[Y.head].s}'`], 0.85);
      attachedChunks.add(Y);
      if (Y.prep !== undefined) { /* its preposition is attached below as case */ }
    }
    // determiners / adjectives inside each phrase
    for (const ch of chunks) attachDet(ch);

    // ── arguments
    let args = chunks.filter((c) => !c.pp && !attachedChunks.has(c));
    const pps = chunks.filter((c) => c.pp && !attachedChunks.has(c) || (c.pp && c.conjOf));
    const assigned = new Set<Chunk>();
    const hostS = () => (lex.length ? car(lex[0]) : undefined);
    const hostO = () => (lex.length ? car(lex[lex.length - 1]) : undefined);
    const hostAt = (i: number): number | undefined => { let h = hostO(); for (const cv of conjVerbs) if (i > cv.cc) h = cv.v; return h; };
    const L = lex[lex.length - 1];
    const copLemma = L !== undefined && COPULA.has(ws[L].lemma) ? ws[L].lemma : undefined;
    const copReal = copLemma !== undefined && (L === F || form.get(L) === 'inf' || form.get(L) === 'part' || form.get(L) === 'zuinf');
    let subject: Chunk | undefined;
    let subjAlts: Chunk[] = [];
    // und trinkt das Wasser: a coordinated clause that opens with its verb shares the subject of the clause before
    const elided = s.cc !== undefined && !s.final && F !== undefined && cw[0] === F;
    // a noun whose first reading is not nominative but which has a nominative reading too (Bauern: dative singular, nominative plural)
    const viaAlt = new Map<Chunk, AnalysisCandidate>();
    const nomAgree = args.filter((a) => {
      if (a.conjOf || (elided && !nomExact(a))) return false;
      if (caseSet(a).includes('Nom')) return agrees(a);
      const h = ws[a.head];
      if (h.pos !== 'NOUN' && h.pos !== 'PROPN') return false;
      const alt = h.cs.slice(1).find((c) => c.pos === h.pos && c.lemma === h.c?.lemma && (list(c.morph.Case) ?? []).includes('Nom'));
      if (!alt || !(a.coord.length ? agrees(a) : F === undefined || fcs.some((vc) => compat(list(alt.morph.Number), list(vc.morph.Number)) && compat(['3'], list(vc.morph.Person))))) return false;
      viaAlt.set(a, alt);
      return true;
    });
    if (F !== undefined && s.kind !== 'inf' && nomAgree.length) {
      const score = (a: Chunk) => (nomExact(a) ? 3 : 1) - (isRelChunk(a) ? 2 : 0);
      const sorted = nomAgree.slice().sort((a, b) => score(b) - score(a) || a.ps - b.ps);
      subject = sorted[0];
      subjAlts = sorted.slice(1);
    }
    if (subject) assigned.add(subject);

    // predicate of a copula
    let predicate: { head: number; kind: 'nom' | 'adj' | 'pp' | 'adv'; chunk?: Chunk } | undefined;
    if (copReal) {
      const rest = args.filter((a) => !assigned.has(a));
      const nom = rest.find((a) => caseSet(a).includes('Nom') && !isRelChunk(a) && !TIME_NOUNS.has(ws[a.head].lemma));
      const usedByMods = new Set<number>(chunks.flatMap((c) => c.mods));
      const adj = cw.find((i) => ws[i].pos === 'ADJ' && !usedByMods.has(i) && !R.has(i));
      const ppC = pps.find((p) => !p.conjOf);
      const adv = cw.filter((i) => ws[i].pos === 'ADV' && !NOT_PREDICATE.has(ws[i].n) && !(DEICTIC.has(ws[i].n) && F !== undefined && i < F) && !usedByMods.has(i) && !R.has(i)).pop();
      if (nom && (subject || args.length >= 2 || F === undefined)) { predicate = { head: nom.head, kind: 'nom', chunk: nom }; assigned.add(nom); }
      else if (adj !== undefined) predicate = { head: adj, kind: 'adj' };
      else if (adv !== undefined && !(subject === undefined)) predicate = { head: adv, kind: 'adv' };
      else if (ppC) predicate = { head: ppC.head, kind: 'pp', chunk: ppC };
      // sein with only one nominative: a lone nominative is the subject, there is no predicate
    }
    if (predicate && L !== undefined) {
      carrier.set(L, predicate.head);
      const copWord = L;
      const how = predicate.kind === 'nom' ? 'a noun phrase' : predicate.kind === 'adj' ? 'an adjective' : predicate.kind === 'pp' ? 'a prepositional phrase' : 'an adverb';
      R.set(copWord, predicate.head, 'cop', `copula linking the subject to ${q(predicate.head)}`, [`'${ws[copWord].s}' (${ws[copWord].lemma}) has no other verb in the clause, so it only links the subject to ${how}`, `${how} after '${ws[copWord].lemma}' is the predicate and heads the clause (Universal Dependencies style)`], 0.8);
    }

    // chain relations
    for (const [A, aux] of auxOf) {
      let to = aux.to;
      while (auxOf.has(to)) to = auxOf.get(to)!.to;
      const tgt = car(to);
      const label = aux.kind === 'perfect' ? 'perfect tense auxiliary' : aux.kind === 'passive' ? 'passive auxiliary (werden + participle)' : 'future auxiliary (werden + infinitive)';
      const basis = aux.kind === 'perfect' ? [`'${ws[A].s}' (${ws[A].lemma}) + the participle '${ws[to].s}' makes the perfect tense`, 'the participle carries the meaning and sits at the end of the clause (sentence bracket)']
        : aux.kind === 'passive' ? [`'${ws[A].s}' (werden) + the participle '${ws[to].s}' makes the passive`, 'the participle sits at the end of the clause (sentence bracket)']
          : [`'${ws[A].s}' (werden) + the infinitive '${ws[to].s}' makes the future`, 'the infinitive sits at the end of the clause (sentence bracket)'];
      R.set(A, tgt, 'aux', `${label} of ${q(tgt)}`, basis, 0.85);
    }
    for (let k = 1; k < lex.length; k++) {
      const A = car(lex[k - 1]);
      const B = lex[k];
      const f = form.get(B);
      const modal = MODALS.has(ws[lex[k - 1]].lemma);
      const basis = [modal ? `'${ws[lex[k - 1]].s}' is a modal verb: it takes a bare infinitive at the end of the clause` : `'${ws[lex[k - 1]].s}' takes the verb '${ws[B].s}' as its complement`, f === 'zuinf' ? "the infinitive is marked by 'zu'" : f === 'part' ? 'the participle completes the verb' : 'the infinitive stands at the end of the clause'];
      R.set(car(B), A, 'xcomp', `verb complement of ${q(A)}`, basis, modal ? 0.85 : 0.7);
      const zu = zuMark.get(B);
      if (zu !== undefined) R.set(zu, car(B), 'mark', `infinitive marker of ${q(B)}`, [`'zu' stands directly before the infinitive '${ws[B].s}'`], 0.9);
    }
    if (F === undefined || s.kind === 'inf') {
      for (const [v, zu] of zuMark) R.set(zu, car(v), 'mark', `infinitive marker of ${q(v)}`, [`'zu' stands directly before the infinitive '${ws[v].s}'`], 0.9);
    }
    for (const cv of conjVerbs) {
      const of = car(cv.of);
      R.set(cv.v, of, 'conj', `coordinated with ${q(of)}`, [`'${ws[cv.cc].s}' joins the verbs '${ws[cv.of].s}' and '${ws[cv.v].s}' at the end of the clause`, 'the first verb is the head; the second hangs on it and takes the words behind the joining word'], 0.75);
      R.set(cv.cc, cv.v, 'cc', `coordinating word before ${q(cv.v)}`, [`'${ws[cv.cc].s}' stands directly before the second verb '${ws[cv.v].s}'`], 0.85);
      const zu = zuMark.get(cv.v);
      if (zu !== undefined) R.set(zu, cv.v, 'mark', `infinitive marker of ${q(cv.v)}`, [`'zu' stands directly before the infinitive '${ws[cv.v].s}'`], 0.9);
    }
    const S = hostS();
    const O = hostO();
    s.head = S;
    s.objHost = O;

    // subject
    const explainAgree = (a: Chunk) => {
      const h = ws[a.head];
      const fw = ws[F!];
      const num = a.coord.length ? 'plural (two or more joined by und)' : (h.numbers ? h.numbers.map((x) => NUM_FULL[x] ?? x).join('/') : 'number open');
      return `'${h.s}' is nominative (${describe(h)}) and agrees with the finite verb '${fw.s}' (${num})`;
    };
    if (subject && S !== undefined) {
      const alts: SyntaxAlternative[] = [];
      const synSub = caseSet(subject).includes('Acc');
      const swappable = subjAlts.filter((o) => caseSet(o).includes('Acc') && synSub && o !== predicate?.chunk);
      const basis = [viaAlt.has(subject) ? `'${ws[subject.head].s}' is read as ${describe(ws[subject.head])} first, but it also has a nominative reading (${(viaAlt.get(subject)!.morph.Case ?? '').replace(/Nom/, 'nominative')} ${viaAlt.get(subject)!.morph.Number === 'Plur' ? 'plural' : viaAlt.get(subject)!.morph.Number === 'Sing' ? 'singular' : ''}) that agrees with the finite verb '${ws[F!].s}'` : explainAgree(subject)];
      let conf = nomExact(subject) ? 0.9 : viaAlt.has(subject) ? 0.55 : 0.8;
      if (subjAlts.length) {
        if (nomExact(subject)) basis.push(`also nominative-compatible: ${subjAlts.map((o) => `'${ws[o.head].s}'`).join(', ')}, but '${ws[subject.head].s}' is the clearer nominative`);
        else basis.push(predicate?.chunk && subjAlts.includes(predicate.chunk) ? 'both noun phrases could be nominative; the first one is read as the subject and the second as the predicate (the usual order in a sentence with sein)' : 'both noun phrases could be nominative; the first one is read as the subject (the usual German order)');
      }
      if (swappable.length) {
        conf = subject.head < (F ?? 0) ? 0.7 : 0.55; // the subject-verb-object order is the usual one
        alts.push({ head: S, relation: 'obj', confidence: 0.35, why: `'${ws[subject.head].s}' looks the same in nominative and accusative (${describe(ws[subject.head])}), so it could also be the object if ${swappable.map((o) => `'${ws[o.head].s}'`).join(' / ')} were the subject` });
      }
      R.set(subject.head, S, 'nsubj', `subject of ${q(S)}`, basis, conf, alts);
    }

    // remaining noun phrases
    const rest = args.filter((a) => !assigned.has(a));
    args = rest;
    const verbRow = F !== undefined ? deLexiconView.verb(ws[F].lemma)[0] : undefined;
    const lowRow = L !== undefined ? deLexiconView.verb(ws[L].lemma)[0] : undefined;
    const governsDat = lowRow?.governs === 'dat' || verbRow?.governs === 'dat';
    const reflexiveVerb = !!(lowRow?.reflexive || verbRow?.reflexive);
    const objAt = new Set<number>();
    const haveObjFor = (a: Chunk) => objAt.has(hostAt(a.head) ?? -1);
    const takeObj = (a: Chunk) => { objAt.add(hostAt(a.head) ?? -1); };
    const pending: Chunk[] = [];
    const place = (a: Chunk, rel: Rel, label: string, basis: string[], conf: number, alts?: SyntaxAlternative[], status: 'generated' | 'conflicted' = 'generated') => {
      const Ox = hostAt(a.head);
      if (Ox === undefined) return;
      R.set(a.head, Ox, rel, label, basis, conf, alts, status);
      assigned.add(a);
    };
    for (const a of rest) {
      const h = ws[a.head];
      const cs = caseSet(a);
      if (O === undefined) break;
      if (h.lemma === 'sich' || (reflexiveVerb && ['mich', 'dich', 'uns', 'euch', 'mir', 'dir'].includes(h.n) && h.pos === 'PRON')) {
        place(a, 'expl', `reflexive pronoun of ${q(O)}`, [`'${h.s}' is the reflexive pronoun that belongs to the verb '${ws[O].lemma}'`], 0.8);
        continue;
      }
      if (TIME_NOUNS.has(h.lemma) && cs.includes('Acc') && !cs.includes('Dat')) {
        place(a, 'obl', `time expression of ${q(O)}`, [`'${h.s}' is an accusative time noun (${describe(h)}) answering when / how long, not an object`], 0.7);
        continue;
      }
      if (cs.length === 1 && cs[0] === 'Acc') { place(a, 'obj', `direct object of ${q(O)}`, [`'${h.s}' is accusative (${describe(h)}): the object the verb acts on`], 0.85); takeObj(a); continue; }
      if (cs.length === 1 && cs[0] === 'Nom' && ws[O].lemma === 'heißen') { place(a, 'xcomp', `name after ${q(O)}`, [`'heißen' takes a second nominative: the name`], 0.7); continue; }
      if (cs.every((c) => c === 'Dat' || c === 'Gen') && cs.includes('Dat')) { place(a, 'iobj', `indirect object (dative) of ${q(O)}`, [`'${h.s}' is dative (${describe(h)}): the person who receives or is affected`], 0.8); continue; }
      pending.push(a);
    }
    if (O !== undefined) for (const a of pending) {
      const h = ws[a.head];
      const cs = caseSet(a);
      const open = cs.length === 4;
      const ambiguousWhy = open ? `'${h.s}' has no case marking of its own (a name or an unmarked noun)` : `'${h.s}' is ${cs.map((c) => CASE_FULL[c]).join(' or ')} (${describe(h)})`;
      const haveObj = haveObjFor(a);
      const strictAccElsewhere = pending.some((o) => o !== a && caseSet(o).includes('Acc') && !caseSet(o).includes('Dat') && hostAt(o.head) === hostAt(a.head));
      if (cs.includes('Dat') && (governsDat || haveObj || (strictAccElsewhere && cs.includes('Acc') && !haveObj))) {
        const alt: SyntaxAlternative[] = cs.includes('Acc') ? [{ head: O, relation: 'obj', confidence: 0.3, why: `${ambiguousWhy}; accusative is possible too` }] : [];
        place(a, 'iobj', `indirect object (dative) of ${q(O)}`, [ambiguousWhy, haveObj ? 'another accusative object is already there, so this one is read as the dative object' : strictAccElsewhere && !governsDat ? 'another noun phrase can only be the accusative object, so this one is read as the dative object that comes first (geben + dative + accusative)' : `the verb '${ws[O].lemma}' takes a dative object`], 0.6, alt);
        continue;
      }
      if (cs.includes('Acc') && !haveObj) {
        const alt: SyntaxAlternative[] = cs.includes('Dat') ? [{ head: O, relation: 'iobj', confidence: 0.3, why: `${ambiguousWhy}; dative is possible too` }] : [];
        if (cs.includes('Nom') && subject && caseSet(subject).includes('Acc') && agrees(a)) alt.push({ head: O, relation: 'nsubj', confidence: 0.35, why: `'${h.s}' looks the same in nominative and accusative, so it could be the subject and '${ws[subject.head].s}' the object` });
        place(a, 'obj', `direct object of ${q(O)}`, [ambiguousWhy, 'the subject is already taken, so the remaining accusative-compatible noun phrase is read as the direct object'], alt.length ? 0.6 : 0.7, alt);
        takeObj(a);
        continue;
      }
      if (cs.length === 1 && cs[0] === 'Gen') { place(a, 'obl', `genitive adverbial of ${q(O)}`, [`'${h.s}' is genitive (${describe(h)}) with no noun before it: a genitive of time or manner (eines Tages, meines Wissens)`], 0.55); continue; }
      if (cs.includes('Dat')) { place(a, 'iobj', `indirect object (dative) of ${q(O)}`, [ambiguousWhy, 'an object is already there, so this one is read as the dative object'], 0.55); continue; }
      if (cs.includes('Acc')) { place(a, 'obj', `second accusative object of ${q(O)}`, [ambiguousWhy, 'a second accusative noun phrase (the verb takes two, or the first is an adverbial)'], 0.4, undefined, 'conflicted'); continue; }
      if (cs.includes('Nom') && !subject) { /* a nominative with no agreeing verb */ place(a, 'dep', `noun phrase of ${q(O)}, role not decided`, [ambiguousWhy, 'the verb does not agree with it, so it is not read as the subject'], 0.3); continue; }
      place(a, 'dep', `noun phrase of ${q(O)}, role not decided`, [ambiguousWhy], 0.3);
    }
    // the swapped reading on the object side of a syncretic pair
    if (subject && S !== undefined && O !== undefined) {
      for (const o of subjAlts) {
        const r = R.map.get(o.head);
        if (!r || r.relation !== 'obj' || !caseSet(subject).includes('Acc') || !caseSet(o).includes('Acc')) continue;
        const alts = r.alternatives ?? [];
        if (!alts.some((x) => x.relation === 'nsubj')) alts.push({ head: S, relation: 'nsubj', confidence: 0.35, why: `'${ws[o.head].s}' looks the same in nominative and accusative (${describe(ws[o.head])}); if it were the subject, '${ws[subject.head].s}' would be the object` });
        r.alternatives = alts;
        r.status = 'conflicted';
        r.confidence = Math.min(r.confidence, 0.6);
      }
    }

    // ── prepositional phrases
    for (const p of pps) {
      const prep = p.prep;
      if (prep === undefined) continue;
      const pw = ws[prep];
      const hw = ws[p.head];
      const gov = governed(pw);
      const cs = hw.cases ?? caseSet(p);
      const fit = gov.length ? cs.filter((c) => gov.includes(c)) : cs;
      const govText = gov.length ? gov.map((c) => CASE_FULL[c]).join(' or ') : '';
      const basis = [`'${pw.s}' is a preposition${govText ? ` that takes the ${govText}` : ''}`];
      let status: 'generated' | 'conflicted' = 'generated';
      let conf = 0.9;
      if (pw.cs[0]?.parts?.some((x) => x.kind === 'contracted')) basis.push(`'${pw.s}' is a contraction (${pw.cs[0].parts!.filter((x) => x.kind === 'contracted').map((x) => x.text).join(' + ')}): the article is inside it`);
      if (gov.includes('Acc') && gov.includes('Dat')) {
        if (fit.length === 1) basis.push(fit[0] === 'Dat' ? `two-way preposition: the phrase is dative (${describe(hw)}), so it names a location (where?)` : `two-way preposition: the phrase is accusative (${describe(hw)}), so it names a direction or goal (where to?)`);
        else { basis.push(`two-way preposition: the case of '${hw.s}' is not narrowed, so location (dative, where?) or direction (accusative, where to?) stays open`); conf = 0.7; }
      } else if (gov.length && fit.length) basis.push(`the phrase '${hw.s}' is ${fit.map((c) => CASE_FULL[c]).join(' or ')}, as the preposition requires`);
      else if (gov.length && !fit.length && hw.cases) { basis.push(`but '${hw.s}' is ${describe(hw)}, which does not fit; the rules may have misread one of them`); status = 'conflicted'; conf = 0.45; }
      R.set(prep, p.head, 'case', `preposition of ${q(p.head)}${govText ? ` (+ ${govText})` : ''}`, basis, status === 'conflicted' ? 0.5 : conf, undefined, status);
      if (p.prep2 !== undefined) R.set(p.prep2, p.head, 'case', `‘bis’ + preposition: up to ${q(p.head)}`, [`'${ws[p.prep2].s}' stands directly before the preposition '${pw.s}': 'as far as / until'`], 0.7);
      if (p.conjOf) continue;
      // where does the phrase hang?
      if (predicate && predicate.kind === 'pp' && predicate.chunk === p) continue;
      const Oh = hostAt(p.head);
      if (Oh === undefined) continue;
      const startPos = p.ps - 1 - (p.prep2 !== undefined ? 1 : 0);
      const prevNoun = chunks.find((c) => c !== p && !c.pp && !c.conjOf && c.pe + 1 === startPos && (ws[c.head].pos === 'NOUN' || ws[c.head].pos === 'PROPN'));
      const prevPP = chunks.find((c) => c !== p && c.pp && !c.conjOf && c.pe + 1 === startPos && ws[c.head].pos === 'NOUN' && c.prep !== undefined && PLACE.has(ws[c.prep].lemma) && PLACE.has(pw.lemma));
      const prefield = F !== undefined && s.kind === 'main' && p.head < F;
      if (prevNoun && prefield && ws[prevNoun.head].pos !== 'PROPN') {
        R.set(p.head, prevNoun.head, 'nmod', `phrase describing ${q(prevNoun.head)}`,
          [`'${pw.s} ${hw.s}' follows the noun '${ws[prevNoun.head].s}' inside the first position of the sentence, so it belongs to that noun phrase`], 0.7,
          [{ head: Oh, relation: 'obl', confidence: 0.3, why: 'a phrase can also modify the verb, but only one phrase may stand in front of the finite verb' }]);
      } else if (prevNoun && pw.n === 'mit' && !p.mods.length && hw.pos === 'NOUN' && !prefield) {
        R.set(p.head, prevNoun.head, 'nmod', `phrase describing ${q(prevNoun.head)}`,
          [`'${pw.s} ${hw.s}' has no article and follows the noun '${ws[prevNoun.head].s}' directly: mit + a bare noun after a noun usually says what it comes with (Tee mit Honig)`], 0.55,
          [{ head: Oh, relation: 'obl', confidence: 0.4, why: `it could also be an adverbial of the verb '${ws[Oh].s}'` }]);
      } else if (prevPP) {
        R.set(p.head, prevPP.head, 'nmod', `place phrase describing ${q(prevPP.head)}`,
          [`'${pw.s} ${hw.s}' is a place phrase that follows another place phrase ('${ws[prevPP.prep!].s} … ${ws[prevPP.head].s}'): it says where that place is`], 0.55,
          [{ head: Oh, relation: 'obl', confidence: 0.4, why: `it could also be a second adverbial of the verb '${ws[Oh].s}'` }]);
      } else if (prevNoun && pw.n === 'von') {
        R.set(p.head, prevNoun.head, 'nmod', `phrase describing ${q(prevNoun.head)}`,
          [`'von' + a noun phrase right behind the noun '${ws[prevNoun.head].s}' is usually its attribute (belonging to, made of)`], 0.6,
          [{ head: Oh, relation: 'obl', confidence: 0.4, why: `'von ${hw.s}' could also be an adverbial of the verb '${ws[Oh].s}'` }]);
      } else {
        const alt: SyntaxAlternative[] = prevNoun ? [{ head: prevNoun.head, relation: 'nmod', confidence: 0.35, why: `the phrase also fits as a modifier of the noun '${ws[prevNoun.head].s}' right before it` }] : [];
        R.set(p.head, Oh, 'obl', `adverbial phrase of ${q(Oh)} (${hw.pos === 'ADV' ? 'adverb' : 'preposition + noun'})`,
          [`'${pw.s} ${hw.s}' is a prepositional phrase: place, time, manner or the thing the verb relates to`, alt.length ? 'a noun stands right before it, so it could also describe that noun; the verb is the default' : `it depends on the verb '${ws[Oh].s}'`], alt.length ? 0.6 : 0.75, alt);
      }
    }
    // verbs left over (a second finite verb, an unclassifiable participle)
    for (const v of s.extra) if (!R.has(v) && S !== undefined) notes.push(`The verb ${q(v)} has no place in the verb group the rules know.`);

    // ── adverbs, particles, leftovers
    const chunkOfTok = new Map<number, Chunk>();
    for (const ch of chunks) { chunkOfTok.set(ch.head, ch); for (const m of ch.mods) chunkOfTok.set(m, ch); if (ch.prep !== undefined) chunkOfTok.set(ch.prep, ch); }
    const placed = (i: number) => R.has(i) || i === S || i === O || (predicate !== undefined && i === predicate.head);
    for (let p = 0; p < cw.length; p++) {
      const i = cw[p];
      const w = ws[i];
      if (R.has(i) || !w.cs.length) continue;
      const lastHost = hostAt(i);
      if (w.pos === 'DET' && cw[p + 1] !== undefined && (ws[cw[p + 1]].n === 'bisschen' || ws[cw[p + 1]].n === 'wenig')) {
        R.set(i, cw[p + 1], 'det', `article of ${q(cw[p + 1])}`, [`'${w.s} ${ws[cw[p + 1]].s}' is a fixed quantity phrase (a little)`], 0.7);
        continue;
      }
      if (w.n === 'zu' && w.pos === 'PART') {
        const nx = cw.slice(p + 1).find((k) => isVerbal(ws[k]));
        if (nx !== undefined) R.set(i, car(nx), 'mark', `infinitive marker of ${q(nx)}`, [`'zu' stands before the infinitive '${ws[nx].s}'`], 0.8);
        continue;
      }
      // adjective / adverb joined to the one before by und (groß und schön, hier und dort)
      const ccw = p >= 2 ? cw[p - 1] : undefined;
      if (ccw !== undefined && (w.pos === 'ADJ' || w.pos === 'ADV') && COORD.has(ws[ccw].n) && ws[ccw].pos === 'CONJ' && !R.has(ccw) && ws[cw[p - 2]].pos === w.pos && placed(cw[p - 2])) {
        const l = cw[p - 2];
        R.set(i, l, 'conj', `coordinated with ${q(l)}`, [`'${ws[ccw].s}' joins the two ${w.pos === 'ADJ' ? 'adjectives' : 'adverbs'} '${ws[l].s}' and '${w.s}'`], 0.75);
        R.set(ccw, i, 'cc', `coordinating word before ${q(i)}`, [`'${ws[ccw].s}' stands directly before '${w.s}'`], 0.8);
        continue;
      }
      if (w.pos === 'ADV' || w.pos === 'ADJ' || w.pos === 'PART') {
        const next = cw[p + 1];
        // nur / auch / etwa + a phrase: the adverb belongs to that phrase
        const nch = next !== undefined ? chunkOfTok.get(next) : undefined;
        if (nch && FOCUS.has(w.n) && (nch.ps === p + 1 || (nch.prep !== undefined && nch.prep === next))) {
          R.set(i, nch.head, 'advmod', `adverb of the phrase ${q(nch.head)}`, [`'${w.s}' stands directly before the phrase '${ws[next].s} …' and limits or approximates it`], 0.65);
          continue;
        }
        const predAdj = next !== undefined && ws[next].pos === 'ADJ' && lastHost !== undefined && PRED_VERBS.has(ws[lastHost].lemma);
        if (next !== undefined && ws[next].cs.length && ((DEGREE.has(w.n) && (ws[next].pos === 'ADJ' || (w.n === 'gar' && ws[next].n === 'nicht') || (ws[next].pos === 'ADV' && (!NOT_PREDICATE.has(ws[next].n) || DEGREE.has(ws[next].n))))) || (w.n === 'nicht' && predAdj))) {
          R.set(i, next, 'advmod', `intensifier of ${q(next)}`, [`'${w.s}' stands directly before '${ws[next].s}' and strengthens it`], 0.75);
          continue;
        }
        if (lastHost === undefined) continue;
        if (PARTICLES.has(w.n)) {
          R.set(i, lastHost, 'discourse', `modal particle in the clause of ${q(lastHost)}`, [`'${w.s}' is a modal particle: it colours the sentence but is not a part of it`], 0.65);
          continue;
        }
        if (w.pos === 'ADJ' && PRED_VERBS.has(ws[lastHost].lemma)) {
          R.set(i, lastHost, 'xcomp', `predicate adjective of ${q(lastHost)}`, [`'${ws[lastHost].lemma}' takes an adjective that says how the subject is, looks or stays`, `'${w.s}' is an adjective with no ending and no noun after it`], 0.65);
          continue;
        }
        const why = w.pos === 'ADJ' ? `'${w.s}' is an adjective with no ending and no noun after it, so it works as an adverb` : `'${w.s}' is an adverb: it adds time, place, degree or manner to the clause`;
        R.set(i, lastHost, 'advmod', `adverb of ${q(lastHost)}`, [why, `it depends on the verb '${ws[lastHost].s}'`], 0.7);
        continue;
      }
      if (w.pos === 'CONJ' && ['aber', 'denn', 'doch', 'allein'].includes(w.n) && lastHost !== undefined && i !== s.words[0]) {
        R.set(i, lastHost, w.n === 'denn' ? 'discourse' : 'advmod', `connecting word in the clause of ${q(lastHost)}`, [`'${w.s}' stands inside the clause (not in front of it), where it works like a connecting adverb or particle`], 0.5);
        continue;
      }
      if (w.pos === 'ADP' && !w.piece && p === cw.length - 1 && F !== undefined && lastHost !== undefined && deLexiconView.prefixKind(w.n) === 'separable') {
        R.set(i, F, 'compound', `separable prefix of ${q(F)}`, [`'${w.s}' stands alone at the end of the clause, where a separable verb leaves its prefix`, `the verb ${w.n}${ws[F].lemma} is not in the word list as one unit, so this is a guess from position`], 0.5);
        continue;
      }
      if (w.pos === 'INTJ' && lastHost !== undefined) {
        R.set(i, lastHost, 'discourse', `interjection in the clause of ${q(lastHost)}`, [`'${w.s}' is an interjection or greeting`], 0.7);
        continue;
      }
    }

    // clause facts for linking
    for (const ch of chunks) if (!ch.pp) s.nps.push(ch.head);
    if (s.kind === 'frag') s.head = undefined;

  }

  /** Determiner, numeral, adjectives (and their intensifiers) of one noun phrase. */
  function attachDet(ch: Chunk): void {
    const h = ws[ch.head];
    // two adjectives joined by und: the first describes the noun, the second hangs on the first (mods run right to left)
    for (let k = 1; k + 1 < ch.mods.length; k++) {
      const mid = ws[ch.mods[k]];
      if (!COORD.has(mid.n) || ws[ch.mods[k - 1]].pos !== 'ADJ' || ws[ch.mods[k + 1]].pos !== 'ADJ') continue;
      const second = ch.mods[k - 1];
      const first = ch.mods[k + 1];
      R.set(second, first, 'conj', `coordinated with ${q(first)}`, [`'${mid.s}' joins the adjectives '${ws[first].s}' and '${ws[second].s}' before the noun '${h.s}'`], 0.75);
      R.set(mid.i, second, 'cc', `coordinating word before ${q(second)}`, [`'${mid.s}' stands between two adjectives`], 0.8);
    }
    for (const m of ch.mods) {
      if (R.has(m)) continue;
      const mw = ws[m];
      if (mw.pos === 'DET') {
        const ok = compat(mw.genders, h.genders) && compat(mw.numbers, h.numbers) && compat(mw.cases, h.cases);
        const poss = mw.m.Poss === 'Yes';
        R.set(m, ch.head, 'det', `${poss ? 'possessive' : mw.m.Definite === 'Ind' ? 'indefinite article / determiner' : 'determiner'} of ${q(ch.head)}`,
          ok ? [`'${mw.s}' (${describe(mw)}) agrees with '${h.s}' (${describe(h)}) in case, gender and number`] : [`'${mw.s}' (${describe(mw)}) and '${h.s}' (${describe(h)}) do not agree; the rules attach it anyway because it stands directly before the noun`],
          ok ? 0.9 : 0.45, undefined, ok ? 'generated' : 'conflicted');
      } else if (mw.pos === 'ADJ') {
        const ok = compat(mw.genders, h.genders) && compat(mw.numbers, h.numbers) && compat(mw.cases, h.cases);
        const attr = !!mw.cases || mw.m.Decl !== undefined || /(e|en|er|es|em)$/.test(mw.n);
        R.set(m, ch.head, 'amod', `adjective describing ${q(ch.head)}`,
          [attr ? `'${mw.s}' stands before the noun '${h.s}' and has an adjective ending${ok ? ` that fits it (${describe(h)})` : ''}` : `'${mw.s}' stands directly before the noun '${h.s}'`, ok ? 'case, gender and number agree' : 'the ending does not clearly agree with the noun; the rules attach it by position'],
          ok ? 0.85 : 0.5, undefined, ok ? 'generated' : 'conflicted');
      } else if (mw.pos === 'NUM') {
        R.set(m, ch.head, 'nummod', `number counting ${q(ch.head)}`, [`'${mw.s}' is a number standing directly before the noun '${h.s}'`], 0.85);
      } else if (mw.pos === 'ADV') {
        const nx = ch.mods[ch.mods.indexOf(m) - 1];
        if (nx !== undefined) R.set(m, nx, 'advmod', `intensifier of ${q(nx)}`, [`'${mw.s}' stands directly before the adjective '${ws[nx].s}' and strengthens it`], 0.8);
      }
    }
  }

  /** Person / number a noun phrase can have as a subject: a pronoun with several readings (sie) offers each; a joined phrase (er und Oma) is plural. */
  function agrOptions(ch: Chunk): Array<{ persons: string[] | null; numbers: string[] | null }> {
    const h = ws[ch.head];
    if (ch.coord.length && ws[ch.coord[0].cc ?? -1]?.n !== 'oder') {
      const all = [h, ...ch.coord.map((c) => ws[c.head])];
      const only = (x: W, v: string) => !!x.persons && x.persons.length === 1 && x.persons[0] === v;
      const person = all.some((x) => only(x, '1')) ? ['1'] : all.some((x) => only(x, '2')) ? ['2'] : ['3'];
      return [{ persons: person, numbers: ['Plur'] }];
    }
    if (h.pos === 'PRON') {
      const outs = h.cs.filter((c) => c.pos === 'PRON').map((c) => (c.morph.Polite === 'Form' ? { persons: ['3'], numbers: ['Plur'] } : { persons: list(c.morph.Person) ?? ['3'], numbers: list(c.morph.Number) }));
      return outs.length ? outs : [{ persons: h.persons ?? ['3'], numbers: h.numbers }];
    }
    return [{ persons: ['3'], numbers: h.numbers }];
  }

  function governed(p: W): string[] {
    const con = deLexiconView.contraction(p.n);
    if (con) return [CASE_KEY[con.cell.c]];
    const pr = deLexiconView.preposition(p.n) ?? deLexiconView.preposition(p.lemma.toLowerCase());
    return pr ? pr.cases.map((c) => CASE_KEY[c]) : [];
  }

  // ───────────── noun-phrase chunks ─────────────

  function buildChunks(cw: number[]): Chunk[] {
    const used = new Set<number>();
    const out: Chunk[] = [];
    const mk = (head: number, p: number): Chunk => ({ head, mods: [], ps: p, pe: p, pp: false, coord: [], done: false });
    for (let p = cw.length - 1; p >= 0; p--) {
      const w = ws[cw[p]];
      if (used.has(w.i) || !w.cs.length) continue;
      if (w.pos !== 'NOUN' && w.pos !== 'PROPN' && w.pos !== 'PRON') continue;
      const ch = mk(w.i, p);
      used.add(w.i);
      if (w.pos !== 'PRON') {
        let k = p - 1;
        let dets = 0;
        while (k >= 0) {
          const mw = ws[cw[k]];
          if (used.has(mw.i) || !mw.cs.length) break;
          if (mw.pos === 'DET') { if (dets >= 2) break; dets++; }
          else if (mw.pos === 'ADJ' || mw.pos === 'NUM') { /* ok */ }
          else if (mw.pos === 'ADV' && DEGREE.has(mw.n) && ch.mods.length && ws[ch.mods[ch.mods.length - 1]].pos === 'ADJ') { /* sehr schöne Frau */ }
          else if (COORD.has(mw.n) && mw.pos === 'CONJ' && k >= 1 && ws[cw[k - 1]].pos === 'ADJ' && ch.mods.length && ws[ch.mods[ch.mods.length - 1]].pos === 'ADJ') { /* große und kleine Hunde */ }
          else break;
          ch.mods.push(mw.i);
          used.add(mw.i);
          k--;
        }
        ch.ps = k + 1;
      }
      out.unshift(ch);
    }
    // determiners and numerals with no noun are noun phrases of their own (Das ist Opa)
    for (let p = 0; p < cw.length; p++) {
      const w = ws[cw[p]];
      if (used.has(w.i) || !w.cs.length) continue;
      const nxt = ws[cw[p + 1]];
      if (w.pos === 'DET' && nxt && (nxt.n === 'bisschen' || nxt.n === 'wenig')) continue;
      if ((w.pos === 'DET' && !(w.cs[0].parts?.some((x) => x.kind === 'contracted'))) || w.pos === 'NUM') {
        used.add(w.i);
        out.push(mk(w.i, p));
      }
    }
    out.sort((a, b) => a.ps - b.ps);
    // names and titles: Frau Müller, Paul Müller
    for (let a = out.length - 1; a >= 1; a--) {
      const X = out[a - 1];
      const Y = out[a];
      const xh = ws[X.head];
      const yh = ws[Y.head];
      if (yh.pos !== 'PROPN' || Y.mods.length || X.pe + 1 !== Y.ps || !(xh.pos === 'PROPN' || (xh.pos === 'NOUN' && TITLES.has(xh.lemma)))) continue;
      R.set(Y.head, X.head, 'flat', `part of the name ${q(X.head)} ${q(Y.head)}`, [`'${xh.s} ${yh.s}' stand together as one name or title + name`], 0.8);
      X.pe = Y.pe;
      out.splice(a, 1);
    }
    // prepositions
    for (const ch of out) {
      const before = ch.ps > 0 ? ws[cw[ch.ps - 1]] : undefined;
      if (!before || !before.cs.length) continue;
      const isAdp = before.pos === 'ADP' && !before.piece;
      const compare = (before.n === 'als' || before.n === 'wie') && ch.ps - 1 > 0 && ['SCONJ', 'CONJ', 'ADV', 'ADP'].includes(before.pos);
      if (isAdp || compare) {
        ch.prep = before.i; ch.pp = true; used.add(before.i);
        const b2 = ch.ps > 1 ? ws[cw[ch.ps - 2]] : undefined;
        if (b2 && b2.pos === 'ADP' && !b2.piece && b2.n === 'bis' && !used.has(b2.i)) { ch.prep2 = b2.i; used.add(b2.i); }
      }
    }
    // preposition + adverb (bis morgen, von hier)
    for (let p = 0; p + 1 < cw.length; p++) {
      const a = ws[cw[p]];
      const b = ws[cw[p + 1]];
      if (a.pos !== 'ADP' || a.piece || used.has(a.i) || !b.cs.length || b.pos !== 'ADV' || used.has(b.i)) continue;
      used.add(a.i); used.add(b.i);
      const ch = mk(b.i, p + 1);
      ch.ps = p; ch.prep = a.i; ch.pp = true;
      out.push(ch);
    }
    out.sort((a, b) => a.ps - b.ps);
    return out;
  }

  // ───────────── linking ─────────────

  function link(): void {
    const live = segs.filter((x) => !x.merged);
    const withHead = (x: Seg) => x.head !== undefined;
    let root = live.find((x) => withHead(x) && x.kind === 'main' && !x.quote && x.cc === undefined);
    root ??= live.find((x) => withHead(x) && x.kind === 'main' && !x.quote);
    root ??= live.find((x) => withHead(x) && x.kind === 'main');
    if (!root) {
      const firstVerbal = live.find((x) => withHead(x));
      const firstFrag = live.find((x) => x.kind === 'frag' && fragHead(x) !== undefined);
      if (firstFrag && (!firstVerbal || firstFrag.idx < firstVerbal.idx)) { root = firstFrag; firstFrag.head = fragHead(firstFrag); } else root = firstVerbal;
    }
    // verbless sentence: the first noun phrase or word
    let rootHead: number | undefined = root?.head;
    if (rootHead === undefined) {
      for (const x of live) {
        const f = fragHead(x);
        if (f !== undefined) { rootHead = f; x.head = f; root = x; break; }
      }
    }
    if (rootHead !== undefined) {
      R.set(rootHead, undefined, 'root', 'the main word of the sentence', [rootBasis(rootHead, root?.kind === 'frag')], root?.kind === 'frag' ? 0.5 : 0.85);
    }
    function rootBasis(h: number, verbless: boolean): string {
      if (verbless) return 'the sentence has no verb: its first noun phrase or word is taken as the main word';
      const dep = [...R.map.values()].find((r) => r.head === h && (r.relation === 'cop' || r.relation === 'aux'));
      if (dep?.relation === 'cop') return `'${surf(h)}' is the predicate; the verb '${surf(dep.dependent)}' only links the subject to it (copula)`;
      if (dep?.relation === 'aux') return `'${surf(h)}' carries the meaning; the finite verb '${surf(dep.dependent)}' is its auxiliary`;
      return `'${surf(h)}' is the finite verb of the first main clause (verb in second position)`;
    }
    const idxOf = (x: Seg) => live.indexOf(x);
    const prevHead = (x: Seg): Seg | undefined => { for (let k = idxOf(x) - 1; k >= 0; k--) if (live[k].head !== undefined) return live[k]; return undefined; };
    const prevMain = (x: Seg): Seg | undefined => { for (let k = idxOf(x) - 1; k >= 0; k--) if (live[k].head !== undefined && (live[k].kind === 'main' || live[k].kind === 'frag')) return live[k]; return undefined; };
    const nextMain = (x: Seg): Seg | undefined => { for (let k = idxOf(x) + 1; k < live.length; k++) if (live[k].head !== undefined && live[k].kind === 'main') return live[k]; return undefined; };
    const firstConj = (x: Seg): Seg => { let c = x; while (c.coordOf !== undefined) c = segs[c.coordOf]; return c; };

    for (const x of live) {
      if (x.cc !== undefined && x.head !== undefined && x.kind !== 'frag') R.set(x.cc, x.head, 'cc', `coordinating word before ${q(x.head)}`, [`'${surf(x.cc)}' joins this clause to what came before`], 0.8);
      if (x.kind === 'frag') { fragment(x, x === root); continue; }
      if (x.head === undefined) continue;
      const head = x.head;
      // ── marker words
      if (x.kind === 'sub' && x.conjMarker !== undefined) R.set(x.conjMarker, head, 'mark', `subordinating word of ${q(head)}`, [`'${surf(x.conjMarker)}' opens a clause that ends in its verb: the conjugated verb '${surf(head)}' is sent to the end`], 0.9);
      if (x.kind === 'inf' && x.marker !== undefined && x.link === 'advcl') R.set(x.marker, head, 'mark', `introduces ${q(head)}`, [`'${surf(x.marker)} … zu' + infinitive is a purpose / manner clause`], 0.85);
      if (x.cc !== undefined) R.set(x.cc, head, 'cc', `coordinating word before ${q(head)}`, [`'${surf(x.cc)}' joins this clause to the one before`], 0.85);
      if (x === root) continue;
      // ── parent
      if (x.kind === 'rel') {
        const rel = relativeParent(x);
        if (rel) { R.set(head, rel.head, 'acl', `relative clause describing ${q(rel.head)}`, rel.basis, rel.conf, rel.alts); continue; }
        const p = prevHead(x) ?? root;
        if (p?.head !== undefined) R.set(head, p.head, 'dep', 'relative clause, antecedent not found', ['a clause opened by a relative pronoun and ending in its verb, but no noun was found in front of it'], 0.3);
        continue;
      }
      if (x.cc !== undefined && !/[.!?…]/.test(x.open) && (x.kind === 'main' || x.kind === 'sub' || x.kind === 'inf')) {
        const p = prevHead(x);
        if (p?.head !== undefined) { x.coordOf = firstConj(p).idx; const t = firstConj(p); R.set(head, t.head!, 'conj', `coordinated clause: ${q(t.head!)} … ${q(head)}`, [`'${surf(x.cc)}' joins two clauses with finite verbs`, 'the first clause is the head; the second hangs on it'], 0.8); continue; }
      }
      if (x.kind === 'sub') {
        let parent: Seg | undefined;
        if (x.link === 'ccomp') parent = prevHead(x) ?? nextMain(x);
        else parent = prevMain(x) ?? nextMain(x);
        if (parent?.head === undefined) parent = root;
        if (parent?.head !== undefined) {
          const lowest = parent.objHost ?? parent.head;
          if (x.link === 'ccomp') R.set(head, lowest, 'ccomp', `clause that completes ${q(lowest)}`, [x.conjMarker !== undefined ? `'${surf(x.conjMarker)}' opens a content clause (what is said, known or asked) with the verb at the end` : `the question word '${surf(x.marker!)}' opens an indirect question with the verb at the end`, `it fills a slot of '${surf(lowest)}'`], 0.8);
          else R.set(head, parent.head, 'advcl', `adverbial clause of ${q(parent.head)}`, [`'${surf(x.conjMarker!)}' opens an adverbial clause (reason, time, condition …) with the verb at the end`, `it depends on '${surf(parent.head)}'`], 0.8);
          continue;
        }
      }
      if (x.kind === 'inf') {
        const pv = prevHead(x) ?? nextMain(x) ?? root;
        const lastW = x.words[0] > 0 ? ws[x.words[0] - 1] : undefined;
        const prevNounHead = lastW && lastW.s === ',' ? (() => { for (let k = x.words[0] - 2; k >= 0; k--) { if (ws[k].word) return ['NOUN'].includes(ws[k].pos) ? k : undefined; } return undefined; })() : undefined;
        if (x.link === 'advcl' && pv?.head !== undefined) { R.set(head, pv.head, 'advcl', `purpose / manner clause of ${q(pv.head)}`, [`'${surf(x.marker!)} … zu' + infinitive`, `it depends on '${surf(pv.head)}'`], 0.8); continue; }
        if (prevNounHead !== undefined) { R.set(head, prevNounHead, 'acl', `infinitive clause describing ${q(prevNounHead)}`, [`a clause with 'zu' + infinitive follows the noun '${surf(prevNounHead)}'`], 0.55, pv?.head !== undefined ? [{ head: pv.head, relation: 'xcomp', confidence: 0.35, why: `it could also complete the verb '${surf(pv.head)}'` }] : undefined); continue; }
        if (pv?.head !== undefined) { const low = pv.objHost ?? pv.head; R.set(head, low, 'xcomp', `infinitive clause completing ${q(low)}`, [`'zu' + infinitive after the verb '${surf(low)}' completes it`], 0.65); continue; }
      }
      if (x.quote) {
        const p = prevMain(x);
        const target = p && (x.open.includes(':') || p.close.includes(':')) ? p : nextMain(x) ?? p;
        if (target?.head !== undefined) { R.set(head, target.head, 'ccomp', `quoted words completing ${q(target.head)}`, ['the words in quotation marks are what is said'], 0.7); continue; }
      }
      // a further main clause
      const p = prevHead(x) ?? root;
      if (p?.head !== undefined && p.head !== head) R.set(head, firstConj(p).head ?? p.head, 'conj', 'further clause of the sentence', ['an independent clause after the first one, without a joining word'], 0.5);
    }

    function relativeParent(x: Seg): { head: number; basis: string[]; conf: number; alts?: SyntaxAlternative[] } | undefined {
      const rp = x.relPron !== undefined ? ws[x.relPron] : undefined;
      const start = x.words[0];
      const cands: number[] = [];
      for (let k = start - 1; k >= 0 && cands.length < 4; k--) {
        const w = ws[k];
        if (!w.word) continue;
        if (['NOUN', 'PROPN'].includes(w.pos) || (w.pos === 'PRON' && cands.length === 0 && false)) cands.push(k);
      }
      if (!cands.length) return undefined;
      const agree = (k: number) => !rp || (compat(rp.genders, ws[k].genders) && compat(rp.numbers, ws[k].numbers));
      const good = cands.filter(agree);
      const pick = good[0] ?? cands[0];
      const basis = [`'${surf(x.relPron ?? start)}' opens a clause that ends in its verb, right after the noun '${surf(pick)}'`, good.length ? `the relative pronoun agrees with '${surf(pick)}' in gender and number (${describe(ws[pick])}); its case comes from its job inside the relative clause` : `no noun in front agrees with the pronoun; the nearest noun '${surf(pick)}' is taken`];
      const alts: SyntaxAlternative[] = good.slice(1, 2).map((k) => ({ head: k, relation: 'acl' as Rel, confidence: 0.35, why: `'${surf(k)}' agrees with the relative pronoun in gender and number too` }));
      const adjacent = pick === cands[0];
      return { head: pick, basis, conf: good.length && adjacent ? 0.85 : good.length ? 0.6 : 0.4, alts: alts.length ? alts : undefined };
    }

    /** The words, phrases and main word of a stretch with no verb: its first noun phrase, else its first full word (not an intensifier or a particle). */
    function fragFacts(x: Seg): { cw: number[]; chunks: Chunk[]; nps: Chunk[]; fh: number } | undefined {
      const cw = x.words.filter((k) => !ws[k].piece && k !== x.cc && ws[k].cs.length > 0);
      if (!cw.length) return undefined;
      const chunks = buildChunks(cw);
      const nps = chunks.filter((c) => !c.pp);
      const inPhrase = new Set<number>(chunks.flatMap((c) => [c.head, ...c.mods, ...(c.prep !== undefined ? [c.prep] : []), ...(c.prep2 !== undefined ? [c.prep2] : [])]));
      const light = (w: W) => (w.pos === 'ADV' || w.pos === 'PART') && (DEGREE.has(w.n) || FOCUS.has(w.n) || PARTICLES.has(w.n) || ['na', 'sonst', 'dann', 'so', 'ja', 'nein'].includes(w.n));
      const free = cw.filter((k) => !inPhrase.has(k) && ws[k].pos !== 'CONJ');
      const word = free.find((k) => !light(ws[k]));
      const fh = nps.length ? nps[0].head : word ?? chunks[0]?.head ?? free[0] ?? cw[0];
      return { cw, chunks, nps, fh };
    }

    function fragHead(x: Seg): number | undefined { return fragFacts(x)?.fh; }

    /** A stretch with no verb: greetings, names addressed, list items, answers. Its own words are chunked; the fragment hangs loosely on a clause. */
    function fragment(x: Seg, isRoot: boolean): void {
      const facts = fragFacts(x);
      if (!facts) return;
      const { cw, chunks, nps, fh } = facts;
      for (const ch of chunks) {
        attachDet(ch);
        const h = ws[ch.head];
        if (ch.prep !== undefined) R.set(ch.prep, ch.head, 'case', `preposition of ${q(ch.head)}`, [`'${surf(ch.prep)}' is a preposition directly before '${h.s}'`], 0.8);
        if (ch.prep2 !== undefined) R.set(ch.prep2, ch.head, 'case', `‘bis’ + preposition: up to ${q(ch.head)}`, [`'${surf(ch.prep2)}' stands directly before the preposition`], 0.65);
      }
      const prevS = prevHead(x);
      const tgt = (prevS ?? nextMain(x) ?? root)?.head;
      const tgtNext = (nextMain(x) ?? prevS ?? root)?.head;
      const fhw = ws[fh];
      const left = (() => { for (let k = x.words[0] - 1; k >= 0; k--) if (ws[k].word) return ws[k]; return undefined; })();
      let anchor = fh;
      const prevRaw = live[live.indexOf(x) - 1];
      let vocTarget = tgtNext;
      if (prevRaw && prevRaw.kind === 'frag' && !prevRaw.merged) {
        const pf = fragFacts(prevRaw);
        if (pf && !(pf.cw.length === 1 && (ws[pf.fh].pos === 'INTJ' || ANSWERS.has(ws[pf.fh].n)))) vocTarget = pf.fh;
      }
      if (!isRoot) {
        const bare = nps.length >= 1 && nps.every((c) => !c.mods.some((m) => ws[m].pos === 'DET') && (ws[c.head].pos === 'NOUN' || ws[c.head].pos === 'PROPN')) && cw.every((k) => ws[k].pos === 'CONJ' || chunks.some((c) => c.head === k || c.mods.includes(k)));
        if (cw.length === 1 && (fhw.pos === 'INTJ' || ANSWERS.has(fhw.n))) {
          if (tgtNext !== undefined) R.set(fh, tgtNext, 'discourse', `interjection / greeting for ${q(tgtNext)}`, [`'${fhw.s}' is an interjection or greeting standing on its own`], 0.7);
        } else if (x.cc !== undefined && prevS?.head !== undefined) {
          const t = firstConj(prevS).head ?? prevS.head;
          R.set(fh, t, 'conj', `coordinated with ${q(t)}`, [`'${surf(x.cc)}' joins this stretch to the clause before it; the verb is left out (ellipsis)`], 0.45);
          R.set(x.cc, fh, 'cc', `coordinating word before ${q(fh)}`, [`'${surf(x.cc)}' stands directly before the phrase`], 0.6);
        } else if ([...x.open].some((ch) => OPEN_QUOTE.has(ch)) && (x.open.includes(':') || prevRaw?.close.includes(':')) && prevS?.head !== undefined && !(cw.length === 1 && (fhw.pos === 'PROPN' || fhw.pos === 'NOUN'))) {
          const lowest = prevS.objHost ?? prevS.head;
          R.set(fh, lowest, 'ccomp', `quoted words completing ${q(lowest)}`, ['the words in quotation marks are what is said; they have no verb of their own'], 0.5);
        } else if (bare && left && (left.pos === 'NOUN' || left.pos === 'PROPN' || left.pos === 'PRON') && (fhw.pos === 'NOUN' || (fhw.pos === 'PROPN' && left.pos === 'PROPN')) && !/[!?]/.test(x.open)) {
          let h = left.i;
          while (R.map.get(h)?.relation === 'conj') h = R.map.get(h)!.head!;
          R.set(fh, h, 'conj', `item of a list with ${q(h)}`, ['a bare noun after a comma, right behind another noun: one more item of an enumeration'], 0.55);
          anchor = h;
        } else if (nps.length === 0 && chunks.length && left && R.map.get(left.i)?.relation === 'obl' && !/[!?:]/.test(x.open)) {
          R.set(fh, left.i, 'conj', `phrase coordinated with ${q(left.i)}`, ['a prepositional phrase after a comma, right behind another one: one more item of the same kind'], 0.5);
          anchor = left.i;
        } else if (bare && vocTarget !== undefined) {
          R.set(fh, vocTarget, 'vocative', `person addressed (${q(vocTarget)})`, [`'${fhw.s}' is a name or noun on its own between commas or marks, with no article: the person spoken to`], 0.6);
        } else if (tgt !== undefined) {
          R.set(fh, tgt, 'dep', `loose phrase beside ${q(tgt)}`, ['a stretch with no verb of its own (an answer, an exclamation or a left-out verb); how it belongs to the clause is not decided'], 0.3);
        }
      }
      if (x.cc !== undefined && !R.has(x.cc)) R.set(x.cc, fh, 'cc', `coordinating word before ${q(fh)}`, [`'${surf(x.cc)}' opens this stretch: it ties it to what was said before`], 0.6);
      // the rest of the fragment
      for (const ch of chunks) {
        if (ch.head === fh) continue;
        const startTok = ch.prep ?? cw[ch.ps];
        let bi = cw.indexOf(ch.prep2 ?? startTok) - 1;
        while (bi > 0 && FOCUS.has(ws[cw[bi]].n)) bi--; // und sogar im Garten
        const before = cw[bi];
        if (before !== undefined && COORD.has(ws[before].n) && ws[before].pos === 'CONJ' && !R.has(before)) {
          R.set(ch.head, anchor, 'conj', `coordinated with ${q(anchor)}`, [`'${ws[before].s}' joins this phrase to '${ws[anchor].s}'`], 0.65);
          R.set(before, ch.head, 'cc', `coordinating word before ${q(ch.head)}`, [`'${ws[before].s}' stands directly before the phrase`], 0.75);
        } else if (ch.pp) {
          R.set(ch.head, fh, nps.length ? 'nmod' : 'obl', `phrase belonging to ${q(fh)}`, [`'${surf(ch.prep!)} ${ws[ch.head].s}' follows '${fhw.s}' with no verb in between`], 0.5);
        }
      }
      // single words around the head of the fragment: adverbs before it
      for (let k = 0; k < cw.length; k++) {
        const w = ws[cw[k]];
        if (R.has(w.i) || w.i === fh) continue;
        if (w.pos === 'CONJ' && PARTICLES.has(w.n)) R.set(w.i, fh, 'discourse', `particle beside ${q(fh)}`, [`'${w.s}' is a particle in a stretch with no verb`], 0.5);
        else if (w.pos === 'ADV' || w.pos === 'ADJ' || w.pos === 'PART') R.set(w.i, fh, 'advmod', `adverb of ${q(fh)}`, [`'${w.s}' is an adverb in a stretch with no verb: it belongs to '${fhw.s}'`], 0.5);
        else if (w.pos === 'INTJ') R.set(w.i, fh, 'discourse', `interjection beside ${q(fh)}`, [`'${w.s}' is an interjection`], 0.5);
      }
    }
  }

  function leftoverCoordination(): void {
    for (const w of ws) {
      if (!w.word || R.has(w.i) || !COORD.has(w.n) || w.pos !== 'CONJ') continue;
      const nx = ws[w.i + 1];
      if (!nx || !nx.word || R.has(nx.i) || !nx.cs.length) continue;
      let l = w.i - 1;
      while (l >= 0 && ws[l].word && !(ws[l].pos === nx.pos && (R.has(l) || ws[l].pos === 'ADJ'))) l--;
      if (l < 0 || !ws[l].word) continue;
      if (nx.pos !== 'ADJ' && nx.pos !== 'ADV' && nx.pos !== 'NOUN' && nx.pos !== 'PROPN' && nx.pos !== 'PRON') continue;
      R.set(nx.i, l, 'conj', `coordinated with ${q(l)}`, [`'${w.s}' joins two words of the same kind: '${ws[l].s}' and '${nx.s}'`], 0.6);
      R.set(w.i, nx.i, 'cc', `coordinating word before ${q(nx.i)}`, [`'${w.s}' stands directly before '${nx.s}'`], 0.7);
    }
  }

  function punctuation(): void {
    const segOf = new Map<number, Seg>();
    for (const s of segs) for (const k of s.words) segOf.set(k, s.merged && s.mergedInto !== undefined ? segs[s.mergedInto] : s);
    const rootIdx = [...R.map.values()].find((r) => r.relation === 'root')?.dependent;
    const headOfWord = (k: number): number | undefined => {
      const s = segOf.get(k);
      if (s?.head !== undefined) return s.head;
      // a verbless fragment: the nearest word that has a relation
      return R.has(k) || k === rootIdx ? k : undefined;
    };
    for (const w of ws) {
      if (w.word) continue;
      let prev = -1;
      for (let k = w.i - 1; k >= 0; k--) if (ws[k].word) { prev = k; break; }
      let next = -1;
      for (let k = w.i + 1; k < ws.length; k++) if (ws[k].word) { next = k; break; }
      const closing = sentenceFinal(w.s) || /^[“”»'"’)\]]$/.test(w.s);
      let h: number | undefined;
      if (sentenceFinal(w.s) && next === -1) h = rootIdx;
      else if (closing && prev >= 0) h = headOfWord(prev);
      else if (next >= 0) h = headOfWord(next);
      else if (prev >= 0) h = headOfWord(prev);
      h ??= rootIdx;
      if (h === undefined || h === w.i) continue;
      R.set(w.i, h, 'punct', 'punctuation', [`'${w.s}' is a punctuation mark: it marks a boundary between clauses or the end of the sentence`], 0.9);
    }
  }

  function breakCycles(): void {
    for (const r of R.map.values()) {
      let k = r.head;
      let steps = 0;
      const seen = new Set<number>([r.dependent]);
      while (k !== undefined && steps++ < 200) {
        if (seen.has(k)) { R.map.delete(r.dependent); notes.push(`A loop was found around ${q(r.dependent)} and its relation was dropped.`); break; }
        seen.add(k);
        k = R.map.get(k)?.head;
      }
    }
  }

  function spans(): ClauseSpan[] {
    const out: ClauseSpan[] = [];
    for (const x of segs) {
      if (x.merged || !x.words.length || x.kind === 'frag') continue;
      const kind: ClauseSpan['kind'] = x.kind === 'rel' ? 'relative' : x.kind === 'sub' || x.kind === 'inf' ? 'subordinate' : x.quote ? 'quote' : x.coordOf !== undefined ? 'coordinate' : 'main';
      const label = kind === 'relative' ? 'relative clause: the verb stands last' : kind === 'subordinate' ? (x.kind === 'inf' ? 'infinitive clause with zu' : 'subordinate clause: the finite verb stands last') : kind === 'coordinate' ? 'coordinated clause' : kind === 'quote' ? 'quoted words' : 'main clause';
      const span: ClauseSpan = { start: x.words[0], end: x.words[x.words.length - 1], kind, label };
      const m = x.marker ?? x.cc;
      if (m !== undefined) span.marker = m;
      out.push(span);
    }
    return out;
  }
}
