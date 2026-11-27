/**
 * THE DECK GATE, for every language (the owner, 2026-11-25: "Make sure that there are no false words or unknown words that appear in the GoReview deck";
 * 2026-11-26: "Enforce the same rule for all the other languages"). It is the GoReview side of the review gate (src/core/review-gate.ts: the same
 * kinds, the same notes), applied to the FACTS a card is built from, because that is where a card's first meaning is chosen.
 *
 * A lemma or form unit may become a card only when:
 *   (a) REAL HEADWORD   the word is a confirmed reading of the pack's word list, or an entry of the pack's dictionary;
 *   (b) A MEANING       the first meaning shown is not only a cross-reference ("alternative spelling of aquél"); a cross-reference is followed
 *                       once to its target's meaning when the dictionary has it;
 *   (c) DECIDED         a written form with no reading that the dictionary files under several word classes is not decided by its spelling
 *                       (the unit's own status already refuses a conflicted reading);
 *   (c') THE RIGHT PERIOD in a language whose analyser labels its readings by period (Greek, Hebrew), the word is one of the learner's own period (Modern
 *                       Greek μητέρα read as Ancient μήτηρ is another variety's word), and its meaning is that period's (a Biblical meaning gives way to the
 *                       modern reading's own, and the word is held when the period has none);
 *   (d) NOT KNOWN-WRONG the unit is not on the language's known-limits list (deck-known-limits.ts);
 *   (e) THE MEANING FITS a meaning taken from the dictionary is the head of the entry's FIRST current sense, never a later sense that happens to
 *                       be short ("Sonntag" was shown as "a municipality of Vorarlberg, Austria" because "Sunday (the first day of …)" is long);
 *                       and a form card shows a meaning its own word's card has (a form card that repeats its lemma card is not false; one that
 *                       shows a look-alike's meaning is).
 *
 * A unit that fails is HELD, not removed: status `requires-review`, no meaning to build a card from (so a card already in a deck is not asked
 * either), and `reviewHold` = the kind and one plain sentence. Where the fault is only the ORDER of the meanings, the facts are repaired instead:
 * the head of the first sense is put first. The word stays readable on the GoLearn card; nothing here touches the reader.
 * Units a reviewer has verified are left as they are. Pure apart from the dictionary reads it is handed.
 */
import type { ReviewKind } from '../../../../src/core/review-gate';
import { crossReferenceTarget, isCrossReferenceOnly } from '../../../../src/core/review-meaning';
import { acceptedMeanings, glossSplit, referenceGloss, senseReference } from '../exercises/shared';
import type { ReviewFacts } from './review-facts';
import type { UnitFacts } from '../types';

export interface DeckHold { kind: ReviewKind; reason: string }
export type GatedFacts = UnitFacts & { reviewHold?: DeckHold };

interface Sense { gloss: string; pos?: string; tags?: readonly string[] }
export interface DeckGateDeps {
  languageId: string;
  /** The pack dictionary (runtime.gloss). */
  gloss(lemma: string, pos?: string, forms?: readonly string[]): Promise<{ senses: Sense[]; via?: unknown } | undefined>;
  /** The GATED facts of another unit (a form's own word). */
  factsOf(unitId: string): Promise<GatedFacts | undefined>;
  /** The learner's target variety (a period variety of Greek or Hebrew decides which sources a reading may come from). */
  varietyId?: string;
  /** The words the pack's forms index lists this written form under (lemma and class), where the dictionary has such an index; [] where it has none. */
  formIdentities?(form: string): Promise<Array<{ lemma: string; pos?: string }>>;
  /** (d) Why this unit is on the language's known-limits list, or undefined. */
  known?(unitId: string): string | undefined;
}

/** A sense so labelled is not the word's current main meaning. */
const NOT_CURRENT = new Set(['obsolete', 'archaic', 'dated', 'rare', 'historical', 'alt-of', 'form-of', 'misspelling', 'nonstandard', 'uncommon', 'no-gloss']);
/** The languages whose form cards rest on an attested form source (MorphGNT, the Open Scriptures Hebrew Bible, the Wiktionary tables) and show the lemma's own meaning by construction. */
const ATTESTED_FORMS = new Set(['el', 'he', 'arc']);
/** The languages whose verbs separate: a finite form may be the stem half of a separable verb whose prefix stands at the end of the clause (German fängst … an = anfangen). */
const SEPARABLE_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  de: ['ab', 'an', 'auf', 'aus', 'bei', 'dar', 'durch', 'ein', 'empor', 'entgegen', 'fest', 'fort', 'her', 'heran', 'heraus', 'herein', 'herum', 'herunter', 'hervor', 'hin', 'hinaus', 'hinein', 'hinter', 'hinzu', 'los', 'mit', 'nach', 'nieder', 'um', 'vor', 'voran', 'voraus', 'vorbei', 'weg', 'weiter', 'wieder', 'zu', 'zurück', 'zusammen'],
};
/** A verb that already carries a separable prefix (herankommen): its joined finite forms (herankam) are that verb's and nothing else's. */
const carriesPrefix = (lang: string, lemma: string): boolean => (SEPARABLE_PREFIXES[lang] ?? []).some((pre) => lemma.toLowerCase().startsWith(pre) && lemma.length >= pre.length + 4);
const VERBAL = new Set(['VERB', 'AUX']);
const NOMINAL = new Set(['NOUN', 'PROPN']);
const posCompatible = (a: string, b: string): boolean => a === b || (VERBAL.has(a) && VERBAL.has(b)) || (NOMINAL.has(a) && NOMINAL.has(b));
const current = (s: Sense): boolean => !(s.tags ?? []).some((t) => NOT_CURRENT.has(t));
const withoutBrackets = (s: string): string => s.replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' ').replace(/\s+/gu, ' ').replace(/\s+([,;.:])/gu, '$1').trim();
/** Two meanings are the same only when they are the same words: nothing is stemmed and no aside is dropped ("books (accounting records)" is not "book"). */
const loose = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim().replace(/[.]+$/u, '').replace(/^(?:to|a|an|the)\s+/u, '');

/** A sense with no word outside its brackets ("[with prepositional]") is a grammar note, not a meaning. */
const hasMeaning = (gloss: string): boolean => /\p{L}/u.test(withoutBrackets(gloss));
/** A leading grammar note is not part of the meaning ("[with prepositional] — in, at, on" gives "in, at, on"). */
const withoutLeadingNote = (gloss: string): string => gloss.replace(/^(?:\[[^\]]*\]\s*)+[\u2014\u2013-]?\s*/u, '').trim();

/** The head of a dictionary sense, short enough to show: the sense itself, else the sense without its bracketed asides ("Sunday (the first day …)" gives "Sunday"). */
export function senseHead(sense: string): string | undefined {
  const g = withoutLeadingNote(sense.trim());
  if (!g || !hasMeaning(g) || isCrossReferenceOnly(g)) return undefined;
  const direct = senseReference(g);
  if (direct) return direct;
  const bare = withoutBrackets(g).replace(/[,;:]+$/u, '').trim();
  return bare && bare !== g && /\p{L}/u.test(bare) ? senseReference(bare) : undefined;
}

/** What the written-recognition builder would show for these facts (the same choice it makes), with the answers it would accept. */
export function cardMeaning(facts: UnitFacts): { shown: string; accepted: string[]; base: boolean } | undefined {
  const reference = referenceGloss(facts);
  const accepted = acceptedMeanings(facts);
  if (reference !== undefined || accepted.length) { const shown = reference ?? accepted[0]; return shown && accepted.length ? { shown, accepted, base: false } : undefined; }
  const lexical = facts.unit.kind === 'form' && facts.lexicalRecognition?.status === 'verified' && facts.lexicalRecognition.lemma && facts.lexicalRecognition.glosses?.length ? facts.lexicalRecognition : undefined;
  if (!lexical) return undefined;
  const asFacts = { ...facts, glosses: lexical.glosses!, lexiconGlossCount: lexical.glosses!.length } as UnitFacts;
  const acc = acceptedMeanings(asFacts);
  const shown = referenceGloss(asFacts) ?? acc[0];
  return shown && acc.length ? { shown, accepted: acc, base: true } : undefined;
}

const REASON: Record<string, string> = {
  unlisted: 'This word is not an entry of the word list or the dictionary (a fragment, a name or a guess from an ending), so it is not made a review card.',
  'no-meaning': 'The dictionary gives this word only a pointer to another entry, not a meaning, so it is not made a review card.',
  'undecided-entry': 'This spelling is more than one word in the dictionary and the spelling alone does not say which, so it is not made a review card.',
  'meaning-unreviewed': 'No one has checked that the first meaning the dictionary gives fits this word, so it is not added to review yet.',
  'form-meaning': 'The dictionary meaning found for this written form is not a meaning of its own word, so the form is not made a review card; the word itself is.',
  'word-held': 'The word this form belongs to is not made a review card, so neither is the form.',
  'form-two-words': 'This written form is more than one word in the word list, and a form alone has no sentence to say which, so the form is not made a review card; the word read in its sentence is.',
  'form-separable': 'A finite verb form can be half of a separable verb whose prefix stands at the end of the clause, which the written form alone does not show, so the form is not made a review card; the verb read in its sentence is.',
  'form-of-another': 'The dictionary also lists this spelling as a form of another word, and the spelling alone does not say which word it is here, so it is not made a review card.',
  'other-variety': 'This reading comes from another period of the language than the one being studied, so it is not made a review card.',
};

function held(facts: UnitFacts, kind: ReviewKind, reason: string): GatedFacts {
  return {
    ...facts, status: 'requires-review', unit: { ...facts.unit, status: 'requires-review' }, glosses: [], lexiconGlossCount: 0,
    lexicalRecognition: { status: 'withheld', reason }, reviewHold: { kind, reason },
  } as GatedFacts;
}

/** The facts with `head` shown first among the dictionary meanings (the word list's own meanings stay ahead of it). */
function withFirst(facts: UnitFacts, head: string): UnitFacts {
  const { lexicon, dictionary } = glossSplit(facts);
  return { ...facts, glosses: [...lexicon, head, ...dictionary.filter((g) => g !== head)] };
}

const lemmaUnitId = (lang: string, lemma: string, pos?: string): string => `lemma:${lang}:${lemma}${pos ? `:${pos}` : ''}`;

/** The first current sense of a dictionary answer in a word class (any class when none is given), a cross-reference followed once. */
async function firstMeaning(deps: DeckGateDeps, senses: readonly Sense[], pos: string | undefined): Promise<{ head?: string; kind?: 'no-meaning' | 'meaning-unreviewed' }> {
  const mine = senses.filter((s) => !pos || !s.pos || posCompatible(pos, s.pos)).filter((s) => hasMeaning(s.gloss));
  const first = mine.find(current) ?? mine[0];
  if (!first) return { kind: 'no-meaning' };
  if (isCrossReferenceOnly(first.gloss)) {
    const target = crossReferenceTarget(first.gloss)?.replace(/\s*\(.*$/u, '').replace(/^[“"']+|[”"']+$/gu, '').trim();
    if (target) {
      try {
        const d = await deps.gloss(target, pos ?? first.pos);
        const t = (d?.senses ?? []).filter((s) => !pos || !s.pos || posCompatible(pos, s.pos)).filter((s) => !isCrossReferenceOnly(s.gloss));
        const head = (t.find(current) ?? t[0]) ? senseHead((t.find(current) ?? t[0]).gloss) : undefined;
        if (head) return { head };
      } catch { /* the target could not be read: held below */ }
    }
    return { kind: 'no-meaning' };
  }
  const head = senseHead(first.gloss);
  return head ? { head } : { kind: 'meaning-unreviewed' };
}

export async function applyDeckGate(facts: UnitFacts | undefined, deps: DeckGateDeps): Promise<GatedFacts | undefined> {
  if (!facts) return facts;
  const id = facts.unit.unitId;
  const lang = deps.languageId;
  const isLemma = id.startsWith(`lemma:${lang}:`);
  const isForm = id.startsWith(`form:${lang}:`);
  if (!isLemma && !isForm) return facts;
  if (facts.status === 'invalidated' || facts.status === 'conflicted' || facts.status === 'requires-review' || facts.status === 'verified') return facts;
  if (facts.unit.provenance?.source === 'reviewer') return facts;
  const known = deps.known?.(id);
  if (known) return held(facts, 'known-limit', known);
  const meaning = cardMeaning(facts);
  if (!meaning) return facts; // nothing to build a meaning card from: the builder refuses it as before
  const f = facts as ReviewFacts;
  const { lexicon, dictionary } = glossSplit(facts);

  if (isLemma) {
    const lemma = facts.lemma ?? facts.unit.label;
    let senses: Sense[] | undefined;
    const read = async (): Promise<Sense[]> => {
      if (!senses) { try { const d = await deps.gloss(lemma, facts.pos); senses = d && !d.via ? d.senses : []; } catch { senses = []; } }
      return senses;
    };
    // (a) a real headword
    if (f.lemmaInWordList !== true && !(await read()).length) return held(facts, 'unlisted', REASON.unlisted);
    // (c') the learner's period, by the analyser's own period labels: a word no reading places in the period is another variety's word; a meaning taken
    // from another period's reading gives way to the period's own meaning, and is held when the period has none
    const pr = f.periodReading;
    if (pr && !pr.attested) return held(facts, 'other-variety', REASON['other-variety']);
    if (pr && !pr.inPeriod) {
      if (!pr.gloss) return held(facts, 'other-variety', REASON['other-variety']);
      const own = pr.gloss;
      const rest = facts.glosses.filter((g, i) => g !== own && !(i < lexicon.length));
      return applyDeckGate({ ...facts, glosses: [own, ...rest], lexiconGlossCount: 1, periodReading: { ...pr, inPeriod: true } } as UnitFacts, deps);
    }
    // (b) + (e) the first meaning
    if (lexicon.length && hasMeaning(lexicon[0])) {
      if (!isCrossReferenceOnly(meaning.shown)) {
        // a word list whose meanings were taken from the dictionary by machine: one that is a LATER sense of the entry gives way to the first current sense
        if (f.source !== 'dictionary') return facts;
        const all = await read();
        const mine = all.filter((s) => !facts.pos || !s.pos || posCompatible(facts.pos, s.pos)).filter((s) => hasMeaning(s.gloss));
        const first = mine.find(current) ?? mine[0];
        const at = mine.findIndex((s) => loose(s.gloss) === loose(lexicon[0]) || loose(senseHead(s.gloss) ?? '') === loose(lexicon[0]));
        if (!first || at < 0 || mine[at] === first) return facts;
        const head = senseHead(first.gloss);
        return head && loose(head) !== loose(lexicon[0]) ? { ...facts, glosses: [head, ...facts.glosses.filter((g) => g !== head)], lexiconGlossCount: lexicon.length + 1 } as UnitFacts : facts;
      }
      const target = crossReferenceTarget(meaning.shown);
      const d = target ? await deps.gloss(target, facts.pos).catch(() => undefined) : undefined;
      const m = d ? await firstMeaning(deps, d.senses, facts.pos) : { kind: 'no-meaning' as const };
      return m.head ? { ...facts, glosses: [m.head, ...facts.glosses.filter((g) => g !== m.head && !isCrossReferenceOnly(g))], lexiconGlossCount: 1 } as UnitFacts : held(facts, 'no-meaning', REASON['no-meaning']);
    }
    const all = await read();
    const m = await firstMeaning(deps, all.length ? all : dictionary.map((gloss) => ({ gloss })), facts.pos);
    if (!m.head) return held(facts, m.kind!, REASON[m.kind!]);
    if (m.head === meaning.shown) return facts;
    // a word-list meaning that is only a grammar note gives way to the dictionary's first meaning
    return lexicon.length ? { ...facts, glosses: [m.head, ...dictionary.filter((g) => g !== m.head)], lexiconGlossCount: 0 } as UnitFacts : withFirst(facts, m.head);
  }

  // ── a form ──
  // A form unit has no sentence: it stands for every occurrence of its spelling, with the capital lost. A spelling the pack's forms index lists under more than one
  // word (German linken: the verb, the adjective link, the nouns Linke and Linker; Gebühren, the plural of Gebühr, beside the verb gebühren) is not decided by
  // the spelling when the reading of it is only a GUESS (a rule's, with no entry of the pack's own word list behind it). A reading the word list confirms stands
  // as it did (Spanish agua is the noun, whatever aguar's forms are); so does one headword listed under two classes (und), and a place name beside a common word.
  let listed: Array<{ lemma: string; pos?: string }> = [];
  const guessed = !facts.lemma || facts.unit.provenance?.source === 'rule' || facts.unit.provenance?.source === 'parser';
  if (guessed && !ATTESTED_FORMS.has(lang)) { try { listed = (await deps.formIdentities?.(facts.unit.label)) ?? []; } catch { listed = []; } }
  const commonListed = listed.some((h) => h.pos !== 'PROPN') ? listed.filter((h) => h.pos !== 'PROPN') : listed;
  const words = new Set(commonListed.map((h) => h.lemma.normalize('NFC')));
  if (words.size > 1) return held(facts, 'undecided-entry', REASON['form-of-another']);
  const lemma = meaning.base ? facts.lexicalRecognition?.lemma : facts.lemma;
  const pos = meaning.base ? facts.lexicalRecognition?.pos ?? facts.pos : facts.pos;
  if (!ATTESTED_FORMS.has(lang)) {
    // The analyser's own word list reads this spelling as another word too (Bokmål lære: the verb "to learn" and the noun "doctrine"; Spanish tarde: "afternoon" and
    // "late"). In a sentence the analyser decides, and the word's lemma card is made from that; a form card has no sentence, and showed whichever word the
    // spelling read alone came out as.
    if ((f.alternativeReadings ?? []).length > 0) return held(facts, 'undecided-entry', REASON['form-two-words']);
    // German: a finite form of a simple verb may be the stem half of a separable verb (holt … ab is abholen, not holen); a verb that carries its prefix already is itself
    const verbal = pos === 'VERB' || pos === 'AUX';
    const finite = facts.features?.VerbForm === 'Fin' || !!facts.features?.Person || (meaning.base && !/^ge|en$|end$/u.test(facts.unit.label));
    if (SEPARABLE_PREFIXES[lang] && verbal && !!lemma && !carriesPrefix(lang, lemma) && facts.unit.label.normalize('NFC').toLowerCase() !== lemma.normalize('NFC').toLowerCase() && finite) return held(facts, 'undecided-entry', REASON['form-separable']);
  }
  if (lemma) {
    // (e) a form card shows a meaning of its own word, or it is not a card; (a)–(d) are its word's
    const own = await deps.factsOf(lemmaUnitId(lang, lemma, pos)).catch(() => undefined);
    if (own?.reviewHold) return held(facts, own.reviewHold.kind, REASON['word-held']);
    const ownMeaning = own && own.status !== 'conflicted' && own.status !== 'invalidated' && own.status !== 'requires-review' ? cardMeaning(own) : undefined;
    if (ATTESTED_FORMS.has(lang)) {
      // the form's meaning is its lemma's by construction (an attested form source): only a pointer shown as the meaning is refused
      return isCrossReferenceOnly(meaning.shown) ? held(facts, 'no-meaning', REASON['no-meaning']) : facts;
    }
    if (!ownMeaning) return held(facts, own ? 'undecided-entry' : 'unlisted', REASON['word-held']);
    if (loose(meaning.shown) === loose(ownMeaning.shown)) return facts;
    // a base-meaning card asks for the meaning of the form's word: it shows what the word's own card shows first
    if (meaning.base) return { ...facts, lexicalRecognition: { ...facts.lexicalRecognition!, glosses: [ownMeaning.shown, ...facts.lexicalRecognition!.glosses!.filter((g) => g !== ownMeaning.shown)] } };
    // an inflected form with a meaning of its own that its word's card shows too (oss "us" beside vi "we; us"): the same word, a meaning of its own
    const partsOf = (s: string): string[] => withoutBrackets(s).split(/[;,/]/u).map((x) => loose(x)).filter(Boolean);
    const firstPart = partsOf(meaning.shown)[0];
    if (firstPart && partsOf(ownMeaning.shown).includes(firstPart)) return facts;
    const mine = new Set([meaning.shown, ...meaning.accepted].map(loose));
    const theirs = new Set([ownMeaning.shown, ...ownMeaning.accepted].map(loose));
    const agrees = theirs.has(loose(meaning.shown)) || mine.has(loose(ownMeaning.shown));
    // the citation form itself, with the dictionary's meanings of the same word in another order: the form card shows what the word's own card shows first
    const citation = facts.unit.label.normalize('NFC').toLowerCase() === lemma.normalize('NFC').toLowerCase();
    if (agrees && citation && !lexicon.length) return withFirst(facts, ownMeaning.shown);
    return held(facts, 'meaning-unreviewed', REASON['form-meaning']);
  }
  // a written form with no reading: its meaning is the dictionary's entry of that spelling
  let senses: Sense[] = [];
  try { const d = await deps.gloss(facts.unit.label, facts.pos); senses = d && !d.via ? d.senses : []; } catch { senses = []; }
  if (!senses.length) return held(facts, 'unlisted', REASON.unlisted);
  // (c) a spelling the forms index lists under another word too is not decided by the spelling: a form unit has lost its capital, so German Gebühren (the plural
  // of Gebühr) found the verb gebühren, and Zwiebeln the verb zwiebeln (a place name beside a common word does not count, as below)
  const another = commonListed.some((h) => h.lemma.normalize('NFC').toLowerCase() !== facts.unit.label.normalize('NFC').toLowerCase());
  if (another) return held(facts, 'undecided-entry', REASON['form-of-another']);
  // (c) a spelling the dictionary files under several word classes is not decided by the spelling (a place name beside a common word does not count)
  const common = senses.filter((s) => s.pos !== 'PROPN' && current(s) && !isCrossReferenceOnly(s.gloss));
  const pool = common.length ? common : senses;
  const classes = [...new Set(pool.map((s) => s.pos ?? ''))];
  if (classes.filter(Boolean).length > 1 && !classes.every((c) => !c || posCompatible(classes.find(Boolean)!, c))) return held(facts, 'undecided-entry', REASON['undecided-entry']);
  const m = await firstMeaning(deps, pool, undefined);
  if (!m.head) return held(facts, m.kind!, REASON[m.kind!]);
  return m.head === meaning.shown ? facts : withFirst(facts, m.head);
}
