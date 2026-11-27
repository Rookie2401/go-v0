/**
 * Arabic constructions as PatternCandidates: grammar patterns the reader can name, each with a title, a one-sentence explanation and
 * the words it spans, each firing only on a shape the readings support. It reads the readings the sentence layer left (sentence.ts), the
 * first reading of each word, and fires only where that reading's feature is a single value (a union means "do not guess").
 *
 * MACHINE-DRAFTED from standard descriptions of Modern Standard Arabic grammar; not reviewed by a native speaker or an Arabist.
 * `AR_CONSTRUCTIONS` is the table the pack manifest lists: every key `detectArPatterns` can return is in it (the test checks that).
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../core/adapters';
import * as G from './government';
import { ArSentence, arAdjectiveAgrees } from './sentence';
import { arKey } from './text';

export interface ArConstruction { id: string; label: string; explain: string }

export const AR_CONSTRUCTIONS: readonly ArConstruction[] = [
  { id: 'ar-construct', label: 'Construct phrase (iḍāfa): noun + noun',
    explain: 'To say "the student\'s book" Arabic puts two nouns side by side: the first loses ال and tanwīn, the second is definite and in the genitive — كِتَابُ الطَّالِبِ. The whole phrase is definite.' },
  { id: 'ar-demonstrative', label: 'Demonstrative + definite noun',
    explain: 'هٰذَا (this, m.), هٰذِهِ (this, f.), ذٰلِكَ (that) before a noun that keeps ال mean "this book": هٰذَا الْكِتَابُ. Before an indefinite word the demonstrative is a pronoun and the words are a sentence: هٰذَا كِتَابٌ (this is a book).' },
  { id: 'ar-noun-adjective', label: 'Noun + adjective: agreement',
    explain: 'An adjective follows its noun and agrees in definiteness, gender and number: الطَّالِبُ الْجَدِيدُ, طَالِبَةٌ جَدِيدَةٌ. A non-human plural takes a feminine singular adjective: كُتُبٌ جَدِيدَةٌ.' },
  { id: 'ar-kana', label: 'كَانَ and its sisters: "was, became, remained"',
    explain: 'كَانَ (and أَصْبَحَ, صَارَ, ظَلَّ, بَاتَ, لَيْسَ) puts a sentence in the past or changes its meaning: the subject stays nominative, the predicate becomes accusative — كَانَ الطَّقْسُ جَمِيلًا (the weather was fine).' },
  { id: 'ar-kana-imperfect', label: 'كَانَ + imperfect: "was doing", "used to do"',
    explain: 'كَانَ before an imperfect verb describes a continuing or repeated action in the past: كَانَ يَكْتُبُ (he was writing, he used to write).' },
  { id: 'ar-inna', label: 'إِنَّ and its sisters: the subject is accusative',
    explain: 'إِنَّ (indeed), أَنَّ (that), كَأَنَّ (as if), لٰكِنَّ (but), لَيْتَ (if only), لَعَلَّ (perhaps) are followed by their subject in the accusative; the predicate stays nominative — إِنَّ الطَّالِبَ مُجْتَهِدٌ.' },
  { id: 'ar-neg-lam', label: 'Negating the past: لَمْ + jussive',
    explain: 'لَمْ before an imperfect verb in the jussive (a sukūn on the last letter, or the short form) says "did not": لَمْ يَكْتُبْ (he did not write). The verb looks present; the meaning is past.' },
  { id: 'ar-neg-lan', label: 'Negating the future: لَنْ + subjunctive',
    explain: 'لَنْ before an imperfect verb in the subjunctive (a fatḥa on the last letter) says "will not": لَنْ يَكْتُبَ (he will not write).' },
  { id: 'ar-neg-la', label: 'Negation with لَا + indicative',
    explain: 'لَا before an imperfect verb in the indicative negates the present or the habit: لَا يَكْتُبُ (he does not write). Before a noun it says "no": لَا شَيْءَ (nothing).' },
  { id: 'ar-prohibition', label: 'Prohibition: لَا + jussive (you)',
    explain: 'لَا before a second person imperfect in the jussive forbids: لَا تَكْتُبْ (do not write). Only the 2nd person is forbidden this way; the same spelling without the sukūn is a plain negation.' },
  { id: 'ar-neg-ma', label: 'Negating the past: مَا + perfect',
    explain: 'مَا before a perfect verb says "did not" (more formal or literary): مَا كَتَبَ (he did not write). Before a noun, مَا can also mean "what" or "that which".' },
  { id: 'ar-neg-laysa', label: 'لَيْسَ: "is not"',
    explain: 'لَيْسَ negates a sentence without a verb "to be": لَيْسَ الطَّقْسُ جَمِيلًا (the weather is not fine). It works like كَانَ: its predicate is accusative, often with بِـ in the genitive: لَيْسَ بِجَمِيلٍ.' },
  { id: 'ar-future', label: 'Future: سَـ / سَوْفَ + imperfect',
    explain: 'The imperfect with the prefix سَـ or the word سَوْفَ means the future: سَيَكْتُبُ, سَوْفَ يَكْتُبُ (he will write). سَوْفَ is more distant or more formal. The verb stays in the indicative.' },
  { id: 'ar-qad-perfect', label: 'قَدْ + perfect: "has done"',
    explain: 'قَدْ before a perfect verb stresses that the action has happened, often with a present result: قَدْ كَتَبَ (he has written, he did write).' },
  { id: 'ar-qad-imperfect', label: 'قَدْ + imperfect: "may do"',
    explain: 'قَدْ before an imperfect verb says it is possible or sometimes true: قَدْ يَكْتُبُ (he may write, he sometimes writes).' },
  { id: 'ar-subjunctive', label: 'Particles + subjunctive: أَنْ, كَيْ, لِكَيْ, حَتَّى',
    explain: 'أَنْ ("to, that"), كَيْ and لِكَيْ ("in order to"), حَتَّى ("until, so that") and the lām of purpose (لِـ) put the imperfect verb after them in the subjunctive: أُرِيدُ أَنْ أَكْتُبَ (I want to write).' },
  { id: 'ar-conditional', label: 'Conditional sentences: إِذَا, إِنْ, لَوْ',
    explain: 'إِذَا ("if, when") is for what is likely and is followed by a perfect verb; إِنْ ("if") is for what is possible and puts its verb in the jussive (often in the perfect form of speech); لَوْ ("if", unreal) speaks of what did not happen. The answer usually begins with فَـ when it is not a verb.' },
  { id: 'ar-relative', label: 'Relative clause: الَّذِي, الَّتِي, مَنْ, مَا',
    explain: 'الَّذِي (m.), الَّتِي (f.), الَّذِينَ (pl.) join a clause to a DEFINITE noun and agree with it; the clause needs a pronoun that points back when the noun is the object: الْكِتَابُ الَّذِي قَرَأْتُهُ. After an indefinite noun no relative word is written. مَنْ (who) and مَا (what) are relatives without a noun.' },
  { id: 'ar-comparative', label: 'Comparative: elative + مِنْ',
    explain: 'The elative أَفْعَلُ ("bigger, better") is followed by مِنْ for "than": هُوَ أَكْبَرُ مِنْ أَخِيهِ (he is bigger than his brother). It does not change for gender or number in this use.' },
  { id: 'ar-superlative', label: 'Superlative: elative in construct, or with ال',
    explain: 'The elative as the first term of a construct is a superlative: أَكْبَرُ مَدِينَةٍ (the biggest city), أَكْبَرُ الْمُدُنِ (the biggest of the cities). With ال it agrees with its noun: الْمَدِينَةُ الْكُبْرَى.' },
  { id: 'ar-number-3-10', label: 'Numbers 3–10 + plural noun (genitive); the number has the opposite gender',
    explain: 'ثَلَاثَةٌ to عَشَرَةٌ take a plural noun in the genitive, and the number has the OPPOSITE gender to the noun: ثَلَاثَةُ كُتُبٍ (3 books, masculine noun, number with ة), ثَلَاثُ طَالِبَاتٍ (3 students, f.).' },
  { id: 'ar-number-11-99', label: 'Numbers 11–99 + accusative singular noun',
    explain: 'From 11 to 99 the counted noun is SINGULAR and in the accusative: أَحَدَ عَشَرَ كَوْكَبًا (11 planets), عِشْرُونَ طَالِبًا (20 students). 13–19 follow the polarity of 3–10 for the unit; the tens do not change.' },
  { id: 'ar-number-100', label: '100, 1000 + singular noun in the genitive',
    explain: 'مِئَةٌ (100) and أَلْفٌ (1000) are the first term of a construct: the counted noun is SINGULAR and genitive — مِئَةُ كِتَابٍ (100 books), أَلْفُ رَجُلٍ.' },
  { id: 'ar-masdar-li', label: 'لِـ + verbal noun: "in order to do"',
    explain: 'The preposition لِـ before a verbal noun (maṣdar) gives a purpose without a verb: ذَهَبَ لِلدِّرَاسَةِ (he went to study / for study). The same idea with a verb is لِيَدْرُسَ.' },
  { id: 'ar-masdar-bi', label: 'بِـ + verbal noun: "by doing"',
    explain: 'بِـ before a verbal noun says by what means something is done: نَجَحَ بِالْعَمَلِ (he succeeded by working).' },
  { id: 'ar-passive', label: 'Passive verb',
    explain: 'A verb with a ḍamma on its first letter and a kasra before the last radical is passive: كُتِبَ الدَّرْسُ (the lesson was written). The doer is not named and the receiver is the grammatical subject, in the nominative. Only the written vowels show it: without them the passive is spelled like the active.' },
  { id: 'ar-vocative', label: 'Vocative: يَا + noun',
    explain: 'يَا before a noun calls a person: يَا طَالِبُ (O student). The noun has no tanwīn: ḍamma for a single noun, fatḥa for a construct (يَا طَالِبَ الْعِلْمِ).' },
] as const;

const BY_ID = new Map(AR_CONSTRUCTIONS.map((c) => [c.id, c]));

type Cand = AnalysisCandidate;

const keyOfLemma = (c: Cand | undefined): string => (c?.lemma ? arKey(c.lemma) : '');
/** Confidence of a pattern: what its weakest word is worth, never over 0.8, never under 0.4. */
function conf(s: ArSentence, idxs: number[], base = 0.7): number {
  let m = base;
  for (const i of idxs) {
    const t = s.top(i);
    if (!t) continue;
    if (t.confidence < 0.5) m = Math.min(m, 0.5);
  }
  return Math.max(0.4, Math.min(0.8, m));
}

/** The grammar patterns of one sentence: see AR_CONSTRUCTIONS. Each lists the tokens it spans. */
export function detectArPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const cands = analyses.map((a) => a.candidates);
  const none = tokens.map(() => false);
  const s = new ArSentence(tokens, cands, none, none);
  const out: PatternCandidate[] = [];
  const seen = new Set<string>();
  const add = (id: string, idxs: number[], base = 0.7): void => {
    const def = BY_ID.get(id);
    const key = `${id}|${idxs.join(',')}`;
    if (!def || seen.has(key)) return;
    seen.add(key);
    out.push({ key: id, title: def.label, explanation: def.explain, tokenIndexes: [...idxs].sort((a, b) => a - b), confidence: conf(s, idxs, base) });
  };
  const hasPart = (c: Cand | undefined, lemmas: string[]): boolean => !!c?.parts?.some((p) => p.kind === 'prefix' && lemmas.includes(p.lemma ?? ''));
  // a token whose first reading is the particle (with a conjunction at most in front)
  const particle = (i: number, ok: (key: string, c: Cand) => boolean): Cand | undefined => {
    const c = s.top(i);
    if (!c?.lemma || c.unconfirmed || G.isPos(c, 'NOUN', 'ADJ', 'PROPN', 'NUM') || G.hasSuffix(c)) return undefined;
    const pre = (c.parts ?? []).filter((p) => p.kind === 'prefix');
    if (pre.some((p) => !['وَ', 'فَ', 'أَ'].includes(p.lemma ?? ''))) return undefined;
    return ok(keyOfLemma(c), c) ? c : undefined;
  };
  const verbAt = (j: number): Cand | undefined => (j >= 0 ? s.cands[j].find((c) => G.isFiniteVerb(c) && c === s.top(j)) ?? (s.eff(j).find(G.isFiniteVerb)) : undefined);

  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.top(i);
    if (!t) continue;
    const j = s.next(i);
    const nextTop = j >= 0 ? s.top(j) : undefined;

    // ── particles that take a verb ──
    const lam = particle(i, (k) => k === 'لم');
    if (lam && j >= 0) { const v = verbAt(j); if (v && G.isImperfect(v)) add('ar-neg-lam', [i, j], 0.75); }
    const lan = particle(i, (k) => k === 'لن');
    if (lan && j >= 0) { const v = verbAt(j); if (v && G.isImperfect(v)) add('ar-neg-lan', [i, j], 0.75); }
    const la = particle(i, (k) => k === 'لا');
    if (la && j >= 0) {
      const v = verbAt(j);
      if (v && G.isImperfect(v)) {
        if (v.morph.Mood === 'Jus' && G.valsOf(v, 'Person').includes('2')) add('ar-prohibition', [i, j], 0.7);
        else if (v.morph.Mood !== 'Jus' || !G.valsOf(v, 'Person').includes('2')) add('ar-neg-la', [i, j], 0.6);
      }
    }
    const ma = particle(i, (k, c) => k === 'ما' && G.isPos(c, 'PART', 'ADV'));
    if (ma && j >= 0) { const v = verbAt(j); if (v && G.isPerfect(v)) add('ar-neg-ma', [i, j], 0.6); }
    const laysa = t.lemma && keyOfLemma(t) === 'ليس' && G.isFiniteVerb(t) ? t : undefined;
    if (laysa) add('ar-neg-laysa', j >= 0 ? [i, j] : [i], 0.7);
    const qad = particle(i, (k) => k === 'قد');
    if (qad && j >= 0) {
      const v = verbAt(j);
      if (v && G.isPerfect(v)) add('ar-qad-perfect', [i, j], 0.7);
      else if (v && G.isImperfect(v)) add('ar-qad-imperfect', [i, j], 0.7);
    }
    const sawf = particle(i, (k) => k === 'سوف');
    if (sawf && j >= 0) { const v = verbAt(j); if (v && G.isImperfect(v)) add('ar-future', [i, j], 0.75); }
    // سَـ on the verb itself
    if (G.isImperfect(t) && hasPart(t, ['سَ'])) add('ar-future', [i], 0.8);
    // subjunctive particles
    const sub = particle(i, (k, c) => !!G.AR_MOOD_PARTICLES[k] && G.AR_MOOD_PARTICLES[k].mood === 'Sub' && k !== 'لن' && (G.AR_MOOD_PARTICLES[k].shadda === undefined || (c.lemma ?? '').includes('ّ') === G.AR_MOOD_PARTICLES[k].shadda));
    if (sub && j >= 0) { const v = verbAt(j); if (v && G.isImperfect(v)) add('ar-subjunctive', [i, j], 0.7); }
    // a lām of purpose on the verb: لِيَكْتُبَ
    if (G.isImperfect(t) && hasPart(t, ['لِ']) && (t.morph.Mood === 'Sub' || t.morph.Mood === 'Jus,Sub')) add('ar-subjunctive', [i], 0.6);

    // ── كَانَ ──
    if (G.isFiniteVerb(t) && keyOfLemma(t) in G.AR_KANA_LEMMAS && keyOfLemma(t) !== 'ليس' && !G.hasSuffix(t)) {
      const k = j >= 0 ? s.next(j) : -1;
      const vj = j >= 0 ? verbAt(j) : undefined;
      if (vj && G.isImperfect(vj) && keyOfLemma(t) === 'كان') add('ar-kana-imperfect', [i, j], 0.7);
      else if (j >= 0 && k >= 0 && s.effAll(j, G.isNominal) && s.effAll(k, G.isNominal) && s.effAll(j, (c) => G.isDefinite(c) || G.hasSuffix(c))) add('ar-kana', [i, j, k], 0.65);
    }
    // ── إِنَّ ──
    if (t.lemma && G.AR_INNA_LEMMAS.has(keyOfLemma(t)) && G.isPos(t, 'PART', 'SCONJ', 'CONJ') && ((t.lemma.includes('ّ')) || keyOfLemma(t) === 'ليت') && j >= 0 && s.effAll(j, (c) => G.isNominal(c) || G.isPos(c, 'PRON'))) add('ar-inna', [i, j], 0.7);
    if (t.lemma && G.AR_INNA_LEMMAS.has(keyOfLemma(t)) && G.hasSuffix(t) === false && t.parts?.some((p) => p.kind === 'suffix')) add('ar-inna', [i], 0.6);

    // ── conditionals ──
    const cond = particle(i, (k) => k === 'إذا' || k === 'لو' || k === 'لولا' || (k === 'إن' && !(`${t.lemma}`).includes('ّ')));
    if (cond) { const jj = j >= 0 && verbAt(j) ? [i, j] : [i]; add('ar-conditional', jj, 0.65); }

    // ── relative clauses ──
    if (G.isRelative(t) && keyOfLemma(t) === 'الذي') {
      if (j >= 0 && (verbAt(j) || s.top(j)?.pos === 'PRON')) add('ar-relative', [i, j], 0.7);
      else add('ar-relative', [i], 0.55);
    }
    if (G.isPos(t, 'PRON') && (keyOfLemma(t) === 'من' || keyOfLemma(t) === 'ما') && t.confidence >= 0.5 && j >= 0 && verbAt(j)) add('ar-relative', [i, j], 0.45);

    // ── comparative and superlative ──
    if (isElative(t)) {
      if (j >= 0 && keyOfLemma(s.top(j)) === 'من' && G.isPos(s.top(j)!, 'ADP')) add('ar-comparative', [i, j], 0.7);
      else if (j >= 0 && s.effAll(j, (c) => G.isNominal(c) && G.isDefinite(c) && G.hasVal(c, 'Number', 'Plur'))) add('ar-superlative', [i, j], 0.45);
    }

    // ── numbers ──
    const nw = G.AR_NUMBER_WORDS[s.keys[i]];
    const bf = s.prev(i);
    if (nw && G.isPos(t, 'NUM', 'NOUN', 'ADJ') && !G.isTeenSecond(s.keys[i], bf >= 0 ? s.keys[bf] : undefined)) {
      let last = i;
      let teen = false;
      if (G.AR_TEEN_UNITS.has(s.keys[i]) && j >= 0 && G.AR_TEEN_KEYS.has(s.keys[j])) { last = j; teen = true; }
      const k = s.next(last);
      if (k >= 0 && s.any(k, G.isNominal) && (teen || !(nw.kind === 'one' || nw.kind === 'two'))) {
        const span = teen ? [i, last, k] : [i, k];
        if (teen || nw.kind === 'tens') add('ar-number-11-99', span, 0.65);
        else if (nw.kind === 'few' || nw.kind === 'thousands') add('ar-number-3-10', span, 0.65);
        else add('ar-number-100', span, 0.65);
      }
    }

    // ── a verbal noun after لِـ / بِـ ──
    const masdar = (c: Cand): boolean => c.notes?.derivation === 'verbal noun' || c.morph.VerbForm === 'Vnoun';
    if (masdar(t) && hasPart(t, ['لِ'])) add('ar-masdar-li', [i], 0.55);
    if (masdar(t) && hasPart(t, ['بِ'])) add('ar-masdar-bi', [i], 0.55);

    // ── the passive: only when the page prints the vowels that show it ──
    if (G.isFiniteVerb(t) && t.morph.Voice === 'Pass' && t.confidence >= 0.5 && t.notes?.vowels === 'source') add('ar-passive', [i], 0.8);

    // ── the noun phrase ──
    if (G.isNounLike(t) && t.morph.Definite === 'Cons' && j >= 0) {
      // the first term and what follows it: a chain of construct terms ends at the first definite one
      const chain = [i];
      let cur = i;
      for (let n = s.next(cur); n >= 0 && s.top(cur)?.morph.Definite === 'Cons' && s.effAll(n, G.isNominal); n = s.next(cur)) {
        const def = s.effAll(n, (c) => G.isDefinite(c) || (G.hasSuffix(c) && c.morph.Definite === 'Cons'));
        const cons = s.top(n)?.morph.Definite === 'Cons';
        if (!def && !cons) break;
        chain.push(n);
        cur = n;
        if (def && !cons) break;
      }
      if (chain.length > 1) add('ar-construct', chain, 0.7);
    }
    if (G.isDemonstrative(t) && j >= 0 && s.effAll(j, (c) => G.isNominal(c))) {
      const def = s.effAll(j, (c) => G.isDefinite(c));
      const gd = t.morph.Gender;
      const gn = nextTop?.morph.Gender;
      if (!gd || !gn || gn.includes(',') || gd === gn || G.hasVal(nextTop!, 'Number', 'Plur')) add('ar-demonstrative', [i, j], def ? 0.7 : 0.5);
    }
    if (nextTop && G.isNounLike(t) && !G.isPos(t, 'PROPN') && G.isPos(nextTop, 'ADJ') && arAdjectiveAgrees(t, nextTop) && t.confidence >= 0.5 && nextTop.confidence >= 0.5) add('ar-noun-adjective', [i, j], 0.6);
    // the vocative
    const ya = particle(i, (k) => k === 'يا');
    if (ya && j >= 0 && s.effAll(j, (c) => G.isNominal(c))) add('ar-vocative', [i, j], 0.7);
  }
  return out.sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || b.confidence - a.confidence);
}

/** An elative: the index's Degree=Cmp, or the shape of أَفْعَلُ (an adjective, diptote, four letters from the hamza). Colours share the shape: only with مِنْ is it claimed. */
const isElative = (c: Cand): boolean => G.isPos(c, 'ADJ') && !!c.lemma && (G.hasVal(c, 'Degree', 'Cmp') || (c.morph.Decl === 'Dip' && /^أ.{3}$/.test(arKey(c.lemma)) && !G.isDefinite(c)));
