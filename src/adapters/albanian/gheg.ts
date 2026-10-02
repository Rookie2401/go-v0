/**
 * Gheg forms related to their Standard Albanian equivalents: correspondences, not translations (asht ↔ është,
 * nji ↔ një, punue ↔ punuar). The text is never changed. Package Q4.
 *
 * What this is, and is not. Gheg is a GROUP of varieties (northern Albania, Kosovo, North Macedonia, Montenegro) with
 * no single written norm. These correspondences are a reading aid for a learner who already knows Standard Albanian:
 * machine-drafted, not checked by a speaker. They do not make a text Standard, and a form related here is still a Gheg
 * form (the adapter tags it 'aln'); nothing here is ever generated as if it were Standard.
 *
 * Two layers:
 *  - LISTED PAIRS (confidence 0.8): single words whose correspondence is certain.
 *  - REGULAR PATTERNS (confidence 0.5–0.6), applied only when the result is a form `known` accepts as Standard:
 *      · a Gheg nasal vowel written â ê î ô û ŷ → the Standard vowel (â → ë first, then a; ê → e, then ë;
 *        î → i; ô → o; û → u; ŷ → y): bâj → bëj, nânë → nënë;
 *      · participles in -ue → -uar, -ye → -yer (punue → punuar, shkrue → shkruar), only when the stem before the ending
 *        has three or more letters, so that grue / due / mue do not become "gruar" / "duar" / "muar";
 *      · -ue- → -ua- (grue → grua, due → dua, mue → mua);
 *      · rhotacism, intervocalic n → r (zâni → zëri): applied ONLY together with a nasal-vowel mark in the same form.
 *        On its own it would misfire on ordinary Standard words (venë, Shqipnia, bana, sana ... all contain n between
 *        vowels), so a bare "venë" is never bridged to "verë" and "shqipnia" never to "shqipëria". It is not combined
 *        with the participle or -ua patterns either (not sure enough of the interaction).
 *  A form `known` already accepts as Standard gets [] (it needs no bridge) unless it is a listed pair.
 *
 * Not handled here: the Gheg infinitive "me + participle" (me punue = to work) is TWO words, a construction for the
 * construction layer, not a single-word correspondence. Likewise "kjo âsht ...", "me kênë" are not listed as phrases.
 */
import { sqNormalize } from './orthography';

export interface SqCorrespondence {
  /** The Standard Albanian form (or forms) this written form corresponds to. */
  standard: string;
  /** Which regular correspondence or listed pair says so, in plain words. */
  rule: string;
  /** A listed pair is surer than a pattern. */
  confidence: number;
  /** 'aln' for Gheg in general; a narrower code only when the source says so. */
  variety: string;
}

/** Listed pairs: Gheg written form → Standard form. No identities (kam, ke ... are the same in both). */
const LISTED: ReadonlyArray<readonly [string[], string, string]> = [
  [['âsht', 'asht', 'âshtë', 'ashtë'], 'është', 'Gheg "is" (âsht / asht)'],
  [["s'âsht", "s'asht", "s'âshtë", "s'ashtë"], "s'është", 'Gheg "is not" (s\'âsht)'],
  [['nji'], 'një', 'Gheg "one, a" (nji)'],
  [['shpi', 'shpia'], 'shtëpi', 'Gheg "house" (shpi)'],
  [['tue'], 'duke', 'Gheg "-ing" particle (tue + participle)'],
  [['tash'], 'tani', 'Gheg "now" (tash)'],
  [['çka'], 'çfarë', 'Gheg "what" (çka)'],
  [['un'], 'unë', 'Gheg "I" (un)'],
  [['kênë'], 'qenë', 'Gheg participle "been" (kênë)'],
];

/** Per-form overrides where the Standard form differs by more than the head word (definite forms). */
const LISTED_FORM: Record<string, string> = { shpia: 'shtëpia' };

const LISTED_MAP = new Map<string, { standard: string; what: string }>();
for (const [forms, standard, what] of LISTED) for (const f of forms) LISTED_MAP.set(f, { standard: LISTED_FORM[f] ?? standard, what });

const NASAL: Record<string, string[]> = { 'â': ['ë', 'a'], 'ê': ['e', 'ë'], 'î': ['i'], 'ô': ['o'], 'û': ['u'], 'ŷ': ['y'] };
const VOWELS = new Set([...'aeëiouy']);

interface Cand { standard: string; rule: string; confidence: number; changes: number }

function nasalCandidates(form: string): Cand[] {
  const marks: number[] = [];
  for (let i = 0; i < form.length; i++) if (NASAL[form[i]]) marks.push(i);
  if (marks.length === 0 || marks.length > 6) return [];
  const out: Cand[] = [];
  // every combination of the options for each mark
  let combos: string[][] = [[]];
  for (const p of marks) combos = combos.flatMap((c) => NASAL[form[p]].map((v) => [...c, v]));
  for (const combo of combos) {
    const chars = form.split('');
    const said: string[] = [];
    marks.forEach((p, k) => { said.push(`nasal ${form[p]} is ${combo[k]}`); chars[p] = combo[k]; });
    const base = chars.join('');
    const plain = `Gheg ${said.join(', ')}`;
    out.push({ standard: base, rule: plain, confidence: 0.6, changes: marks.length });
    // rhotacism, only here (with a nasal mark present): n between two vowels → r
    const ns: number[] = [];
    for (let i = 1; i < base.length - 1; i++) if (base[i] === 'n' && VOWELS.has(base[i - 1]) && VOWELS.has(base[i + 1])) ns.push(i);
    if (ns.length > 0 && ns.length <= 4) {
      for (let mask = 1; mask < 1 << ns.length; mask++) {
        const c2 = base.split('');
        let n = 0;
        ns.forEach((p, b) => { if (mask & (1 << b)) { c2[p] = 'r'; n++; } });
        out.push({ standard: c2.join(''), rule: `${plain}; n between vowels is r (rhotacism, only together with a nasal vowel)`, confidence: 0.5, changes: marks.length + n });
      }
    }
  }
  return out;
}

function participleCandidates(form: string): Cand[] {
  const out: Cand[] = [];
  if (form.endsWith('ue') && form.length - 2 >= 3) {
    out.push({ standard: `${form.slice(0, -2)}uar`, rule: 'Gheg participle -ue is Standard -uar', confidence: 0.55, changes: 1 });
  }
  if (form.endsWith('ye') && form.length - 2 >= 2) {
    out.push({ standard: `${form.slice(0, -2)}yer`, rule: 'Gheg participle -ye is Standard -yer', confidence: 0.55, changes: 1 });
  }
  return out;
}

function ueCandidates(form: string): Cand[] {
  const out: Cand[] = [];
  for (let i = form.indexOf('ue'); i !== -1; i = form.indexOf('ue', i + 1)) {
    out.push({ standard: `${form.slice(0, i)}ua${form.slice(i + 2)}`, rule: 'Gheg -ue- is Standard -ua- (grue → grua)', confidence: 0.5, changes: 1 });
  }
  return out;
}

/** Standard equivalents of a Gheg form, restricted to forms `known` accepts as Standard Albanian. May be empty. */
export function ghegToStandard(form: string, known: (form: string) => boolean): SqCorrespondence[] {
  return correspondences(form, known, 'aln', false);
}

/** The pairs and patterns an older Gheg-based spelling shares (used by historical.ts): only those we are sure of. */
const OLDER_LISTED = new Set(['âsht', 'asht', 'âshtë', 'ashtë', "s'âsht", "s'asht", "s'âshtë", "s'ashtë", 'nji', 'tue']);

/**
 * Shared engine of ghegToStandard and historicalToModern. `older` restricts it to what is certain of pre-1972 printing in
 * the Gheg literary tradition (the listed pairs in OLDER_LISTED; nasal vowels without rhotacism; participles; -ue- → -ua-)
 * and tags the result with the variety given.
 */
export function correspondences(form: string, known: (form: string) => boolean, variety: string, older: boolean): SqCorrespondence[] {
  const f = sqNormalize(form).trim();
  if (!f) return [];
  const results: Cand[] = [];
  const listed = older && !OLDER_LISTED.has(f) ? undefined : LISTED_MAP.get(f);
  if (listed && listed.standard !== f && known(listed.standard)) {
    results.push({ standard: listed.standard, rule: `${listed.what} corresponds to Standard "${listed.standard}"`, confidence: 0.8, changes: 0 });
  }
  if (!listed && !known(f)) {
    const nasal = nasalCandidates(f).filter((c) => !older || !c.rule.includes('rhotacism'));
    for (const c of [...nasal, ...participleCandidates(f), ...ueCandidates(f)]) {
      if (c.standard !== f && known(c.standard)) results.push(c);
    }
  }
  // best first; ties keep generation order (the first-listed option of a mark, e.g. â → ë before â → a), which is deterministic
  results.sort((a, b) => b.confidence - a.confidence || a.changes - b.changes);
  const seen = new Set<string>();
  const out: SqCorrespondence[] = [];
  for (const c of results) {
    if (seen.has(c.standard)) continue;
    seen.add(c.standard);
    out.push({ standard: c.standard, rule: older ? `Older Gheg-based spelling: ${c.rule}` : c.rule, confidence: c.confidence, variety });
    if (out.length === 3) break;
  }
  return out;
}
