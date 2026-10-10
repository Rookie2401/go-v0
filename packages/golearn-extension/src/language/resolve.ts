/**
 * The language resolver: ONE answer to "which language is this selection in?", with its basis and its reasons.
 *
 * The ladder, strongest first; the first rung that decides ends it:
 *
 *   1. override            the learner's explicit choice (a language id or a tag such as es-HN). Never second-guessed.
 *   2. book-metadata       what the book declares (an OPF dc:language ...), when its confidence is at least 0.8.
 *   3. document-metadata   what the page declares near the selection (element lang, html lang, a language meta tag),
 *                          when its confidence is at least 0.6 and it is not a URL guess. A weaker declaration
 *                          (og:locale, a locale in the URL) is mentioned in the reasons and decides nothing.
 *   4. detection           from the SAMPLE only, and only with at least 3 words: Thai script is Thai; Devanagari is
 *                          Hindi when the Hindi word list recognises enough of it (Marathi, Nepali and Sanskrit share the
 *                          script); Latin script is a lexicon-hit comparison across the INSTALLED packs' word lists,
 *                          which must clear a floor and a margin. A tie, a thin win or a single ambiguous word is
 *                          'undetermined': the resolver prefers saying nothing to guessing.
 *   5. team-default        the language of the learner's enrolment. A default, not evidence: confidence 0.3.
 *
 * A declared language is mapped through a BCP-47 table (below). A tag that names a language with no pack is skipped with
 * a reason (an English page does not stop the ladder); a tag that is ambiguous (no = Bokmål or Nynorsk; hi-Latn =
 * Hindi in Latin script, which no pack analyses; gsw = Swiss German, which is not Standard German) decides nothing, with
 * one exception: a bare Norwegian "no" is read as the one Norwegian pack the learner has installed when exactly one of nb / nn
 * is installed (the learner's own choice of a written standard decides it, at a lowered confidence, and the reasons say so);
 * with both installed, or neither, "no" decides nothing and the sample or the enrolment must; a
 * tag that names a pack language that is NOT installed ends the ladder with 'undetermined' and says so, because reading
 * a page in another language with the learner's default pack would produce confident nonsense.
 *
 * When metadata decides but the sample clearly looks like another installed language, the answer keeps the metadata's
 * language, drops its confidence to 0.55 and says that the text disagrees.
 *
 * A page or book that declares a language no pack covers (an English-labelled Albanian site) blocks the team default,
 * unless the sample is plainly compatible with the chosen language (DEFAULT_COMPATIBLE_SHARE); then the default is used
 * at its usual confidence, with the share in the reasons.
 *
 * The evidence is metadata and a short sample: the selected surface plus, since 2026-10-09, up to 400 characters of the
 * block around it (the controller reads it from the page for this purpose only); it never contains a whole page or a book,
 * and nothing here keeps or sends it. Pure: no DOM, no storage, no network.
 */
import type { LanguageAdapter } from '../../../../src/core';
import type { LanguageEvidence, LanguageResolution, ResolveLanguage } from '../contract/language';
import { parserAdapter } from '../parser';

export type { LanguageEvidence, LanguageResolution, ResolveLanguage } from '../contract/language';

// ───────────────────────────── thresholds (all stated, all tested) ─────────────────────────────

/** Book metadata is reliable at this confidence or above. */
export const BOOK_MIN_CONFIDENCE = 0.8;
/** Document metadata is reliable at this confidence or above (a URL guess never is). */
export const DOCUMENT_MIN_CONFIDENCE = 0.6;
/** Fewer word tokens than this is never enough to detect a language. */
export const MIN_TOKENS = 3;
/** A language must recognise at least this share of the sample's words... */
export const MIN_TOP_SHARE = 0.6;
/** ...and at least this many words... */
export const MIN_HITS = 3;
/** ...and beat the runner-up by at least this much of the sample. */
export const MIN_MARGIN = 0.25;
/** Share of the letters that must be in one script for the script to decide. */
export const MIN_SCRIPT_SHARE = 0.6;
/** Devanagari is accepted as Hindi when the Hindi word list recognises at least this share of the words. */
export const MIN_HINDI_SHARE = 0.5;
/** Confidence given to the team default: a default, not evidence. */
export const TEAM_DEFAULT_CONFIDENCE = 0.3;
/**
 * A page that declares a language no pack covers (an Albanian site with html lang="en") blocks the learner's chosen language,
 * unless the chosen language's word list recognises at least this share of the words around the selection (and MIN_HITS of them).
 * Measured 2026-10-09 (scripts/probe-resolver-share.mts): each pack recognises 70–100 % of its own language's prose and at most
 * 38 % of foreign prose (English against Albanian: 7–22 %), so 45 % separates "compatible" from "another language".
 */
export const DEFAULT_COMPATIBLE_SHARE = 0.45;
const MAX_SAMPLE_CHARS = 1200;
const MAX_SAMPLE_TOKENS = 150;

// ───────────────────────────── the BCP-47 -> pack-language table ─────────────────────────────

/** The varieties a pack lists, by language (agrees with the manifests; test/reader-languages/resolve.test.ts compares). */
export const PACK_VARIETIES: Readonly<Record<string, readonly string[]>> = {
  sq: ['sq-standard'],
  es: ['es-HN', 'es-419', 'es-ES'],
  de: ['de-DE', 'de-AT', 'de-CH'],
  hi: ['hi-standard'],
  th: ['th-standard'],
  nb: ['nb', 'nb-riksmal'],
  nn: ['nn', 'nn-landsmal'],
};
/** The script each pack's language is written in; a tag that states another script (hi-Latn) names something no pack analyses. */
const PACK_SCRIPT: Readonly<Record<string, string>> = { sq: 'latn', es: 'latn', de: 'latn', hi: 'deva', th: 'thai', nb: 'latn', nn: 'latn' };

const PRIMARY: Readonly<Record<string, string>> = {
  sq: 'sq', sqi: 'sq', als: 'sq', aln: 'sq',
  de: 'de', deu: 'de', ger: 'de',
  es: 'es', spa: 'es',
  th: 'th', tha: 'th',
  hi: 'hi', hin: 'hi',
  nb: 'nb', nob: 'nb',
  nn: 'nn', nno: 'nn',
};
/** Tags that look like a pack language but are not the pack's language. */
const NOT_THE_PACK: Readonly<Record<string, string>> = {
  gsw: 'Swiss German is its own language, not Standard German',
  bar: 'Bavarian is its own language, not Standard German',
  nds: 'Low German is its own language, not Standard German',
  ast: 'Asturian is its own language, not Spanish',
  gl: 'Galician is its own language, not Spanish',
  ca: 'Catalan is its own language, not Spanish',
  mr: 'Marathi is its own language, not Hindi (it shares the script)',
  ne: 'Nepali is its own language, not Hindi (it shares the script)',
  sa: 'Sanskrit is not Hindi (it shares the script)',
  awa: 'Awadhi is its own language, read beside Hindi, not analysed as Hindi',
  bra: 'Braj is its own language, read beside Hindi, not analysed as Hindi',
};
const NORWEGIAN_UNSPECIFIED = new Set(['no', 'nor']);
/** Confidence given to a bare "no" that the learner's single installed Norwegian pack settles: below what a declared nb or nn gets. */
export const NORWEGIAN_UNSPECIFIED_CONFIDENCE = 0.6;
/** True for a tag that says Norwegian without a written standard ("no", "no-NO", "nor"). */
export const isUnspecifiedNorwegian = (tag: string): boolean => NORWEGIAN_UNSPECIFIED.has(tag.trim().toLowerCase().replace(/_/gu, '-').split('-')[0] ?? '');
const LATIN_AMERICAN_REGIONS = new Set(['419', 'mx', 'ar', 'bo', 'cl', 'co', 'cr', 'cu', 'do', 'ec', 'gt', 'ni', 'pa', 'pe', 'pr', 'py', 'sv', 'uy', 've', 'us']);

export type TagMapping =
  | { kind: 'pack'; languageId: string; varietyId?: string; notes: string[] }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'no-pack'; reason: string };

/** Maps a language id or BCP-47 tag (`es-HN`, `de_AT`, `hi-Latn`, `no`) to a pack language, an ambiguity, or "no pack". */
export function mapLanguageTag(tag: string): TagMapping {
  const parts = tag.trim().toLowerCase().replace(/_/gu, '-').split('-').filter(Boolean);
  const primary = parts[0] ?? '';
  if (!/^[a-z]{2,3}$/u.test(primary)) return { kind: 'no-pack', reason: `"${tag}" is not a language tag` };
  const rest = parts.slice(1);
  const script = rest.find((p) => /^[a-z]{4}$/u.test(p));
  const region = rest.find((p) => /^([a-z]{2}|\d{3})$/u.test(p));

  if (NORWEGIAN_UNSPECIFIED.has(primary)) {
    return { kind: 'ambiguous', reason: 'Norwegian is written in two standards, Bokmål (nb) and Nynorsk (nn); "no" does not say which, and neither is assumed' };
  }
  if (NOT_THE_PACK[primary]) return { kind: 'ambiguous', reason: NOT_THE_PACK[primary] };
  const languageId = PRIMARY[primary];
  if (!languageId) return { kind: 'no-pack', reason: `no language pack covers "${primary}"` };
  if (script && script !== PACK_SCRIPT[languageId]) {
    return { kind: 'ambiguous', reason: `"${tag}" is ${primary} written in ${script.toUpperCase()} script; the ${languageId} pack analyses the ${PACK_SCRIPT[languageId].toUpperCase()} script only` };
  }
  const notes: string[] = [];
  if (primary === 'aln') notes.push('Gheg is related to Standard Albanian, not analysed as a variety of its own');
  if (primary === 'als') notes.push('Tosk is the base of Standard Albanian');

  let varietyId: string | undefined;
  if (languageId === 'es' && region) {
    if (region === 'hn') varietyId = 'es-HN';
    else if (region === 'es') varietyId = 'es-ES';
    else if (LATIN_AMERICAN_REGIONS.has(region)) { varietyId = 'es-419'; if (region !== '419') notes.push(`${region.toUpperCase()} is read as Latin American Spanish (es-419); the pack has no variety of its own for it`); }
  } else if (languageId === 'de' && region) {
    const v = `de-${region.toUpperCase()}`;
    if (PACK_VARIETIES.de.includes(v)) varietyId = v;
  }
  return { kind: 'pack', languageId, ...(varietyId ? { varietyId } : {}), notes };
}

// ───────────────────────────── detection ─────────────────────────────

const wordSegmenter = (() => { let s: Intl.Segmenter | undefined; return () => (s ??= new Intl.Segmenter('und', { granularity: 'word' })); })();

/** Word-like tokens of a sample (the first MAX_SAMPLE_TOKENS of the first MAX_SAMPLE_CHARS characters). */
function sampleWords(sample: string): string[] {
  const out: string[] = [];
  for (const s of wordSegmenter().segment(sample.slice(0, MAX_SAMPLE_CHARS).normalize('NFC'))) {
    if (s.isWordLike) { out.push(s.segment); if (out.length >= MAX_SAMPLE_TOKENS) break; }
  }
  return out;
}

interface ScriptShare { latin: number; thai: number; devanagari: number; letters: number }
function scriptShare(sample: string): ScriptShare {
  const r: ScriptShare = { latin: 0, thai: 0, devanagari: 0, letters: 0 };
  for (const ch of sample.slice(0, MAX_SAMPLE_CHARS)) {
    if (!/\p{L}/u.test(ch)) continue;
    r.letters++;
    if (/\p{Script=Latin}/u.test(ch)) r.latin++;
    else if (/\p{Script=Thai}/u.test(ch)) r.thai++;
    else if (/\p{Script=Devanagari}/u.test(ch)) r.devanagari++;
  }
  return r;
}

/** The share of the sample's words the adapter's word list recognises: a reading that is not an inferred (unconfirmed) one. */
function wordListShare(adapter: LanguageAdapter, sample: string): { hits: number; words: number; share: number } {
  const toks = adapter.tokenize(sample.slice(0, MAX_SAMPLE_CHARS).normalize('NFC'));
  const words = toks.filter((t) => t.isWord).length;
  if (!words) return { hits: 0, words: 0, share: 0 };
  const hits = adapter.analyze(toks).filter((a) => a.token.isWord && a.candidates.some((c) => !c.unconfirmed)).length;
  return { hits, words, share: hits / words };
}

interface Detection { languageId?: string; confidence: number; reasons: string[] }

const r2 = (n: number): number => Math.round(n * 100) / 100;

function detect(sample: string, installed: ReadonlySet<string>, adapterOf: (l: string) => LanguageAdapter | undefined): Detection {
  const words = sampleWords(sample);
  if (words.length < MIN_TOKENS) {
    return { confidence: 0, reasons: [`the sample has ${words.length} word${words.length === 1 ? '' : 's'}; fewer than ${MIN_TOKENS} is never enough to detect a language (a single word can belong to several)`] };
  }
  const sh = scriptShare(sample);
  const share = (n: number): number => (sh.letters ? n / sh.letters : 0);

  if (share(sh.thai) >= MIN_SCRIPT_SHARE) {
    if (!installed.has('th')) return { confidence: 0, reasons: ['the sample is in Thai script, but the Thai pack is not installed'] };
    return { languageId: 'th', confidence: 0.9, reasons: ['the sample is in Thai script, which none of the other packs uses'] };
  }
  if (share(sh.devanagari) >= MIN_SCRIPT_SHARE) {
    if (!installed.has('hi')) return { confidence: 0, reasons: ['the sample is in Devanagari script, but the Hindi pack is not installed'] };
    const hi = adapterOf('hi');
    if (!hi) return { confidence: 0, reasons: ['the sample is in Devanagari script, which Hindi shares with Marathi, Nepali and Sanskrit, and no Hindi word list available (it is not loaded) to tell them apart'] };
    const w = wordListShare(hi, sample);
    if (w.share >= MIN_HINDI_SHARE) {
      return { languageId: 'hi', confidence: r2(Math.min(0.8, 0.5 + w.share / 2)), reasons: [`the sample is in Devanagari script and the Hindi word list recognises ${w.hits} of ${w.words} words (the script is shared with Marathi, Nepali and Sanskrit, so the word list is what supports Hindi)`] };
    }
    return { confidence: 0, reasons: [`the sample is in Devanagari script, but the Hindi word list recognises only ${w.hits} of ${w.words} words: it may be Marathi, Nepali, Sanskrit, or Hindi outside the word list`] };
  }
  if (share(sh.latin) < MIN_SCRIPT_SHARE) {
    return { confidence: 0, reasons: ['the sample is not mainly in one script this resolver can compare (Latin, Thai or Devanagari)'] };
  }

  // Latin script: a lexicon-hit comparison across the installed packs that have a word list.
  const candidates: Array<{ id: string; hits: number; words: number; share: number }> = [];
  const skipped: string[] = [];
  for (const id of [...installed].sort()) {
    const a = adapterOf(id);
    if (!a) { skipped.push(`${id} (no word list available)`); continue; }
    if (a.script !== 'Latn') continue;
    candidates.push({ id, ...wordListShare(a, sample) });
  }
  const reasons: string[] = [];
  if (skipped.length) reasons.push(`not compared: ${skipped.join(', ')}`);
  if (candidates.length === 0) return { confidence: 0, reasons: [...reasons, 'no installed Latin-script pack has a word list to compare the sample against'] };
  candidates.sort((a, b) => b.share - a.share || b.hits - a.hits || a.id.localeCompare(b.id));
  const top = candidates[0];
  const second = candidates[1];
  const margin = top.share - (second?.share ?? 0);
  const table = candidates.map((c) => `${c.id} ${c.hits}/${c.words}`).join(', ');
  if (top.share < MIN_TOP_SHARE || top.hits < MIN_HITS) {
    return { confidence: 0, reasons: [...reasons, `no installed pack recognises enough of the sample (${table}); the floor is ${Math.round(MIN_TOP_SHARE * 100)}% of the words and at least ${MIN_HITS}`] };
  }
  if (margin < MIN_MARGIN) {
    return { confidence: 0, reasons: [...reasons, `the best two packs are too close to call (${table}); the winner must lead by ${Math.round(MIN_MARGIN * 100)}% of the words${second ? `, and ${top.id} leads ${second.id} by ${Math.round(margin * 100)}%` : ''}`] };
  }
  return {
    languageId: top.id,
    confidence: r2(Math.min(0.85, 0.35 + 0.3 * top.share + 0.4 * margin)),
    reasons: [...reasons, `the ${top.id} word list recognises ${top.hits} of ${top.words} words and leads the runner-up by ${Math.round(margin * 100)}% (${table})`],
  };
}

/** Is the sample plainly in the learner's chosen language? (Only asked when a declaration names a language no pack covers.) */
function defaultCompatibility(tag: string, sample: string, installed: ReadonlySet<string>, adapterOf: (l: string) => LanguageAdapter | undefined): { ok: boolean; reason: string } {
  const m = mapLanguageTag(tag);
  if (m.kind !== 'pack' || !installed.has(m.languageId)) return { ok: false, reason: `the chosen language "${tag}" is not an installed pack, so the text could not be checked against it` };
  const adapter = adapterOf(m.languageId);
  if (!adapter) return { ok: false, reason: `the ${m.languageId} word list is not loaded, so the text could not be checked against the chosen language` };
  const words = sampleWords(sample);
  if (words.length < MIN_TOKENS) return { ok: false, reason: `the text around the selection has ${words.length} word${words.length === 1 ? '' : 's'}; fewer than ${MIN_TOKENS} cannot show that it is ${m.languageId}` };
  const w = wordListShare(adapter, sample);
  const need = Math.round(DEFAULT_COMPATIBLE_SHARE * 100);
  if (w.share >= DEFAULT_COMPATIBLE_SHARE && w.hits >= MIN_HITS) {
    return { ok: true, reason: `the page's declared language has no pack, but the ${m.languageId} word list recognises ${w.hits} of ${w.words} words around the selection (at least ${need}% needed), so the learner's chosen language is used` };
  }
  return { ok: false, reason: `the ${m.languageId} word list recognises only ${w.hits} of ${w.words} words around the selection (at least ${need}% needed to use the chosen language on a page declared as another)` };
}

// ───────────────────────────── the resolver ─────────────────────────────

export interface ResolverOptions {
  /** Word lists beyond the parser's. The parser's own registry already holds every language whose analyser chunk has been loaded (Norwegian Bokmål and Nynorsk included); this is for a caller that holds one the parser does not. */
  adapters?: Readonly<Record<string, LanguageAdapter>>;
}

const undetermined = (reasons: string[]): LanguageResolution => ({ confidence: 0, basis: 'undetermined', reasons });

export function createLanguageResolver(options: ResolverOptions = {}): ResolveLanguage {
  const adapterOf = (id: string): LanguageAdapter | undefined =>
    (options.adapters && Object.prototype.hasOwnProperty.call(options.adapters, id) ? options.adapters[id] : undefined) ?? parserAdapter(id);

  return function resolveLanguage(evidence: LanguageEvidence): LanguageResolution {
    const installed = new Set((evidence.installed ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean));
    const reasons: string[] = [];
    let declaredNoPack: string | undefined;

    /** A declared language, mapped; returns a final answer, or undefined to let the ladder go on. */
    const fromDeclared = (tag: string, what: string, basis: LanguageResolution['basis'], confidence: number): LanguageResolution | undefined => {
      const m = mapLanguageTag(tag);
      if (m.kind === 'ambiguous') {
        if (isUnspecifiedNorwegian(tag)) {
          const have = (['nb', 'nn'] as const).filter((l) => installed.has(l));
          if (have.length === 1) {
            return {
              languageId: have[0], confidence: Math.min(r2(confidence), NORWEGIAN_UNSPECIFIED_CONFIDENCE), basis,
              reasons: [...reasons, `${what} "${tag}", which is Norwegian without a written standard; ${have[0] === 'nb' ? 'Bokmål' : 'Nynorsk'} (${have[0]}) is the only Norwegian pack installed, so the learner's own choice of pack decides it`],
            };
          }
        }
        reasons.push(`${what} "${tag}" decides nothing: ${m.reason}`);
        return undefined;
      }
      if (m.kind === 'no-pack') {
        // A reliable declaration of a language no pack covers is evidence against the team default: detection may still
        // recognise a mislabelled page from real text, but the ladder never ends in the team language (certification
        // finding: an English Bible page was parsed as Albanian).
        declaredNoPack = `${what} "${tag}" names no language this build has a pack for (${m.reason})`;
        reasons.push(declaredNoPack);
        return undefined;
      }
      if (!installed.has(m.languageId)) {
        return undetermined([...reasons, `${what} "${tag}" names ${m.languageId}, but the ${m.languageId} pack is not installed, so nothing is read with another language's word list`]);
      }
      return {
        languageId: m.languageId, ...(m.varietyId ? { varietyId: m.varietyId } : {}), confidence: r2(confidence), basis,
        reasons: [...reasons, `${what} "${tag}" is ${m.languageId}${m.varietyId ? ` (variety ${m.varietyId})` : ''}`, ...m.notes],
      };
    };

    /** Metadata decided: let the text, if it clearly says otherwise, lower the confidence and say so. */
    const checkedAgainstText = (r: LanguageResolution): LanguageResolution => {
      if (!evidence.sample) return r;
      const d = detect(evidence.sample, installed, adapterOf);
      if (d.languageId && d.languageId !== r.languageId && d.confidence >= 0.6) {
        return { ...r, confidence: Math.min(r.confidence, 0.55), reasons: [...r.reasons, `the text itself looks like ${d.languageId}, not ${r.languageId} (${d.reasons.at(-1)}): the declared language is kept but is less certain`] };
      }
      return r;
    };

    // 1. override
    if (evidence.override) {
      const r = fromDeclared(evidence.override, 'the learner chose', 'override', 1);
      return r ?? undetermined([...reasons, 'the learner’s choice could not be matched to an installed pack']);
    }

    // 2. book metadata
    if (evidence.bookLanguage) {
      const b = evidence.bookLanguage;
      if (b.confidence >= BOOK_MIN_CONFIDENCE) {
        const r = fromDeclared(b.tag ?? b.languageId, `the book (${b.source}) declares`, 'book-metadata', b.confidence);
        if (r) return r.basis === 'undetermined' ? r : checkedAgainstText(r);
      } else {
        reasons.push(`the book declares "${b.languageId}" (${b.source}) with confidence ${r2(b.confidence)}, below the ${BOOK_MIN_CONFIDENCE} needed to rely on it`);
      }
    }

    // 3. document metadata
    if (evidence.documentLanguage) {
      const d = evidence.documentLanguage;
      if (d.source === 'url') {
        reasons.push(`a locale in the URL ("${d.languageId}") is a guess and decides nothing`);
      } else if (d.confidence >= DOCUMENT_MIN_CONFIDENCE) {
        const r = fromDeclared(d.tag ?? d.languageId, `the page (${d.source}) declares`, 'document-metadata', Math.min(d.confidence, 0.95));
        if (r) return r.basis === 'undetermined' ? r : checkedAgainstText(r);
      } else {
        reasons.push(`the page declares "${d.languageId}" (${d.source}) with confidence ${r2(d.confidence)}, below the ${DOCUMENT_MIN_CONFIDENCE} needed to rely on it`);
      }
    }

    // 4. detection from the sample
    if (evidence.sample) {
      const d = detect(evidence.sample, installed, adapterOf);
      if (d.languageId) return { languageId: d.languageId, confidence: d.confidence, basis: 'detection', reasons: [...reasons, ...d.reasons] };
      reasons.push(...d.reasons);
    } else {
      reasons.push('no sample was given to detect a language from');
    }

    // 5. team default — not when the page or book reliably declares a language no pack covers, UNLESS the text around the
    //    selection is plainly compatible with the learner's chosen language (a mislabelled page: an Albanian site declaring "en")
    if (declaredNoPack) {
      const compatible = evidence.teamDefault && evidence.sample ? defaultCompatibility(evidence.teamDefault, evidence.sample, installed, adapterOf) : undefined;
      if (!compatible?.ok) return undetermined([...reasons, ...(compatible ? [compatible.reason] : []), `${declaredNoPack}; the team default is not used against a declared language — choose a language if the page is mislabelled`]);
      reasons.push(compatible.reason);
    }
    // 5. team default
    if (evidence.teamDefault) {
      const m = mapLanguageTag(evidence.teamDefault);
      if (m.kind === 'pack') {
        if (!installed.has(m.languageId)) return undetermined([...reasons, `the default language "${evidence.teamDefault}" is ${m.languageId}, but its pack is not installed`]);
        return {
          languageId: m.languageId, ...(m.varietyId ? { varietyId: m.varietyId } : {}), confidence: TEAM_DEFAULT_CONFIDENCE, basis: 'team-default',
          reasons: [...reasons, `nothing else decided, so the language of the learner’s enrolment is used (${m.languageId}${m.varietyId ? `, ${m.varietyId}` : ''}): a default, not evidence about this text`, ...m.notes],
        };
      }
      reasons.push(`the default language "${evidence.teamDefault}" cannot be used: ${m.reason}`);
    } else {
      reasons.push('there is no default language');
    }
    return undetermined(reasons);
  };
}

/** The resolver the content script uses: the parser's word lists. */
export const resolveLanguage: ResolveLanguage = createLanguageResolver();
