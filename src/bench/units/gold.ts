/**
 * Reading-unit gold format: one paragraph, cut into reading units (the app's `Sentence` rows).
 *
 *  - JSON Lines (`UnitGoldCase`, one paragraph per line). `unitBoundaries` are UTF-16 offsets at which a new unit
 *    STARTS, excluding 0. A unit starts at its first non-space character, never on whitespace; the whitespace between
 *    two units belongs to the end of the earlier one, and the paragraph's leading indentation to the first unit, so
 *    the units re-joined (`unitsOf(c).join('')`) reproduce the paragraph exactly.
 *  - Editing format (`toEditing` / `fromEditing`), for a person with any text editor: a header line `# <id> <stratum>`,
 *    then one unit per line, a blank line between paragraphs. Editors strip trailing blanks and cannot show a line
 *    break inside a unit, so whitespace at the start or end of a unit line, and every line break / tab inside a unit,
 *    is written with a visible mark: ␣ space, ↵ line feed, ␍ carriage return, ⇥ tab, ⍽ no-break space, ⟦U+XXXX⟧ any
 *    other space character. A paragraph that already contains one of these marks cannot be written in this format.
 *    To split a unit at a space, put ␣ at the end of the first line; to join two units, delete the line break and keep
 *    the ␣. Cutting only moves boundaries: `fromEditing` refuses a unit text that no longer re-joins to the paragraph.
 *  - Offsets and boundary rules are those of `src/bench/shared.ts` (whitespace is never a boundary, never inside a
 *    grapheme cluster or between a Thai leading vowel and its consonant).
 */
import { boundaryProblem, canonicalBoundaries, graphemeBoundaries, isWs } from '../shared';

export type UnitRights = 'rights-safe' | 'personal-copy' | 'derived-cc-by-sa';

export interface UnitGoldCase {
  id: string;
  lang: 'th';
  /** For the constructed set: the hazard (e.g. `dialogue-curly`, `abbreviation`). For course texts: the course stratum. */
  stratum: string;
  paragraph: string;
  unitBoundaries: number[];
  source: { title: string; licence: string; rights: UnitRights };
  segmentedBy: string;
  checkedBy?: string;
  checkedAt?: string;
  notes?: string;
}

export const CONSTRUCTED_SEGMENTED_BY = 'constructed by the benchmark author (machine-drafted Thai, not native-reviewed)';

// ───────────────────────────── units of a case ─────────────────────────────

/** The unit slices: boundary to boundary, so each carries the whitespace that follows it (the first also the indent). */
export function unitsOfText(paragraph: string, unitBoundaries: readonly number[]): string[] {
  const cuts = [0, ...unitBoundaries, paragraph.length];
  const out: string[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) out.push(paragraph.slice(cuts[k], cuts[k + 1]));
  return out;
}
export const unitsOf = (c: Pick<UnitGoldCase, 'paragraph' | 'unitBoundaries'>): string[] => unitsOfText(c.paragraph, c.unitBoundaries);

/** Gold case from the units as an author writes them (each unit carries its trailing whitespace). */
export function boundariesFromUnits(units: readonly string[]): { paragraph: string; unitBoundaries: number[] } {
  const unitBoundaries: number[] = [];
  let at = 0;
  units.forEach((u, k) => { if (k > 0) unitBoundaries.push(at); at += u.length; });
  return { paragraph: units.join(''), unitBoundaries };
}

// ───────────────────────────── validator ─────────────────────────────

const RIGHTS: readonly string[] = ['rights-safe', 'personal-copy', 'derived-cc-by-sa'];

/** Every problem with one case, as plain sentences; an empty list means the case is valid. */
export function validateUnitCase(c: UnitGoldCase): string[] {
  const where = `${c.id ?? '(no id)'}`;
  const errs: string[] = [];
  const add = (m: string) => errs.push(`${where}: ${m}`);
  if (typeof c.id !== 'string' || !c.id || /\s/.test(c.id)) add('id must be a non-empty string without spaces');
  if (c.lang !== 'th') add('lang must be "th"');
  if (typeof c.stratum !== 'string' || !c.stratum || /\s/.test(c.stratum)) add('stratum must be a non-empty string without spaces');
  if (typeof c.paragraph !== 'string' || c.paragraph.trim() === '') { add('paragraph is empty'); return errs; }
  if (!Array.isArray(c.unitBoundaries)) { add('unitBoundaries must be an array'); return errs; }
  if (!c.source || !c.source.title || !c.source.licence || !RIGHTS.includes(c.source.rights)) add('source needs a title, a licence and a rights value');
  if (typeof c.segmentedBy !== 'string' || !c.segmentedBy.trim()) add('segmentedBy must say who or what cut the units');
  if ((c.checkedBy !== undefined) !== (c.checkedAt !== undefined)) add('checkedBy and checkedAt go together');

  const g = graphemeBoundaries(c.paragraph);
  let prev = 0;
  for (const b of c.unitBoundaries) {
    if (!Number.isInteger(b)) { add(`boundary ${String(b)} is not an integer`); continue; }
    if (b <= prev) add(`boundary ${b} is not greater than the one before (boundaries must be strictly increasing)`);
    const problem = boundaryProblem(c.paragraph, b, g);
    if (problem) add(`boundary ${b} is ${problem}`);
    prev = Math.max(prev, b);
  }
  if (errs.length) return errs;
  const units = unitsOf(c);
  units.forEach((u, k) => { if (u.trim() === '') add(`unit ${k + 1} is only whitespace`); });
  if (units.join('') !== c.paragraph) add('the units do not re-join to the paragraph');
  const canon = canonicalBoundaries(c.paragraph, c.unitBoundaries);
  if (canon.length !== c.unitBoundaries.length) add('a boundary lies before the first character of text or is repeated');
  return errs;
}

/** Validate a whole file: every case, and ids must be unique. */
export function validateUnitCases(cases: readonly UnitGoldCase[]): string[] {
  const errs = cases.flatMap(validateUnitCase);
  const seen = new Set<string>();
  for (const c of cases) { if (seen.has(c.id)) errs.push(`${c.id}: duplicate id`); seen.add(c.id); }
  return errs;
}

// ───────────────────────────── JSON Lines ─────────────────────────────

export const toJsonl = (cases: readonly UnitGoldCase[]): string => cases.map((c) => JSON.stringify(c)).join('\n') + (cases.length ? '\n' : '');

export function parseJsonl(text: string): UnitGoldCase[] {
  const out: UnitGoldCase[] = [];
  text.split(/\r?\n/).forEach((line, k) => {
    if (line.trim() === '') return;
    try { out.push(JSON.parse(line) as UnitGoldCase); }
    catch (e) { throw new Error(`line ${k + 1} is not valid JSON (${e instanceof Error ? e.message : String(e)})`); }
  });
  return out;
}

// ───────────────────────────── editing format ─────────────────────────────

const MARKS = { ' ': '␣', '\n': '↵', '\r': '␍', '\t': '⇥', ' ': '⍽' } as const;
const UNMARK: Record<string, string> = { '␣': ' ', '↵': '\n', '␍': '\r', '⇥': '\t', '⍽': ' ' };
const MARK_CHARS = new Set<string>(Object.values(MARKS));

function markChar(ch: string): string {
  const m = (MARKS as Record<string, string>)[ch];
  if (m) return m;
  return `⟦U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟧`;
}

/** One unit as a line: edge whitespace and any line break / tab inside are written with marks. */
export function encodeUnit(unit: string): string {
  let a = 0;
  let b = unit.length;
  while (a < b && isWs(unit[a])) a++;
  while (b > a && isWs(unit[b - 1])) b--;
  const body = [...unit.slice(a, b)].map((ch) => (isWs(ch) && ch !== ' ' ? markChar(ch) : ch)).join('');
  return [...unit.slice(0, a)].map(markChar).join('') + body + [...unit.slice(b)].map(markChar).join('');
}

export function decodeUnit(line: string): string {
  // A person's editor may have stripped or added plain blanks at the line's two ends: they carry no meaning.
  const raw = line.replace(/^[ ]+|[ ]+$/g, '');
  return raw.replace(/⟦U\+([0-9A-Fa-f]{4,6})⟧/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/[␣↵␍⇥⍽]/g, (m) => UNMARK[m]);
}

export function toEditing(cases: readonly UnitGoldCase[]): string {
  return cases.map((c) => {
    if ([...c.paragraph].some((ch) => MARK_CHARS.has(ch) || ch === '⟦')) throw new Error(`${c.id}: the paragraph contains a mark character of the editing format`);
    return [`# ${c.id} ${c.stratum}`, ...unitsOf(c).map(encodeUnit)].join('\n');
  }).join('\n\n') + (cases.length ? '\n' : '');
}

export interface FromEditingOptions {
  /** Existing cases by id: metadata is copied and the paragraph must be unchanged. */
  base?: ReadonlyMap<string, UnitGoldCase>;
  /** Metadata for ids not in `base`. */
  defaults?: Pick<UnitGoldCase, 'source' | 'segmentedBy'> & Partial<Pick<UnitGoldCase, 'checkedBy' | 'checkedAt'>>;
}

/** Parse the editing format. Throws with the id and the reason when a paragraph's text was changed or a header is bad. */
export function fromEditing(text: string, opts: FromEditingOptions = {}): UnitGoldCase[] {
  const out: UnitGoldCase[] = [];
  let cur: { id: string; stratum: string; units: string[] } | undefined;
  const flush = () => {
    if (!cur) return;
    const { paragraph, unitBoundaries } = boundariesFromUnits(cur.units);
    const base = opts.base?.get(cur.id);
    if (base) {
      if (base.paragraph !== paragraph) {
        throw new Error(`${cur.id}: the units no longer re-join to the paragraph (text was changed; a space between two units is written ␣ at the end of the first line)`);
      }
      out.push({ ...base, unitBoundaries });
    } else {
      if (!opts.defaults) throw new Error(`${cur.id}: not in the base file and no defaults were given`);
      out.push({ id: cur.id, lang: 'th', stratum: cur.stratum, paragraph, unitBoundaries, ...opts.defaults });
    }
    cur = undefined;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('#')) {
      flush();
      const m = /^#\s*(\S+)\s+(\S+)\s*$/.exec(raw);
      if (!m) throw new Error(`bad header line "${raw}" (expected "# <id> <stratum>")`);
      cur = { id: m[1], stratum: m[2], units: [] };
    } else if (raw.trim() === '') {
      flush();
    } else {
      if (!cur) throw new Error(`a unit line before any header: "${raw}"`);
      cur.units.push(decodeUnit(raw));
    }
  }
  flush();
  return out;
}
