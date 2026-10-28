/**
 * German compounds the forms index lacks as whole words (2026-10-27): `Zunftbürger`, `Klassengegensätze`, `ostindische`. For a form the
 * index does not have, this finds the split whose parts the index DOES have and names the compound's own lemma from them. German only,
 * and only ever a fallback after the index lookup: a form the index has is never split.
 *
 * The rule (docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md follow-up):
 *  - a form of at least 8 letters (a-z, ä ö ü ß; forms arrive lower-cased by the analyser) is cut at every point that leaves at least 3
 *    letters on the left and 4 on the right;
 *  - the RIGHT part must be in the index with a NOUN or ADJ first row (not a proper noun, not a closed-class word): its lemma is the head;
 *  - the LEFT part must be in the index (any part of speech but a closed-class word), as written or without a linking element at its end
 *    (s es n en e er ens: klassen -> klasse, betriebs -> betrieb); or the left part is itself a compound by the same rule, one level down
 *    (pfahl + bürger + schaft), and no deeper;
 *  - the longest right part among the valid splits wins;
 *  - the lemma is the left part as written in the form + the head lemma lower-cased, capitalised when the head is a NOUN
 *    (klassengegensätze -> Klassengegensatz NOUN, ostindische -> ostindisch ADJ).
 *
 * Cost: parts are looked up in levels (all right parts; the left parts of the splits whose right part is valid; for a left that is a compound,
 * its own right parts and then left parts), each level ONE `lookupForms` call, and at most COMPOUND_BUDGET distinct strings per request.
 * A form the budget did not reach is reported as unanswered, never as absent.
 */
export type IndexRow = { lemma: string; pos?: string };
export type PartLookup = (forms: string[]) => Promise<Map<string, IndexRow[]>>;

export const COMPOUND_BUDGET = 200;
export const COMPOUND_MIN_FORM = 8;
export const COMPOUND_MIN_LEFT = 3;
export const COMPOUND_MIN_RIGHT = 4;
/** Linking elements at the end of a left part, longest first. */
export const LINKING_ELEMENTS: readonly string[] = ['ens', 'es', 'en', 'er', 'n', 'e', 's'];

const GERMAN_WORD = /^[a-zäöüß]+$/;
const CLOSED = new Set(['DET', 'ADP', 'PRON', 'CONJ', 'CCONJ', 'SCONJ']);
const PROPER = new Set(['PROPN', 'NAME']);

const posOf = (r: IndexRow | undefined): string => (r?.pos ?? '').toUpperCase();
const headRow = (rows: IndexRow[] | undefined): IndexRow | undefined => (rows && rows.length && rows[0].lemma ? rows[0] : undefined);
/** A usable head: NOUN or ADJ, and neither a proper noun nor a closed-class word. */
const isHead = (rows: IndexRow[] | undefined): boolean => { const p = posOf(headRow(rows)); return (p === 'NOUN' || p === 'ADJ') && !PROPER.has(p) && !CLOSED.has(p); };
/** A usable left part: in the index, not a closed-class word. */
const isLeft = (rows: IndexRow[] | undefined): boolean => { const r = headRow(rows); return !!r && !CLOSED.has(posOf(r)); };

/** The spellings a left part may be looked up under: as written, then without a linking element (at least 3 letters stay). */
export function leftVariants(left: string): string[] {
  const out = [left];
  for (const s of LINKING_ELEMENTS) if (left.endsWith(s) && left.length - s.length >= COMPOUND_MIN_LEFT && !out.includes(left.slice(0, -s.length))) out.push(left.slice(0, -s.length));
  return out;
}

export interface CompoundResult {
  /** form -> [lemma, pos] of the compounds that were resolved */
  found: Map<string, [lemma: string, pos: string]>;
  /** Eligible forms the budget did not reach: not answered (neither found nor known to be absent). */
  unanswered: Set<string>;
  /** How many distinct strings were looked up. */
  looked: number;
}

interface Split { i: number; left: string; right: string }
/** Every cut of a word that leaves at least 3 letters on the left and 4 on the right, longest right part first. */
const splitsOf = (word: string): Split[] => {
  const out: Split[] = [];
  for (let i = COMPOUND_MIN_LEFT; i <= word.length - COMPOUND_MIN_RIGHT; i++) out.push({ i, left: word.slice(0, i), right: word.slice(i) });
  return out;
};

const compoundLemma = (left: string, head: IndexRow): [string, string] => {
  const pos = posOf(head);
  const lower = left + head.lemma.toLowerCase();
  return [pos === 'NOUN' ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower, pos];
};

export async function splitCompounds(forms: readonly string[], lookup: PartLookup, budget: number = COMPOUND_BUDGET): Promise<CompoundResult> {
  const found = new Map<string, [string, string]>();
  const unanswered = new Set<string>();
  const memo = new Map<string, IndexRow[]>();
  let looked = 0;

  /** One call for a level. `wants` is per form: the strings that form needs. A form whose strings do not all fit in the budget is dropped (unanswered). Returns the forms that were served. */
  const level = async (wants: Map<string, string[]>): Promise<Set<string>> => {
    const served = new Set<string>();
    const batch = new Set<string>();
    for (const [form, strings] of wants) {
      const fresh = [...new Set(strings)].filter((s) => !memo.has(s) && !batch.has(s));
      if (looked + batch.size + fresh.length > budget) { unanswered.add(form); continue; }
      for (const s of fresh) batch.add(s);
      served.add(form);
    }
    if (batch.size) {
      looked += batch.size;
      const got = await lookup([...batch]);
      for (const s of batch) memo.set(s, got.get(s) ?? []);
    }
    return served;
  };

  const eligible = [...new Set(forms)].filter((f) => f.length >= COMPOUND_MIN_FORM && GERMAN_WORD.test(f));

  // level 1: every right part
  const served1 = await level(new Map(eligible.map((f) => [f, splitsOf(f).map((s) => s.right)])));
  const valid = new Map<string, Split[]>();
  for (const f of eligible) {
    if (!served1.has(f)) continue;
    const ok = splitsOf(f).filter((s) => isHead(memo.get(s.right)));
    if (ok.length) valid.set(f, ok);
  }

  // level 2: the left parts of the splits whose right part is a head
  const served2 = await level(new Map([...valid].map(([f, ss]) => [f, ss.flatMap((s) => leftVariants(s.left))])));
  const pending = new Map<string, Split[]>();
  for (const [f, ss] of valid) {
    if (!served2.has(f)) continue;
    let resolved = false;
    const open: Split[] = [];
    for (const s of ss) { // longest right part first
      if (leftVariants(s.left).some((v) => isLeft(memo.get(v)))) { found.set(f, compoundLemma(s.left, headRow(memo.get(s.right))!)); resolved = true; break; }
      if (s.left.length >= COMPOUND_MIN_LEFT + COMPOUND_MIN_RIGHT) open.push(s);
    }
    if (!resolved && open.length) pending.set(f, open);
  }

  // level 3 (depth 2): a left part that is itself a compound; its own right parts, then its own left parts
  if (pending.size) {
    const served3 = await level(new Map([...pending].map(([f, ss]) => [f, ss.flatMap((s) => splitsOf(s.left).map((x) => x.right))])));
    const sub = new Map<string, Array<{ top: Split; inner: Split }>>();
    for (const [f, ss] of pending) {
      if (!served3.has(f)) continue;
      const list: Array<{ top: Split; inner: Split }> = [];
      for (const top of ss) for (const inner of splitsOf(top.left)) if (isHead(memo.get(inner.right))) list.push({ top, inner });
      if (list.length) sub.set(f, list);
    }
    const served4 = await level(new Map([...sub].map(([f, xs]) => [f, xs.flatMap((x) => leftVariants(x.inner.left))])));
    for (const [f, xs] of sub) {
      if (!served4.has(f)) continue;
      const hit = xs.find((x) => leftVariants(x.inner.left).some((v) => isLeft(memo.get(v)))); // order: longest top right part, then longest inner right part
      if (hit) found.set(f, compoundLemma(hit.top.left, headRow(memo.get(hit.top.right))!));
    }
  }
  for (const f of found.keys()) unanswered.delete(f);
  return { found, unanswered, looked };
}

// ───────────────────────── inflected endings the index has no row for ─────────────────────────

/** Adjective and participle endings, longest first. */
export const ADJECTIVE_ENDINGS: readonly string[] = ['en', 'er', 'em', 'es', 'e'];
export const ENDING_MIN_REMAINDER = 4;
/** The most remainders one call carries (a request has at most 500 forms). */
export const ENDING_MAX_STRINGS = 2_000;

const PRESENT_PARTICIPLE = /end$/;
const PAST_PARTICIPLE = /ge.{2,}(?:t|en)$/;

/** The remainders a form may be an inflection of, in the order they are tried: adjective/participle endings (longest first), then the dative plural in -n. */
function endingCandidates(form: string): Array<{ remainder: string; kind: 'adj' | 'dative' }> {
  const out: Array<{ remainder: string; kind: 'adj' | 'dative' }> = [];
  for (const e of ADJECTIVE_ENDINGS) if (form.endsWith(e) && form.length - e.length >= ENDING_MIN_REMAINDER) out.push({ remainder: form.slice(0, -e.length), kind: 'adj' });
  if (form.endsWith('n') && form.length - 1 >= ENDING_MIN_REMAINDER && form.charAt(form.length - 2) === 'e') out.push({ remainder: form.slice(0, -1), kind: 'dative' });
  return out;
}

/** The row of the remainder that makes the form an inflection of it, or undefined. */
function acceptEnding(kind: 'adj' | 'dative', remainder: string, rows: IndexRow[] | undefined): IndexRow | undefined {
  if (!rows) return undefined;
  if (kind === 'dative') return rows.find((r) => posOf(r) === 'NOUN');
  return rows.find((r) => {
    const p = posOf(r);
    if (p === 'ADJ') return true;
    return p === 'VERB' && (PRESENT_PARTICIPLE.test(remainder) || PAST_PARTICIPLE.test(remainder));
  });
}

/**
 * German forms the index lacks that are an inflected adjective or participle (`kämpfenden` <- `kämpfend`), or a dative plural in -n
 * (`klassenkämpfen` <- `klassenkämpfe`), found by taking the ending off and asking the index for the remainder. ONE `lookupForms` call for
 * all remainders of all forms. The answer is the remainder's own lemma and part of speech, as the index gives them.
 */
export async function retryEndings(forms: readonly string[], lookup: PartLookup): Promise<Map<string, [lemma: string, pos: string]>> {
  const found = new Map<string, [string, string]>();
  const wanted = new Map<string, Array<{ remainder: string; kind: 'adj' | 'dative' }>>();
  const strings = new Set<string>();
  for (const f of new Set(forms)) {
    if (!GERMAN_WORD.test(f)) continue;
    const c = endingCandidates(f);
    if (!c.length || strings.size + c.length > ENDING_MAX_STRINGS) continue;
    wanted.set(f, c);
    for (const x of c) strings.add(x.remainder);
  }
  if (!strings.size) return found;
  const got = await lookup([...strings]);
  for (const [f, cands] of wanted) {
    for (const c of cands) {
      const hit = acceptEnding(c.kind, c.remainder, got.get(c.remainder));
      if (hit) { found.set(f, [hit.lemma, posOf(hit)]); break; }
    }
  }
  return found;
}
