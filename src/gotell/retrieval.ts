/**
 * Intent retrieval: "what are you trying to say?" -> wording the learner has ALREADY MET.
 *
 * Built only from the stated English meaning. It never reads a draft or a revision (the learner's own testimony
 * Texts are excluded from the pool), so the proposal can never echo his own writing back as if it were new help.
 *
 *   1. English -> meaning terms (content words, stemmed; negation kept aside).
 *   2. Pool = the sentences this learner has encountered (store.encounters), minus testimony texts.
 *   3. A token expresses a term by (a) a precise concept table hit (key theological terms, "understand"),
 *      (b) the lemma gloss ("began", "sin") found through the lemma index, or - at sentence level only - (c) the
 *      sentence's English rescue line. Phrase occurrences stretch a span to whole phrases.
 *   4. ONE sentence must cover every term. The proposal is the smallest contiguous span of that sentence covering
 *      the matched tokens (plus whole phrases), taken verbatim. A span that flips negation, or that carries a key
 *      term the learner did not ask for, is disqualified.
 *   5. Otherwise nothing is proposed: the result says exactly which ideas have no encountered wording.
 */
import type { AdapterRegistry, AppStore, LanguageCode, PhraseOccurrence, Sentence, Text, Token } from '../core';
import { CONCEPTS, CONCEPT_IDS, conceptsForToken } from './concepts';
import type { ConceptId } from './concepts';
import { isNegator } from './meaning';
import { isFunctionAt, parse, wordIndexes } from './text';

// ───────────────────────── English -> terms ─────────────────────────

const STOP = new Set(('a an the and or but if then than so as at by for from in into of on onto to with about over under up out off again ' +
  'i me my mine myself we us our ours you your yours he him his she her hers it its they them their theirs this that these those ' +
  'am is are was were be been being have has had having do does did doing done will would can could should may might must shall ' +
  'also just very really quite too there here what which who whom whose how why where when while because since until before after ' +
  'some any all each every both more most much many one ones thing things way lot get got go went going come came').split(' '));
const NEGATION = new Set(['not', 'no', 'never', 'cannot', 'nothing', 'nobody', 'nowhere', 'neither', 'nor', 'none', 'without']);

const IRREGULAR: Record<string, string> = {
  began: 'begin', begun: 'begin', knew: 'know', known: 'know', understood: 'understand', felt: 'feel', gave: 'give', given: 'give',
  saw: 'see', seen: 'see', took: 'take', taken: 'take', told: 'tell', thought: 'think', found: 'find', made: 'make', said: 'say',
  became: 'become', forgave: 'forgive', forgiven: 'forgive', children: 'child', people: 'person', heard: 'hear', wrote: 'write',
  written: 'write', ran: 'run', held: 'hold', kept: 'keep', left: 'leave', lost: 'lose', met: 'meet', sat: 'sit', stood: 'stand',
  brought: 'bring', lived: 'live', died: 'die', rose: 'rise', risen: 'rise', chose: 'choose', chosen: 'choose', fell: 'fall', fallen: 'fall',
};

/** A crude English stemmer, used identically on the request, the glosses and the rescue lines. */
export function stemEnglish(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, '');
  if (IRREGULAR[w]) w = IRREGULAR[w];
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

const words = (s: string): string[] => [...s.toLowerCase().matchAll(/[a-z]+(?:'[a-z]+)?/g)].map((m) => m[0]);
const isNegationWord = (w: string) => NEGATION.has(w) || /n't$/.test(w);

/** Content stems of a gloss / rescue line (stopwords and negation removed). */
export function contentStems(s: string): Set<string> {
  return new Set(words(s).filter((w) => !STOP.has(w) && !isNegationWord(w) && w.length > 1).map(stemEnglish));
}

export interface IntentTerm {
  /** The stem that identifies the idea. */
  key: string;
  /** The English word the learner used (for messages). */
  word: string;
  /** Precise concepts (key theological terms, "understand") the word belongs to. */
  concepts: ConceptId[];
}

/** Concepts reliable enough to match a target word on their own; the broad ones ("jesus" = God/Jesus/church) are not. */
const isPrecise = (c: ConceptId) => CONCEPTS[c].keyTerm || c === 'understand';

export function intentTerms(english: string): { terms: IntentTerm[]; negated: boolean } {
  const terms: IntentTerm[] = [];
  const seen = new Set<string>();
  let negated = false;
  for (const w of words(english)) {
    if (isNegationWord(w)) { negated = true; continue; }
    if (STOP.has(w) || w.length < 2) continue;
    const key = stemEnglish(w);
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ key, word: w, concepts: CONCEPT_IDS.filter((id) => isPrecise(id) && CONCEPTS[id].english.includes(w)) });
  }
  return { terms, negated };
}

// ───────────────────────── retrieval ─────────────────────────

export interface RetrievedWording {
  text: string;
  sentence: Sentence;
  textRow: Text;
  surface: 'corpus' | 'scripture' | 'testimony' | 'listen';
  coveredKeys: string[];
  /** Content words inside the span that do not correspond to anything asked for. */
  extraWords: string[];
  /** Form ids of the matched tokens + phrase ids fully inside the span (what GoLearn is asked about). */
  itemIds: string[];
  phraseIds: string[];
  tokenCount: number;
}

export interface RetrievalResult {
  terms: IntentTerm[];
  negated: boolean;
  /** One sentence that covers every term, as the smallest verbatim span. */
  best?: RetrievedWording;
  /** Terms with no encountered wording anywhere. */
  missing: IntentTerm[];
  /** For every term that WAS met: the first place (title + sentence). */
  metSeparately: Array<{ term: IntentTerm; textTitle: string; excerpt: string }>;
  /** The best single sentence when none covers everything. */
  bestPartial?: { covers: IntentTerm[]; lacks: IntentTerm[]; textTitle: string };
  /** Why otherwise-matching sentences were disqualified. */
  blocked: string[];
}

export interface RetrievalDeps { store: AppStore; adapters: AdapterRegistry }

interface PoolEntry { sentenceId: string; textId: string; surface: RetrievedWording['surface'] }

export async function retrieveWording(deps: RetrievalDeps, userId: string, lang: LanguageCode, english: string): Promise<RetrievalResult> {
  const { store, adapters } = deps;
  const adapter = adapters.get(lang);
  const { terms, negated } = intentTerms(english);
  const result: RetrievalResult = { terms, negated, missing: [], metSeparately: [], blocked: [] };
  if (terms.length === 0) return result;

  // 1. the pool: sentences this learner has met, never his own testimony
  const encs = (await store.encounters.where('userId', userId)).filter((e) => e.lang === lang);
  const entries = new Map<string, PoolEntry>();
  for (const e of encs) if (!entries.has(e.sentenceId)) entries.set(e.sentenceId, { sentenceId: e.sentenceId, textId: e.textId, surface: e.surface });
  const textIds = [...new Set([...entries.values()].map((e) => e.textId))];
  const texts = new Map<string, Text>();
  for (const t of await store.texts.getMany(textIds)) if (t && t.kind !== 'testimony' && t.lang === lang) texts.set(t.id, t);
  const pool = [...entries.values()].filter((e) => texts.has(e.textId));

  // 2. per text: tokens, rescues, phrase occurrences (indexed queries, one per text)
  const tokensBySentence = new Map<string, Token[]>();
  const rescueStems = new Map<string, Set<string>>();
  const occBySentence = new Map<string, PhraseOccurrence[]>();
  const sentenceRows = new Map<string, Sentence>();
  for (const s of await store.sentences.getMany(pool.map((e) => e.sentenceId))) if (s) sentenceRows.set(s.id, s);
  const wanted = new Set(sentenceRows.keys());
  for (const textId of new Set(pool.map((e) => e.textId))) {
    for (const t of await store.tokens.where('textId', textId)) {
      if (!wanted.has(t.sentenceId)) continue;
      (tokensBySentence.get(t.sentenceId) ?? tokensBySentence.set(t.sentenceId, []).get(t.sentenceId)!).push(t);
    }
    for (const r of await store.rescues.where('textId', textId)) if (wanted.has(r.sentenceId)) rescueStems.set(r.sentenceId, contentStems(r.english));
    for (const o of await store.phraseOccurrences.where('textId', textId)) {
      if (wanted.has(o.sentenceId)) (occBySentence.get(o.sentenceId) ?? occBySentence.set(o.sentenceId, []).get(o.sentenceId)!).push(o);
    }
  }
  for (const list of tokensBySentence.values()) list.sort((a, b) => a.index - b.index);

  // 3. lemma glosses -> tokens (through the lemma index, not a scan of every analysis)
  const termKeys = new Set(terms.map((t) => t.key));
  const glossTokens = new Map<string, Set<string>>(); // term key -> tokenIds whose lemma gloss / analysis gloss has the stem
  for (const lemma of await store.lemmas.where('lang', lang)) {
    const hit = lemma.gloss ? [...contentStems(lemma.gloss)].filter((k) => termKeys.has(k)) : [];
    const analysesRows = hit.length ? await store.analyses.where('lemmaId', lemma.id) : [];
    for (const a of analysesRows) for (const k of hit) (glossTokens.get(k) ?? glossTokens.set(k, new Set()).get(k)!).add(a.tokenId);
  }

  // 4. coverage per sentence
  interface Cover { perTerm: Map<string, number[]>; unlocated: Set<string> }
  const covers = new Map<string, Cover>();
  for (const e of pool) {
    const toks = tokensBySentence.get(e.sentenceId) ?? [];
    const perTerm = new Map<string, number[]>();
    const unlocated = new Set<string>();
    for (const term of terms) {
      const idx: number[] = [];
      toks.forEach((tk, i) => {
        if (!tk.isWord) return;
        const viaConcept = term.concepts.length > 0 && conceptsForToken(lang, tk.normalized).some((c) => term.concepts.includes(c));
        const viaGloss = glossTokens.get(term.key)?.has(tk.id) ?? false;
        if (viaConcept || viaGloss) idx.push(i);
      });
      if (idx.length) perTerm.set(term.key, idx);
      else if (rescueStems.get(e.sentenceId)?.has(term.key)) unlocated.add(term.key);
    }
    if (perTerm.size || unlocated.size) covers.set(e.sentenceId, { perTerm, unlocated });
  }

  // 5. which terms were met at all, and where
  for (const term of terms) {
    const at = pool.find((e) => { const c = covers.get(e.sentenceId); return !!c && (c.perTerm.has(term.key) || c.unlocated.has(term.key)); });
    if (!at) { result.missing.push(term); continue; }
    result.metSeparately.push({ term, textTitle: texts.get(at.textId)!.title, excerpt: sentenceRows.get(at.sentenceId)!.text });
  }

  // 6. candidate spans
  const candidates: RetrievedWording[] = [];
  let partial: { covers: IntentTerm[]; lacks: IntentTerm[]; textTitle: string; size: number } | undefined;
  const keyAllowed = new Set(terms.flatMap((t) => t.concepts.filter((c) => CONCEPTS[c].keyTerm)));
  for (const e of pool) {
    const cover = covers.get(e.sentenceId);
    if (!cover) continue;
    const sentence = sentenceRows.get(e.sentenceId)!;
    const textRow = texts.get(e.textId)!;
    const coveredTerms = terms.filter((t) => cover.perTerm.has(t.key) || cover.unlocated.has(t.key));
    if (coveredTerms.length < terms.length) {
      if (!partial || coveredTerms.length > partial.covers.length) {
        partial = { covers: coveredTerms, lacks: terms.filter((t) => !coveredTerms.includes(t)), textTitle: textRow.title, size: sentence.text.length };
      }
      continue;
    }
    const span = buildSpan(sentence, tokensBySentence.get(e.sentenceId) ?? [], occBySentence.get(e.sentenceId) ?? [], terms, cover, negated, lang);
    if (!span) continue;
    if (span.negatedAround) {
      result.blocked.push(`"${span.text}" (${textRow.title}) comes from a negative sentence, but what you said is not negative.`);
      continue;
    }
    const parsed = parse(adapter, span.text);
    const negs = wordIndexes(parsed).filter((i) => isNegator(lang, parsed.tokens[i].normalized)).length;
    if ((negs > 0) !== negated) {
      result.blocked.push(`"${span.text}" (${textRow.title}) ${negs > 0 ? 'is negative' : 'is affirmative'} but what you said ${negated ? 'is negative' : 'is not'}.`);
      continue;
    }
    const extraKey = new Set<ConceptId>();
    for (const i of wordIndexes(parsed)) for (const c of conceptsForToken(lang, parsed.tokens[i].normalized)) if (CONCEPTS[c].keyTerm && !keyAllowed.has(c)) extraKey.add(c);
    if (extraKey.size) {
      result.blocked.push(`"${span.text}" (${textRow.title}) also says ${[...extraKey].join(', ')}, which you did not ask for.`);
      continue;
    }
    candidates.push({
      text: span.text, sentence, textRow, surface: e.surface, coveredKeys: terms.map((t) => t.key),
      extraWords: wordIndexes(parsed).filter((i) => !isFunctionAt(parsed, i) && !span.matchedNorm.has(parsed.tokens[i].normalized)).map((i) => parsed.tokens[i].surface),
      itemIds: span.itemIds, phraseIds: span.phraseIds, tokenCount: wordIndexes(parsed).length,
    });
  }
  candidates.sort((a, b) => a.tokenCount - b.tokenCount || a.extraWords.length - b.extraWords.length || a.sentence.text.length - b.sentence.text.length || (a.sentence.id < b.sentence.id ? -1 : 1));
  result.best = candidates[0];
  if (!result.best && partial) result.bestPartial = { covers: partial.covers, lacks: partial.lacks, textTitle: partial.textTitle };
  return result;
}

const TERMINAL = /[.!?。।॥]/u;

/** The smallest contiguous span covering the matched tokens of every term, stretched over whole phrase occurrences. */
function buildSpan(
  sentence: Sentence, tokens: Token[], occs: PhraseOccurrence[], terms: IntentTerm[],
  cover: { perTerm: Map<string, number[]>; unlocated: Set<string> }, negated: boolean, lang: LanguageCode,
): { text: string; itemIds: string[]; phraseIds: string[]; matchedNorm: Set<string>; negatedAround: boolean } | undefined {
  if (tokens.length === 0) return undefined;
  const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  if (wordIdx.length === 0) return undefined;
  const located = terms.filter((t) => cover.perTerm.has(t.key));
  let lo: number;
  let hi: number;
  let matched: number[] = [];
  if (cover.unlocated.size > 0 || located.length === 0) {
    // a term is only evidenced by the English line: no way to locate it, so the whole sentence is the span
    lo = wordIdx[0]; hi = wordIdx[wordIdx.length - 1];
    matched = located.flatMap((t) => cover.perTerm.get(t.key)!.slice(0, 1));
  } else {
    // choose one token per term so that the window is as small as possible
    const lists = located.map((t) => cover.perTerm.get(t.key)!.slice(0, 5));
    let bestSpan = Infinity;
    let bestPick: number[] = [];
    const pick: number[] = [];
    const walk = (k: number) => {
      if (k === lists.length) {
        const span = Math.max(...pick) - Math.min(...pick);
        if (span < bestSpan) { bestSpan = span; bestPick = [...pick]; }
        return;
      }
      for (const i of lists[k]) { pick[k] = i; walk(k + 1); }
    };
    walk(0);
    matched = bestPick;
    lo = Math.min(...bestPick); hi = Math.max(...bestPick);
    // stretch over whole phrase occurrences that overlap the window (repeat until stable)
    const idxOf = new Map(tokens.map((t, i) => [t.id, i]));
    for (let changed = true; changed;) {
      changed = false;
      for (const o of occs) {
        const ix = o.tokenIds.map((id) => idxOf.get(id)).filter((x): x is number => x !== undefined);
        if (ix.length === 0) continue;
        const a = Math.min(...ix);
        const b = Math.max(...ix);
        if (b >= lo && a <= hi && (a < lo || b > hi)) { lo = Math.min(lo, a); hi = Math.max(hi, b); changed = true; }
      }
    }
  }
  // a negator right around the span scopes over it: when the request is negative it comes along (up to 3 tokens
  // before, else 2 after); when it is not, the sentence must not be used (cutting the negator off would flip it)
  let negatedAround = false;
  if (!tokens.slice(lo, hi + 1).some((t) => t.isWord && isNegator(lang, t.normalized))) {
    let found = -1;
    for (let j = lo - 1; j >= Math.max(0, lo - 3) && found < 0; j--) if (tokens[j].isWord && isNegator(lang, tokens[j].normalized)) found = j;
    if (found >= 0) { if (negated) lo = found; else negatedAround = true; }
    else for (let j = hi + 1; j <= Math.min(tokens.length - 1, hi + 2) && found < 0; j++) {
      if (tokens[j].isWord && isNegator(lang, tokens[j].normalized)) { found = j; if (negated) hi = j; else negatedAround = true; }
    }
  }
  const atStart = lo <= wordIdx[0];
  const atEnd = hi >= wordIdx[wordIdx.length - 1];
  const start = atStart ? 0 : tokens[lo].start;
  const end = atEnd ? sentence.text.length : tokens[hi].end;
  let text = sentence.text.slice(start, end).trim();
  if (!atStart) text = capitalize(text);
  if (!atEnd) {
    const last = sentence.text.trim().slice(-1);
    if (TERMINAL.test(last) && !TERMINAL.test(text.slice(-1))) text += last;
  }
  const idxOf = new Map(tokens.map((t, i) => [t.id, i]));
  const phraseIds: string[] = [];
  for (const o of occs) {
    const ix = o.tokenIds.map((id) => idxOf.get(id)).filter((x): x is number => x !== undefined);
    if (ix.length && Math.min(...ix) >= lo && Math.max(...ix) <= hi && !phraseIds.includes(o.phraseId)) phraseIds.push(o.phraseId);
  }
  const itemIds = [...new Set([...matched.map((i) => tokens[i].formId), ...phraseIds])];
  return { text, itemIds, phraseIds, matchedNorm: new Set(matched.map((i) => tokens[i].normalized)), negatedAround };
}

function capitalize(s: string): string {
  const first = [...s][0];
  if (!first) return s;
  const up = first.toLocaleUpperCase();
  return up === first ? s : up + s.slice(first.length);
}

// ───────────────────────── wording the gap ─────────────────────────

/** Plain-language limitation for a request that cannot be answered from encountered wording. */
export function describeGap(r: RetrievalResult): { limitation: string; unexpressed: string[] } {
  const w = (t: IntentTerm) => `"${t.word}"`;
  if (r.terms.length === 0) {
    return { limitation: 'GoTell found no content words in what you wrote. Say what you mean in a short English sentence.', unexpressed: [] };
  }
  const parts: string[] = [];
  let unexpressed: string[];
  if (r.missing.length > 0) {
    unexpressed = r.missing.map((t) => t.word);
    parts.push(`You have not met any wording for ${r.missing.map(w).join(', ')} in the texts you have read or heard, so GoTell cannot build a sentence from your own language for it.`);
    const met = r.metSeparately.filter((m) => !r.missing.includes(m.term));
    if (met.length > 0) parts.push(`You have met ${met.map((m) => `${w(m.term)} (${m.textTitle}: "${m.excerpt}")`).join('; ')}.`);
  } else if (r.blocked.length > 0 && !r.bestPartial) {
    unexpressed = r.terms.map((t) => t.word);
    parts.push(`Wording you have met was set aside because it would say something different: ${r.blocked.slice(0, 2).join(' ')}`);
  } else {
    unexpressed = (r.bestPartial?.lacks ?? r.terms).map((t) => t.word);
    parts.push(`You have met wording for each idea, but no single sentence you have read or heard says them together (closest: ${r.bestPartial ? `${r.bestPartial.covers.map(w).join(', ')} in ${r.bestPartial.textTitle}` : 'none'}; still missing ${unexpressed.map((x) => `"${x}"`).join(', ')}). Gluing pieces from different sentences together would not be grammar you can trust.`);
    const met = r.metSeparately;
    if (met.length > 0) parts.push(`Where you met them: ${met.map((m) => `${w(m.term)} (${m.textTitle}: "${m.excerpt}")`).join('; ')}.`);
  }
  if (r.blocked.length > 0 && r.missing.length > 0) parts.push(`Also set aside: ${r.blocked[0]}`);
  parts.push('Read or listen to more texts that say it, then try again, or say a smaller idea.');
  return { limitation: parts.join(' '), unexpressed };
}
