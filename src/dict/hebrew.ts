/**
 * Hebrew specifics of the dictionary build (2026-11-13).
 *
 * A Wiktionary Hebrew entry is filed under its UNPOINTED headword (`word`: לחם, נקודה), but a card asks the dictionary for the
 * lemma the analyser gave, which is POINTED (לֶחֶם, נְקֻדָּה: the citation form of the Modern index, or the Tanakh index's headword),
 * and a page prints inflected forms the entry lists only on its headword line (פירות, the plural of פְּרִי; נקודת, the construct
 * of נְקֻדָּה). `hebrewAliases(line, entry, normalize)` gives the small form-of entries that make those spellings find the entry:
 *   - each canonical (pointed) spelling → the headword, labelled `alt-of` and `pointed-spelling`;
 *   - each headword-line form (plural, construct, feminine …) → the headword, with Wiktionary's own labels.
 * An alias carries no gloss and no pronunciation of its own, only the relation, as Latin's do (latin.ts). Nothing is invented: every
 * spelling is the source's.
 */
import type { DictionaryEntry } from '../core';

export const HEBREW_POINTED_LABELS: readonly string[] = ['alt-of', 'pointed-spelling'];
const SKIP = new Set(['canonical', 'romanization', 'class', 'table-tags', 'inflection-template', 'error-unrecognized-form', 'alternative', 'abbreviation']);
const MAX_KEY = 40;
const SPELLING_ONLY = /^(?:(?:obsolete|archaic|rare|nonstandard|common|informal)\s+)?(?:defective|plene|alternative|alternate|archaic|obsolete|misspelling|nonstandard)\b[^.]*\b(?:spelling|form)s?\s+of\b/i;
const MAX_ALIASES = 24;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string' && !!t.trim()) : []);

/**
 * A spelling-only entry (נקדה: "defective spelling of נקודה.") as a relation instead of a sense: no gloss of its own, a form-of link to
 * the entry it names, labelled `alt-of` and the kind of spelling. Then a lookup that lands on the spelling follows the link to the real
 * senses ("point, dot, full stop") instead of showing "defective spelling of נקודה." as the meaning. Undefined for any other entry.
 */
export function hebrewSpellingEntry(entry: DictionaryEntry, normalize: (s: string) => string): DictionaryEntry | undefined {
  if (!entry.glosses.length || !entry.glosses.every((g) => SPELLING_ONLY.test(g))) return undefined;
  const targets = [...new Set(entry.glosses.map((g) => /\bof\s+([ְ-ת׳״'"־-]+)/u.exec(g)?.[1]).filter((t): t is string => !!t).map((t) => normalize(t.replace(/[־-]$/u, ''))))];
  if (!targets.length) return undefined;
  const kind = /\b(defective|plene|alternative|alternate|archaic|obsolete|misspelling|nonstandard)\b/i.exec(entry.glosses[0])?.[1].toLowerCase() ?? 'alternative';
  const { senses: _senses, ...rest } = entry;
  return { ...rest, glosses: [], formOf: targets.map((lemma) => ({ lemma, tags: ['alt-of', `${kind}-spelling`] })) };
}

export function hebrewAliases(rawLine: string, entry: DictionaryEntry, normalize: (s: string) => string): DictionaryEntry[] {
  if (entry.altOf?.length || (!entry.glosses.length && entry.formOf?.length)) return [];
  // a spelling entry (נקדה "defective spelling of נקודה") shares its pointed form with the entry it names: only the real entry claims it
  if (entry.glosses.length && entry.glosses.every((g) => SPELLING_ONLY.test(g))) return [];
  let line: unknown;
  try { line = JSON.parse(rawLine.replace(/^﻿/, '')); } catch { return []; }
  if (!isObj(line) || !Array.isArray(line.forms)) return [];
  const out = new Map<string, DictionaryEntry>();
  const add = (form: string, tags: string[]): void => {
    const key = normalize(form.normalize('NFC').replace(/[־-]$/u, ''));
    if (!key || key === entry.form || key.length > MAX_KEY || /[A-Za-z\s]/.test(key) || !/[א-ת]/u.test(key) || out.has(key)) return;
    out.set(key, { form: key, lang: entry.lang, glosses: [], ...(entry.pos ? { pos: entry.pos } : {}), formOf: [{ lemma: entry.form, tags: [...tags] }] });
  };
  for (const f of line.forms.filter(isObj)) {
    if (typeof f.form !== 'string') continue;
    const tags = strings(f.tags);
    if (tags.includes('canonical')) add(f.form, [...HEBREW_POINTED_LABELS]);
    else if (!f.source && tags.length && !tags.some((t) => SKIP.has(t))) add(f.form, tags);
  }
  return [...out.values()].slice(0, MAX_ALIASES);
}
