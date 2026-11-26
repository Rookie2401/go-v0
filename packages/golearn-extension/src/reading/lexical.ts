/**
 * Reading Analysis: the words of the text, counted.
 *
 * The text is read node by node with the language's own analyser, exactly as GoLearn Active reads it (`wordsOfText`, src/active/scan.ts: the
 * one place that names a page word), and what is kept is a TABLE, not the text: each distinct word (its form id and the lemma id of every
 * creditable reading) with the number of times it occurs. A novel that uses a word 150 times has one row with 150 on it, and the Repository
 * is asked about that word once. Nothing here knows what the learner knows: the table depends on the text and the language pack only, so it
 * is kept and reused when the same text is analysed again after the learner's knowledge changed.
 *
 * A word the analyser does not have is asked of the language's dictionary (its forms index, in the background: `confirmForms`, the question
 * GoLearn Active asks), in batches, each of which must be answered. A word neither has stays in the table with no reading: it is counted in
 * the total and reported as not identified. It is never dropped and never guessed.
 *
 * Long texts: the work is done in slices of a few milliseconds with a pause between them, so a book does not freeze the page; it can be
 * cancelled between slices; and it has two stated limits (characters, distinct words). Reaching one ends the reading THERE and the table
 * says so (`complete: false`, `analysedCharacters`): a part is never presented as the whole.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { wordInScript } from '../active/pageLanguages';
import { wordsOfText } from '../active/scan';
import { MAX_CONFIRM_FORMS, isUnitId, type ConfirmFormsReply } from '../protocol';
import { MAX_READINGS, type WireWord } from './protocol';

/** About six times War and Peace. A text longer than this is read up to here and reported as partly read. */
export const MAX_CHARACTERS = 20_000_000;
export const MAX_DISTINCT_WORDS = 400_000;
/** How long one slice of work may run before the page gets the thread back. */
export const SLICE_MS = 12;

export interface TableWord { word: WireWord; occurrences: number }

export interface LexicalTable {
  languageId: string;
  varietyId?: string;
  /** The analyser's version: a table made by another version is not reused. */
  analyser: string;
  fingerprint: string;
  words: TableWord[];
  /** Eligible word occurrences: the sum of `occurrences`. */
  total: number;
  characters: number;
  analysedCharacters: number;
  complete: boolean;
  /** `asked`: every word the analyser did not have was asked of the dictionary. `unavailable`: it could not be asked about some. `no-index`: the language has no forms index here. `not-needed`: the analyser had them all. */
  dictionary: 'asked' | 'unavailable' | 'no-index' | 'not-needed';
}

export interface BuildOptions {
  nodes: readonly Text[];
  fingerprint: string;
  adapter: LanguageAdapter;
  languageId: string;
  varietyId?: string;
  signal: AbortSignal;
  onProgress?(done: number, total: number): void;
  confirmForms?: (forms: string[], languageId: string) => Promise<ConfirmFormsReply | undefined>;
  limits?: { characters?: number; distinctWords?: number };
  /** A clock and a pause, for tests. */
  now?: () => number;
  pause?: () => Promise<void>;
}

const FORM_LETTERS = /^[\p{L}\p{M}]+$/u;
const SEP = '\u0001';

export async function buildLexicalTable(o: BuildOptions): Promise<LexicalTable> {
  const now = o.now ?? (() => performance.now());
  const pause = o.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const maxChars = o.limits?.characters ?? MAX_CHARACTERS;
  const maxWords = o.limits?.distinctWords ?? MAX_DISTINCT_WORDS;
  const analyze = o.varietyId ? { varietyId: o.varietyId } : undefined;
  const rows = new Map<string, { form: string; readings: string[]; occurrences: number }>();
  const characters = o.nodes.reduce((sum, n) => sum + n.data.length, 0);
  let analysedCharacters = 0;
  let total = 0;
  let complete = true;
  let sliceStart = now();

  for (const node of o.nodes) {
    if (now() - sliceStart >= SLICE_MS) {
      o.onProgress?.(analysedCharacters, characters);
      await pause();
      o.signal.throwIfAborted();
      sliceStart = now();
    }
    const data = node.data;
    // a limit ends the reading at a node boundary: a node is read whole or not at all, so no word is cut in two
    if (analysedCharacters + data.length > maxChars || rows.size >= maxWords) { complete = false; break; }
    for (const w of wordsOfText(data, o.adapter, o.languageId, analyze)) {
      if (!wordInScript(w.surface, o.languageId)) continue; // a word of another script is not a word of this language's text
      const form = w.ids[0];
      if (!isUnitId(form)) continue; // a form too long to be a unit id is not a word (a run of letters with no spaces)
      // more readings than a word can carry: it is sent with none (the form's own record may still answer) rather than with some of them
      const readings = w.readings.length > MAX_READINGS || !w.readings.every(isUnitId) ? [] : w.readings;
      const key = form + SEP + readings.join(SEP);
      const row = rows.get(key);
      if (row) row.occurrences += 1; else rows.set(key, { form, readings, occurrences: 1 });
      total += 1;
    }
    analysedCharacters += data.length;
  }
  o.signal.throwIfAborted();
  o.onProgress?.(analysedCharacters, characters);

  // the dictionary, for the words the analyser did not have: letters only, once each
  const prefix = `form:${o.languageId}:`;
  const unread = [...rows.values()].filter((r) => !r.readings.length && r.form.startsWith(prefix) && FORM_LETTERS.test(r.form.slice(prefix.length)));
  let dictionary: LexicalTable['dictionary'] = unread.length ? 'asked' : 'not-needed';
  if (unread.length) {
    if (!o.confirmForms) dictionary = 'unavailable';
    else {
      const byForm = new Map<string, typeof unread>();
      for (const r of unread) { const f = r.form.slice(prefix.length); (byForm.get(f) ?? byForm.set(f, []).get(f)!).push(r); }
      let pending = [...byForm.keys()];
      // a form the worker's budget did not reach is absent from the reply and asked again; a round that answers nothing ends the asking
      for (let round = 0; round < 50 && pending.length && dictionary === 'asked'; round++) {
        const left: string[] = [];
        let answered = 0;
        for (let i = 0; i < pending.length && dictionary === 'asked'; i += MAX_CONFIRM_FORMS) {
          o.signal.throwIfAborted();
          const batch = pending.slice(i, i + MAX_CONFIRM_FORMS);
          let reply: ConfirmFormsReply | undefined;
          try { reply = await o.confirmForms(batch, o.languageId); } catch { reply = undefined; }
          o.signal.throwIfAborted();
          if (!reply || !reply.ok || typeof reply.forms !== 'object' || !reply.forms) { dictionary = 'unavailable'; break; }
          for (const f of batch) {
            if (!Object.prototype.hasOwnProperty.call(reply.forms, f)) { left.push(f); continue; }
            answered += 1;
            const hit = reply.forms[f];
            const lemma = Array.isArray(hit) && typeof hit[0] === 'string' && hit[0] ? hit[0] : undefined;
            const pos = Array.isArray(hit) && typeof hit[1] === 'string' && /^[A-Za-z]{1,8}$/.test(hit[1]) ? hit[1] : undefined;
            // a language whose dictionary keys have no vowels (Arabic) mints no lemma id from them: the form stays a form unit (see `bareDictionaryHeads`)
            const lemmaId = lemma && !o.adapter.bareDictionaryHeads ? `lemma:${o.languageId}:${lemma}${pos ? ':' + pos : ''}` : undefined;
            if (lemmaId && isUnitId(lemmaId)) for (const r of byForm.get(f) ?? []) r.readings = [lemmaId];
          }
          if (reply.reason) { dictionary = reply.reason === 'no-pack' || reply.reason === 'no-index' ? 'no-index' : 'unavailable'; break; }
        }
        if (dictionary === 'asked' && left.length && !answered) dictionary = 'unavailable';
        pending = left;
      }
      if (dictionary === 'asked' && pending.length) dictionary = 'unavailable';
    }
  }

  const words: TableWord[] = [...rows.values()].map((r) => ({ word: [r.form, ...r.readings] as unknown as WireWord, occurrences: r.occurrences }));
  return {
    languageId: o.languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}), analyser: o.adapter.version, fingerprint: o.fingerprint,
    words, total, characters, analysedCharacters, complete, dictionary,
  };
}
