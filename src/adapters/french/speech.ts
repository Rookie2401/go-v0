/**
 * French speech normalisation (TTS input only; never the display text). Not native-reviewed.
 * Deterministic. Over `speechNormalizeGeneric` (NFC, verse markers, abbreviations, numbers to words, whitespace), plus what French
 * needs first: non-breaking spaces to plain spaces, the dialogue dash not spoken (dropped at the start of a turn; a dash after
 * the end of a sentence inside one line becomes a plain space), thousands written with a space (1 500 → 1500), a decimal comma
 * (3,5 → "3 virgule 5", the fraction read digit by digit when it has leading zeros), and ordinals (1er → premier, 2e → deuxième).
 *
 * Known limits: "un" is never "une" (the gender of the thing counted is not known); roman numerals and dates (le 3 mars) are left
 * to the generic number rule; guillemets are left in the text (a speech engine ignores them).
 */
import type { SpeechNormalizationResult } from '../../core';
import { DETERMINISTIC_AT, nfc, speechNormalizeGeneric } from '../shared';

const TOOL = 'speech-fr@1';

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0–99. `final`: nothing follows, so quatre-vingts takes its s. */
function below100(n: number, final: boolean): string {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? TENS[t] : u === 1 ? `${TENS[t]}-et-un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante-et-onze' : `soixante-${below100(n - 60, false)}`;
  return `quatre-vingt${n === 80 && final ? 's' : ''}${n > 80 ? `-${below100(n - 80, false)}` : ''}`;
}

/** 0–999. */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r, final);
  if (h === 1) return r ? `cent-${below100(r, final)}` : 'cent';
  return `${UNITS[h]}-cent${r ? `-${below100(r, final)}` : final ? 's' : ''}`;
}

/** An integer in words (0 – 999 999 999), or null out of range. */
export function frNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return null;
  if (n < 1000) return below1000(n, true);
  const m = Math.floor(n / 1_000_000);
  const t = Math.floor((n % 1_000_000) / 1000);
  const r = n % 1000;
  const parts: string[] = [];
  if (m) parts.push(m === 1 ? 'un million' : `${below1000(m, true)} millions`);
  if (t) parts.push(t === 1 ? 'mille' : `${below1000(t, false)}-mille`);
  if (r) parts.push(below1000(r, true));
  return parts.join(' ');
}

/** 1er → premier, 2e → deuxième, 5e → cinquième, 9e → neuvième, 80e → quatre-vingtième, 21e → vingt-et-unième. */
function ordinalWords(n: number, feminine: boolean): string | null {
  if (n === 1) return feminine ? 'première' : 'premier';
  const w = frNumberToWords(n);
  if (w === null) return null;
  let stem = w;
  if (/cinq$/u.test(stem)) stem += 'u';
  else if (/neuf$/u.test(stem)) stem = stem.slice(0, -1) + 'v';
  else if (/[esx]$/u.test(stem) && !/(?:deux|six|dix)$/u.test(stem)) stem = stem.slice(0, -1);
  return `${stem}ième`;
}

const ABBREVIATIONS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /(?<![\p{L}\p{N}])av\.\s*J\.-C\./gu, replacement: 'avant Jésus-Christ', label: 'av. J.-C.' },
  { pattern: /(?<![\p{L}\p{N}])apr\.\s*J\.-C\./gu, replacement: 'après Jésus-Christ', label: 'apr. J.-C.' },
  { pattern: /(?<![\p{L}\p{N}])MM\./gu, replacement: 'messieurs', label: 'MM.' },
  { pattern: /(?<![\p{L}\p{N}])M\.(?=\s)/gu, replacement: 'monsieur', label: 'M.' },
  { pattern: /(?<![\p{L}\p{N}])Mmes\.?(?![\p{L}\p{N}])/gu, replacement: 'mesdames', label: 'Mmes' },
  { pattern: /(?<![\p{L}\p{N}])Mme\.?(?![\p{L}\p{N}])/gu, replacement: 'madame', label: 'Mme' },
  { pattern: /(?<![\p{L}\p{N}])Mlles\.?(?![\p{L}\p{N}])/gu, replacement: 'mesdemoiselles', label: 'Mlles' },
  { pattern: /(?<![\p{L}\p{N}])Mlle\.?(?![\p{L}\p{N}])/gu, replacement: 'mademoiselle', label: 'Mlle' },
  { pattern: /(?<![\p{L}\p{N}])Dr\.?(?![\p{L}\p{N}])/gu, replacement: 'docteur', label: 'Dr' },
  { pattern: /(?<![\p{L}\p{N}])Pr\.?(?![\p{L}\p{N}])/gu, replacement: 'professeur', label: 'Pr' },
  { pattern: /(?<![\p{L}\p{N}])Me\.(?=\s)/gu, replacement: 'maître', label: 'Me.' },
  { pattern: /(?<![\p{L}\p{N}])Ste\.?(?![\p{L}\p{N}])/gu, replacement: 'sainte', label: 'Ste' },
  { pattern: /(?<![\p{L}\p{N}])St\.?(?![\p{L}\p{N}])/gu, replacement: 'saint', label: 'St' },
  { pattern: /(?<![\p{L}\p{N}])etc\./gu, replacement: 'et cetera', label: 'etc.' },
  { pattern: /(?<![\p{L}\p{N}])[nN]°\s*/gu, replacement: 'numéro ', label: 'n°' },
  { pattern: /(?<![\p{L}\p{N}])pp\.(?=\s*\d)/gu, replacement: 'pages', label: 'pp.' },
  { pattern: /(?<![\p{L}\p{N}])p\.(?=\s*\d)/gu, replacement: 'page', label: 'p.' },
];

export function frenchSpeechNormalize(displayText: string, opts?: { isScripture?: boolean }): SpeechNormalizationResult {
  void opts; // verse markers are stripped in every mode: they are never spoken (the generic step does it)
  const records: SpeechNormalizationResult['transformations'] = [];
  let text = nfc(displayText);
  const step = (next: string, description: string) => {
    if (next !== text) { records.push({ at: DETERMINISTIC_AT, tool: TOOL, description }); text = next; }
  };

  step(text.replace(/[  ]/gu, ' '), 'non-breaking spaces to plain spaces');
  // the dialogue dash is punctuation, not a sound
  step(text.replace(/^([ \t]*)[—–][ \t]*/gmu, '$1'), 'dialogue dash not spoken at the start of a turn');
  step(text.replace(/([.!?…»])[ \t]+[—–][ \t]*/gu, '$1 '), 'dialogue dash after the end of a sentence not spoken');
  // thousands written with a space: 1 500 000 → 1500000
  step(text.replace(/(?<![\d.,])(\d{1,3})((?: \d{3})+)(?!\d)/gu, (_m, a: string, b: string) => a + b.replace(/ /gu, '')), 'thousands groups joined');
  // ordinals: 1er, 1re, 2e, 2d, 21e
  step(text.replace(/(?<![\p{L}\p{N}.,])(\d{1,7})(er|re|e|ème|d|nd)(?![\p{L}\p{N}])/gu, (m, d: string, suf: string) => {
    const w = ordinalWords(Number(d), suf === 're');
    return w === null ? m : w;
  }), 'ordinals to words');
  // decimal comma: 3,5 → 3 virgule 5; leading zeros of the fraction are read out (0,05 → 0 virgule zéro cinq)
  step(text.replace(/(?<![\d.,])(\d{1,7}),(\d{1,6})(?![\d])/gu, (_m, i: string, f: string) => {
    const zeros = /^0*/u.exec(f)![0].length;
    const rest = f.slice(zeros);
    const restWords = rest ? frNumberToWords(Number(rest)) : '';
    if (restWords === null) return _m;
    return `${i} virgule ${[...Array(zeros).fill('zéro'), restWords].filter(Boolean).join(' ')}`;
  }), 'decimal comma to "virgule"');

  const inner = speechNormalizeGeneric(text, {
    tool: TOOL,
    numberToWords: frNumberToWords,
    percentWord: 'pour cent',
    abbreviations: ABBREVIATIONS,
  });
  if (!records.length) return inner;
  return { ...inner, transformations: [...records, ...inner.transformations] };
}
