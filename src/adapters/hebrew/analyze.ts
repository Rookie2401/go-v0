/**
 * From tokens to analysed tokens, for every period of Hebrew at once.
 *
 * A written form is looked up in the installed form indexes (index-store.ts): the Tanakh index gives the Open Scriptures
 * reading(s) of that very form in the Bible (period he-bib, or arc-bib for the Aramaic chapters); the Wiktionary tables index
 * gives the Modern readings (he-mod). A pointed form is matched as pointed; an unpointed form reaches the pointed Biblical forms
 * through their consonants, at lower confidence (the points are inferred, not read). A form no index holds is tried with its
 * attachable prefixes peeled off (וְ בְּ לְ כְּ מִ הַ שֶׁ הֲ, by rule, confidence 0.5); what is left unknown gets NO reading.
 *
 * Then the sentence decides the PERIOD it is read in (`sentencePeriod`): cantillation anywhere → Biblical; else the period most
 * of the words' best readings belong to; a tie → the caller's declared or targeted variety (`opts.varietyId`); nothing → Modern.
 * Readings of that period are put first on every word (never removed), and every reading says which period the sentence was
 * read in (`notes.period`) so the card can state it. Nothing in the text is ever overridden by the preference.
 *
 * What a candidate carries: notes.source ('oshb' | 'kaikki-he' | 'rule'), notes.attested ("11× in the Tanakh"), notes.code
 * (the source's own code), notes.lemmaId, notes.period, notes.rule (how a prefix was peeled), notes.pointing ('inferred' when an
 * unpointed form was matched through its consonants), varieties (the period), parts (prefix · stem · suffix).
 */
import type { AnalysisCandidate, AnalyzeOptions, AnalyzedToken, PartOfSpeech, RawToken, WordPart } from '../../core';
import { type HeIndexHit, lemmaStem, lookupHebrewForm } from './index-store';
import { PREFIXES, decodeOshb, oshbParts } from './oshb';
import { heMorphFromTags } from './tags';
import { consonantal, hasCantillation, isPointed, pointed } from './text';
import { HE_VARIETIES } from './varieties';

export const HE_VERSION = '1';
export const HE_ANALYZER = `adapter-he@${HE_VERSION}`;
export const HE_SOURCE_IDS = {
  oshb: 'oshb-tanakh',
  kaikki: 'kaikki-he-tables',
  rules: `he-rules@${HE_VERSION}`,
} as const;

const PERIOD_LABEL = (code: string): string => HE_VARIETIES[code]?.label ?? code;

/** Prefix letters that may be peeled, with the vowel points each may carry; tried longest chain first. */
const PEELABLE: Array<{ code: string; re: RegExp }> = [
  { code: 'c', re: /^ו[ְַָּ]*/u },
  { code: 'd', re: /^ה[ֶַָ]?/u },
  { code: 'b', re: /^ב[ּ]?[ְִַָ]?/u },
  { code: 'l', re: /^ל[ְִַָ]?/u },
  { code: 'k', re: /^כ[ּ]?[ְַָ]?/u },
  { code: 'm', re: /^מ[ִֵ]?/u },
  { code: 's', re: /^ש[ׁ]?[ֶ]?/u },
  { code: 'i', re: /^ה[ֲ]/u },
];
/** Which prefix may follow which (וְ before anything; a preposition before the article is fused, so הַ is not peeled after בְּ). */
const AFTER: Record<string, string[]> = { '': ['c', 'd', 'b', 'l', 'k', 'm', 's', 'i'], c: ['d', 'b', 'l', 'k', 'm', 's', 'i'], b: [], l: [], k: [], m: ['d'], s: ['d', 'b', 'l', 'k', 'm'], d: [], i: [] };

interface Peeled { codes: string[]; pieces: string[]; rest: string }
function peelings(form: string): Peeled[] {
  const out: Peeled[] = [];
  const walk = (rest: string, codes: string[], pieces: string[]) => {
    const allowed = AFTER[codes[codes.length - 1] ?? ''] ?? [];
    for (const p of PEELABLE) {
      if (!allowed.includes(p.code)) continue;
      const m = p.re.exec(rest);
      if (!m || !m[0] || m[0].length >= rest.length) continue;
      const next = rest.slice(m[0].length);
      if (consonantal(next).length < 2) continue;
      out.push({ codes: [...codes, p.code], pieces: [...pieces, m[0]], rest: next });
      if (codes.length < 2) walk(next, [...codes, p.code], [...pieces, m[0]]);
    }
  };
  walk(form, [], []);
  return out;
}

function fromHit(token: RawToken, hit: HeIndexHit, share: number, peeled?: Peeled): AnalysisCandidate | undefined {
  const [lemmaChain, code, count, seg] = hit.row;
  const idx = hit.index;
  const stem = lemmaStem(lemmaChain);
  const lemmaRow = idx.lemmas[stem];
  let candidate: AnalysisCandidate;
  if (idx.codes === 'oshb') {
    const r = decodeOshb(lemmaChain, code);
    const headword = lemmaRow?.[0] ?? stem;
    const period = r.aramaic ? 'arc-bib' : idx.period;
    const notes: Record<string, string | string[]> = {
      source: 'oshb', code, lemmaId: stem, attested: `${count}× in the Tanakh as this reading`,
    };
    if (hit.viaConsonantal) notes.pointing = 'inferred';
    let base = hit.viaConsonantal ? 0.6 : 0.92;
    const parts: WordPart[] = peeled ? [] : oshbParts(token.surface, r, seg, headword, r.pos).map((p) => ({ ...p, kind: p.role === 'stem' ? 'stem' : 'clitic' }));
    candidate = {
      lemma: headword, pos: r.pos, morph: { ...r.morph }, notes, confidence: base, varieties: [period],
      origin: 'dictionary', sourceId: HE_SOURCE_IDS.oshb,
      ...(lemmaRow?.[1] ? { gloss: lemmaRow[1] } : {}),
      ...(r.role ? { role: r.role } : {}),
      ...(parts.length ? { parts } : {}),
    };
  } else {
    const tags = code ? code.split('|') : [];
    const citation = tags.includes('citation-form');
    const morph = citation ? {} : heMorphFromTags(tags);
    const headword = lemmaRow?.[0] ?? stem.split('|')[0];
    const pos = (lemmaRow?.[2] ?? stem.split('|')[1] ?? 'X') as PartOfSpeech;
    const periods = (lemmaRow as unknown as unknown[])?.[5] ? String((lemmaRow as unknown as unknown[])[5]).split(',') : [idx.period];
    const notes: Record<string, string | string[]> = { source: 'kaikki-he', lemmaId: stem, ...(citation ? { form: 'citation form' } : { tags: [...tags] }) };
    if (hit.viaConsonantal) notes.pointing = 'inferred';
    // an unpointed Modern word reaching a pointed table row is the ordinary case (Modern Hebrew is written unpointed), so the
    // match is only slightly less confident than a pointed one; the note still says the points are the table's, not the text's
    candidate = {
      lemma: headword, pos, morph, notes, confidence: hit.viaConsonantal ? 0.7 : 0.78, varieties: periods,
      origin: 'dictionary', sourceId: HE_SOURCE_IDS.kaikki,
      ...(lemmaRow?.[1] ? { gloss: lemmaRow[1] } : {}),
    };
  }
  if (peeled) {
    // the prefixes were cut by rule; the remainder is the index's reading
    const parts: WordPart[] = [];
    let at = 0;
    peeled.codes.forEach((c, k) => {
      const p = PREFIXES[c];
      const piece = peeled.pieces[k];
      parts.push({ text: piece, start: at, end: at + piece.length, lemma: p.lemma, pos: p.pos, morph: { ...(p.morph ?? {}) }, role: p.gloss, kind: 'clitic' });
      at += piece.length;
    });
    parts.push({ text: token.surface.slice(at), start: at, end: token.surface.length, ...(candidate.lemma ? { lemma: candidate.lemma } : {}), pos: candidate.pos, morph: { ...candidate.morph }, role: 'stem', kind: 'stem' });
    candidate.parts = parts;
    candidate.notes = { ...candidate.notes, rule: `prefix${peeled.codes.length > 1 ? 'es' : ''} ${peeled.codes.map((c) => PREFIXES[c].lemma).join(' + ')} cut off by rule; the rest is the source's form`, source: 'rule' };
    candidate.origin = 'rule';
    candidate.sourceId = HE_SOURCE_IDS.rules;
    candidate.confidence = Math.min(candidate.confidence, 0.5);
    if (peeled.codes.includes('d')) candidate.morph = { ...candidate.morph, Definite: 'Def' };
  }
  // several readings of one form share the confidence by how often each is read that way
  candidate.confidence = Math.round(candidate.confidence * (0.55 + 0.45 * share) * 100) / 100;
  return candidate;
}

function hitsToCandidates(token: RawToken, allHits: HeIndexHit[], peeled?: Peeled): AnalysisCandidate[] {
  // a table's citation-form row adds nothing when the same lemma has a real row for this form
  const withRows = new Set(allHits.filter((h) => h.index.codes === 'kaikki-tags' && h.row[1] !== 'citation-form').map((h) => h.row[0]));
  const hits = allHits.filter((h) => !(h.index.codes === 'kaikki-tags' && h.row[1] === 'citation-form' && withRows.has(h.row[0])));
  const total = hits.reduce((s, h) => s + h.row[2], 0) || 1;
  const out: AnalysisCandidate[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const c = fromHit(token, h, h.row[2] / total, peeled);
    if (!c) continue;
    const key = `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}|${c.varieties?.join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Context-free readings of one token, best first. */
export function heCandidates(token: RawToken): AnalysisCandidate[] {
  const key = token.normalized;
  if (!key) return [];
  const direct = lookupHebrewForm(key);
  if (direct.length) return hitsToCandidates(token, direct);
  // nothing attested as written: cut off attachable prefixes and look up the rest (longest remainder first)
  const peels = peelings(key).sort((a, b) => b.rest.length - a.rest.length);
  for (const p of peels) {
    const hits = lookupHebrewForm(p.rest).filter((h) => h.index.codes !== 'oshb' || !/^(c|d|b|l|k|m|s|i)\//.test(h.row[0]) || true);
    if (hits.length) return hitsToCandidates(token, hits, p);
  }
  return [];
}

export type HePeriod = 'he-bib' | 'he-mod' | 'he-mish' | 'he-med' | 'arc-bib';

/**
 * The period a sentence is read in: cantillation anywhere → Biblical (it is a Masoretic text); else the period most best
 * readings belong to; a tie → the caller's variety; nothing to go on → the caller's variety or Modern. The basis is returned
 * with it so the card can say why.
 */
export function sentencePeriod(tokens: RawToken[], base: AnalysisCandidate[][], opts?: AnalyzeOptions): { period: HePeriod; basis: string } {
  const masoretic = tokens.some((t) => t.isWord && hasCantillation(t.surface));
  const declared = opts?.varietyId && HE_VARIETIES[opts.varietyId] ? (opts.varietyId as HePeriod) : undefined;
  const votes: Record<string, number> = {};
  let voters = 0;
  base.forEach((cands, i) => {
    if (!tokens[i].isWord || !cands.length) return;
    voters++;
    // each period a word has a reading in gets one vote from that word (a source's confidence is not evidence of period)
    const periods = new Set(cands.flatMap((c) => c.varieties ?? []));
    for (const v of periods) votes[v] = (votes[v] ?? 0) + 1;
  });
  // Biblical Aramaic is its own language: a sentence is read as Aramaic only when more words have an Aramaic reading than a Hebrew one
  const bib = votes['he-bib'] ?? 0;
  const arc = votes['arc-bib'] ?? 0;
  if (arc > bib && arc >= (votes['he-mod'] ?? 0)) return { period: 'arc-bib', basis: `${arc} of the ${voters} recognised words have a Biblical Aramaic reading and fewer a Hebrew one` };
  if (masoretic) return { period: 'he-bib', basis: 'the text carries cantillation marks: a Masoretic text' };
  const ranked = Object.entries(votes).filter(([v]) => v !== 'arc-bib').sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return declared ? { period: declared, basis: 'no word was recognised; read in the declared variety' } : { period: 'he-mod', basis: 'no word was recognised; read as Modern Hebrew by default' };
  const [top, second] = ranked;
  const allPointed = tokens.filter((t) => t.isWord).every((t) => isPointed(t.surface));
  if (second && Math.abs(top[1] - second[1]) < 0.15 * top[1]) {
    if (declared) return { period: declared, basis: `the words are read in more than one period alike; the declared variety (${PERIOD_LABEL(declared)}) decides` };
    if (allPointed) return { period: 'he-bib', basis: 'the words are read in more than one period alike; the text is fully pointed, as a Biblical text is' };
    return { period: 'he-mod', basis: 'the words are read in more than one period alike; unpointed text is read as Modern Hebrew' };
  }
  return { period: top[0] as HePeriod, basis: `${Math.round((top[1] / ranked.reduce((s, r) => s + r[1], 0)) * 100)} % of the ${voters} recognised words have a reading in ${PERIOD_LABEL(top[0])}` };
}

/** Readings of the sentence's period first on every word; every reading says which period the sentence was read in. */
export function orderHeSentence(tokens: RawToken[], base: AnalysisCandidate[][], opts?: AnalyzeOptions): AnalysisCandidate[][] {
  const { period, basis } = sentencePeriod(tokens, base, opts);
  const fits = (c: AnalysisCandidate): boolean => (c.varieties ?? []).includes(period);
  return base.map((cands, i) => {
    if (!tokens[i].isWord) return cands;
    const first = cands.filter(fits);
    const rest = cands.filter((c) => !fits(c));
    const changed = first.length > 0 && rest.length > 0 && cands[0] && !fits(cands[0]);
    return [...first, ...rest].map((c, k) => ({
      ...c,
      notes: {
        ...c.notes, period, periodBasis: basis,
        ...(changed && k === 0 ? { context: `put first because the sentence is read as ${PERIOD_LABEL(period)}` } : {}),
      },
    }));
  });
}

/** The adapter's `analyze`. */
export function heAnalyze(tokens: RawToken[], opts?: AnalyzeOptions): AnalyzedToken[] {
  const base = tokens.map((t) => (t.isWord ? heCandidates(t) : []));
  const ordered = orderHeSentence(tokens, base, opts);
  return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? ordered[i] : [], analyzer: HE_ANALYZER }));
}

/** The pointed key of any written form (for callers outside the adapter). */
export const heKey = (surface: string): string => pointed(surface);
