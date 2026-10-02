/**
 * A small CoNLL-U reader (Universal Dependencies format), written for the Albanian validation work. Pure: it takes
 * the text of a file and returns sentences; it reads no file and keeps nothing.
 *
 * What it understands:
 *   - comment lines `# key = value` (`sent_id`, `text`, ...), other comments are kept under their own text;
 *   - word lines with exactly ten tab-separated columns; `_` means absent (except FORM, which is kept as written);
 *   - multiword-token lines (`3-4<TAB>ta<TAB>_ ...`): one surface token that spans the words 3 to 4;
 *   - empty nodes (`3.1`, enhanced-dependency ellipsis): skipped, they are not words of the sentence;
 *   - FEATS parsed to a record (`Case=Acc|Number=Sing`), MISC to a record, `SpaceAfter=No` honoured.
 *
 * A malformed line throws an Error that names its line number. Every string is NFC-normalized on the way in, so the
 * offsets of tokens in `text` and the forms of the words live in one coordinate system.
 *
 * Offsets: each surface token gets `start` / `end` in `UdSentence.text`. They are found by walking the `# text`
 * comment with the token forms in order (only whitespace may lie between them). When there is no `# text`, or the
 * forms cannot be walked through it (a treebank that normalized its forms), `text` is the text REBUILT from the
 * tokens and `SpaceAfter`, and `textFrom` says 'rebuilt': the comparison then runs on the rebuilt text.
 */

export interface UdWord {
  /** 1-based position in the sentence. */
  id: number;
  form: string;
  lemma?: string;
  upos?: string;
  xpos?: string;
  feats: Record<string, string>;
  head?: number;
  deprel?: string;
  misc: Record<string, string>;
  spaceAfter: boolean;
}

/** One SURFACE token: a multiword token once (with its component words), any other word as itself. */
export interface UdToken {
  form: string;
  /** Offsets in `UdSentence.text`. */
  start: number;
  end: number;
  /** True for a multiword-token range (`3-4`), also when the range was written for a single word. */
  multiword: boolean;
  /** The component words (one for an ordinary token). */
  words: UdWord[];
  spaceAfter: boolean;
}

export interface UdSentence {
  /** The `# sent_id`, or `s<ordinal>` (1-based, in file order) when the sentence has none. */
  id: string;
  text: string;
  textFrom: 'comment' | 'rebuilt';
  /** The text rebuilt from the surface tokens and SpaceAfter, whatever `text` is. */
  rebuilt: string;
  comments: Record<string, string>;
  words: UdWord[];
  tokens: UdToken[];
  /** 1-based line of the sentence's first line in the file. */
  line: number;
}

const nfc = (s: string): string => s.normalize('NFC');

function fail(line: number, message: string): never {
  throw new Error(`conllu line ${line}: ${message}`);
}

function parseFeats(col: string, line: number): Record<string, string> {
  if (col === '_') return {};
  const out: Record<string, string> = {};
  for (const part of col.split('|')) {
    const eq = part.indexOf('=');
    if (eq <= 0 || eq === part.length - 1) fail(line, `FEATS entry "${part}" is not Key=Value`);
    out[nfc(part.slice(0, eq))] = nfc(part.slice(eq + 1));
  }
  return out;
}

function parseMisc(col: string): Record<string, string> {
  if (col === '_') return {};
  const out: Record<string, string> = {};
  for (const part of col.split('|')) {
    const eq = part.indexOf('=');
    if (eq < 0) out[nfc(part)] = '';
    else out[nfc(part.slice(0, eq))] = nfc(part.slice(eq + 1));
  }
  return out;
}

const absent = (col: string): string | undefined => (col === '_' ? undefined : nfc(col));

interface Range { start: number; end: number; form: string; misc: Record<string, string>; line: number }

export function parseConllu(text: string): UdSentence[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const sentences: UdSentence[] = [];

  let comments: Record<string, string> = {};
  let words: UdWord[] = [];
  let wordLines: number[] = [];
  let ranges: Range[] = [];
  let firstLine = 0;

  const reset = (): void => { comments = {}; words = []; wordLines = []; ranges = []; firstLine = 0; };

  const flush = (): void => {
    if (words.length === 0 && ranges.length === 0) { reset(); return; }
    words.forEach((w, i) => { if (w.id !== i + 1) fail(wordLines[i], `word id ${w.id} where ${i + 1} was expected (ids must run 1, 2, 3, ...)`); });
    let lastEnd = 0;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    for (const r of sorted) {
      if (r.start >= r.end) fail(r.line, `multiword range ${r.start}-${r.end} must span at least two words`);
      if (r.end > words.length) fail(r.line, `multiword range ${r.start}-${r.end} runs past the last word (${words.length})`);
      if (r.start <= lastEnd) fail(r.line, `multiword range ${r.start}-${r.end} overlaps the one before it`);
      lastEnd = r.end;
    }
    const rangeAt = new Map(sorted.map((r) => [r.start, r]));

    const tokens: UdToken[] = [];
    for (let i = 0; i < words.length;) {
      const r = rangeAt.get(words[i].id);
      if (r) {
        const comp = words.slice(i, r.end);
        tokens.push({ form: r.form, start: 0, end: 0, multiword: true, words: comp, spaceAfter: r.misc.SpaceAfter !== 'No' });
        i = r.end;
      } else {
        tokens.push({ form: words[i].form, start: 0, end: 0, multiword: false, words: [words[i]], spaceAfter: words[i].spaceAfter });
        i++;
      }
    }

    let rebuilt = '';
    tokens.forEach((t, i) => { rebuilt += t.form; if (t.spaceAfter && i < tokens.length - 1) rebuilt += ' '; });

    const given = comments.text;
    let textFrom: UdSentence['textFrom'] = 'rebuilt';
    let out = rebuilt;
    if (given !== undefined) {
      let cursor = 0;
      let ok = true;
      const spans: Array<[number, number]> = [];
      for (const t of tokens) {
        const at = given.indexOf(t.form, cursor);
        if (at < 0 || given.slice(cursor, at).trim() !== '') { ok = false; break; }
        spans.push([at, at + t.form.length]);
        cursor = at + t.form.length;
      }
      if (ok && given.slice(cursor).trim() === '') {
        tokens.forEach((t, i) => { t.start = spans[i][0]; t.end = spans[i][1]; });
        textFrom = 'comment';
        out = given;
      }
    }
    if (textFrom === 'rebuilt') {
      let pos = 0;
      for (const t of tokens) { t.start = pos; t.end = pos + t.form.length; pos = t.end + (t.spaceAfter ? 1 : 0); }
    }

    sentences.push({
      id: comments.sent_id ?? `s${sentences.length + 1}`,
      text: out, textFrom, rebuilt, comments, words, tokens, line: firstLine,
    });
    reset();
  };

  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const lineNo = n + 1;
    if (raw.trim() === '') { flush(); continue; }
    if (firstLine === 0) firstLine = lineNo;

    if (raw.startsWith('#')) {
      const body = raw.slice(1).trim();
      const eq = body.indexOf('=');
      if (eq > 0) comments[nfc(body.slice(0, eq).trim())] = nfc(body.slice(eq + 1).trim());
      else comments[nfc(body)] = '';
      continue;
    }

    const cols = raw.split('\t');
    if (cols.length !== 10) fail(lineNo, `expected 10 tab-separated columns, found ${cols.length}`);
    const [idCol, formCol, lemmaCol, uposCol, xposCol, featsCol, headCol, deprelCol, , miscCol] = cols;
    if (formCol === '') fail(lineNo, 'empty FORM column (use _ for an absent value)');

    if (/^\d+\.\d+$/.test(idCol)) continue; // empty node: not a word of the sentence

    const range = /^(\d+)-(\d+)$/.exec(idCol);
    if (range) {
      ranges.push({ start: Number(range[1]), end: Number(range[2]), form: nfc(formCol), misc: parseMisc(miscCol), line: lineNo });
      continue;
    }

    if (!/^\d+$/.test(idCol)) fail(lineNo, `ID "${idCol}" is not a word number, a range (3-4) or an empty node (3.1)`);
    if (headCol !== '_' && !/^\d+$/.test(headCol)) fail(lineNo, `HEAD "${headCol}" is not a number or _`);
    const misc = parseMisc(miscCol);
    words.push({
      id: Number(idCol),
      form: nfc(formCol),
      lemma: absent(lemmaCol),
      upos: absent(uposCol),
      xpos: absent(xposCol),
      feats: parseFeats(featsCol, lineNo),
      head: headCol === '_' ? undefined : Number(headCol),
      deprel: absent(deprelCol),
      misc,
      spaceAfter: misc.SpaceAfter !== 'No',
    });
    wordLines.push(lineNo);
  }
  flush();
  return sentences;
}
