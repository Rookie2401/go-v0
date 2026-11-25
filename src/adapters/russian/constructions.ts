/**
 * Russian constructions as PatternCandidates: grammar patterns the reader can name, each with a short explanation and the example, and
 * each firing only on a shape the readings support (the first reading of each word, `candidates[0]`: a feature that is missing or is
 * still a union means "do not fire", never "assume").
 *
 * MACHINE-DRAFTED from standard grammar descriptions of Russian; not reviewed by a native speaker. `RU_CONSTRUCTIONS` is the table the
 * pack manifest lists: every id `detectRuPatterns` can return is in it (the test checks that).
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../core';
import { ruAspectOf, ruAspectPartners, ruAspectPartnerSentence } from './aspect';
import { ruCasesOf, ruPrepositionOf } from './government';
import { lookupRussianLemma } from './index-store';
import { ruMotionOf } from './motion';
import { GEN_PLURAL, PAUCAL } from './sentence';
import { ruKey } from './text';

export interface RuConstruction { id: string; label: string; explain: string }

export const RU_CONSTRUCTIONS: readonly RuConstruction[] = [
  { id: 'possession-u-est', label: 'Possession: у + genitive (+ есть)',
    explain: 'Russian has no verb "to have" for ordinary possession. It says "by me there is a book": у меня есть книга. The owner is in the genitive after у, the thing owned is the grammatical subject, and есть is often left out in speech. In the past or future the verb is быть: у меня была книга.' },
  { id: 'genitive-of-negation', label: 'Genitive of negation: нет / не было + genitive',
    explain: 'After нет (there is not), не было or не будет, the thing that is absent is in the genitive: у меня нет книги (I have no book), в комнате не было окон. Compare the affirmative у меня есть книга, where it is nominative.' },
  { id: 'past-perfective', label: 'Perfective past',
    explain: 'A perfective past presents one completed event as a whole, often with its result or as a step in a sequence: Она прочитала книгу (she read the book through). The past tense agrees with the subject in gender and number, not in person.' },
  { id: 'past-imperfective', label: 'Imperfective past',
    explain: 'An imperfective past presents a process, a repeated or habitual action, or the plain fact that something happened: Она читала книгу (she was reading / used to read the book). The past tense agrees with the subject in gender and number.' },
  { id: 'future-perfective', label: 'Perfective future (present-shaped)',
    explain: 'A perfective verb has no present tense: its present-shaped form means the future: Я прочитаю книгу (I will read the book). The same endings as the present of an imperfective verb, but a different meaning.' },
  { id: 'future-imperfective', label: 'Imperfective future: буду + infinitive',
    explain: 'The imperfective future is made with the future of быть and an imperfective infinitive: Я буду читать (I will be reading / I will read). Only imperfective verbs make their future this way.' },
  { id: 'conditional-by', label: 'Conditional: бы + past',
    explain: 'The particle бы with a past-tense verb makes the conditional or a polite wish: Я бы прочитал эту книгу (I would read this book). Бы can stand after the verb or after another word of the clause; the verb ends as a past tense does, in gender and number.' },
  { id: 'imperative', label: 'Imperative',
    explain: 'The imperative addresses someone: Читай! (to a friend), Читайте! (to several people or politely). A perfective imperative asks for one concrete act (Прочитай эту страницу), an imperfective one for a process, a repeated act or a general invitation (Читай каждый день).' },
  { id: 'reflexive-verb', label: 'Reflexive verb: -ся / -сь',
    explain: 'The ending -ся (-сь after a vowel) marks a verb that is reflexive (мыться: to wash oneself), reciprocal (встречаться: to meet each other), intransitive or "middle" (начаться: to begin), or the passive of an imperfective verb (строиться: to be built). It cannot take a direct object. The dictionary says which meanings a given verb has.' },
  { id: 'motion-determinate', label: 'Verb of motion: determinate',
    explain: 'A determinate verb of motion (идти, ехать, бежать, лететь …) describes one trip in one direction, at one moment: Я иду в школу (I am on my way to school). Its indeterminate partner (ходить, ездить …) is used for habits and round trips.' },
  { id: 'motion-indeterminate', label: 'Verb of motion: indeterminate',
    explain: 'An indeterminate verb of motion (ходить, ездить, бегать, летать …) describes a habit, a round trip, movement with no single goal, or an ability: Я хожу в школу каждый день. Its determinate partner (идти, ехать …) is used for one trip in one direction.' },
  { id: 'motion-prefixed', label: 'Prefixed verb of motion',
    explain: 'A prefix on a verb of motion adds the direction: при- arrival, у- leaving, в- into, вы- out of. Built on the determinate stem the verb is perfective (прийти: to arrive); its imperfective partner is built on the indeterminate stem (приходить). Он пришёл домой: he came home.' },
  { id: 'numeral-noun', label: 'Numeral + noun: genitive',
    explain: 'After два, три, четыре the noun is genitive singular (два года); after пять and higher numbers, and after много, мало, несколько, сколько, it is genitive plural (пять лет, много людей). After один the noun agrees in case (один год).' },
  { id: 'instrumental-predicate', label: 'Instrumental predicate: быть / стать + instrumental',
    explain: 'With быть (in the past or future), стать, являться, казаться or оказаться, the noun or adjective that says what the subject is or becomes is in the instrumental: Он был врачом (he was a doctor), Она стала учительницей. In the present tense быть is left out and the predicate is nominative: Он врач.' },
  { id: 'dative-experiencer', label: 'Dative experiencer: мне нравится, мне холодно',
    explain: 'To say how someone feels or what someone likes, Russian puts the person in the dative: Мне нравится эта книга (I like this book; literally: to me is pleasing), Мне холодно (I am cold), Мне нужно идти (I need to go).' },
  { id: 'impersonal-modal', label: 'Impersonal modal: можно, нужно, надо, нельзя + infinitive',
    explain: 'The words можно (one may), нужно and надо (one must), нельзя (one must not, it is impossible) are followed by an infinitive and need no subject: Здесь можно курить. The person, when named, is in the dative: Мне надо идти. Нельзя + imperfective infinitive forbids; нельзя + perfective says it cannot be done.' },
  { id: 'short-adjective', label: 'Short-form adjective as predicate',
    explain: 'A short adjective (рад, готов, должен, красива, открыты) stands after the noun as the predicate and agrees in gender and number: Она рада (she is glad), Окно открыто. Only the nominative exists, and many adjectives have a short form only in this use.' },
  { id: 'comparative', label: 'Comparative: чем or the genitive',
    explain: 'The thing compared with comes after чем (than) or, with no чем, in the genitive: Он старше, чем она; Он старше её (he is older than she). Больше, меньше, лучше, хуже, быстрее are comparatives.' },
  { id: 'participle-active', label: 'Active participle',
    explain: 'An active participle describes a noun by an action it does: читающий человек (the person who is reading), прочитавший книгу (who has read the book). It agrees with its noun like an adjective and comes from a verb; it is mostly written, not spoken, Russian.' },
  { id: 'participle-passive', label: 'Passive participle',
    explain: 'A passive participle describes a noun by an action done to it: прочитанная книга (the book that has been read), написанное письмо. The short form is a predicate: Письмо написано (the letter is written).' },
  { id: 'adverbial-participle', label: 'Adverbial participle',
    explain: 'An adverbial participle names a second action of the SAME subject as the main verb: Читая, он улыбался (while reading, he smiled; imperfective: at the same time) and Прочитав письмо, он ушёл (having read the letter, he left; perfective: before). It is set off by commas and never changes.' },
  { id: 'chtoby-infinitive', label: 'чтобы + infinitive: purpose',
    explain: 'Чтобы with an infinitive gives the purpose of an action of the same subject: Я пришёл, чтобы помочь (I came in order to help). When the subjects differ, чтобы is followed by a past-tense form: Я хочу, чтобы ты помог.' },
  { id: 'chtoby-past', label: 'чтобы + past: purpose or wish with a different subject',
    explain: 'Чтобы with a past-tense verb expresses a wish or purpose whose subject differs from the main clause: Я хочу, чтобы ты пришёл (I want you to come). The past form is not about the past: it is the subjunctive.' },
  { id: 'relative-kotoryj', label: 'Relative который',
    explain: 'Который (who, which, that) agrees with the noun it refers to in gender and number, but its CASE comes from its own clause: Книга, которую я читаю (the book that I am reading): which is feminine singular like книга, but accusative because it is the object of читаю.' },
  { id: 'preposition-direction', label: 'в / на / за / под + accusative: direction',
    explain: 'Some prepositions take two cases and the case changes the meaning. With the accusative they answer куда? (where to?): Я иду в школу, на работу, за дом. With the prepositional (в, на) or the instrumental (за, под) they answer где? (where?): Я в школе, на работе, за домом.' },
  { id: 'preposition-location', label: 'в / на + prepositional, за / под + instrumental: location',
    explain: 'Some prepositions take two cases and the case changes the meaning. With the prepositional (в, на) or the instrumental (за, под) they answer где? (where?): Я в школе, на работе, за домом. With the accusative they answer куда? (where to?): Я иду в школу.' },
];
const INFO = new Map(RU_CONSTRUCTIONS.map((c) => [c.id, c]));

// ───────────────────────────── readings ─────────────────────────────

type Cand = AnalysisCandidate;
const vals = (c: Cand | undefined, key: string): string[] => (c?.morph[key] ? c.morph[key].split(',') : []);
const has = (c: Cand | undefined, key: string, v: string): boolean => vals(c, key).includes(v);
const only = (c: Cand | undefined, key: string, v: string): boolean => { const x = vals(c, key); return x.length === 1 && x[0] === v; };
const isVerb = (c: Cand | undefined): boolean => !!c && (c.pos === 'VERB' || c.pos === 'AUX');
const isFin = (c: Cand | undefined): boolean => isVerb(c) && only(c, 'VerbForm', 'Fin');
const casesOf = (c: Cand | undefined): string[] => ruCasesOf(c?.morph.Case);
const NOMINAL_POS = new Set(['NOUN', 'PROPN', 'PRON', 'ADJ', 'DET', 'NUM']);

const MODALS = new Set(['можно', 'нужно', 'надо', 'нельзя']);
const COPULAS = new Set(['быть', 'стать', 'являться', 'казаться', 'оказаться', 'становиться', 'оставаться', 'остаться', 'считаться']);
const DAT_PRONOUNS = new Set(['мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'им']);
const FEELING_WORDS = new Set(['холодно', 'жарко', 'тепло', 'скучно', 'страшно', 'весело', 'грустно', 'трудно', 'легко', 'стыдно', 'приятно', 'больно', 'интересно', 'нужно', 'надо', 'можно', 'нельзя', 'пора', 'лень', 'жалко', 'обидно', 'тоскливо', 'грустно', 'душно', 'хорошо', 'плохо', 'неудобно']);
const FEELING_VERBS = new Set(['нравиться', 'понравиться', 'хотеться', 'казаться', 'надоесть', 'удаваться', 'нравится']);

/** Builds one pattern; `here` is a sentence about the actual words (kept short). */
function pattern(id: string, indexes: number[], confidence: number, here?: string, tail?: string): PatternCandidate {
  const info = INFO.get(id)!;
  // the general sentence first, then what is true of these words, then (for an aspect pattern) the partner the dictionary names
  const explanation = [info.explain, here ? `Here: ${here}` : '', tail ?? ''].filter(Boolean).join(' ');
  return { key: id, title: info.label, explanation, tokenIndexes: [...indexes].sort((a, b) => a - b), confidence };
}

/** What a prefix adds, short: the part of its sense before the colon or the bracket. */
const shortSense = (sense: string | undefined): string => (sense ?? '').split(/[:(]/)[0].trim();

/** The grammar patterns of one sentence, over the readings `analyze` gave. */
export function detectRuPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const n = tokens.length;
  const top = (i: number): Cand | undefined => (i >= 0 && i < n && tokens[i].isWord ? analyses[i]?.candidates[0] : undefined);
  const key = (i: number): string => ruKey(tokens[i].surface);
  const word = (i: number): boolean => i >= 0 && i < n && tokens[i].isWord;
  const surf = (...is: number[]): string => is.map((i) => `«${tokens[i].surface}»`).join(' ');
  const next = (i: number): number => (word(i + 1) ? i + 1 : -1);
  /** First word after i (skipping up to `skip` words that satisfy `skippable`) satisfying `want`. */
  const find = (from: number, dir: 1 | -1, max: number, want: (c: Cand | undefined, i: number) => boolean): number => {
    for (let i = from + dir, steps = 0; i >= 0 && i < n && steps < max; i += dir, steps++) {
      if (!tokens[i].isWord) { if (/[.!?…;]/.test(tokens[i].surface)) return -1; continue; }
      if (want(top(i), i)) return i;
    }
    return -1;
  };

  for (let i = 0; i < n; i++) {
    if (!word(i)) continue;
    const c = top(i);
    if (!c) continue;
    const k = key(i);

    // ── possession and the genitive of negation ──
    if (k === 'у' && c.pos === 'ADP') {
      const owner = next(i);
      const oc = top(owner);
      if (owner >= 0 && oc && casesOf(oc).includes('Gen') && NOMINAL_POS.has(oc.pos ?? '')) {
        let last = owner;
        // up to two more words of the owner's phrase (у моего брата)
        for (let s = 0; s < 2; s++) { const t = last + 1; const tc = top(t); if (tc && casesOf(tc).includes('Gen') && NOMINAL_POS.has(tc.pos ?? '')) last = t; else break; }
        const v = find(last, 1, 2, (x, j) => !!x && (key(j) === 'есть' || key(j) === 'нет' || key(j) === 'нету' || (x.lemma === 'быть' && (isFin(x) || only(x, 'VerbForm', 'Fin')))));
        if (v >= 0 && (key(v) === 'есть' || top(v)?.lemma === 'быть')) out.push(pattern('possession-u-est', [i, ...range(owner, last), v], 0.9, `${surf(i, owner)} … ${surf(v)}: the owner is in the genitive.`));
        else if (v >= 0) {
          const thing = find(v, 1, 3, (x) => !!x && NOMINAL_POS.has(x.pos ?? '') && casesOf(x).includes('Gen'));
          out.push(pattern('genitive-of-negation', [i, owner, v, ...(thing >= 0 ? [thing] : [])], 0.9, thing >= 0 ? `${surf(v)} is followed by the genitive ${surf(thing)}.` : undefined));
        }
      }
    }
    if ((k === 'нет' || k === 'нету') && !tokens.slice(0, i).some((t, j) => t.isWord && key(j) === 'у' && i - j <= 5)) {
      const thing = find(i, 1, 3, (x) => !!x && NOMINAL_POS.has(x.pos ?? '') && casesOf(x).includes('Gen') && !casesOf(x).includes('Nom'));
      if (thing >= 0) out.push(pattern('genitive-of-negation', [i, thing], 0.8, `${surf(i)} is followed by the genitive ${surf(thing)}.`));
    }
    if (k === 'не' && next(i) >= 0 && ['было', 'будет', 'осталось'].includes(key(i + 1))) {
      const thing = find(i + 1, 1, 3, (x) => !!x && NOMINAL_POS.has(x.pos ?? '') && casesOf(x).includes('Gen') && !casesOf(x).includes('Nom'));
      if (thing >= 0) out.push(pattern('genitive-of-negation', [i, i + 1, thing], 0.85, `${surf(i, i + 1)} is followed by the genitive ${surf(thing)}.`));
    }

    // ── tense and aspect ──
    if (isFin(c) && c.lemma) {
      const asp = ruAspectOf(c);
      if (only(c, 'Tense', 'Past') && asp === 'Perf') out.push(pattern('past-perfective', [i], 0.9, `${surf(i)} is the past of the perfective verb ${c.lemma}.`, ruAspectPartnerSentence(c)));
      else if (only(c, 'Tense', 'Past') && asp === 'Imp') out.push(pattern('past-imperfective', [i], 0.9, `${surf(i)} is the past of the imperfective verb ${c.lemma}.`, ruAspectPartnerSentence(c)));
      else if (only(c, 'Tense', 'Fut') && asp === 'Perf' && !only(c, 'Mood', 'Imp')) out.push(pattern('future-perfective', [i], 0.85, `${surf(i)} looks like a present but is the future of the perfective verb ${c.lemma}.`, ruAspectPartnerSentence(c)));
      else if (c.lemma === 'быть' && only(c, 'Tense', 'Fut')) {
        const inf = find(i, 1, 3, (x) => isVerb(x) && only(x, 'VerbForm', 'Inf') && !!x && ruAspectOf(x) === 'Imp');
        if (inf >= 0) out.push(pattern('future-imperfective', [i, inf], 0.9, `${surf(i, inf)}: the future of ${top(inf)?.lemma ?? 'the verb'}.`, ruAspectPartnerSentence(top(inf)!)));
      }
      if (only(c, 'Mood', 'Imp')) out.push(pattern('imperative', [i], 0.85, asp === 'Perf' ? `${surf(i)} is a perfective imperative: one concrete act.` : asp === 'Imp' ? `${surf(i)} is an imperfective imperative: a process, repetition or invitation.` : undefined, ruAspectPartnerSentence(c)));
      if (only(c, 'Tense', 'Past') && !only(c, 'Mood', 'Imp')) {
        const by = find(i, -1, 3, (x, j) => !!x && key(j) === 'бы') >= 0 ? find(i, -1, 3, (x, j) => !!x && key(j) === 'бы') : find(i, 1, 2, (x, j) => !!x && key(j) === 'бы');
        if (by >= 0) out.push(pattern('conditional-by', [by, i], 0.9, `${surf(by, i)}.`));
      }
    }
    if (isVerb(c) && has(c, 'Reflex', 'Yes') && (only(c, 'VerbForm', 'Fin') || only(c, 'VerbForm', 'Inf') || only(c, 'VerbForm', 'Conv') || only(c, 'VerbForm', 'Part')) && c.lemma) {
      const plain = c.lemma.replace(/с[яь]$/, '');
      const plainRow = lookupRussianLemma(`${plain}|VERB`);
      out.push(pattern('reflexive-verb', [i], 0.85, plainRow ? `${surf(i)} is a form of ${c.lemma}; the dictionary also has ${plain} without -ся (${plainRow[1]}).` : `${surf(i)} is a form of ${c.lemma}.`));
    }

    // ── verbs of motion ──
    if (isVerb(c) && c.lemma && (only(c, 'VerbForm', 'Fin') || only(c, 'VerbForm', 'Inf') || only(c, 'VerbForm', 'Part') || only(c, 'VerbForm', 'Conv'))) {
      const m = c.lemma ? ruMotionOf(c.lemma) : undefined;
      if (m && !(m.kind === 'prefixed' && only(c, 'Gender', 'Neut'))) {
        const id = m.kind === 'determinate' ? 'motion-determinate' : m.kind === 'indeterminate' ? 'motion-indeterminate' : 'motion-prefixed';
        const lemma = c.lemma;
        const partnerList = ruAspectPartners(c);
        const named = (kind: string): string => (partnerList.length ? ` Its ${kind} partner in the dictionary: ${partnerList.join(', ')}.` : '');
        const note = m.kind === 'determinate'
          ? `${surf(i)} is a form of ${lemma}, the one-direction verb of the pair ${m.base} / ${m.pair}.`
          : m.kind === 'indeterminate'
            ? `${surf(i)} is a form of ${lemma}, the repeated-or-no-fixed-goal verb of the pair ${m.pair} / ${m.base}.`
            : `${surf(i)} is a form of ${lemma} = ${m.prefix}- (${shortSense(m.prefixSense)}) + ${m.expectedAspect === 'Perf' ? m.base : m.base}; ${m.expectedAspect === 'Perf' ? 'perfective' : 'imperfective'}.${named(m.expectedAspect === 'Perf' ? 'imperfective' : 'perfective')}`;
        out.push(pattern(id, [i], m.kind === 'prefixed' ? 0.8 : 0.85, note));
      }
    }

    // ── numeral + noun ──
    if (PAUCAL.has(k) || GEN_PLURAL.has(k)) {
      const noun = find(i, 1, 3, (x) => !!x && (x.pos === 'NOUN' || x.pos === 'PROPN') && casesOf(x).includes('Gen'));
      if (noun >= 0) {
        const nc = top(noun);
        const ok = PAUCAL.has(k) ? only(nc, 'Number', 'Sing') : only(nc, 'Number', 'Plur');
        if (ok) out.push(pattern('numeral-noun', [i, noun], 0.85, `${surf(i, noun)}: after ${tokens[i].surface} the noun is genitive ${PAUCAL.has(k) ? 'singular' : 'plural'}.`));
      }
    }

    // ── instrumental predicate ──
    if (c.lemma && COPULAS.has(c.lemma) && isFin(c) && !(c.lemma === 'быть' && has(c, 'Tense', 'Pres'))) {
      const pred = find(i, 1, 3, (x) => !!x && NOMINAL_POS.has(x.pos ?? '') && x.pos !== 'PRON' && only(x, 'Case', 'Ins'));
      if (pred >= 0) out.push(pattern('instrumental-predicate', [i, pred], 0.8, `${surf(i)} + the instrumental ${surf(pred)}.`));
    }

    // ── dative experiencer and impersonal modals ──
    if (DAT_PRONOUNS.has(k) && casesOf(c).includes('Dat') && (c.pos === 'PRON')) {
      const w = next(i);
      if (w >= 0 && (FEELING_WORDS.has(key(w)) || FEELING_VERBS.has(top(w)?.lemma ?? '') || (top(w)?.lemma === 'хотеться'))) out.push(pattern('dative-experiencer', [i, w], 0.85, `${surf(i, w)}.`));
    }
    if (MODALS.has(k)) {
      const inf = find(i, 1, 2, (x) => isVerb(x) && only(x, 'VerbForm', 'Inf'));
      if (inf >= 0) out.push(pattern('impersonal-modal', [i, inf], 0.9, `${surf(i, inf)}.`));
    }

    // ── short adjective ──
    if (c.pos === 'ADJ' && only(c, 'Variant', 'Short') && vals(c, 'Number').length === 1 && !MODALS.has(k) && !FEELING_WORDS.has(k)) out.push(pattern('short-adjective', [i], 0.8, `${surf(i)} is the short form of ${c.lemma ?? 'the adjective'}.`));

    // ── comparative ──
    if ((c.pos === 'ADJ' || c.pos === 'ADV') && only(c, 'Degree', 'Cmp')) {
      const chem = find(i, 1, 4, (x, j) => !!x && key(j) === 'чем');
      if (chem >= 0) out.push(pattern('comparative', [i, chem], 0.85, `${surf(i)} … ${surf(chem)}.`));
      else {
        const g = next(i);
        const gc = top(g);
        if (g >= 0 && gc && NOMINAL_POS.has(gc.pos ?? '') && casesOf(gc).includes('Gen') && !casesOf(gc).includes('Nom') && gc.pos !== 'ADJ') out.push(pattern('comparative', [i, g], 0.7, `${surf(i)} is followed by the genitive ${surf(g)}.`));
      }
    }

    // ── participles ──
    if (isVerb(c) && only(c, 'VerbForm', 'Part') && c.lemma) {
      const pass = only(c, 'Voice', 'Pass');
      const act = only(c, 'Voice', 'Act');
      if (pass || act) out.push(pattern(pass ? 'participle-passive' : 'participle-active', [i], 0.85, `${surf(i)} comes from the verb ${c.lemma}.`));
    }
    if (isVerb(c) && only(c, 'VerbForm', 'Conv') && c.lemma) out.push(pattern('adverbial-participle', [i], 0.85, `${surf(i)} comes from ${c.lemma} (${ruAspectOf(c) === 'Perf' ? 'perfective: before the main action' : 'imperfective: during the main action'}).`));

    // ── чтобы ──
    if (k === 'чтобы' || k === 'чтоб') {
      const verb = find(i, 1, 5, (x) => isVerb(x) && (only(x, 'VerbForm', 'Inf') || (isFin(x) && only(x, 'Tense', 'Past'))));
      if (verb >= 0) out.push(pattern(only(top(verb), 'VerbForm', 'Inf') ? 'chtoby-infinitive' : 'chtoby-past', [i, verb], 0.8, `${surf(i, verb)}.`));
    }

    // ── который ──
    if (c.lemma === 'который' && c.pos !== undefined) {
      // the comma stands right before it, or before the preposition that governs it (в котором)
      let at = i - 1;
      if (word(at) && top(at)?.pos === 'ADP') at--;
      const comma = at >= 0 && !tokens[at].isWord && tokens[at].surface === ',' ? at : -1;
      const cc = casesOf(c)[0];
      const noun = comma >= 0 ? find(comma, -1, 3, (x) => !!x && (x.pos === 'NOUN' || x.pos === 'PROPN')) : -1;
      if (noun >= 0 && cc && casesOf(c).length === 1) {
        const nc = top(noun);
        const gOk = !c.morph.Gender || !nc?.morph.Gender || vals(c, 'Gender').some((g) => vals(nc, 'Gender').includes(g));
        const nOk = !c.morph.Number || !nc?.morph.Number || vals(c, 'Number').some((g) => vals(nc, 'Number').includes(g));
        if (gOk && nOk) out.push(pattern('relative-kotoryj', [noun, i], 0.8, `${surf(i)} refers to ${surf(noun)} (same gender and number) and is ${ { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Prep: 'prepositional' }[cc] ?? cc } in its own clause.`));
      }
    }

    // ── preposition + case that changes the meaning ──
    if (c.pos === 'ADP') {
      const prep = ruPrepositionOf(k);
      const clauseVerbs = tokens.map((_, j) => j).filter((j) => word(j) && isVerb(top(j)) && Math.abs(j - i) <= 6 && !tokens.slice(Math.min(i, j), Math.max(i, j)).some((t) => !t.isWord && /[,;.!?…]/.test(t.surface)));
      const stative = new Set(['быть', 'жить', 'находиться', 'стоять', 'лежать', 'сидеть', 'висеть', 'работать', 'учиться', 'остаться', 'оставаться', 'родиться', 'встретиться', 'проходить', 'происходить', 'учить', 'отдыхать', 'играть', 'гулять', 'ждать', 'спать', 'хранить']);
      const directional = new Set(['класть', 'положить', 'ставить', 'поставить', 'вешать', 'повесить', 'сажать', 'посадить', 'садиться', 'сесть', 'ложиться', 'лечь', 'прятать', 'спрятать', 'бросать', 'бросить', 'опускать', 'опустить', 'поднимать', 'поднять', 'отправлять', 'отправить']);
      const verbLemmas = clauseVerbs.map((j) => top(j)!.lemma ?? '');
      const moving = verbLemmas.some((l) => !!ruMotionOf(l) || directional.has(l));
      const standing = verbLemmas.length === 0 || verbLemmas.some((l) => stative.has(l));
      const idiomatic = (k === 'в' && ['течение', 'течении'].includes(key(i + 1))) || (i > 0 && ['несмотря', 'вроде', 'смотря'].includes(key(i - 1)));
      if (prep && ['в', 'на', 'за', 'под'].includes(prep.lemma) && !idiomatic) {
        const nx = next(i);
        const nc = top(nx);
        if (nc && NOMINAL_POS.has(nc.pos ?? '')) {
          const cs = casesOf(nc);
          const locCase = prep.lemma === 'в' || prep.lemma === 'на' ? 'Prep' : 'Ins';
          if (cs.includes('Acc') && !cs.includes(locCase) && moving) out.push(pattern('preposition-direction', [i, nx], 0.8, `${surf(i, nx)}: accusative, so the direction: where to.`));
          else if (cs.includes(locCase) && !cs.includes('Acc') && standing && !moving) out.push(pattern('preposition-location', [i, nx], 0.8, `${surf(i, nx)}: ${locCase === 'Prep' ? 'prepositional' : 'instrumental'}, so the location: where.`));
        }
      }
    }
  }

  // one pattern per id and token set
  const seen = new Set<string>();
  return out.filter((p) => { const sig = `${p.key}|${p.tokenIndexes.join(',')}`; if (seen.has(sig)) return false; seen.add(sig); return true; })
    .sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.key.localeCompare(b.key));
}

function range(a: number, b: number): number[] { const r: number[] = []; for (let i = a; i <= b; i++) r.push(i); return r; }
