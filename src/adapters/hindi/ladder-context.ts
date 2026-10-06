/**
 * Neighbour rules for the words the first reading of the Hindi ladder (data/ladder/hi, 101 units) found read wrongly
 * (adapter-hi@5). Like ./noun-first.ts and ./disambiguate.ts they only ORDER the readings the analysis already has: nothing is
 * removed, the chosen reading moves to the front, the others stay below it (marked down to 0.4), and `notes.context` says why.
 * Not a parser: one or two words either side. Machine-drafted, not checked by a native speaker.
 *
 *   जी        the honorific after a name, a title or a kin term (गीता जी के घर, शर्मा जी की, माँ जी), not जीना "to live": the particle
 *   किरण      a name unless a genitive, an adjective, a number or "one" stands before it (सूरज की किरण, आशा की किरण): then the ray
 *   सीख       the noun "lesson, advice" before देना / मिलना / मानना (सीख दी), not the stem of सीखना
 *   मोड़       the noun "turn" before आना (मोड़ आता है)
 *   पूरी       the adjective "whole" (पूरी बात, पूरी तरह) unless food stands near it (पूरी खाई, आलू पूरी, दो पूरी)
 *   सोता       the verb सोना before होना / रहना (वह सोता है), the noun "spring" after a genitive (पानी का सोता)
 *   बिल        the burrow when an animal stands before it (चूहे का बिल); the bill otherwise
 *   बैठे …     the perfective participle of बैठना / रखना / लेटना / छिपना before होना / रहना (वे बैठे हैं, किताबें रखी हैं), not an adjective or a subjunctive
 */
import type { AnalysisCandidate, RawToken } from '../../core';

type C = AnalysisCandidate;
const nf = (s: string): string => s.normalize('NFC');
const set = (xs: string[]): ReadonlySet<string> => new Set(xs.map(nf));

const feat = (c: C, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
const has = (c: C, k: string, v: string): boolean => feat(c, k).includes(v);
const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';

/** After these the noun "turn" / "lesson, advice" is meant, not the stem of the verb (मोड़ना; सीखना). */
const NOUN_BEFORE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['सीख', set(['देना', 'मिलना', 'मानना', 'पाना'])],
  ['मोड़', set(['आना'])],
].map(([w, s]) => [nf(w as string), s as ReadonlySet<string>] as const));

const FOOD = set(['रोटी', 'सब्ज़ी', 'सब्जी', 'हलवा', 'आलू', 'छोले', 'दाल', 'चावल', 'चाय', 'मिठाई', 'खीर', 'कचौड़ी', 'पराठा', 'समोसा', 'नाश्ता', 'खाना', 'भाजी', 'दही', 'रायता', 'अचार', 'लड्डू', 'जलेबी', 'पकवान', 'भोजन', 'नाश्ते']);
const FOOD_VERBS = set(['खाना', 'बनाना', 'तलना', 'बेलना', 'परोसना', 'पकाना', 'बनना', 'तलाना']);
const ANIMALS = set(['चूहा', 'साँप', 'सांप', 'खरगोश', 'लोमड़ी', 'केकड़ा', 'चींटी', 'बिच्छू', 'कीड़ा', 'जानवर', 'नेवला', 'साँपों', 'चूहों', 'लोमड़', 'भेड़िया', 'छछूँदर']);
const PARTICIPLE_VERBS = set(['बैठना', 'रखना', 'लेटना', 'छिपना']);
/** After a name these continue a verb phrase of जीना (जी रहा हूँ, जी सकता है), so जी is not the honorific there. */
const LIVE_CONTINUES = set(['रहना', 'सकना', 'चुकना', 'लगना', 'चाहना', 'भरना']);
const GENITIVES = set(['का', 'के', 'की']);

export function ladderContext(i: number, tokens: RawToken[], base: C[][]): C[] | undefined {
  const cands = base[i];
  if (!cands || cands.length < 2 || !tokens[i]?.isWord) return undefined;
  const w = tokens[i].normalized;
  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const prev = word(i - 1);
  const next = word(i + 1);
  const form = (j: number | undefined): string => (j === undefined ? '' : tokens[j].normalized);
  const anyAt = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && (base[j] ?? []).some(pred);
  const lemmaAt = (j: number | undefined, s: ReadonlySet<string>): boolean => anyAt(j, (c) => c.lemma !== undefined && s.has(c.lemma));
  const topAt = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j]?.[0]);
  const reorder = (pred: (c: C) => boolean, why: string): C[] | undefined => {
    const yes = cands.filter(pred);
    if (!yes.length) return undefined;
    const no = cands.filter((c) => !pred(c));
    // already decided as this rule wants: the same array, so that no other rule reorders it again
    if (!no.length || (cands[0] === yes[0] && no.every((c) => c.confidence <= 0.4))) return cands;
    return [{ ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } }, ...yes.slice(1), ...no.map((c) => (c.confidence > 0.4 ? { ...c, confidence: 0.4 } : c))];
  };
  const prevGenitive = anyAt(prev, (c) => c.lemma === 'का' || has(c, 'Case', 'Gen'));
  const nextAfter = (k: number | undefined): number | undefined => (k === undefined ? undefined : word(k + 1));

  // ── जी after a name, a title or a kin term ──
  if (w === 'जी' && form(next) === nf('भर') && cands.some((c) => c.pos === 'NOUN')) return reorder((c) => c.pos === 'NOUN', 'जी भर: the noun "heart" (जी भर के खाना)');
  if (w === 'जी' && cands.some((c) => c.lemma === 'जी' && c.pos === 'PART')) {
    const pt = topAt(prev);
    const nominalBefore = prev !== undefined && (!pt || pt.pos === 'NOUN' || pt.pos === 'PROPN') && !anyAt(prev, (c) => c.pos === 'PRON' || c.pos === 'DET' || c.morph.Poss === 'Yes' || isVerbal(c) && !(c.pos === 'NOUN'));
    // शर्मा is also the verb शर्माना: a name before जी is a name
    const nameBefore = prev !== undefined && anyAt(prev, (c) => c.pos === 'PROPN');
    if ((nominalBefore || nameBefore) && !anyAt(next, (c) => c.pos === 'VERB' && c.lemma !== undefined && LIVE_CONTINUES.has(c.lemma))) {
      return reorder((c) => c.lemma === 'जी' && c.pos === 'PART', `after "${form(prev)}": जी is the honorific (गीता जी, शर्मा जी), not the verb जीना "to live"`);
    }
    return undefined;
  }

  // ── किरण: the name, or the ray after a genitive, an adjective, a number or "one" ──
  if (w === nf('किरण') && cands.some((c) => c.pos === 'PROPN') && cands.some((c) => c.pos === 'NOUN')) {
    const pt = topAt(prev);
    const rayBefore = prev !== undefined && (prevGenitive || anyAt(prev, (c) => c.lemma === 'का') || form(prev) === 'एक' || pt?.pos === 'NUM' || (pt?.pos === 'ADJ' && !anyAt(prev, (c) => c.pos === 'DET')));
    return rayBefore
      ? reorder((c) => c.pos === 'NOUN', `after "${form(prev)}": the ray of light`)
      : reorder((c) => c.pos === 'PROPN', 'the name Kiran: no genitive, adjective or number before it');
  }

  // ── सीख, मोड़: the noun before a verb that does not join them as a vector ──
  const nounVerbs = NOUN_BEFORE.get(w);
  if (nounVerbs && cands.some((c) => c.pos === 'NOUN' && c.lemma === w) && lemmaAt(next, nounVerbs)) {
    return reorder((c) => c.pos === 'NOUN' && c.lemma === w, `${w} is the noun here (a "${nf(w) === nf('सीख') ? 'lesson' : 'turn'}") of the verb that follows (${form(next)})`);
  }

  // ── पूरी: whole, unless food is near ──
  if (w === nf('पूरी') && cands.some((c) => c.lemma === 'पूरी' && c.pos === 'NOUN') && cands.some((c) => c.lemma === 'पूरा')) {
    const n2 = nextAfter(next);
    const food = lemmaAt(next, FOOD_VERBS) || lemmaAt(next, FOOD) || lemmaAt(prev, FOOD)
      || (anyAt(next, (c) => c.lemma === 'और' || c.lemma === 'व') && lemmaAt(n2, FOOD))
      || (anyAt(prev, (c) => c.pos === 'NUM') && topAt(next)?.pos !== 'NOUN');
    return food ? reorder((c) => c.lemma === 'पूरी' && c.pos === 'NOUN', 'food is near: the fried bread पूरी') : reorder((c) => c.lemma === 'पूरा', 'no food near: the adjective "whole, complete" (पूरी बात, पूरी तरह)');
  }

  // ── सोता: the verb before होना / रहना, the noun "spring" after a genitive ──
  if (w === nf('सोता') && cands.some((c) => c.lemma === 'सोना' && isVerbal(c)) && cands.some((c) => c.pos === 'NOUN')) {
    if (prevGenitive) return reorder((c) => c.pos === 'NOUN', 'after a genitive: the noun "spring" (पानी का सोता)');
    let nx = next;
    while (nx !== undefined && ['नहीं', 'न', 'भी', 'ही', 'तो'].includes(form(nx))) nx = word(nx + 1);
    if (anyAt(nx, (c) => c.lemma === 'होना' || c.lemma === 'रहना')) return reorder((c) => c.lemma === 'सोना' && isVerbal(c), 'होना / रहना follows: the participle of सोना "to sleep" (सोता है, सोता रहा)');
    if (prev !== undefined && (anyAt(prev, (c) => c.pos === 'DET' || c.morph.Poss === 'Yes') || topAt(prev)?.pos === 'ADJ')) return reorder((c) => c.pos === 'NOUN', `after "${form(prev)}": the noun "spring"`);
    return undefined;
  }

  // ── बिल: the burrow after an animal ──
  if (w === nf('बिल') && cands.filter((c) => c.lemma === 'बिल' && c.pos === 'NOUN').length > 1) {
    const animal = lemmaAt(prev, ANIMALS) || (prev !== undefined && GENITIVES.has(form(prev)) && lemmaAt(word(prev - 1), ANIMALS));
    const dig = anyAt(next, (c) => c.lemma === 'खोदना');
    return animal || dig
      ? reorder((c) => c.lemma === 'बिल' && (c.gloss ?? '').includes('burrow'), 'an animal stands before it: the burrow')
      : reorder((c) => c.lemma === 'बिल' && !(c.gloss ?? '').includes('burrow'), 'no animal before it: the bill');
  }

  // ── a perfective participle (बैठे हैं, रखी हैं): not an adjective, not a subjunctive ──
  if (cands.some((c) => c.lemma !== undefined && PARTICIPLE_VERBS.has(c.lemma) && isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Perf'))
    && anyAt(next, (c) => (c.lemma === 'होना' || c.lemma === 'रहना') && isVerbal(c))
    && !prevGenitive) {
    const part = (c: C): boolean => c.lemma !== undefined && PARTICIPLE_VERBS.has(c.lemma) && isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Perf');
    return cands[0] && part(cands[0]) ? cands : reorder(part, `"${form(next)}" follows: the perfective participle (बैठे हैं, रखी हैं)`);
  }
  return undefined;
}
