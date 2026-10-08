/**
 * The Norwegian analysis pass (Bokmål and Nynorsk share it; the standard only chooses the lexicon, the unit list and the
 * names of the sources). MACHINE-DRAFTED rules, not checked by a native speaker.
 *
 * What a token meets, in order: its lexicon readings (closed classes, verbs, nouns, adjectives, names) → for a word the
 * lexicon does not know: the genitive -s on a known noun or name, an older spelling related to today's (historical.ts), a
 * compound taken apart into known words (compounds.ts), a hyphenated compound, a guessed name → the sentence layer
 * (context.ts: what the neighbours decide among homographs) → particle verbs put together (units.ts) → confidences.
 * Uncertain, and said so: a compound (0.55), an older spelling (0.5–0.9), a name guess (0.4–0.5), a genitive (0.75),
 * a particle unit across a noun phrase (0.6–0.7), anything the neighbours do not decide (kept as separate candidates).
 * There is no parser.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken, WordPart } from '../../core';
import { decomposeCompound } from './compounds';
import { rankSentence, type Cand, type Slot } from './context';
import { spellingRelation } from './historical';
import type { NoLexicon } from './lexicon';
import { findUnits, INSEPARABLE_PREFIXES, type NoUnit, type UnitToken } from './units';
import type { NoReading, NoStandard } from './types';

export interface SourceIds { hand: string; phrases: string; constructions: string; rules: string }

export const sourceIds = (std: NoStandard, version: string): SourceIds => {
  const a = `adapter-${std}@${version}`;
  return { hand: `${a}:hand`, phrases: `${a}:phrases`, constructions: `${a}:constructions`, rules: `${a}:rules` };
};

export interface Engine { std: NoStandard; lex: NoLexicon; units: readonly NoUnit[]; analyzer: string; ids: SourceIds }

const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('nb');
const isCap = (s: string): boolean => /^\p{Lu}/u.test(s);

function union(list: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = new Set(list.flatMap((m) => Object.keys(m)));
  for (const k of keys) {
    const vals = new Set(list.flatMap((m) => (m[k] === undefined ? [] : m[k].split(','))));
    out[k] = [...vals].sort().join(',');
  }
  return out;
}

/** Group readings of one form by lemma and part of speech: one candidate per lemma, morph a union. */
export function groupReadings(readings: NoReading[], extra: Partial<Cand> = {}): Cand[] {
  const groups = new Map<string, NoReading[]>();
  for (const r of readings) {
    const k = `${r.lemma}|${r.pos}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Cand[] = [];
  for (const g of groups.values()) {
    const r0 = g[0];
    out.push({
      lemma: r0.lemma, pos: r0.pos, morph: union(g.map((r) => r.morph)), gloss: r0.gloss, rules: [...new Set(g.map((r) => r.rule))],
      order: Math.min(...g.map((r) => r.order)), base: Math.min(...g.map((r) => r.confidence)), register: r0.register, varieties: r0.varieties,
      unverified: g.some((r) => r.unverified) || undefined, score: 0, origin: 'hand', gender: r0.gender, ...extra,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

function genitiveOf(tok: RawToken, eng: Engine): Cand[] {
  const n = tok.normalized;
  if (n.length < 3 || !n.endsWith('s')) return [];
  const baseNorm = n.slice(0, -1);
  const hits = eng.lex.lookup(baseNorm).filter((r) => (r.pos === 'NOUN' || r.pos === 'PROPN') && (r.pos === 'NOUN' || isCap(tok.surface)));
  if (!hits.length) return [];
  const out = hits.map((r): NoReading => ({ ...r, morph: { ...r.morph, Case: 'Gen' }, rule: `${r.rule}, with the genitive -s`, confidence: 0.75 }));
  const stemText = tok.surface.slice(0, -1);
  const parts: WordPart[] = [
    { text: stemText, start: 0, end: stemText.length, kind: 'stem', lemma: hits[0].lemma, pos: hits[0].pos },
    { text: 's', start: stemText.length, end: tok.surface.length, kind: 'clitic', role: 'genitive -s' },
  ];
  return groupReadings(out, { parts, origin: 'rule', base: 0.75 });
}

function compoundCands(tok: RawToken, eng: Engine, lexical: boolean): { cands: Cand[]; parts?: WordPart[] } {
  const d = decomposeCompound(tok.surface, eng.lex);
  if (!d) return { cands: [] };
  if (lexical) return { cands: [], parts: d.parts };
  const headReadings = eng.lex.lookup(norm(d.headForm)).filter((r) => r.pos === 'NOUN' && r.lemma === d.headLemma);
  if (!headReadings.length) return { cands: [] };
  const lemma = norm(d.prefix) + d.headLemma;
  const readings = headReadings.map((r): NoReading => ({ ...r, lemma, gloss: undefined, rule: `compound ${d.parts.filter((p) => p.kind !== 'link').map((p) => p.text).join(' + ')}${d.fuge.length ? ` (linking -${d.fuge.join('-')}-)` : ''}; the head ${d.headLemma} decides gender and inflection`, confidence: d.confidence }));
  const cands = groupReadings(readings, { parts: d.parts, unconfirmed: true, origin: 'rule', base: d.confidence, gender: eng.lex.noun(d.headLemma)?.gender });
  return { cands };
}

function hyphenCands(tok: RawToken, eng: Engine): Cand[] {
  const s = tok.surface;
  const trailing = /-$/.test(s);
  if (trailing) {
    const stem = s.slice(0, -1);
    const readings = eng.lex.lookup(norm(stem)).filter((r) => r.pos === 'NOUN' || r.pos === 'ADJ');
    if (readings.length) {
      const cands = groupReadings(readings.map((r) => ({ ...r, rule: `${r.rule}; the first part of a coordinated compound (sjø- og landtransport)`, confidence: 0.7 })), { origin: 'rule', base: 0.7 });
      for (const c of cands) c.notes = { ellipsis: 'first part of a compound whose second part is shared with a later word' };
      return cands;
    }
    return [];
  }
  const cut = s.lastIndexOf('-');
  const front = s.slice(0, cut);
  const tail = s.slice(cut + 1);
  if (!front || !tail) return [];
  if (/^\d+$/.test(front) && /^årige?$/.test(tail)) {
    return [{ lemma: `${front}-årig`, pos: 'ADJ', morph: { Degree: 'Pos' }, rules: ['a number + -årig'], order: 0, base: 0.6, score: 0, origin: 'rule', unconfirmed: true }];
  }
  if (/^\d+$/.test(front) && /^åring(en|er|ene)?$/.test(tail)) {
    return [{ lemma: `${front}-åring`, pos: 'NOUN', morph: { Gender: 'Masc' }, rules: ['a number + -åring'], order: 0, base: 0.6, score: 0, origin: 'rule', unconfirmed: true, gender: 'm' }];
  }
  let readings = eng.lex.lookup(norm(tail)).filter((r) => r.pos === 'NOUN' || r.pos === 'ADJ' || r.pos === 'VERB');
  if (!readings.length) {
    const d = compoundCands({ ...tok, surface: tail, normalized: norm(tail) }, eng, false).cands;
    if (!d.length) return [];
    readings = d.map((c) => ({ lemma: c.lemma, pos: c.pos, morph: c.morph, rule: c.rules.join('; '), confidence: 0.5, order: 0 } as NoReading));
  }
  const headLemma = readings[0].lemma;
  const lemma = `${front}-${headLemma}`;
  const parts: WordPart[] = [
    { text: front, start: 0, end: front.length, kind: 'component', role: 'first part (name, abbreviation or number)' },
    { text: '-', start: front.length, end: front.length + 1, kind: 'link', role: 'hyphen' },
    { text: tail, start: front.length + 1, end: s.length, kind: 'head', lemma: headLemma, pos: readings[0].pos, role: 'head: decides the gender and the kind of thing' },
  ];
  return groupReadings(readings.map((r) => ({ ...r, lemma, gloss: undefined, rule: `hyphenated compound ${front} + ${tail}; the head ${headLemma} decides the inflection`, confidence: 0.6 })), { parts, unconfirmed: true, origin: 'rule', base: 0.6, hyphen: true });
}

function wordCands(tok: RawToken, eng: Engine, initial: boolean): Cand[] {
  const { lex, std } = eng;
  const n = tok.normalized;
  const cap = isCap(tok.surface);
  if (/[-‐‑–]/.test(tok.surface)) {
    const h = hyphenCands(tok, eng);
    if (h.length) return h;
  }
  // the lexicon, with names only when the word is written with a capital
  let direct = lex.lookup(n).filter((r) => r.pos !== 'PROPN' || cap);
  if (direct.length) {
    const cands = groupReadings(direct);
    const nounCand = cands.find((c) => c.pos === 'NOUN');
    if (nounCand && tok.surface.length >= 8) {
      const cc = compoundCands(tok, eng, true);
      if (cc.parts) nounCand.parts = cc.parts;
    }
    for (const c of cands) {
      if (c.pos !== 'VERB' || c.unit) continue;
      const pre = INSEPARABLE_PREFIXES.find((p) => c.lemma.startsWith(p) && c.lemma.length - p.length >= 3 && lex.hasLemma(c.lemma.slice(p.length), 'VERB') && tok.surface.toLocaleLowerCase('nb').startsWith(p));
      if (!pre) continue;
      c.parts = [
        { text: tok.surface.slice(0, pre.length), start: 0, end: pre.length, kind: 'prefix', role: 'inseparable prefix: the verb never splits' },
        { text: tok.surface.slice(pre.length), start: pre.length, end: tok.surface.length, kind: 'stem', lemma: c.lemma.slice(pre.length), pos: 'VERB' },
      ];
    }
    return cands;
  }
  // a name the lexicon does not hold, written with a capital in the middle of a sentence, may still be a compound or historical
  const gen = genitiveOf(tok, eng);
  if (gen.length) return gen;
  const rel = spellingRelation(tok.surface, std, { isWord: (f) => lex.has(f) }, { midSentence: cap && !initial, isCommonNoun: (f) => lex.lookup(f).some((r) => r.pos === 'NOUN') });
  if (rel) {
    const modern = rel.modern.split(' ');
    if (modern.length === 1) {
      const readings = lex.lookup(modern[0]).filter((r) => r.pos !== 'PROPN');
      if (readings.length) {
        const cands = groupReadings(readings.map((r) => ({ ...r, rule: `${r.rule}; written in older spelling (${rel.rule})`, confidence: rel.confidence })), {
          orthography: { modern: rel.modern, period: rel.period, confidence: rel.confidence }, varieties: [rel.variety], origin: 'rule', base: rel.confidence,
        });
        if (rel.confidence < 0.9) for (const c of cands) c.unconfirmed = false;
        return cands;
      }
    }
  }
  if (!(cap && !initial)) {
    const cc = compoundCands(tok, eng, false);
    if (cc.cands.length) return cc.cands;
  }
  if (cap) {
    return [{
      lemma: tok.surface, pos: 'PROPN', morph: {}, rules: ['a capitalised word the word list does not know: probably a name'], order: 0, base: initial ? 0.4 : 0.5, score: 0,
      origin: 'rule', unconfirmed: true, notes: { nameGuess: 'true' },
    }];
  }
  return [];
}

function toCandidate(c: Cand, conf: number, eng: Engine): AnalysisCandidate {
  const notes: Record<string, string | string[]> = { ...(c.notes ?? {}) };
  if (c.rules.length) notes.rule = c.rules.join('; ');
  if (c.unverified) notes.unverified = 'true';
  if (c.context) notes.context = c.context;
  const cand: AnalysisCandidate = {
    lemma: c.lemma, pos: c.pos, morph: c.morph, confidence: Math.round(Math.min(conf, c.unverified ? 0.8 : 1) * 100) / 100,
    origin: c.origin, sourceId: c.origin === 'hand' ? eng.ids.hand : eng.ids.rules,
  };
  if (Object.keys(notes).length) cand.notes = notes;
  if (c.gloss) cand.gloss = c.gloss;
  if (c.register?.length) cand.register = c.register;
  if (c.varieties?.length) cand.varieties = c.varieties;
  if (c.parts?.length) cand.parts = c.parts;
  if (c.orthography) cand.orthography = c.orthography;
  if (c.unconfirmed) cand.unconfirmed = true;
  if (c.role) cand.role = c.role;
  if (c.unit) cand.unit = c.unit;
  return cand;
}

/** Confidence of each candidate of a token once ranked. */
function confidences(cs: Cand[]): number[] {
  return cs.map((c, k) => {
    if (cs.length === 1) return c.base >= 0.9 ? 0.9 : c.base;
    if (k === 0) {
      const gap = c.score - cs[1].score;
      const top = gap >= 3 ? 0.88 : gap >= 1.5 ? 0.8 : 0.7;
      return Math.min(c.base, top);
    }
    return Math.min(c.base, k === 1 ? 0.5 : 0.4);
  });
}

function applyUnits(slots: Slot[], tokens: RawToken[], eng: Engine): void {
  const ut: UnitToken[] = slots.map((s, i) => {
    const t = tokens[i];
    const bestScore = s.cands[0]?.score ?? 0;
    // a verb reading that the neighbours made much less likely than the best (så = the adverb, not the past tense of se) is not a head
    const verbs = s.cands.filter((c) => (c.pos === 'VERB' || c.pos === 'AUX') && !c.unit && c.score >= bestScore - 1.5);
    return {
      normalized: t.normalized, isWord: t.isWord, verbLemmas: [...new Set(verbs.map((c) => c.lemma))],
      finite: verbs.some((c) => /Fin/.test(c.morph.VerbForm ?? '') && !/Inf/.test(c.morph.VerbForm ?? '')),
      nominal: !!s.cands[0] && ['NOUN', 'PROPN', 'DET', 'ADJ', 'NUM'].includes(s.cands[0].pos),
      conj: !!s.cands[0] && (s.cands[0].pos === 'CONJ' || s.cands[0].pos === 'SCONJ'),
      punct: t.isWord ? undefined : t.surface,
    };
  });
  for (const hit of findUnits(ut, eng.units)) {
    const display = hit.unit.display;
    const mk = (role: string, pos: Cand['pos'], gloss: string, c0?: Cand): Cand => ({
      lemma: display, pos, morph: c0 ? { ...c0.morph } : {}, gloss, rules: [`the particle verb ${display}: the particle follows the verb (${role})`], order: 0, base: hit.confidence, score: 100,
      origin: 'rule', role, unit: { head: hit.head, pieces: hit.pieces, role, display }, notes: { unit: display, ...(role === 'head' ? {} : { particleOf: String(hit.head) }) },
    });
    for (const p of hit.pieces) {
      const slot = slots[p];
      if (p === hit.head) {
        const verbCands = slot.cands.filter((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.lemma === hit.unit.verb);
        const made = verbCands.slice(0, 2).map((c) => ({ ...mk('head', 'VERB', hit.unit.gloss, c), gender: undefined }));
        for (const m of made) m.rules.push(...[]);
        slot.cands = [...made, ...slot.cands.map((c) => ({ ...c, score: Math.min(c.score, 0) }))];
        slot.cands.forEach((c, k) => { if (k >= made.length && (c.pos === 'VERB' || c.pos === 'AUX') && c.lemma === hit.unit.verb) c.context = `part of the particle verb ${display}`; });
      } else {
        const tokNorm = tokens[p].normalized;
        const isRefl = ['seg', 'meg', 'deg', 'oss', 'dem'].includes(tokNorm);
        const m = isRefl ? mk('reflexive pronoun of the unit', 'PRON', hit.unit.gloss) : mk('particle', 'ADV', hit.unit.gloss);
        slot.cands = [m, ...slot.cands.map((c) => ({ ...c, score: Math.min(c.score, 0) }))];
      }
    }
  }
}

/**
 * Danish and early Norwegian print capitalised common nouns. When two or more words in the middle of a sentence are written with a
 * capital and are common nouns of the word list (Han kjøpte en Bok i Byen), their noun readings are related to the lower-case spelling
 * (0.5, nb-pre1907). A single capitalised word is not enough: it is as likely a title or a name (Bibelen).
 */
function markCapitalNouns(slots: Slot[], tokens: RawToken[], eng: Engine): void {
  if (eng.std !== 'nb') return;
  const hits = slots.filter((s) => s.word && !s.initial && isCap(tokens[s.i].surface) && tokens[s.i].surface.slice(1) === tokens[s.i].surface.slice(1).toLocaleLowerCase('nb')
    && s.cands.length > 0 && s.cands.every((c) => c.pos === 'NOUN') && !s.cands.some((c) => c.orthography));
  if (hits.length < 2) return;
  for (const s of hits) {
    for (const c of s.cands) {
      c.orthography = { modern: tokens[s.i].normalized, period: 'nb-pre1907', confidence: 0.5 };
      c.varieties = ['nb-dano'];
    }
  }
}

export function analyzeSentence(tokens: RawToken[], eng: Engine): AnalyzedToken[] {
  let seenWord = false;
  const slots: Slot[] = tokens.map((t, i) => {
    const initial = !seenWord && t.isWord;
    if (t.isWord) seenWord = true;
    const cands = t.isWord ? wordCands(t, eng, initial) : [];
    return { i, tok: t, cands, initial, word: t.isWord };
  });
  rankSentence(slots, tokens, eng.std);
  markCapitalNouns(slots, tokens, eng);
  applyUnits(slots, tokens, eng);
  // the apostrophe genitive: Hans' bok
  slots.forEach((s, i) => {
    const nx = tokens[i + 1];
    if (s.word && nx && !nx.isWord && /^['’]$/.test(nx.surface) && nx.start === tokens[i].end && s.cands[0] && (s.cands[0].pos === 'PROPN' || s.cands[0].pos === 'NOUN')) {
      s.cands[0] = { ...s.cands[0], morph: { ...s.cands[0].morph, Case: 'Gen' }, notes: { ...(s.cands[0].notes ?? {}), genitive: 'apostrophe after a name or noun ending in s' } };
    }
  });
  return slots.map((s) => {
    const conf = confidences(s.cands);
    return { token: s.tok, candidates: s.cands.map((c, k) => toCandidate(c, c.unit ? Math.max(conf[k], c.base) : conf[k], eng)), analyzer: eng.analyzer };
  });
}
