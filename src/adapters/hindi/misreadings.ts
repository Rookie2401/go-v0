/**
 * Neighbour rules for readings the deck audit (2026-11) found confidently wrong. Like ./ladder-context.ts they only ORDER the readings
 * the analysis already has: nothing is removed, the chosen reading moves to the front, the others stay below it (marked down to 0.4),
 * and `notes.context` says why. Where the neighbours do not decide, the function returns undefined and the readings stay as they were
 * (two readings within 0.15 are undecided downstream). One or two words either side; not a parser. Machine-drafted, not checked by a
 * native speaker.
 *
 *   a name against a common noun   (गौरव "dignity" / Gaurav): the common noun after a genitive, a determiner, an adjective, or when it is
 *                                  joined by और / व / तथा to another common noun; the name after a title (श्री, डॉ, भैया …), before जी,
 *                                  or before the agent postposition ने
 *   जी हाँ                         जी before हाँ / नहीं / ना / बिल्कुल …, with no verb of जीना after it, is "yes" / the honorific, not जीना
 *   छाया रहा                       a noun that is also the perfective participle of a verb, before रहा / रही / रहे, with nothing that
 *                                  marks a noun before it: the verb ("hung over", "stayed spread")
 *   X मना है                       मना before होना or करना: the adjective "forbidden" (मना है, मना किया), not the verb मनाना; before a vector verb
 *                                  (मना लो, मना दिया) it stays the bare stem of मनाना
 */
import type { AnalysisCandidate, RawToken } from '../../core';

type C = AnalysisCandidate;
const nf = (s: string): string => s.normalize('NFC');
const set = (xs: string[]): ReadonlySet<string> => new Set(xs.map(nf));

const feat = (c: C, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
const has = (c: C, k: string, v: string): boolean => feat(c, k).includes(v);
const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';

const TITLES = set(['श्री', 'श्रीमान', 'श्रीमती', 'डॉ', 'डॉ.', 'डॉक्टर', 'मिस्टर', 'मिस', 'मि.', 'भैया', 'दादा', 'बाबू', 'सेठ', 'पंडित', 'स्वामी', 'दोस्त', 'दोस्तों', 'बेटा', 'अरे', 'हे']);
const CONJ = set(['और', 'व', 'तथा', 'एवं']);
const ANSWER_WORDS = set(['हाँ', 'हां', 'नहीं', 'ना', 'बिल्कुल', 'बिलकुल', 'ठीक', 'सही', 'जी']);
const STEM_VECTORS = set(['लेना', 'देना', 'रहना', 'पाना', 'सकना', 'चाहना', 'आना', 'जाना']);

export function misreadings(i: number, tokens: RawToken[], base: C[][]): C[] | undefined {
  const cands = base[i];
  if (!cands || cands.length < 2 || !tokens[i]?.isWord) return undefined;
  const w = tokens[i].normalized;
  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const prev = word(i - 1);
  const next = word(i + 1);
  const form = (j: number | undefined): string => (j === undefined ? '' : nf(tokens[j].normalized));
  const anyAt = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && (base[j] ?? []).some(pred);
  const topAt = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j]?.[0]);
  const reorder = (pred: (c: C) => boolean, why: string, first?: (a: C, b: C) => number): C[] | undefined => {
    const yes = cands.filter(pred);
    if (!yes.length) return undefined;
    if (first) yes.sort(first);
    const no = cands.filter((c) => !pred(c));
    if (!no.length) return undefined;
    return [{ ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } }, ...yes.slice(1), ...no.map((c) => (c.confidence > 0.4 ? { ...c, confidence: 0.4 } : c))];
  };
  /** The next word after any of the particles that may stand between a verb and what follows it. */
  const skipParticles = (j: number | undefined): number | undefined => {
    let k = j;
    while (k !== undefined && ['नहीं', 'न', 'भी', 'ही', 'तो'].includes(form(k))) k = word(k + 1);
    return k;
  };
  const prevDetermines = anyAt(prev, (c) => c.pos === 'DET' || c.morph.Poss === 'Yes' || c.lemma === 'का' || has(c, 'Case', 'Gen')) || topAt(prev)?.pos === 'ADJ' || topAt(prev)?.pos === 'NUM';

  // ── a name that is also a common noun (गौरव) ──
  const nameReading = (c: C): boolean => c.pos === 'PROPN';
  const commonReading = (c: C): boolean => c.pos === 'NOUN' && cands.some((p) => nameReading(p) && p.lemma === c.lemma);
  if (cands.some(nameReading) && cands.some(commonReading)) {
    if (form(next) === 'जी' || form(next) === 'ने' || (prev !== undefined && TITLES.has(form(prev)))) return reorder(nameReading, `a title before it, or जी / ने after it: the name`);
    const n2 = form(next) !== '' && CONJ.has(form(next)) ? word((next as number) + 1) : undefined;
    const joinedToCommon = (j: number | undefined): boolean => j !== undefined && !anyAt(j, (c) => c.pos === 'PROPN') && anyAt(j, (c) => c.pos === 'NOUN');
    const conjBefore = prev !== undefined && CONJ.has(form(prev)) ? word(prev - 1) : undefined;
    if (prevDetermines || joinedToCommon(n2) || joinedToCommon(conjBefore)) return reorder(commonReading, 'a genitive, determiner or adjective before it, or joined to a common noun: the common noun, not the name');
    return undefined;
  }

  // ── जी हाँ, जी नहीं: the answer / honorific, not जीना ──
  if (w === nf('जी') && cands.some((c) => c.lemma === 'जी' && (c.pos === 'PART' || c.pos === 'INTJ')) && cands.some((c) => c.lemma === 'जीना')) {
    const pn = topAt(prev);
    const afterNominal = prev !== undefined && (pn?.pos === 'NOUN' || pn?.pos === 'PROPN' || anyAt(prev, (c) => c.pos === 'PRON' || c.pos === 'DET' || c.morph.Poss === 'Yes'));
    if (ANSWER_WORDS.has(form(next)) && !afterNominal && !anyAt(next, (c) => c.lemma === 'जीना')) {
      return reorder((c) => c.lemma === 'जी' && (c.pos === 'PART' || c.pos === 'INTJ'), 'जी before हाँ / नहीं …: "yes", the polite answer, not जीना "to live"', (a, b) => (a.pos === 'INTJ' ? 0 : 1) - (b.pos === 'INTJ' ? 0 : 1));
    }
    return undefined;
  }

  // ── a listed noun's own citation form (छाता "umbrella") whose other readings are only a non-perfective verb form (छाता = "spreading"):
  //    the noun, confidently, unless रहा follows (छाता रहा) ──
  {
    const nounCit = cands.find((c) => c.pos === 'NOUN' && c.lemma !== undefined && nf(c.lemma) === nf(w) && c.confidence >= 0.5 && c.origin === 'hand');
    const others = cands.filter((c) => c !== nounCit && c.lemma !== nounCit?.lemma);
    if (nounCit && others.length > 0 && others.every((c) => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Imp'))
      && !anyAt(skipParticles(next), (c) => (c.lemma === 'रहना' || c.lemma === 'होना') && isVerbal(c))) {
      const out = reorder((c) => c === nounCit, 'the citation form of a listed noun, no रहा after it: the noun');
      if (out) out[0] = { ...out[0], confidence: Math.max(out[0].confidence, 0.92) };
      return out;
    }
    // छाता रहा: the imperfective participle before रहा is the verb
    if (nounCit && others.length > 0 && others.every((c) => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Imp')) && anyAt(skipParticles(next), (c) => (c.lemma === 'रहना' || c.lemma === 'होना') && isVerbal(c)) && !prevDetermines) {
      return reorder((c) => isVerbal(c) && has(c, 'Aspect', 'Imp'), 'रहा follows: the imperfective participle (छाता रहा = kept spreading)');
    }
    // a bare form on its own (a dictionary look-up): the listed noun, as before the verb was listed
    const aloneNoun = cands.find((c) => c.pos === 'NOUN' && c.origin === 'hand' && c.lemma !== undefined && nf(c.lemma) === nf(w));
    if (aloneNoun && tokens.filter((t) => t.isWord).length === 1 && cands.every((c) => c === aloneNoun || (isVerbal(c) && has(c, 'VerbForm', 'Part'))) && cands.some((c) => isVerbal(c))) {
      const out = reorder((c) => c === aloneNoun, 'a single word: the listed noun');
      if (out) out[0] = { ...out[0], confidence: Math.max(out[0].confidence, 0.92) };
      return out;
    }
  }

  // ── छाया रहा: a perfective participle that is also a noun, before रहा ──
  const participle = (c: C): boolean => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Perf');
  if (cands.some(participle) && cands.some((c) => c.pos === 'NOUN') && !cands.some((c) => c.pos === 'ADJ') && !prevDetermines) {
    const nx = skipParticles(next);
    const stays = anyAt(nx, (c) => c.lemma === 'रहना' && isVerbal(c) && !has(c, 'Aspect', 'Prog'));
    const nextPost = anyAt(next, (c) => c.pos === 'ADP');
    if (stays && !nextPost && !(prev !== undefined && anyAt(prev, (c) => c.pos === 'ADP'))) return reorder(participle, `"${form(nx)}" follows: the perfective participle (छाया रहा = stayed spread over)`);
  }

  // ── X मना है: forbidden ──
  if (w === nf('मना') && cands.some((c) => c.pos === 'ADJ' && c.lemma === 'मना') && cands.some((c) => c.lemma === 'मनाना')) {
    const nx = skipParticles(next);
    if (anyAt(nx, (c) => STEM_VECTORS.has(c.lemma ?? '')) || form(nx) === nf('कर')) return reorder((c) => c.lemma === 'मनाना', 'a vector verb or कर follows: the bare stem of मनाना');
    if (anyAt(nx, (c) => (c.lemma === 'होना' || c.lemma === 'करना') && isVerbal(c))) return reorder((c) => c.pos === 'ADJ' && c.lemma === 'मना', 'होना / करना follows: the adjective "forbidden" (मना है, मना किया)');
    return undefined;
  }
  return undefined;
}
