/**
 * GoLearn Active reads every language a page holds (the owner, 2026-11-09: "make it recognize whatever language is currently present on the
 * page"). A Mechon Mamre Psalm page is Hebrew beside English; a course page is Albanian with English notes; a Greek New Testament page has
 * a German commentary. Until now the page had ONE language, decided from a 400-character sample, and when the sample mixed scripts the
 * learner's selected language was used for every word: English words were underlined as Albanian, and the Hebrew was not read at all.
 *
 * Now each piece of text gets its own language:
 *   - a word in a script that only one pack reads (Hebrew, Greek, Thai, Devanagari) is in that pack's language, when it is installed;
 *   - Latin-script text is decided per block (a paragraph, a table cell, a list item ...): a language declared on the block (lang=) decides;
 *     otherwise the installed Latin-script packs' word lists are compared on the block's own words. A pack that recognises at least
 *     COMPATIBLE_SHARE of them (and MIN_HITS) reads the block; the page's own language wins a near tie, another pack must lead clearly.
 *     A block with fewer than MIN_TOKENS words is too short to tell: it takes the page's language, but only when that language rests on
 *     evidence (the page declares it, the learner chose it for this page, the text shows it), never on the selected language alone.
 *   - text that no installed pack recognises (English, French ...) is in no language: nothing in it is underlined or recorded.
 * Pure apart from reading elements' tag names and lang attributes; no layout, no network.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { mapLanguageTag } from '../language/resolve';

/** Scripts read by exactly one pack: the script is the language. */
export const SCRIPT_LANGUAGE: Readonly<Record<string, string>> = { Hebr: 'he', Grek: 'el', Thai: 'th', Deva: 'hi' };
const SCRIPT_RE: Readonly<Record<string, RegExp>> = {
  Latn: /\p{Script=Latin}/u, Hebr: /\p{Script=Hebrew}/u, Grek: /\p{Script=Greek}/u, Thai: /\p{Script=Thai}/u, Deva: /\p{Script=Devanagari}/u,
};
/** The script each pack's words are written in. */
export const LANGUAGE_SCRIPT: Readonly<Record<string, string>> = { sq: 'Latn', es: 'Latn', de: 'Latn', nb: 'Latn', nn: 'Latn', la: 'Latn', he: 'Hebr', arc: 'Hebr', el: 'Grek', th: 'Thai', hi: 'Deva' };

/** A block whose words a pack's word list recognises at this share (and MIN_HITS) is compatible with it (resolve.ts DEFAULT_COMPATIBLE_SHARE, measured: own prose 70-100 %, foreign at most 38 %). */
export const COMPATIBLE_SHARE = 0.45;
/** Another pack takes a block from the page's language only when it recognises this much more of it. */
export const LEAD_MARGIN = 0.25;
export const MIN_HITS = 3;
/** Fewer Latin-script words than this cannot show which language a block is in. */
export const MIN_TOKENS = 3;

const BLOCK_TAGS = new Set(['P', 'DIV', 'TD', 'TH', 'LI', 'DD', 'DT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'ARTICLE', 'SECTION', 'ASIDE', 'MAIN', 'FIGCAPTION', 'CAPTION', 'LEGEND', 'BODY', 'TR', 'TABLE', 'UL', 'OL', 'DL', 'FORM', 'FIELDSET', 'CENTER', 'ADDRESS']);

/** Does `text` hold a letter of this script? */
export const hasScript = (text: string, script: string): boolean => !!SCRIPT_RE[script]?.test(text);

/** Is a word written in the script its language uses (a Hebrew word read by the Hebrew pack, never an English word read by it)? */
export function wordInScript(surface: string, languageId: string): boolean {
  const script = LANGUAGE_SCRIPT[languageId];
  if (!script) return true;
  let letters = 0, own = 0;
  for (const ch of surface) { if (!/\p{L}/u.test(ch)) continue; letters++; if (SCRIPT_RE[script].test(ch)) own++; }
  return letters > 0 && own * 2 > letters;
}

/** The block a text node belongs to: its nearest block-level ancestor (tag names only, no layout). */
export function blockOf(node: Text): Element | undefined {
  for (let el = node.parentElement; el; el = el.parentElement) if (BLOCK_TAGS.has(el.tagName.toUpperCase())) return el;
  return node.parentElement ?? undefined;
}

/** The language an element (or an ancestor below the root element) declares with lang=, as a pack language; null = declared but no pack. */
function declaredOn(el: Element | undefined): string | null | undefined {
  const root = el?.ownerDocument?.documentElement;
  for (let e: Element | null | undefined = el; e && e !== root; e = e.parentElement) {
    const tag = e.getAttribute('lang') ?? e.getAttribute('xml:lang');
    if (tag === null || tag === undefined) continue;
    if (!tag.trim()) return undefined;
    const m = mapLanguageTag(tag);
    return m.kind === 'pack' ? m.languageId : null;
  }
  return undefined;
}

/** The share of `text`'s words a pack's word list reads as its own (not an inferred reading). */
export function wordListShare(adapter: LanguageAdapter, text: string): { hits: number; words: number; share: number } {
  let toks: ReturnType<LanguageAdapter['tokenize']> = [];
  try { toks = adapter.tokenize(text.normalize('NFC')); } catch { toks = []; }
  const words = toks.filter((t) => t.isWord && /\p{L}/u.test(t.surface));
  if (!words.length) return { hits: 0, words: 0, share: 0 };
  let hits = 0;
  try { hits = adapter.analyze(toks).filter((a) => a.token.isWord && /\p{L}/u.test(a.token.surface) && a.candidates.some((c) => !c.unconfirmed)).length; } catch { hits = 0; }
  return { hits, words: words.length, share: hits / words.length };
}

export interface LatinVerdict { languageId?: string; why: 'declared' | 'detected' | 'page' | 'short' | 'none' }

/**
 * The language of a block's Latin-script text. `latin` is the installed Latin-script packs with their word lists; `page` the page's
 * language when it rests on evidence (or undefined).
 */
export function latinLanguageOf(text: string, latin: ReadonlyArray<{ id: string; adapter: LanguageAdapter }>, page: string | undefined): LatinVerdict {
  const words = (text.match(/\p{Script=Latin}+/gu) ?? []).length;
  if (words < MIN_TOKENS) return page ? { languageId: page, why: 'page' } : { why: 'short' };
  const all = latin.map((l) => ({ id: l.id, ...wordListShare(l.adapter, text) }));
  const shares = all.filter((s) => s.hits >= MIN_HITS && s.share >= COMPATIBLE_SHARE)
    .sort((a, b) => b.share - a.share || b.hits - a.hits || a.id.localeCompare(b.id));
  if (page) {
    // the page's own language (declared, chosen here, or shown by its text) reads every block that no other of the learner's languages
    // clearly claims: a paragraph of words the course word list does not have yet is still the page's language (the dictionary confirms them)
    const own = all.find((s) => s.id === page)?.share ?? 0;
    const rival = shares.find((s) => s.id !== page);
    if (rival && rival.share - own >= LEAD_MARGIN) return { languageId: rival.id, why: 'detected' };
    return { languageId: page, why: 'page' };
  }
  if (!shares.length) return { why: 'none' };
  const top = shares[0];
  const second = shares[1];
  if (!second || top.share - second.share >= LEAD_MARGIN) return { languageId: top.id, why: 'detected' };
  return { why: 'none' }; // two packs read it about as well: not guessed
}

export interface PagePlanOptions {
  /** The installed pack languages this build can analyse. */
  installed: readonly string[];
  adapterOf(languageId: string): LanguageAdapter | undefined;
  /** The page's Latin-script language when it rests on evidence (declared, chosen for this page, detected); undefined otherwise. */
  pageLatin?: string;
}

export interface PagePlan {
  /** The text nodes to read in each language. */
  byLanguage: Map<string, Text[]>;
  /** The languages each node is read in (a mixed-script node is read in each of its scripts' languages). */
  nodeLanguages: WeakMap<Text, string[]>;
  /** Languages whose analyser is installed but not loaded yet, and are needed for these nodes. */
  missing: Set<string>;
}

/** Which language(s) each text node is read in. Block decisions are cached in `cache` (keyed by the block element, checked against its text). */
export function planPage(nodes: readonly Text[], opts: PagePlanOptions, cache: WeakMap<Element, { text: string; verdict: LatinVerdict }> = new WeakMap()): PagePlan {
  const installed = new Set(opts.installed);
  const byLanguage = new Map<string, Text[]>();
  const nodeLanguages = new WeakMap<Text, string[]>();
  const missing = new Set<string>();
  const add = (lang: string, n: Text) => {
    (byLanguage.get(lang) ?? byLanguage.set(lang, []).get(lang)!).push(n);
    const cur = nodeLanguages.get(n); if (cur) { if (!cur.includes(lang)) cur.push(lang); } else nodeLanguages.set(n, [lang]);
  };
  const latin = [...installed].filter((l) => LANGUAGE_SCRIPT[l] === 'Latn');
  const latinLoaded = latin.map((id) => ({ id, adapter: opts.adapterOf(id) })).filter((x): x is { id: string; adapter: LanguageAdapter } => !!x.adapter);

  // the Latin text of each block (all of its nodes in this scan), for the per-block decision
  const blockText = new Map<Element | undefined, string>();
  const latinNodes: Text[] = [];
  for (const n of nodes) {
    for (const [script, lang] of Object.entries(SCRIPT_LANGUAGE)) {
      if (!installed.has(lang) || !hasScript(n.data, script)) continue;
      if (opts.adapterOf(lang)) add(lang, n); else missing.add(lang);
    }
    if (latin.length && hasScript(n.data, 'Latn')) {
      latinNodes.push(n);
      const b = blockOf(n);
      blockText.set(b, (blockText.get(b) ?? '') + ' ' + n.data);
    }
  }
  if (latinNodes.length) for (const l of latin) if (!opts.adapterOf(l)) missing.add(l);
  const verdicts = new Map<Element | undefined, LatinVerdict>();
  for (const [b, raw] of blockText) {
    const text = raw.replace(/\s+/gu, ' ').trim();
    const declared = declaredOn(b);
    if (declared === null) { verdicts.set(b, { why: 'none' }); continue; } // the block says it is a language no installed pack reads
    if (declared && installed.has(declared) && LANGUAGE_SCRIPT[declared] === 'Latn') { verdicts.set(b, { languageId: declared, why: 'declared' }); continue; }
    const hit = b ? cache.get(b) : undefined;
    if (hit && hit.text === text) { verdicts.set(b, hit.verdict); continue; }
    const v = latinLanguageOf(text, latinLoaded, opts.pageLatin);
    verdicts.set(b, v);
    if (b) cache.set(b, { text, verdict: v });
  }
  for (const n of latinNodes) {
    const v = verdicts.get(blockOf(n));
    if (v?.languageId && opts.adapterOf(v.languageId)) add(v.languageId, n);
  }
  return { byLanguage, nodeLanguages, missing };
}
