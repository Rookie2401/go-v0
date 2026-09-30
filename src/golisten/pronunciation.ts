/**
 * Pronunciation overrides (PronunciationEntry rows). Exact, case-sensitive match against the text.
 *
 *  - `substitution`  : rewrites the SPEECH text only (display text is never touched). Always available.
 *  - `ssml-phoneme`  : wraps the match in <phoneme>; only when the provider declares ssml + phonemeOverrides.
 *  - `lang-tag`      : wraps the match in <lang xml:lang>; only when the provider declares ssml.
 *  - `lexicon`       : provider-side lexicon reference - not applied by GoListen (TODO(integration): real provider).
 *
 * An override is recorded as "used" only when it was actually applied, so diagnostics never claim
 * a fix that the provider could not honour.
 */
import type { PronunciationEntry } from '../core/model';
import type { ProviderCapabilities } from '../core/contracts/golisten';

const WORD_CHAR = '\\p{L}\\p{M}\\p{N}';
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function matcher(match: string, boundaries: boolean): RegExp {
  const core = escRe(match);
  return boundaries ? new RegExp(`(?<![${WORD_CHAR}])${core}(?![${WORD_CHAR}])`, 'gu') : new RegExp(core, 'gu');
}

export interface AppliedPronunciation {
  speechText: string;
  used: PronunciationEntry[];
  /** Entries to be rendered as SSML (subset of `used`). */
  ssmlEntries: PronunciationEntry[];
  /** Identifies the applied entries for cache keys / asset metadata. */
  lexiconVersion: string;
}

export function lexiconVersionOf(used: PronunciationEntry[]): string {
  if (used.length === 0) return 'none';
  return used.map((e) => `${e.id}@${e.lexiconVersion}`).sort().join(',');
}

export function applicableEntries(entries: PronunciationEntry[], filter: { providerId: string; voiceId: string }): PronunciationEntry[] {
  return entries
    .filter((e) => (!e.providerId || e.providerId === filter.providerId) && (!e.voiceId || e.voiceId === filter.voiceId))
    // Deterministic order: longest match first, then id.
    .sort((a, b) => b.match.length - a.match.length || (a.id < b.id ? -1 : 1));
}

export function applyPronunciation(
  displayText: string, speechText: string, entries: PronunciationEntry[], caps: ProviderCapabilities, opts: { wordBoundaries: boolean },
): AppliedPronunciation {
  let speech = speechText;
  const used: PronunciationEntry[] = [];
  const ssmlEntries: PronunciationEntry[] = [];
  for (const e of entries) {
    if (!e.match || !displayText.includes(e.match)) continue; // only entries that occur in the display text
    if (e.mechanism === 'substitution') {
      const re = matcher(e.match, opts.wordBoundaries);
      if (re.test(speech)) { speech = speech.replace(matcher(e.match, opts.wordBoundaries), () => e.value); used.push(e); }
    } else if (e.mechanism === 'ssml-phoneme') {
      if (caps.ssml && caps.phonemeOverrides && matcher(e.match, opts.wordBoundaries).test(speech)) { used.push(e); ssmlEntries.push(e); }
    } else if (e.mechanism === 'lang-tag') {
      if (caps.ssml && matcher(e.match, opts.wordBoundaries).test(speech)) { used.push(e); ssmlEntries.push(e); }
    }
  }
  return { speechText: speech, used, ssmlEntries, lexiconVersion: lexiconVersionOf(used) };
}

/** Deterministic SSML for the speech text with the given entries applied (longest match first, left to right). */
export function buildSsml(speechText: string, entries: PronunciationEntry[], locale: string, opts: { wordBoundaries: boolean }): string {
  type Hit = { start: number; end: number; entry: PronunciationEntry };
  const hits: Hit[] = [];
  for (const e of entries) {
    for (const m of speechText.matchAll(matcher(e.match, opts.wordBoundaries))) {
      const start = m.index, end = m.index + m[0].length;
      if (!hits.some((h) => start < h.end && end > h.start)) hits.push({ start, end, entry: e });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const h of hits) {
    out += escXml(speechText.slice(cursor, h.start));
    const inner = escXml(speechText.slice(h.start, h.end));
    out += h.entry.mechanism === 'ssml-phoneme'
      ? `<phoneme alphabet="ipa" ph="${escXml(h.entry.value)}">${inner}</phoneme>`
      : `<lang xml:lang="${escXml(h.entry.value)}">${inner}</lang>`;
    cursor = h.end;
  }
  out += escXml(speechText.slice(cursor));
  return `<speak version="1.0" xml:lang="${escXml(locale)}">${out}</speak>`;
}
