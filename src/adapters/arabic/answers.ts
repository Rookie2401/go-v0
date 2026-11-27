/**
 * What an Arabic lemma card may take from the dictionary (2026-11-26, after the independent reader of the second text):
 *
 *  (a) ONE HEADWORD. The level-1 dictionary is keyed by the UNVOCALIZED spelling, so it holds the senses of every word written alike (أَب "father", أَبّ "fodder";
 *      بَلَغَ "to reach", بَلَّغَ "to inform"), and it names a headword only by a romanization whose vowels cannot tell a doubled letter from a single one. The
 *      FULL records carry the vocalized canonical head. An Arabic lemma card therefore takes dictionary senses ONLY from the full records whose vocalized head
 *      (through arHeadForm) AND part of speech are the unit's; a bound form (canonical head written with a leading or trailing dash: ـهُمَا "them, their") is
 *      another headword; a record with no vocalized head gives nothing.
 *  (b) ONLY MEANINGS. An alternative of a sense that is no meaning is dropped: Arabic script inside it, a colon (a usage note: "enjoined: followed by على"),
 *      "etc.", a pointer ("plural of ..."), a bare grammar word ("plural"), a usage
 *      description ("In reduplication, ...", "having a copulative effect"), a bare function word ("with", "and") of an open-class word, and everything after "e.g." (examples).
 *      Transliterations of an English name of a thing (qanun, kanoon, ganoun for the instrument; husainiya) are genuine meanings and are kept.
 *      Language-neutral pointers are read by src/core/review-meaning.ts (isCrossReferenceOnly), which is reused.
 * A later sense of the word's OWN entry that a reader thinks wrong is not decided here: answer-exclusions.json is the reviewed table for that.
 */
import { isCrossReferenceOnly } from '../../core/review-meaning';
import { arHeadForm } from './text';

export interface ArFullRecord { p?: string; f?: Array<{ f: string; t: string[] }>; s?: Array<{ g: string }> }

const GRAMMAR_WORD = /^(?:plural|singular|dual|feminine|masculine|collective|verbal noun|masdar|passive|active|imperative|infinitive|participle|elative|comparative|superlative|construct|definite|indefinite|nominative|genitive|accusative)$/iu;
const USAGE_NOTE = /^(?:in reduplication\b|used (?:to|in|with|for|as|after|before|when|of)\b|followed by\b|usually\b|often\b|especially\b|with (?:the )?(?:genitive|accusative|nominative|jussive|subjunctive|preposition)\b|expresses\b|denotes\b|as in\b|indicates\b|introduces\b|marks\b)/iu;
/** A word that is no meaning of an open-class word whatever it stands alone as ("to become acquainted, with, to meet" cut at its commas leaves "with"). */
const FUNCTION_WORD = /^(?:and|or|with|the|a|an|of|to|in|on|at|by|for|from|as|if|then|but|so|that|which|who)$/iu;
/** A description of the word's grammar, not a meaning ("having a copulative effect, usually inserted when ..."). */
const GRAMMAR_NOTE = /\b(?:copulative|inserted when|grammatical|syntactic(?:ally)?)\b/iu;
/** From here a sense gives examples, not meanings ("to break, tear, e.g., a rope, a string"). */
const EXAMPLE_CUT = /,?\s*\b(?:e\.g\.|i\.e\.|for example|for instance|such as)\s*,?/iu;
const bare = (s: string): string => s.replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' ').replace(/\s+/gu, ' ').trim();

/** True when this alternative of a sense is no meaning of the word (see (b) above). */
export function isFragmentAlternative(alt: string, opts: { functionWords?: boolean } = {}): boolean {
  const a = alt.trim();
  if (!a || !/\p{L}/u.test(a)) return true;
  if (/\p{Script=Arabic}/u.test(a) || a.includes(':') || /\betc\b/iu.test(a)) return true;
  const b = bare(a);
  if (!b) return true;
  if (GRAMMAR_WORD.test(b) || USAGE_NOTE.test(b) || GRAMMAR_NOTE.test(b) || isCrossReferenceOnly(a)) return true;
  if (opts.functionWords !== false && FUNCTION_WORD.test(b)) return true;
  return false;
}

/** A sense with its fragment alternatives taken out ("a, b; c" keeps its separators); empty when nothing is left. */
/** The words of an item outside its brackets. */
const wordsOutside = (item: string): number => bare(item).split(/\s+/u).filter(Boolean).length;
const MAX_ITEM_WORDS = 4;

/**
 * A sense with its fragment alternatives taken out ("a, b; c" keeps its separators); empty when nothing is left. Each comma- or semicolon-separated item is
 * judged on its own: an item of more than four words (a definition: "the time from sunrise to noon") is dropped when the same sense has short items beside it ("morning"),
 * so one long item no longer takes the whole list with it. Not when a short item is capitalised (a name: "a city in Egypt, Africa" is prose, not a list).
 */
export function arCleanSense(sense: string, opts: { functionWords?: boolean } = {}): string {
  const cut = sense.search(EXAMPLE_CUT);
  if (cut >= 0) sense = sense.slice(0, cut);
  // a final full stop is the sentence's, not the meaning's ("the lift(s)." would leave "the lift ." once its aside is taken out)
  const parts = sense.split(/\s*;\s*/u).map((part) => part.split(/\s*,\s*/u).filter((alt) => !isFragmentAlternative(alt, opts)).map((alt) => alt.replace(/[.\s]+$/u, '')));
  const all = parts.flat();
  const shortItems = all.filter((x) => wordsOutside(x) <= MAX_ITEM_WORDS);
  const dropLong = shortItems.length > 0 && shortItems.length < all.length && shortItems.every((x) => !/^\p{Lu}/u.test(x));
  const kept = dropLong ? parts.map((p) => p.filter((x) => wordsOutside(x) <= MAX_ITEM_WORDS)) : parts;
  return kept.map((p) => p.join(', ')).filter(Boolean).join('; ').trim();
}

const canonicalOf = (r: ArFullRecord): string | undefined => r.f?.find((x) => x.t.includes('canonical'))?.f;
/** A canonical head written with a dash or tatweel at either end is a bound form (a suffix, a prefix), another headword. */
const isBound = (head: string): boolean => /^[ـ-]|[ـ-]$/u.test(head.trim());

/** The full records that are THIS unit's headword: the vocalized canonical head (through arHeadForm) and the part of speech both agree. */
export function arUnitRecords(records: readonly ArFullRecord[], lemma: string, pos: string | undefined, posCompatible: (a: string, b: string) => boolean): ArFullRecord[] {
  const want = arHeadForm(lemma, pos ?? 'X');
  return records.filter((r) => {
    const c = canonicalOf(r);
    if (!c || isBound(c)) return false;
    if (pos && r.p && !posCompatible(pos, r.p)) return false;
    return arHeadForm(c, r.p ?? pos ?? 'X') === want;
  });
}
