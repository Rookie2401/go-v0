/**
 * Korean grammar constructions (docs/korean/PLAN.md "Constructions"; brief XI) as PatternCandidates: patterns of several morphemes or
 * words, each found over the ANALYSED readings (the first reading of each word after the sentence layer), never by a regular expression
 * over the text. A construction is reported only when the analysis found its morphemes in the required order: -고 + the auxiliary 있다,
 * -아/어 + 보다 … ; 보다 / 주다 / 있다 as ordinary verbs (영화를 봐요, 책을 줘요, 책이 있어요) report none of the auxiliary patterns.
 *
 * Keys are the ids of PLAN (`ko-progressive` …): the Repository's unit id is `syntax:ko:<key>`. The learner-facing copy of each is the
 * pack's (packages/language-packs/src/packs/ko-grammar.ts); the short title and explanation here say what THIS occurrence joins.
 * MACHINE-DRAFTED from standard grammar descriptions of Korean; not reviewed by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../core';
import { koBareLemma } from './index-store';

type Cand = AnalysisCandidate;

export interface KoConstruction { id: string; title: string; explain: string }

/** Every construction this file can report (a test checks they are keys of the pack's grammar copy). */
export const KO_CONSTRUCTIONS: readonly KoConstruction[] = [
  { id: 'ko-progressive', title: 'Progressive: -고 있다', explain: 'an action going on (있다 is the auxiliary, not "to exist")' },
  { id: 'ko-resultative', title: 'Resulting state: -아/어 있다', explain: 'a state that has come about and lasts' },
  { id: 'ko-want', title: 'Desire: -고 싶다', explain: 'wanting to do' },
  { id: 'ko-must', title: 'Obligation: -아/어야 하다 (되다)', explain: 'having to do' },
  { id: 'ko-can', title: 'Ability or possibility: -(으)ㄹ 수 있다', explain: 'can, may be possible (수 is the bound noun "way, possibility")' },
  { id: 'ko-cannot', title: 'Inability or impossibility: -(으)ㄹ 수 없다', explain: 'cannot, is impossible' },
  { id: 'ko-neg-long', title: 'Long negation: -지 않다', explain: 'not (the negative auxiliary after -지)' },
  { id: 'ko-neg-unable', title: 'Cannot: -지 못하다', explain: 'cannot (lack of ability or chance)' },
  { id: 'ko-try', title: 'Try or experience: -아/어 보다', explain: 'trying, or having tried (보다 is the auxiliary, not "to see")' },
  { id: 'ko-completive', title: 'Completion: -아/어 버리다', explain: 'doing completely, ending up doing' },
  { id: 'ko-benefactive', title: 'Doing a favour: -아/어 주다 (드리다)', explain: 'doing for someone (주다 is the auxiliary, not "to give")' },
  { id: 'ko-become', title: 'Coming about: -게 되다', explain: 'it comes about that, one ends up' },
  { id: 'ko-decide', title: 'Decision: -기로 하다', explain: 'deciding to do' },
  { id: 'ko-experience', title: 'Experience: -(으)ㄴ 적이 있다 / 없다', explain: 'having (or never having) done' },
  { id: 'ko-seem', title: 'Conjecture: -(으)ㄹ 것 같다', explain: 'it seems, I think (it will be)' },
  { id: 'ko-because', title: 'Cause: -기 때문에', explain: 'because' },
  { id: 'ko-if', title: 'Condition: -(으)면', explain: 'if, when' },
  { id: 'ko-but', title: 'Contrast: -지만', explain: 'but' },
  { id: 'ko-background', title: 'Background or contrast: -는데 / -(으)ㄴ데', explain: 'background to what follows, or a contrast' },
  { id: 'ko-intend', title: 'Intention: -(으)려고', explain: 'in order to, intending to' },
  { id: 'ko-neg-short', title: 'Short negation: 안 + verb', explain: 'not (the adverb 안 before the predicate)' },
  { id: 'ko-neg-copula', title: 'Not being: 이/가 아니다', explain: 'is not (이/가 marks the complement)' },
  { id: 'ko-exist', title: 'Existing or having: 이/가 있다 / 없다', explain: 'there is / is not; has / has not' },
  { id: 'ko-passive-jida', title: 'Becoming or being done: -아/어지다', explain: 'comes to be, is done' },
  { id: 'ko-passive-light', title: 'Passive with 되다, 받다, 당하다', explain: 'a 하다 noun made passive' },
  { id: 'ko-causative-ge', title: 'Making or letting: -게 하다 / -게 만들다', explain: 'making or letting someone do' },
  { id: 'ko-causative-light', title: 'Causative with 시키다', explain: 'making someone do (a 하다 noun with 시키다)' },
  { id: 'ko-quote', title: 'Quotation: -다고 하다', explain: 'reported speech or thought' },
  { id: 'ko-since', title: 'Since: -(으)ㄴ 지', explain: 'the time since (지 is a bound noun)' },
  { id: 'ko-while', title: 'During: -는 동안', explain: 'while, during' },
  { id: 'ko-after', title: 'After: -(으)ㄴ 후에 / 다음에', explain: 'after' },
  { id: 'ko-before', title: 'Before: -기 전에', explain: 'before' },
  { id: 'ko-in-order', title: 'Purpose: -기 위해(서)', explain: 'in order to' },
];
const BY_ID = new Map(KO_CONSTRUCTIONS.map((c) => [c.id, c]));

/** One occurrence, with the character span in the sentence and the parts it joins (for tests and tools; the card gets PatternCandidate). */
export interface KoConstructionHit { id: string; tokenIndexes: number[]; start: number; end: number; joins: string[]; confidence: number }

// ───────────────────────────── the words as the rules see them ─────────────────────────────

interface W {
  i: number; c: Cand; surface: string; lemma: string; pos?: string;
  ending?: string; conn?: string; form?: string; particles: string[];
}
const DIGITS = /^[0-9０-９]+(?:[.,][0-9]+)*$/u;

function wordsOf(tokens: RawToken[], analyses: AnalyzedToken[]): Array<W | undefined> {
  return tokens.map((t, i) => {
    const c = analyses[i]?.candidates[0];
    if (!t.isWord || !c || c.unconfirmed) return undefined;
    return {
      i, c, surface: t.surface, lemma: c.lemma ? koBareLemma(c.lemma) : '', pos: c.pos,
      ending: typeof c.notes?.ending === 'string' ? c.notes.ending : undefined,
      conn: c.morph.VerbForm === 'Conn' ? c.morph.Connective : undefined,
      form: c.morph.VerbForm,
      particles: c.morph.Particle ? c.morph.Particle.split('+') : [],
    };
  });
}

/** The word after i in the same clause (punctuation between breaks it; digits do not), or undefined. */
function nextOf(tokens: RawToken[], ws: Array<W | undefined>, i: number, skipAdverbs = false): W | undefined {
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (!t.isWord && !DIGITS.test(t.surface)) return undefined;
    const w = ws[j];
    if (!w) return undefined;
    if (skipAdverbs && w.pos === 'ADV') continue;
    return w;
  }
  return undefined;
}

const isPred = (w: W | undefined): boolean => !!w && (w.pos === 'VERB' || w.pos === 'ADJ' || w.pos === 'AUX');
const partLemmas = (c: Cand): string[] => (c.parts ?? []).map((p) => (p.lemma ? koBareLemma(p.lemma) : p.text));
const hasEnding = (w: W, cite: string): boolean => w.ending === cite || (w.c.parts ?? []).some((p) => p.lemma === cite);
const isAdnPast = (w: W): boolean => w.form === 'Adn' && w.c.morph.Tense === 'Past' && w.ending === '-(으)ㄴ';
const isAdnProsp = (w: W): boolean => w.form === 'Adn' && w.c.morph.Aspect === 'Prosp';
const lastParticle = (w: W): string | undefined => w.particles[w.particles.length - 1];

// ───────────────────────────── detection ─────────────────────────────

/** Every construction of the sentence, in order of its first token. */
export function koDetectConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): KoConstructionHit[] {
  const ws = wordsOf(tokens, analyses);
  const hits: KoConstructionHit[] = [];
  const seen = new Set<string>();
  const add = (id: string, words: W[], joins: string[]): void => {
    const idx = words.map((w) => w.i);
    const k = `${id}|${idx.join(',')}`;
    if (seen.has(k) || !BY_ID.has(id)) return;
    seen.add(k);
    const conf = Math.min(0.9, ...words.map((w) => w.c.confidence));
    hits.push({ id, tokenIndexes: idx, start: tokens[idx[0]].start, end: tokens[idx[idx.length - 1]].end, joins, confidence: Math.round(conf * 100) / 100 });
  };
  for (let i = 0; i < tokens.length; i++) {
    const a = ws[i];
    if (!a) continue;
    const b = nextOf(tokens, ws, i);
    const bl = b?.lemma ?? '';
    const pair = (id: string, aPart: string, bPart: string) => add(id, [a, b!], [`${a.surface} (${aPart})`, `${b!.surface} (${bPart})`]);

    // ── within one word ──
    if (a.c.parts?.some((p) => p.lemma === '-아/어지-')) add('ko-passive-jida', [a], [`${a.surface} (-아/어지-)`]);
    if (a.c.parts?.some((p) => p.lemma === '-아/어야겠-')) add('ko-must', [a], [`${a.surface} (-아/어야겠-: -아/어야 하겠-)`]);
    const parts = a.c.parts ?? [];
    for (let k = 1; k < parts.length; k++) {
      const p = parts[k];
      const host = parts[k - 1];
      if (p.kind !== 'suffix' || !host || (host.pos !== 'NOUN' && host.kind !== 'stem')) continue;
      const lv = p.lemma ? koBareLemma(p.lemma) : '';
      if (host.pos !== 'NOUN') continue;
      if (lv === '되다' || lv === '받다' || lv === '당하다') add('ko-passive-light', [a], [`${host.text} (noun)`, `${p.text} (${lv})`]);
      if (lv === '시키다') add('ko-causative-light', [a], [`${host.text} (noun)`, `${p.text} (시키다)`]);
    }
    if (a.c.morph.Quote === 'Ind' && a.form === 'Fin') add('ko-quote', [a], [`${a.surface} (${a.ending ?? 'contracted quotation ending'})`]);
    if (hasEnding(a, '-(으)면')) add('ko-if', [a], [`${a.surface} (-(으)면)`]);
    if (hasEnding(a, '-지만')) add('ko-but', [a], [`${a.surface} (-지만)`]);
    if (hasEnding(a, '-는데') || hasEnding(a, '-(으)ㄴ데')) add('ko-background', [a], [`${a.surface} (${hasEnding(a, '-는데') ? '-는데' : '-(으)ㄴ데'})`]);
    if (hasEnding(a, '-(으)려고')) add('ko-intend', [a], [`${a.surface} (-(으)려고)`]);
    // written without the spaces (먹을수있어요): the parts of one token hold -(으)ㄹ, 수 and 있다 / 없다
    const pl = partLemmas(a.c);
    for (let k = 0; k + 2 < pl.length; k++) {
      if (pl[k] === '-(으)ㄹ' && pl[k + 1] === '수') {
        const rest = pl.slice(k + 2).find((x) => !x.startsWith('-') && !x.includes('/'));
        if (rest === '있다') add('ko-can', [a], [`${a.surface} (-(으)ㄹ + 수 + 있다, written as one word)`]);
        if (rest === '없다') add('ko-cannot', [a], [`${a.surface} (-(으)ㄹ + 수 + 없다, written as one word)`]);
      }
    }
    if (!b) continue;

    // ── two words ──
    if (a.conn === 'and' && a.ending === '-고') {
      if (bl === '있다' || bl === '계시다') pair('ko-progressive', '-고', bl);
      if (bl === '싶다') pair('ko-want', '-고', '싶다');
    }
    if (a.conn === 'inf') {
      if (bl === '있다' || bl === '계시다') pair('ko-resultative', '-아/어', bl);
      if (bl === '보다') pair('ko-try', '-아/어', '보다');
      if (bl === '버리다') pair('ko-completive', '-아/어', '버리다');
      if (bl === '주다' || bl === '드리다') pair('ko-benefactive', '-아/어', bl);
    }
    if (a.conn === 'only-if' && (bl === '하다' || bl === '되다')) pair('ko-must', '-아/어야', bl);
    if (a.conn === 'neg') {
      if (bl === '않다') pair('ko-neg-long', '-지', '않다');
      if (bl === '못하다') pair('ko-neg-unable', '-지', '못하다');
    }
    if (a.conn === 'adverbial' && a.ending === '-게') {
      if (bl === '되다') pair('ko-become', '-게', '되다');
      if (bl === '하다' || bl === '만들다') pair('ko-causative-ge', '-게', bl);
    }
    if (a.ending === '-기') {
      if (lastParticle(a) === 'by' && bl === '하다') pair('ko-decide', '-기로', '하다');
      if (bl === '때문') pair('ko-because', '-기', '때문');
      if (bl === '전') pair('ko-before', '-기', '전');
      if (bl === '위하다') pair('ko-in-order', '-기', '위하다');
    }
    const quoteVerb = ['하다', '말하다', '생각하다', '묻다', '듣다'].includes(bl);
    if (quoteVerb && a.c.morph.Quote === 'Ind' && a.form === 'Conn') pair('ko-quote', a.ending ?? 'quotation ending', bl);
    if (quoteVerb && (lastParticle(a) === 'quote-direct' || lastParticle(a) === 'quote-go')) pair('ko-quote', 'the quotative particle', bl);
    if (a.lemma === '안' && a.pos === 'ADV' && isPred(b)) pair('ko-neg-short', '안 "not"', b.lemma);
    if (lastParticle(a) === 'subject' && bl === '아니다') pair('ko-neg-copula', '이/가', '아니다');
    if (lastParticle(a) === 'subject') {
      const v = nextOf(tokens, ws, i, true);
      if (v && (v.lemma === '있다' || v.lemma === '없다') && v.pos === 'ADJ' && v.c.morph.VerbType === 'Exist') add('ko-exist', [a, v], [`${a.surface} (이/가)`, `${v.surface} (${v.lemma})`]);
    }
    if (a.form === 'Adn') {
      const c3 = nextOf(tokens, ws, b.i);
      if (isAdnProsp(a) && bl === '수' && c3 && (c3.lemma === '있다' || c3.lemma === '없다')) add(c3.lemma === '있다' ? 'ko-can' : 'ko-cannot', [a, b, c3], [`${a.surface} (-(으)ㄹ)`, `${b.surface} (수)`, `${c3.surface} (${c3.lemma})`]);
      if (isAdnPast(a) && bl === '적' && c3 && (c3.lemma === '있다' || c3.lemma === '없다')) add('ko-experience', [a, b, c3], [`${a.surface} (-(으)ㄴ)`, `${b.surface} (적)`, `${c3.surface} (${c3.lemma})`]);
      if ((bl === '것' || bl === '거') && c3 && c3.lemma === '같다') add('ko-seem', [a, b, c3], [`${a.surface} (${a.ending ?? 'adnominal'})`, `${b.surface} (${bl})`, `${c3.surface} (같다)`]);
      if (isAdnPast(a) && bl === '지') pair('ko-since', '-(으)ㄴ', '지');
      if (a.ending === '-는' && bl === '동안') pair('ko-while', '-는', '동안');
      if (isAdnPast(a) && (bl === '후' || bl === '다음' || bl === '뒤')) pair('ko-after', '-(으)ㄴ', bl);
    }
  }
  return hits.sort((x, y) => x.tokenIndexes[0] - y.tokenIndexes[0] || x.id.localeCompare(y.id));
}

/** The adapter's `detectPatterns`: each occurrence with its title and a plain explanation naming the words it joins. */
export function detectKoPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  return koDetectConstructions(tokens, analyses).map((h) => {
    const c = BY_ID.get(h.id)!;
    return { key: h.id, title: c.title, explanation: `${c.title}: ${c.explain}. Here: ${h.joins.join(' + ')}.`, tokenIndexes: h.tokenIndexes, confidence: h.confidence };
  });
}
