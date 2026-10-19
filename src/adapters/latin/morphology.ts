/**
 * The Latin word-form engine: every context-free reading of a written word.
 *
 *   form index (the lexicon's generated cells)  →  enclitic -que / -ne / -ve split off a word the index does not know  →
 *   Roman numerals in capitals  →  ending-based guesses for a word nothing knows (unconfirmed, no gloss).
 *
 * A reading is one lexeme and one feature bundle; cells of one lexeme that differ in a single feature merge into a union
 * (Case "Acc,Nom" for the neuter verbum), the same convention the German and Albanian adapters use. The written form is never
 * changed: the key it is looked up under (orthography.foldKey) folds ligatures, j / i, u / v and length marks only for the lookup.
 */
import type { AnalysisCandidate, PartOfSpeech, WordPart } from '../../core';
import { latinLexicon } from './lexicon';
import type { Reading } from './lexicon';
import { foldKey, romanValue, spellingAlternatives, splitEnclitic } from './orthography';
import { abbreviationReadings, guessWord } from './guess';
import { priorBoost } from './priors';
import { LA_SOURCE_IDS } from './version';
import type { Cell, Feats, Lexeme } from './types';

/** A feature bundle with the weight of the cells it stands for. */
interface Weighted { f: Feats; w: number }

/** Merge feature bundles that differ in exactly one feature into one bundle with a union value ("Acc,Nom"); the weights add up. */
export function mergeFeatures(list: Feats[]): Feats[] {
  return mergeWeighted(list.map((f) => ({ f, w: 1 }))).map((x) => x.f);
}

function mergeWeighted(list: Weighted[]): Weighted[] {
  const work = list.map((x) => ({ f: { ...x.f }, w: x.w }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < work.length; i++) {
      for (let j = i + 1; j < work.length; j++) {
        const a = work[i].f;
        const b = work[j].f;
        const ka = Object.keys(a);
        if (ka.length !== Object.keys(b).length) continue;
        let diff: string | undefined;
        let ok = true;
        for (const k of ka) {
          if (!(k in b)) { ok = false; break; }
          if (a[k] !== b[k]) {
            if (diff !== undefined) { ok = false; break; }
            diff = k;
          }
        }
        if (!ok) continue;
        if (diff === undefined) { work[i].w += work[j].w; work.splice(j, 1); changed = true; break outer; }
        a[diff] = [...new Set([...a[diff].split(','), ...b[diff].split(',')])].sort().join(',');
        work[i].w += work[j].w;
        work.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return work;
}

/**
 * How likely a form is to be this cell rather than a rarer one that spells the same: the citation form of a word (the nominative
 * of a noun, the first person of a verb, the infinitive) is the likeliest, a finite verb form beats an infinitive beats a participle
 * beats a gerundive, a vocative or a contracted variant is rare. These weights order the readings of one written form; they are
 * priors, not counts.
 */
function cellWeight(cell: Cell, lex: Lexeme, key: string): number {
  const f = cell.features;
  let w = 1;
  if (f.VerbForm === 'Inf') w = 0.8;
  else if (f.VerbForm === 'Part') w = 0.4;
  else if (f.VerbForm === 'Ger') w = 0.3;
  else if (f.VerbForm === 'Gdv') w = 0.25;
  else if (f.VerbForm === 'Sup') w = 0.05;
  if (f.Mood === 'Imp') w *= f.Tense === 'Fut' ? 0.1 : 0.5;
  if (f.Mood === 'Sub') w *= 0.8;
  if (f.Tense === 'FutPerf') w *= 0.4;
  if (f.Tense === 'Pqp') w *= 0.7;
  if (f.Case === 'Voc') w *= 0.3;
  if (f.Degree === 'Cmp') w *= 0.5;
  if (f.Degree === 'Sup') w *= 0.4;
  if (f.Voice === 'Pass' && f.VerbForm === 'Fin') w *= 0.7;
  if (cell.note === 'variant' || cell.note === 'contracted') w *= 0.3;
  // the citation form (an indeclinable word weighted 8 or 12 times was tried: the strict part of speech gained a point, the lemma lost a few tenths)
  if (foldKey(lex.lemma) === key) w *= 4;
  return w;
}

/** The note set a lexeme adds to every reading of it. */
function lexemeNotes(lex: Lexeme): Record<string, string | string[]> {
  const notes: Record<string, string | string[]> = {};
  if (lex.info.principal?.length) notes.principal = lex.info.principal.filter(Boolean);
  if (lex.info.declension) notes.declension = lex.info.declension;
  if (lex.info.conjugation) notes.conjugation = lex.info.conjugation;
  if (lex.info.adjType) notes.adjectiveClass = lex.info.adjType;
  if (lex.info.governs?.length) notes.governs = lex.info.governs;
  if (lex.info.indeclinable) notes.indeclinable = 'yes';
  if (lex.info.defective) notes.defective = 'yes';
  notes.source = lex.origin === 'rule' ? 'rule' : 'lexicon';
  return notes;
}

function morphFor(lex: Lexeme, features: Feats): Record<string, string> {
  const m: Record<string, string> = { ...features };
  if ((lex.kind === 'noun' || lex.kind === 'proper') && lex.info.gender) m.Gender = lex.info.gender;
  if (lex.info.deponent) m.Deponent = 'Yes';
  return m;
}

function confidenceFor(share: number, readings: number, lex: Lexeme): number {
  void readings;
  const base = 0.95 * Math.pow(share, 0.6);
  const c = lex.origin === 'rule' ? base * 0.8 : base;
  return Math.max(0.2, Math.min(0.95, Math.round(c * 100) / 100));
}

export interface WordOptions {
  /** The word starts its sentence (a capital letter there says nothing about a name). */
  sentenceInitial?: boolean;
}

function assemble(hits: Reading[], key: string): AnalysisCandidate[] {
  const byLex = new Map<Lexeme, Reading[]>();
  for (const h of hits) {
    const l = byLex.get(h.lex) ?? [];
    l.push(h);
    byLex.set(h.lex, l);
  }
  const all: Array<{ lex: Lexeme; f: Feats; w: number; readings: number }> = [];
  for (const [lex, list] of byLex) {
    const merged = mergeWeighted(list.map((r) => ({ f: r.cell.features, w: (lex.count + 3) * cellWeight(r.cell, lex, key) * priorBoost(key, lex.lemma, lex.pos) })));
    for (const x of merged) all.push({ lex, f: x.f, w: x.w, readings: merged.length });
  }
  // a participle that spells like a noun or adjective of the lexicon (mortuis, ventus, scriptura) is read as the noun or adjective
  if (all.some((x) => x.lex.kind === 'adj' || x.lex.kind === 'noun' || x.lex.kind === 'proper')) {
    const nominals = all.filter((n) => n.lex.kind === 'adj' || n.lex.kind === 'noun' || n.lex.kind === 'proper').map((n) => n.lex.lemma.toLowerCase());
    for (const x of all) {
      if (x.lex.kind !== 'verb' || (x.f.VerbForm !== 'Part' && x.f.VerbForm !== 'Gdv')) continue;
      // the perfect participle of a deponent verb IS the verb's own perfect (mortuus of morior, natus of nascor, profectus): the verb is the reading, not the adjective that spells the same
      if (x.lex.info.deponent && x.f.Tense === 'Perf' && x.f.VerbForm === 'Part') { x.w *= 3; continue; }
      const v = x.lex.lemma.toLowerCase();
      const k = Math.min(v.length - 1, 5);
      // sciens / scio, amans / amo are one word with one stem: no penalty; ventus / venio, scriptura / scribo are two
      if (nominals.some((n) => n.slice(0, k) !== v.slice(0, k))) x.w *= 0.15;
    }
  }
  const total = all.reduce((s, x) => s + x.w, 0);
  const out: AnalysisCandidate[] = all.map((x) => {
    const lex = x.lex;
    const c: AnalysisCandidate = {
      lemma: lex.lemma,
      pos: lex.pos,
      morph: morphFor(lex, x.f),
      notes: lexemeNotes(lex),
      confidence: confidenceFor(x.w / total, x.readings, lex),
      ...(lex.gloss ? { gloss: lex.gloss } : {}),
      origin: lex.origin === 'rule' ? 'rule' : 'hand',
      sourceId: lex.origin === 'romance' ? LA_SOURCE_IDS.closed : lex.origin === 'rule' ? LA_SOURCE_IDS.rules : LA_SOURCE_IDS.lexicon,
    };
    return c;
  });
  return out.sort((a, b) => b.confidence - a.confidence);
}

const ENCLITIC_INFO = {
  que: { lemma: '-que', pos: 'CONJ' as PartOfSpeech, role: 'enclitic "and" (attached to the word before it)' },
  ne: { lemma: '-ne', pos: 'PART' as PartOfSpeech, role: 'enclitic question marker (attached to the first word of a question)' },
  ve: { lemma: '-ve', pos: 'CONJ' as PartOfSpeech, role: 'enclitic "or" (attached to the word before it)' },
};

/** Every context-free reading of a written word. */
export function wordCandidates(surface: string, opts: WordOptions = {}): AnalysisCandidate[] {
  const lexicon = latinLexicon();
  const key = foldKey(surface);
  const hits = lexicon.lookup(key);
  if (hits.length) return assemble(hits, key);

  // host + enclitic: populusque, Deusque, dixitne, vobisve
  const enc = splitEnclitic(key);
  if (enc) {
    const [host, e] = enc;
    const hostHits = lexicon.lookup(host);
    if (hostHits.length) {
      const hostLen = surface.length - e.length;
      const info = ENCLITIC_INFO[e];
      return assemble(hostHits, host).map((c): AnalysisCandidate => {
        const parts: WordPart[] = [
          { text: surface.slice(0, hostLen), start: 0, end: hostLen, lemma: c.lemma, pos: c.pos, morph: c.morph, kind: 'stem' },
          { text: surface.slice(hostLen), start: hostLen, end: surface.length, lemma: info.lemma, pos: info.pos, role: info.role, kind: 'clitic' },
        ];
        return { ...c, confidence: Math.round(c.confidence * 0.9 * 100) / 100, parts, notes: { ...c.notes, enclitic: e } };
      });
    }
  }

  // a personal pronoun with ipse: teipsum, meipso, seipsos, nosmetipsos, vobismetipsis (read as the pronoun, the emphatic word said in the parts)
  const emph = /^(me|te|se|nos|uos|nobis|uobis|tibi|mihi|sibi|mei|tui|sui|nostri|uestri)(met)?(ips[a-z]*)$/.exec(key);
  if (emph) {
    const hostHits = lexicon.lookup(emph[1]);
    if (hostHits.length && lexicon.lookup(emph[3]).length) {
      const cut = surface.length - emph[3].length;
      return assemble(hostHits, emph[1]).map((c): AnalysisCandidate => ({
        ...c, confidence: Math.round(c.confidence * 0.9 * 100) / 100,
        parts: [
          { text: surface.slice(0, cut), start: 0, end: cut, lemma: c.lemma, pos: c.pos, morph: c.morph, kind: 'stem' },
          { text: surface.slice(cut), start: cut, end: surface.length, lemma: 'ipse', pos: 'PRON', role: 'emphatic "self"', kind: 'clitic' },
        ],
        notes: { ...c.notes, emphatic: 'ipse' },
      }));
    }
  }

  // the emphatic -met on a personal pronoun: egomet, sibimet, nosmet, tuimet
  const met = /^(ego|tu|mihi|tibi|sibi|nobis|uobis|mei|tui|sui|me|te|se|nos|uos)met$/.exec(key);
  if (met) {
    const hostHits = lexicon.lookup(met[1]);
    if (hostHits.length) {
      const cut = surface.length - 3;
      return assemble(hostHits, met[1]).map((c): AnalysisCandidate => ({
        ...c, confidence: Math.round(c.confidence * 0.9 * 100) / 100,
        parts: [
          { text: surface.slice(0, cut), start: 0, end: cut, lemma: c.lemma, pos: c.pos, morph: c.morph, kind: 'stem' },
          { text: surface.slice(cut), start: cut, end: surface.length, lemma: '-met', pos: 'PART', role: 'emphatic particle (attached to a personal pronoun)', kind: 'clitic' },
        ],
        notes: { ...c.notes, enclitic: 'met' },
      }));
    }
  }

  // an enclitic written as a bare q (adeoq, atq, itaq): the -que of the Neo-Latin scientific hand
  if (/[a-z]{3,}q$/.test(key)) {
    const whole = lexicon.lookup(key + 'ue');
    if (whole.length) return assemble(whole, key + 'ue').map((c) => ({ ...c, confidence: Math.round(c.confidence * 0.8 * 100) / 100, notes: { ...c.notes, abbreviation: surface + ' is short for ' + surface + 'ue' } }));
    const host = lexicon.lookup(key.slice(0, -1));
    if (host.length) return assemble(host, key.slice(0, -1)).map((c) => ({ ...c, confidence: Math.round(c.confidence * 0.72 * 100) / 100, notes: { ...c.notes, abbreviation: surface + ' is short for ' + surface + 'ue', enclitic: 'que' } }));
  }

  // Roman first names (L., M., C.) and numerals in capitals (the lower-case words mi, di, vix, mil are words)
  const praenomen = abbreviationReadings(surface);
  const rv = romanValue(surface);
  if (praenomen.length || rv !== undefined) {
    const out = [...praenomen];
    if (rv !== undefined) out.push({ lemma: surface, pos: 'NUM', morph: { NumType: 'Card', NumValue: String(rv) }, notes: { numeral: String(rv), source: 'rule' }, confidence: praenomen.length ? 0.45 : 0.85, origin: 'rule', sourceId: LA_SOURCE_IDS.rules });
    return out;
  }

  // another spelling of a word the lexicon knows: an assimilated prefix, a medieval e for ae, a doubled consonant
  if (key.length >= 3) {
    for (const alt of spellingAlternatives(key)) {
      const found = lexicon.lookup(alt.key);
      if (!found.length) continue;
      return assemble(found, alt.key).map((c): AnalysisCandidate => ({
        ...c, confidence: Math.max(0.3, Math.round(c.confidence * 0.8 * 100) / 100), orthography: { modern: found[0].cell.form, period: alt.period, confidence: 0.8 },
        notes: { ...c.notes, spelling: alt.why },
      }));
    }
  }

  return guessWord(surface, key, !!opts.sentenceInitial);
}
