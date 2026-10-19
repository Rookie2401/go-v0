/**
 * Text quality control. Inspect raw text BEFORE it becomes documents and REPORT what is wrong with it: bad encoding,
 * broken accents, OCR damage, hard line wraps, page numbers, running heads, footnote markers, duplicated paragraphs,
 * boilerplate, a text in the wrong language. It never changes the text: what to do about a flag (strip boilerplate, unwrap
 * lines) is an explicit converter option (`plaintext.ts`), and the converter removes ONLY what `findBoilerplate` identified.
 *
 * Every flag has a code, a severity, a count and a short sample. The verdict: `clean` (nothing found), `usable` (only info
 * and warnings), `damaged` (at least one serious flag: import only after a person has looked).
 */
import type { LanguageCode, QualityFlag, QualityReport } from '../core';
import { detectHeadings } from './headings';

export const QUALITY_VERSION = 'quality@1';

export interface QualityOptions {
  lang: LanguageCode;
  /** Where the text came from, for source-specific noise (a Project Gutenberg file has a licence header and footer). */
  sourceKind?: 'plain' | 'gutenberg' | 'wikisource' | 'epub' | 'ocr';
}

/** A run of lines that is not the book: a licence header, a "Produced by" credit, a transcriber's note, a copyright line. */
export interface BoilerplateRange {
  kind: 'boilerplate' | 'title-page-noise';
  label: string;
  /** 0-based line numbers, inclusive. */
  startLine: number;
  endLine: number;
}

const trim = (s: string) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const TERMINAL = /[.!?…:;»”"')\]।]$/u;

const GUTENBERG_START = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
const GUTENBERG_END = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
const PRODUCED_BY = /^\s*(?:Produced by|Produced from|Proofreading by|Distributed Proofreading|Producido por|Digitalizado por|Transcrito por)\b/i;
const TRANSCRIBER = /^\s*\[?\s*(?:Transcriber['’]s? Notes?|Nota del transcriptor|Notas del transcriptor|Nota de transcripci[oó]n)\b/i;
const NOTICE = /Project Gutenberg|wikisource\.org/i;
const TITLE_PAGE_NOISE = /^\s*(?:ISBN[\s:-]*[\dXx-]{8,}.*|Copyright\b.*|©.*|Todos los derechos reservados.*|Dep[oó]sito legal.*|Impreso en .*|Edici[oó]n digital.*|Primera edici[oó]n.*|All rights reserved.*)$/i;

/**
 * The boilerplate of a text, by line: Project Gutenberg header and licence (up to their START / from their END markers),
 * "Produced by" credits, transcriber's notes, notices that name Project Gutenberg or Wikisource, and copyright / ISBN
 * lines near the beginning or the end. Exactly what `inspectText` reports as `boilerplate` / `title-page-noise` — and all
 * a converter's `stripBoilerplate` removes.
 */
export function findBoilerplate(lines: readonly string[]): BoilerplateRange[] {
  const out: BoilerplateRange[] = [];
  const n = lines.length;
  const paragraphEnd = (from: number) => { let j = from; while (j + 1 < n && lines[j + 1].trim() !== '') j++; return j; };

  const start = lines.findIndex((l, i) => i < 400 && GUTENBERG_START.test(l));
  if (start >= 0) out.push({ kind: 'boilerplate', label: 'Project Gutenberg header', startLine: 0, endLine: start });
  let end = -1;
  for (let i = n - 1; i >= Math.max(0, n - 600); i--) if (GUTENBERG_END.test(lines[i])) { end = i; break; }
  if (end >= 0 && end > start) out.push({ kind: 'boilerplate', label: 'Project Gutenberg licence', startLine: end, endLine: n - 1 });
  else end = -1;
  const inMarked = (i: number) => (start >= 0 && i <= start) || (end >= 0 && i >= end);

  for (let i = 0; i < n; i++) {
    if (inMarked(i)) continue;
    const l = lines[i];
    if (PRODUCED_BY.test(l)) { const e = paragraphEnd(i); out.push({ kind: 'boilerplate', label: 'production credit', startLine: i, endLine: e }); i = e; }
    else if (TRANSCRIBER.test(l)) { const e = paragraphEnd(i); out.push({ kind: 'boilerplate', label: 'transcriber\'s note', startLine: i, endLine: e }); i = e; }
    else if (NOTICE.test(l)) { const e = paragraphEnd(i); out.push({ kind: 'boilerplate', label: 'source notice', startLine: i, endLine: e }); i = e; }
  }
  // copyright / ISBN lines only where a title page or a colophon is: the first and last 60 lines
  const covered = (i: number) => out.some((r) => i >= r.startLine && i <= r.endLine);
  for (let i = 0; i < n; i++) {
    if (!(i < 60 || i >= n - 60) || covered(i)) continue;
    if (TITLE_PAGE_NOISE.test(lines[i])) out.push({ kind: 'title-page-noise', label: 'copyright or title-page line', startLine: i, endLine: i });
  }
  return out.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

interface WrapStats { wrapped: boolean; breaks: number }

/** Does the text look hard-wrapped (a newline after every ~70 characters, paragraphs separated by blank lines)? Never for Thai. */
export function looksHardWrapped(lines: readonly string[], lang: LanguageCode): boolean {
  return wrapStats(lines, lang).wrapped;
}

function wrapStats(lines: readonly string[], lang: LanguageCode): WrapStats {
  if (lang === 'th') return { wrapped: false, breaks: 0 };
  const t = lines.map(trim);
  const nonBlank = t.filter((l) => l !== '').length;
  const blankLines = t.length - nonBlank;
  const interior: number[] = [];
  let lowerNext = 0;
  let unterminated = 0;
  const blockLengths: number[] = [];
  let inBlock = false;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '') { inBlock = false; continue; }
    if (!inBlock) { blockLengths.push(0); inBlock = true; }
    blockLengths[blockLengths.length - 1]++;
    if (i + 1 < t.length && t[i + 1] !== '') {
      interior.push(t[i].length);
      if (!TERMINAL.test(t[i])) unterminated++;
      if (/^\p{Ll}/u.test(t[i + 1])) lowerNext++;
    }
  }
  // single-line blocks (headings, separators) do not count against the paragraphs: what matters is how long the multi-line blocks are
  const multi = blockLengths.filter((n) => n >= 2);
  if (nonBlank < 8 || blankLines < 1 || interior.length < 6 || multi.length < 2 || multi.reduce((a, b) => a + b, 0) / multi.length < 2.5) return { wrapped: false, breaks: 0 };
  const sorted = [...interior].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const wrapped = median >= 30 && median <= 130 && unterminated / interior.length >= 0.6 && lowerNext / interior.length >= 0.45;
  return { wrapped, breaks: wrapped ? interior.length : 0 };
}

// ── helpers ──

const sample = (s: string): string => {
  const one = s.replace(/\s*[\r\n]+\s*/g, ' ↵ ').trim();
  return one.length <= 120 ? one : `${one.slice(0, 117)}…`;
};
const around = (text: string, index: number, length = 1): string => sample(text.slice(Math.max(0, index - 40), Math.min(text.length, index + length + 60)));

function firstMatch(text: string, re: RegExp): { count: number; first?: RegExpExecArray } {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let count = 0;
  let first: RegExpExecArray | undefined;
  for (let m = g.exec(text); m; m = g.exec(text)) { count++; first ??= m; if (m[0] === '') g.lastIndex++; }
  return { count, first };
}

// UTF-8 text decoded as Latin-1 / Windows-1252: "Ã¡" for á, "Ã±" for ñ, "â€”" for —
const CP1252 = '\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u02C6\\u02DC\\u2013\\u2014\\u2018-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122';
const MOJIBAKE = new RegExp(`[\\u00C3\\u00C2][${CP1252}]|\\u00E2\\u20AC`, 'u');
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const BROKEN_ACCENT = /(?<![aeiouAEIOU\p{M}])[̀́]|(?<![\p{L}])[̀-ͯ]|[´¨][aeiouAEIOU]|[nN]~|~[nN]/u;
const FOOTNOTE = /\p{L}\[\d{1,3}\]|\p{L}\(\d{1,3}\)(?=[\s.,;:])|(?<![ÃÂ])[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\[\*+\]|\[\s*(?:nota|n\.)\s*\d*\s*\]|\p{L}\*(?=[\s.,;:)])/iu;
const PAGE_NUMBER = /^(?:[-–—]\s*)?\d{1,4}(?:\s*[-–—])?$|^(?:p[aá]g(?:ina)?\.?|page|p\.)\s*\d{1,4}$/iu;
const MIXED_SCRIPT_WORD = /\p{Script=Latin}+[\p{Script=Cyrillic}\p{Script=Greek}]|[\p{Script=Cyrillic}\p{Script=Greek}]+\p{Script=Latin}/u;

// Spanish words that need an accent, written without one
const UNACCENTED = new Set(['tambien', 'despues', 'ademas', 'aqui', 'alli', 'asi', 'habia', 'podia', 'queria', 'sabia', 'tenia', 'venia', 'decia', 'jamas', 'quizas', 'senor', 'nino', 'nina', 'ninos', 'ninas', 'corazon', 'razon', 'cancion', 'nacion', 'ultimo', 'pais', 'dia', 'dias', 'anos', 'espanol']);

// Function words that dominate ordinary text of a language (share of word tokens): used to notice the wrong language.
const FUNCTION_WORDS: Partial<Record<LanguageCode, ReadonlySet<string>>> = {
  es: new Set('de la que el en y a los se del las un por con no una su para es al lo como más mas o pero sus le ya si porque esta entre cuando muy sin sobre me hasta hay donde quien desde todo nos durante también tambien ser son dos fue era'.split(' ')),
  de: new Set('der die und in den von zu das mit sich des auf für fur ist im dem nicht ein eine als auch es an werden aus er hat dass daß sie nach wird bei einer um am sind noch wie einem über uber so zum'.split(' ')),
  sq: new Set('dhe të te e që qe në ne për per me një nje nga është eshte i u si por do ka kjo ky ishte nuk më ajo ai kur edhe pas'.split(' ')),
  // machine-draft, native review pending
  nb: new Set('og i er det som på en et til av for med at har den ikke jeg var om han hun seg men vi kan fra så ble også å de du hva noen eller når skal vil blir bare hadde etter mer meg deg sin sitt sine ut opp inn her der hvor hvis nå mye alle andre ham dem oss'.split(' ')),
  nn: new Set('og i er det som på ein ei eit til av for med at har den ikkje eg var om han ho seg men vi me kan frå så vart også å dei du kva nokon eller når skal vil blir berre hadde etter meir meg deg sin sitt sine ut opp inn her der kor viss no mykje alle andre oss'.split(' ')),
  // Latin: Vulgate and classical function words (i/j and u/v spellings both listed); machine-draft
  la: new Set('et in est non qui quae quod cum ad ut sed a ab de ex per pro autem enim ergo etiam atque ac aut vel si ne nec neque sunt erat esse fuit eius ejus eum eos eorum hic haec hoc ille illa illi ei se sibi suo sua suum me te nos vos tu ego omnes omnia'.split(' ')),
};
const ENGLISH_WORDS = new Set('the of and to in is that it was for on are with as his they be at one have this from or had by not but what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part'.split(' '));

const SCRIPTS: Array<[string, RegExp]> = [
  ['Latin', /\p{Script=Latin}/u], ['Cyrillic', /\p{Script=Cyrillic}/u], ['Greek', /\p{Script=Greek}/u], ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u], ['Thai', /\p{Script=Thai}/u], ['Devanagari', /\p{Script=Devanagari}/u], ['Han', /\p{Script=Han}/u],
  ['Hangul', /\p{Script=Hangul}/u], ['Kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
];
const EXPECTED_SCRIPT: Record<LanguageCode, string> = { es: 'Latin', de: 'Latin', sq: 'Latin', th: 'Thai', hi: 'Devanagari', nb: 'Latin', nn: 'Latin', he: 'Hebrew', el: 'Greek', la: 'Latin' };

/**
 * Whether one paragraph looks like English rather than the language of the text: the paragraph rule of `inspectText`
 * (at least 12 words, English common words a quarter of them and more than twice the language's own), usable on its
 * own. For a language written in another script (Thai, Devanagari): at least 4 words, most of them in Latin letters.
 * A rule of thumb for apparatus (a publisher's English description, an editor's notes), never a language identifier.
 */
const SHARED_WITH_NEIGHBOURS = new Set('as he an so up do in on one is it at be or we me am no if to a i'.split(' '));

export function looksLikeEnglishParagraph(paragraph: string, lang: LanguageCode): boolean {
  const ws = (paragraph.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? []).map((w) => w.toLowerCase());
  if (EXPECTED_SCRIPT[lang] !== 'Latin') return ws.length >= 4 && ws.filter((w) => /^[a-z'’]+$/.test(w)).length / ws.length > 0.5;
  const own = FUNCTION_WORDS[lang];
  if (!own || ws.length < 12) return false;
  // only words that are English and not also a word of a Germanic or Romance neighbour (as, he, an, so, up, do, in …):
  // a Low German or Dutch paragraph must not pass for English
  const en = ws.filter((w) => ENGLISH_WORDS.has(w) && !SHARED_WITH_NEIGHBOURS.has(w)).length / ws.length;
  return en >= 0.25 && en > 2 * (ws.filter((w) => own.has(w)).length / ws.length);
}

/**
 * Inspect raw text BEFORE it becomes documents: bad encoding, broken accents, OCR damage, hard line wraps, page
 * numbers, running heads, footnote markers, duplicated paragraphs, boilerplate, language mismatch. Never changes the
 * text: it reports. What to do about a flag (strip boilerplate, unwrap lines) is an explicit converter option.
 */
export function inspectText(text: string, opts: QualityOptions): QualityReport {
  const flags: QualityFlag[] = [];
  const add = (code: QualityFlag['code'], severity: QualityFlag['severity'], count: number, message: string, sampleText?: string) => {
    if (count > 0) flags.push({ code, severity, count, ...(sampleText ? { sample: sample(sampleText) } : {}), message });
  };
  const { lang } = opts;
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = body.split(/\r\n|\r|\n/);
  const trimmed = lines.map(trim);
  const nonBlank = trimmed.filter((l) => l !== '');
  const words = body.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? [];

  // ── encoding ──
  const moji = firstMatch(body, MOJIBAKE);
  add('mojibake', moji.count >= 2 ? 'serious' : 'warning', moji.count,
    'The text looks as if UTF-8 was read as Latin-1 (letters such as "Ã¡" for "á"). Read the file again as UTF-8; the text is not repaired here.', moji.first && around(body, moji.first.index, moji.first[0].length));
  const repl = firstMatch(body, /�/u);
  add('replacement-characters', repl.count >= 3 ? 'serious' : 'warning', repl.count,
    'The text contains replacement characters (�): some letters were lost when the file was read or saved.', repl.first && around(body, repl.first.index));
  const ctrl = firstMatch(body, CONTROL);
  add('control-characters', ctrl.count >= 5 ? 'serious' : 'warning', ctrl.count, 'The text contains control characters that are not part of any writing.', ctrl.first && around(body, ctrl.first.index));

  // ── accents and OCR ──
  const accent = firstMatch(body, BROKEN_ACCENT);
  add('broken-accents', accent.count >= 10 ? 'serious' : 'warning', accent.count,
    'Some accents are separated from their letters (a loose combining accent, ´ or ¨ before a vowel, n~ for ñ).', accent.first && around(body, accent.first.index, accent.first[0].length));

  let ocr = 0;
  let ocrSample = '';
  if (lang !== 'th' && lang !== 'hi') {
    const freq = new Map<string, number>();
    for (const w of words) { const k = w.toLowerCase(); freq.set(k, (freq.get(k) ?? 0) + 1); }
    for (const [w, c] of freq) {
      if (!w.includes('rn') || c > 3) continue;
      const fixed = w.replace(/rn/g, 'm');
      const fc = freq.get(fixed) ?? 0;
      if (fc >= 5 && fc >= 5 * c) { ocr += c; ocrSample ||= `${w} (for ${fixed})`; }
    }
    const digit = firstMatch(body, /\p{L}[01]\p{L}/u);
    ocr += digit.count;
    if (digit.first) ocrSample ||= around(body, digit.first.index, 3);
    if (lang === 'es') {
      const letters = (body.match(/\p{L}/gu) ?? []).length;
      const accented = (body.match(/[áéíóúüñÁÉÍÓÚÜÑ]/g) ?? []).length;
      if (letters > 0 && accented / letters >= 0.004) {
        let dropped = 0;
        for (const w of words) if (UNACCENTED.has(w.toLowerCase())) { dropped++; ocrSample ||= w; }
        if (dropped >= 3) ocr += dropped;
      }
    }
  }
  add('ocr-confusions', ocr >= 100 ? 'serious' : 'warning', ocr,
    'The text has the kind of mistakes a scan makes: "rn" for "m", digits inside words, accents missing in a text that otherwise has them.', ocrSample);

  // ── layout ──
  const wrap = opts.sourceKind === 'epub' ? { wrapped: false, breaks: 0 } : wrapStats(lines, lang);
  add('hard-wrapped-lines', 'warning', wrap.breaks, 'The lines are broken at the margin of the page, not at the end of a paragraph. Join them with the converter\'s unwrap option.',
    wrap.wrapped ? nonBlank.slice(0, 2).join(' ↵ ') : undefined);

  let hyphenBreaks = 0;
  let hyphenSample = '';
  if (lang !== 'th') {
    for (let i = 0; i + 1 < lines.length; i++) {
      const a = trim(lines[i]);
      const b = trim(lines[i + 1]);
      if (/\p{L}-$/u.test(a) && !/--$/.test(a) && /^\p{Ll}/u.test(b)) { hyphenBreaks++; hyphenSample ||= `${a.slice(-20)} ↵ ${b.slice(0, 20)}`; }
    }
  }
  add('hyphenated-line-breaks', 'warning', hyphenBreaks, 'Words are split with a hyphen at the end of a line. The converter can join them back (unwrap), keeping real hyphens.', hyphenSample);

  const pageLines = nonBlank.filter((l) => PAGE_NUMBER.test(l));
  add('page-numbers', 'warning', pageLines.length >= 2 ? pageLines.length : 0, 'Page numbers stand alone on their own lines between the paragraphs.', pageLines[0]);

  if (nonBlank.length >= 30) {
    const counts = new Map<string, number>();
    for (const l of nonBlank) {
      if (l.length < 3 || l.length > 60 || TERMINAL.test(l) || /,$/.test(l) || !/\p{L}/u.test(l)) continue;
      const k = l.replace(/\d+/g, '#');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const heads = [...counts].filter(([k, c]) => c >= 3 && k !== '#');
    add('running-heads', 'warning', heads.reduce((n, [, c]) => n + c, 0), 'The same short line returns again and again between paragraphs (a running head or a page header).', heads[0]?.[0]);
  }

  const foot = firstMatch(body, FOOTNOTE);
  add('footnote-markers', 'info', foot.count, 'Footnote markers stand inside the prose.', foot.first && around(body, foot.first.index, foot.first[0].length));

  // paragraphs: blank-line blocks when the text is wrapped, otherwise the lines themselves
  const paragraphs: string[] = [];
  if (wrap.wrapped) {
    let cur: string[] = [];
    for (const l of trimmed) { if (l === '') { if (cur.length) paragraphs.push(cur.join(' ')); cur = []; } else cur.push(l); }
    if (cur.length) paragraphs.push(cur.join(' '));
  } else paragraphs.push(...nonBlank);
  const seen = new Map<string, number>();
  let duplicates = 0;
  let dupSample = '';
  for (const p of paragraphs) {
    if (p.length < 40) continue;
    const c = (seen.get(p) ?? 0) + 1;
    seen.set(p, c);
    if (c > 1) { duplicates++; dupSample ||= p; }
  }
  add('duplicated-paragraphs', 'warning', duplicates, 'The same paragraph appears more than once (a repeated page or a double paste).', dupSample);
  const long = paragraphs.filter((p) => p.length > 6000);
  add('very-long-paragraphs', 'warning', long.length, 'Some paragraphs are very long (over 6,000 characters): line breaks may have been lost.', long[0]);

  // ── boilerplate ──
  const ranges = findBoilerplate(lines);
  const bp = ranges.filter((r) => r.kind === 'boilerplate');
  add('boilerplate', 'info', bp.length, `Licence or production text that is not the book (${[...new Set(bp.map((r) => r.label))].join(', ')}). The converter can strip it.`, bp[0] && lines.slice(bp[0].startLine, bp[0].startLine + 2).join(' ↵ '));
  const tp = ranges.filter((r) => r.kind === 'title-page-noise');
  add('title-page-noise', 'info', tp.length, 'Copyright or title-page lines are mixed into the text.', tp[0] && lines[tp[0].startLine]);

  // ── language and script ──
  const functionWords = FUNCTION_WORDS[lang];
  if (functionWords && words.length >= 60) {
    const lower = words.map((w) => w.toLowerCase());
    const share = lower.filter((w) => functionWords.has(w)).length / lower.length;
    if (share < 0.18) {
      const english = lower.filter((w) => ENGLISH_WORDS.has(w)).length / lower.length;
      add('language-mismatch', share < 0.1 ? 'serious' : 'warning', words.length,
        `Only ${Math.round(share * 100)}% of the words are common words of this language${english > 0.25 ? '; the text looks like English' : ''}.`, nonBlank.find((l) => l.length > 30));
    } else {
      // the text as a whole is in its language, but parts of it may not be: an annotated edition carries an English
      // preface, notes, exercises and a vocabulary. Paragraph by paragraph: English common words clearly outweigh the
      // language's own. Reported from 5 % of the words; at 15 % the source is not the book alone.
      let foreign = 0;
      let foreignParagraphs = 0;
      let foreignSample = '';
      for (const p of paragraphs) {
        const ws = (p.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? []).map((w) => w.toLowerCase());
        if (ws.length < 12) continue;
        const en = ws.filter((w) => ENGLISH_WORDS.has(w)).length / ws.length;
        const own = ws.filter((w) => functionWords.has(w)).length / ws.length;
        if (en >= 0.25 && en > 2 * own) { foreign += ws.length; foreignParagraphs++; foreignSample ||= p; }
      }
      const part = foreign / words.length;
      if (part >= 0.05) {
        add('language-mismatch', part >= 0.15 ? 'serious' : 'warning', foreign,
          `About ${Math.round(part * 100)}% of the words stand in paragraphs that look like English (${foreignParagraphs} paragraphs): a preface, notes, exercises or a vocabulary of an annotated edition. They are not the book; cut them from the source, they are not removed here.`, foreignSample);
      }
    }
  }
  const letters = body.match(/\p{L}/gu) ?? [];
  if (letters.length >= 20) {
    const counts = new Map<string, number>();
    for (const ch of letters) { const s = SCRIPTS.find(([, re]) => re.test(ch)); const k = s ? s[0] : 'Other'; counts.set(k, (counts.get(k) ?? 0) + 1); }
    const expected = EXPECTED_SCRIPT[lang];
    const other = letters.length - (counts.get(expected) ?? 0);
    const share = other / letters.length;
    const limit = expected === 'Latin' ? 0.01 : 0.5; // a Thai or Hindi book may quote Latin; a Spanish one should not be in another script
    if (share >= limit) {
      const names = [...counts].filter(([k]) => k !== expected).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3).join(', ');
      add('mixed-scripts', share >= 0.2 && expected === 'Latin' ? 'serious' : 'warning', other, `${Math.round(share * 100)}% of the letters are not ${expected} (${names}).`);
    }
    if (expected === 'Latin') {
      const mixedWord = firstMatch(body, MIXED_SCRIPT_WORD);
      add('mixed-scripts', 'warning', mixedWord.count, 'Some words mix Latin letters with look-alike letters of another script.', mixedWord.first && around(body, mixedWord.first.index, mixedWord.first[0].length));
    }
  }

  // ── punctuation ──
  let punctuation = 0;
  let punctSample = '';
  if (lang === 'es') {
    const closers = (body.match(/[?!]/g) ?? []).length;
    const openers = (body.match(/[¿¡]/g) ?? []).length;
    if (closers >= 5 && openers === 0) { punctuation += closers; punctSample = 'questions and exclamations without ¿ ¡'; }
  }
  const quotes = firstMatch(body, /''|``|,,/u);
  if (quotes.count >= 3) { punctuation += quotes.count; punctSample ||= around(body, quotes.first!.index, 2); }
  add('mangled-punctuation', 'info', punctuation, 'Punctuation looks mangled (no opening ¿ ¡ in Spanish, or quotation marks made of two apostrophes or commas).', punctSample);

  // ── structure ──
  if (words.length >= 3000 && detectHeadings(trimmed, lang).length === 0) {
    add('no-chapters-found', 'info', 1, 'No chapter headings were found in a long text, so it would be one chapter.');
  }

  const verdict: QualityReport['verdict'] = flags.some((f) => f.severity === 'serious') ? 'damaged' : flags.length ? 'usable' : 'clean';
  return { checkedWith: QUALITY_VERSION, flags, verdict };
}

export type { QualityFlag, QualityReport };
