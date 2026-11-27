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
 *      description ("In reduplication, ..."). Language-neutral pointers are read by src/core/review-meaning.ts (isCrossReferenceOnly), which is reused.
 * A later sense of the word's OWN entry that a reader thinks wrong is not decided here: answer-exclusions.json is the reviewed table for that.
 */
import { isCrossReferenceOnly } from '../../core/review-meaning';
import { arHeadForm } from './text';

export interface ArFullRecord { p?: string; f?: Array<{ f: string; t: string[] }>; s?: Array<{ g: string }> }

const GRAMMAR_WORD = /^(?:plural|singular|dual|feminine|masculine|collective|verbal noun|masdar|passive|active|imperative|infinitive|participle|elative|comparative|superlative|construct|definite|indefinite|nominative|genitive|accusative)$/iu;
const USAGE_NOTE = /^(?:in reduplication\b|used (?:to|in|with|for|as|after|before|when|of)\b|followed by\b|usually\b|often\b|especially\b|with (?:the )?(?:genitive|accusative|nominative|jussive|subjunctive|preposition)\b|expresses\b|denotes\b|as in\b|indicates\b|introduces\b|marks\b)/iu;
const bare = (s: string): string => s.replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' ').replace(/\s+/gu, ' ').trim();

/** True when this alternative of a sense is no meaning of the word (see (b) above). */
export function isFragmentAlternative(alt: string): boolean {
  const a = alt.trim();
  if (!a || !/\p{L}/u.test(a)) return true;
  if (/\p{Script=Arabic}/u.test(a) || a.includes(':') || /\betc\b/iu.test(a)) return true;
  const b = bare(a);
  if (!b) return true;
  if (GRAMMAR_WORD.test(b) || USAGE_NOTE.test(b) || isCrossReferenceOnly(a)) return true;
  return false;
}

/** A sense with its fragment alternatives taken out ("a, b; c" keeps its separators); empty when nothing is left. */
export function arCleanSense(sense: string): string {
  // a final full stop is the sentence's, not the meaning's ("the lift(s)." would leave "the lift ." once its aside is taken out)
  return sense.split(/\s*;\s*/u).map((part) => part.split(/\s*,\s*/u).filter((alt) => !isFragmentAlternative(alt)).map((alt) => alt.replace(/[.\s]+$/u, '')).join(', ')).filter(Boolean).join('; ').trim();
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
