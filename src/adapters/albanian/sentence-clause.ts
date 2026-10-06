/**
 * What the words around a noun or a verb decide (rules 3–6 of the sentence layer; names are in sentence-names.ts): the case
 * a preposition asks for; a verb against another reading after the particles, and its mood; the person a subject
 * pronoun asks for; the non-active aorist after "u". Machine-drafted rules, not checked by a native speaker.
 * Anything the neighbours do not decide is left as the word-form engine gave it.
 */
import { sqAgree } from './types';
import { SUBJECTS } from './sentence-little';
import {
  anyParticleAt, cliticAt, decided, hasVal, isClitic, isFin, isNominal, nextWord, norm, particleAt, pick, wordAt,
  type C, type Ctx,
} from './sentence-core';
import { nameDecided } from './sentence-names';
import { phraseHead } from './sentence-look';

// ───────────────────────────── case after a preposition ─────────────────────────────

const CASE_WORD: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Abl: 'ablative', Gen: 'genitive' };

/** Words that may follow a noun and no noun phrase: a conjunction or a preposition ("nuk kam para për të blerë"). "se" is not among them: "para se të vij". */
const AFTER_NOUN = new Set(['dhe', 'edhe', 'por', 'ose', 'apo', 'që', 'sepse', 'për', 'në', 'me', 'nga', 'te', 'tek', 'pa']);

/** The clause ends at token i, or a conjunction, a preposition or an adverb follows it. */
function endsPhrase(cx: Ctx, i: number): boolean {
  const next = cx.tokens[i + 1];
  if (!next) return true;
  if (!next.isWord) return !/\d/u.test(next.surface);
  // an adverb (sot, tani, shumë) is no noun phrase either
  return AFTER_NOUN.has(norm(cx, i + 1)) || (cx.base[i + 1].length > 0 && cx.base[i + 1].every((c) => c.pos === 'ADV'));
}

/** After a preposition the head of the next noun phrase has the case the preposition asks for. */
export function prepositions(cx: Ctx): void {
  for (let i = 0; i < cx.tokens.length; i++) {
    if (!cx.tokens[i].isWord || cx.inUnit.has(i) || norm(cx, i) === 'më') continue;
    const adp = cx.cur[i].find((c) => c.pos === 'ADP' && typeof c.notes?.governs === 'string');
    if (!adp || (decided(cx, i) && cx.cur[i][0].pos !== 'ADP')) continue;
    const k = nextWord(cx, i);
    const head = k === undefined ? undefined : phraseHead(cx, k);
    if (!head) {
      // afër, larg, pranë … with no noun phrase after them are adverbs
      if (cx.cur[i].some((c) => c.pos === 'ADV') && !cx.tokens[i + 1]?.isWord) {
        pick(cx, i, { pred: (c) => c.pos === 'ADV', why: 'with no noun phrase after it: an adverb' });
      } else if (cx.cur[i].some(isNominal) && endsPhrase(cx, i)) {
        // para (money) is also the preposition para (before): the preposition needs a noun phrase after it
        pick(cx, i, { pred: isNominal, why: 'with no noun phrase after it, at the end of the clause or before a conjunction: the noun, not the preposition' });
      }
      continue;
    }
    pick(cx, i, { pred: (c) => c.pos === 'ADP', why: 'before a noun phrase: a preposition' });
    // a name written with a capital letter stays a name, whatever case the preposition asks for (me Drita, te Luan)
    if (nameDecided(cx, head.idx)) continue;
    const governs = String(adp.notes?.governs);
    pick(cx, head.idx, {
      pred: (c) => (isNominal(c) || (c.pos === 'PRON' && !isClitic(c))) && sqAgree(c.morph.Case, governs),
      allow: { Case: [governs] },
      why: `after the preposition "${norm(cx, i)}" (it takes the ${CASE_WORD[governs] ?? governs}): the noun phrase is in that case`,
    });
  }
}

// ───────────────────────────── verbs: which reading, which mood, which person ─────────────────────────────

interface Demand { moods?: string[]; word: string; why: string }

/** What stands before the verb at k (short object pronouns skipped) and asks for a verb, and for a mood. */
function demandBefore(cx: Ctx, k: number): Demand | undefined {
  let j = k - 1;
  let shorts = 0;
  while (wordAt(cx, j) !== undefined && cliticAt(cx, j)) { shorts++; j--; }
  const w = wordAt(cx, j);
  if (w === undefined) return shorts > 0 ? { word: norm(cx, k - 1), why: 'after a short object pronoun: a verb' } : undefined;
  const f = norm(cx, w);
  if (f === 'nuk' || f === "s'") return { moods: ['Ind'], word: f, why: `after "${f}": a verb in the indicative` };
  if (f === 'mos') {
    const b = wordAt(cx, w - 1);
    return b !== undefined && particleAt(cx, b, 'të')
      ? { moods: ['Sub'], word: f, why: 'after "të mos": a verb in the subjunctive' }
      : { moods: ['Imp', 'Sub', 'Opt'], word: f, why: 'after "mos": a command or a wish (imperative, subjunctive or optative)' };
  }
  if (particleAt(cx, w, 'të')) return { moods: ['Sub'], word: f, why: 'after the particle "të": a verb in the subjunctive' };
  if (particleAt(cx, w, 'po')) return { moods: ['Ind'], word: f, why: 'after "po": a verb in the indicative' };
  if (particleAt(cx, w, 'u')) return { word: f, why: 'after the non-active particle "u": a verb' };
  return shorts > 0 ? { word: norm(cx, k - 1), why: 'after a short object pronoun: a verb' } : undefined;
}

/** The subject pronoun before the verb at k: only particles, negation and short object pronouns may stand between. */
function subjectBefore(cx: Ctx, k: number): number | undefined {
  let j = k - 1;
  while (wordAt(cx, j) !== undefined && (cliticAt(cx, j) || anyParticleAt(cx, j))) j--;
  const s = wordAt(cx, j);
  return s !== undefined && norm(cx, s) in SUBJECTS && cx.cur[s].some((c) => c.pos === 'PRON' && !isClitic(c) && sqAgree(c.morph.Case, 'Nom')) ? s : undefined;
}

export function verbs(cx: Ctx): void {
  for (let k = 0; k < cx.tokens.length; k++) {
    if (!cx.tokens[k].isWord || cx.inUnit.has(k) || !cx.cur[k].some(isFin)) continue;
    const d = demandBefore(cx, k);
    const moodOk = (c: C): boolean => !d?.moods || c.morph.Mood === undefined || d.moods.some((m) => hasVal(c.morph.Mood, m));
    // a word that may be a verb or something else: after a particle that asks for a verb, the verb reading
    if (d && !cx.cur[k].every(isFin) && !decided(cx, k)) {
      const fits = cx.cur[k].some((c) => isFin(c) && moodOk(c));
      pick(cx, k, { pred: (c) => isFin(c) && (!fits || moodOk(c)), allow: d.moods ? { Mood: d.moods } : {}, why: d.why });
    }
    // only a word that is a verb here: every reading is one, or the sentence put a verb reading first
    const verbal = cx.cur[k].every(isFin) || (decided(cx, k) && isFin(cx.cur[k][0]));
    if (!verbal) continue;
    if (d?.moods) pick(cx, k, { pred: (c) => isFin(c) && moodOk(c), allow: { Mood: d.moods }, why: d.why });
    // a subject pronoun directly before: its person and number, and the pronoun in the nominative
    const s = subjectBefore(cx, k);
    const subject = s === undefined ? undefined : SUBJECTS[norm(cx, s)];
    // (a verb that does not agree with the pronoun says nothing about it: a learner's slip, or not its subject)
    if (s !== undefined && subject !== undefined && cx.cur[k].some((c) => isFin(c) && sqAgree(c.morph.Person, subject.person) && sqAgree(c.morph.Number, subject.number))) {
      const { person, number } = subject;
      const agrees = (c: C): boolean => isFin(c) && sqAgree(c.morph.Person, person) && sqAgree(c.morph.Number, number);
      pick(cx, s, { pred: (c) => c.pos === 'PRON' && !isClitic(c) && sqAgree(c.morph.Case, 'Nom'), allow: { Case: ['Nom'] }, why: 'directly before a verb: the subject pronoun' });
      pick(cx, k, {
        pred: agrees,
        allow: { Person: [person], Number: [number] },
        why: `after the subject "${cx.tokens[s].surface}": ${['first', 'second', 'third'][Number(person) - 1]} person ${number === 'Sing' ? 'singular' : 'plural'}`,
      });
    }
    // "u" before an aorist: the meaning is non-active
    const p = wordAt(cx, k - 1);
    if (p !== undefined && particleAt(cx, p, 'u')) {
      const aorist = cx.cur[k].filter((c) => isFin(c) && c.morph.Tense === 'Past');
      const mid = aorist.filter((c) => c.morph.Voice === 'Mid');
      if (mid.length > 0) pick(cx, k, { pred: (c) => mid.includes(c), why: 'after "u": the non-active aorist' });
      else if (aorist.length > 0) {
        pick(cx, k, {
          pred: (c) => aorist.includes(c), usual: true, force: true,
          why: 'after "u" the meaning is non-active; the word list gives this aorist form only with its active ending, which the non-active shares',
        });
      }
    }
  }
}
