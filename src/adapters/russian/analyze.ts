/**
 * The context-free readings of one Russian word token: what the installed form indexes (russian/index-store.ts) say a written form
 * can be, best first. No neighbour is looked at here (russian/sentence.ts orders readings by context and may only reorder them and
 * lower a confidence).
 *
 * What a reading is:
 *  - one candidate per (lemma, bundle of features) of one lemma; readings of ONE lemma that differ in exactly one feature are merged
 *    into one with a union value ("новые": Case=Acc,Nom|Number=Plur). The merge is made along one feature at a time between
 *    readings with the same other features, the same register labels and the same stress, so a union never allows a combination the
 *    rows do not hold. Readings of different lemmas are never merged (стали stays a verb AND a noun; за́мок and замо́к stay two).
 *  - the lemma is the headword's key (`lemmaOfId`: unstressed, ё kept), the gloss and the aspect partners are the lemma row's.
 *  - confidence (PLAN.md): a form the index holds as written 0.90; a ё-restored reading 0.88 when the key as written has no reading
 *    and 0.70 beside one; a reading the source labels dated, archaic, rare or colloquial 0.10 lower; a hyphenated word read through
 *    its parts 0.60 (0.80 when the index holds the lemma with the particle); a guess from the ending 0.35, unconfirmed, no gloss.
 *  - order: as written before ё-restored, readings that agree with a stress mark the text wrote first, then the lemma's count (high
 *    first), then the fixed order of the features (nominative before accusative before genitive …, singular before plural, finite
 *    before participle), a reading with a register label after the same lemma's plain ones.
 */
import type { AnalysisCandidate, PartOfSpeech, RawToken } from '../../core';
import { RU_PRONOUN_LEXEME, ruClosedFor } from './closed';
import { RU_FORM_PRIORS } from './generated/form-priors';
import { RU_PRIORS } from './generated/priors';
import { ruGuess } from './guess';
import { lemmaOfId, lookupRussianForm, lookupRussianLemma, type RuIndexHit, type RuLemmaRow } from './index-store';
import { RU_LOWERED_USAGE, ruFeaturesOfCode } from './tags';
import { CYRILLIC_LETTER, hyphenParts, impliedStress, ruKey, stressPositions, withStress, yoFold } from './text';
import { RU_SOURCE_IDS } from './version';

type Morph = Record<string, string>;

/** One reading before it becomes a candidate. */
interface Reading {
  lemmaId: string;
  row: RuLemmaRow | undefined;
  lemma: string;
  pos: PartOfSpeech;
  viaYo: boolean;
  morph: Morph;
  usage: string[];
  /** The forms with their stress marks the rows give ("кни́гу"); a reading can have several. */
  stress: string[];
  stressPositions: number[][];
  hand: boolean;
  /** The source lists this е-spelling of a ё-word itself (an `alternative` row): the ё-restored reading then counts as written. */
  listed?: boolean;
  /** Set when the lemma is much rarer than the commonest lemma of the form: that lemma's headword. */
  rarerThan?: string;
  /** With rarerThan: the form is this lemma's own headword and the commonest lemma has it in the same case and number (очки, plural-only, beside очко): lemma counts do not separate them. */
  rarerSameSlot?: boolean;
  /** The treebank has this form with other readings only (form priors): lowered, and says so. */
  unseen?: boolean;
  /** Set by a merge of several lemma ids that read alike (за́мок / замо́к): the glosses, the partners and whether every member is lowered. */
  glossText?: string;
  partnersAll?: string[];
  allLowered?: boolean;
  /** The treebank has this form far more often as another reading: that reading's lemma and part of speech. */
  formRarer?: string;
}

const CONF_AS_WRITTEN = 0.9;
const CONF_YO_ALONE = 0.88;
const CONF_YO_BESIDE = 0.7;
const CONF_PARTS = 0.6;
const CONF_PARTS_LEMMA = 0.8;
const CONF_GUESS = 0.35;
const CONF_HAND = 0.9;
const USAGE_PENALTY = 0.1;
const RARE_PENALTY = 0.2;
/** The matched rows of the form priors must total this much before an unmatched reading is lowered. */
const FORM_PRIORS_MIN = 10;
/** Among the readings the form priors give, one under a tenth of the commonest one's count is lowered, when that count is at least this. */
const FORM_TOP_MIN = 20;
const FORM_RATIO = 10;
/** A lemma this much rarer than the form's commonest lemma (count < top / 50, or none at all while top >= 20) is lowered. */
const RARE_TOP_MIN = 20;
/** A lemma the corpus never saw is lowered already beside a lemma seen this often. */
const RARE_ZERO_TOP_MIN = 5;
const RARE_RATIO = 50;
const round2 = (x: number): number => Math.round(x * 100) / 100;

// ───────────────────────────── from hits to readings ─────────────────────────────

function stressOf(hit: RuIndexHit): { text?: string; positions: number[] } {
  const positions = hit.stress.length ? hit.stress : impliedStress(hit.key);
  return positions.length ? { text: withStress(hit.key, positions), positions } : { positions: [] };
}

function readingsOf(hits: readonly RuIndexHit[]): Reading[] {
  const by = new Map<string, Reading>();
  for (const h of hits) {
    const { morph, usage } = ruFeaturesOfCode(h.code, h.lemma[2], h.lemma[3]);
    if (h.lemma[2] === 'PRON') for (const [k, v] of Object.entries(RU_PRONOUN_LEXEME[lemmaOfId(h.lemmaId)] ?? {})) if (!(k in morph)) morph[k] = v;
    const sig = `${h.lemmaId}\t${h.viaYo ? 1 : 0}\t${JSON.stringify(Object.entries(morph).sort())}\t${usage.join(',')}`;
    const s = stressOf(h);
    const have = by.get(sig);
    if (have) {
      if (s.text && !have.stress.includes(s.text)) { have.stress.push(s.text); have.stressPositions.push(s.positions); }
      continue;
    }
    by.set(sig, {
      lemmaId: h.lemmaId, row: h.lemma, lemma: lemmaOfId(h.lemmaId), pos: h.lemma[2] as PartOfSpeech, viaYo: h.viaYo, morph, usage,
      stress: s.text ? [s.text] : [], stressPositions: s.text ? [s.positions] : [], hand: false,
    });
  }
  return settleAlternatives([...by.values()]);
}

const ALT = 'alternative spelling';
/** Whether reading `o` carries every feature of `r` (r's values among o's) — r says nothing o does not say. */
function covers(o: Reading, r: Reading): boolean {
  return Object.entries(r.morph).every(([k, v]) => k in o.morph && v.split(',').every((x) => o.morph[k].split(',').includes(x)));
}

/**
 * A row the source files as an alternative spelling ("шел" for шёл, "все" for всё) is a reading of the target lemma. When the same
 * lemma comes back ё-restored with the same features, the two say one thing: the restored reading is kept, at the confidence of a
 * reading as written (the source itself lists the е-spelling), and the alternative row is dropped.
 */
function settleAlternatives(list: Reading[]): Reading[] {
  const drop = new Set<Reading>();
  for (const a of list) {
    if (a.viaYo || !a.usage.includes(ALT)) continue;
    const twin = list.find((y) => y.viaYo && y.lemmaId === a.lemmaId && covers(y, a));
    if (!twin) continue;
    drop.add(a);
    for (const y of list) if (y.viaYo && y.lemmaId === a.lemmaId && covers(y, a)) { y.listed = true; if (!y.usage.includes(ALT)) y.usage = [...y.usage, ALT]; }
  }
  return list.filter((r) => !drop.has(r));
}

// ───────────────────────────── unions ─────────────────────────────

/** The order the keys are merged in: the one that makes the readable unions first (cases of one gender, then genders). */
const MERGE_KEYS = ['Case', 'Gender', 'Number', 'Person', 'Animacy', 'Tense', 'Voice', 'Mood'];

const sameUsageStress = (r: Reading): string => `${r.lemmaId}\t${r.viaYo ? 1 : 0}\t${r.hand ? 1 : 0}\t${[...r.usage].sort().join(',')}\t${[...r.stress].sort().join('/')}`;

/**
 * Merge readings of one lemma along one feature at a time: readings that have the same keys, the same values everywhere else, the
 * same register labels and the same stress become one reading whose value for that feature is the sorted union. Merging along one
 * feature between otherwise equal readings is exact: the union names precisely the cells the rows hold.
 */
function mergeUnions(readings: Reading[]): Reading[] {
  let list = readings;
  for (let changed = true; changed;) {
    changed = false;
    for (const key of MERGE_KEYS) {
      const next: Reading[] = [];
      const buckets = new Map<string, Reading[]>();
      for (const r of list) {
        if (!(key in r.morph)) { next.push(r); continue; }
        const others = Object.entries(r.morph).filter(([k]) => k !== key).sort();
        const sig = `${sameUsageStress(r)}	${JSON.stringify(others)}`;
        const group = buckets.get(sig);
        if (group) group.push(r); else buckets.set(sig, [r]);
      }
      for (const group of buckets.values()) {
        if (group.length === 1) { next.push(group[0]); continue; }
        const values = new Set<string>();
        for (const r of group) for (const v of r.morph[key].split(',')) values.add(v);
        next.push({ ...group[0], morph: { ...group[0].morph, [key]: [...values].sort().join(',') } });
        changed = true;
      }
      list = next;
    }
  }
  // a reading that only says less than another of the same lemma (the participle without its case beside the participle in the
  // nominative) adds nothing: it is left out
  return list.filter((r) => !list.some((o) => o !== r && sameUsageStress(o) === sameUsageStress(r) && says(o, r)));
}

/** Whether reading `o` has every feature of `r` (its values among o's values) and more. */
function says(o: Reading, r: Reading): boolean {
  const ok = Object.keys(o.morph).length;
  if (ok <= Object.keys(r.morph).length) return false;
  return Object.entries(r.morph).every(([k, v]) => k in o.morph && v.split(',').every((x) => o.morph[k].split(',').includes(x)));
}

/**
 * Two lemma ids of one headword that read the same (друг|NOUN and друг|NOUN|2, за́мок and замо́к) are one item for the learner, who
 * knows them by one id: readings with the same lemma, part of speech, features and ё-marking become one. Confidence is the higher
 * (a member that is not lowered keeps the merged reading unlowered), the glosses are the distinct ones (three at most), the stresses
 * the distinct spellings, the stress the text wrote first; partners and register labels are unions.
 */
function mergeSameReading(readings: Reading[], marked: number[]): Reading[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const k = r.hand ? `hand\t${r.lemmaId}` : `${r.lemma}\t${r.pos}\t${r.viaYo}\t${JSON.stringify(Object.entries(r.morph).sort())}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  const out: Reading[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    g.sort((a, b) => countOf(b) - countOf(a));
    const entries: Array<{ stress?: string; positions: number[]; gloss?: string; match: number }> = [];
    for (const m of g) {
      const gloss = m.row?.[1] || undefined;
      if (!m.stress.length) entries.push({ positions: [], gloss, match: 1 });
      m.stress.forEach((st, i) => entries.push({ stress: st, positions: m.stressPositions[i] ?? [], gloss, match: marked.length && !sameStress(m.stressPositions[i] ?? [], marked) ? 1 : 0 }));
    }
    entries.sort((a, b) => a.match - b.match);
    const stress = [...new Set(entries.map((e) => e.stress).filter((x): x is string => !!x))];
    const glosses = [...new Set(entries.map((e) => e.gloss).filter((x): x is string => !!x))].slice(0, 3);
    // a member that is not lowered speaks for the merged reading: the labels of the lowered ones are left out
    const plain = g.filter((m) => !lowered(m));
    const usage = [...new Set((plain.length ? plain : g).flatMap((m) => m.usage))];
    const partners = [...new Set(g.flatMap((m) => m.row?.[5] ?? []))];
    out.push({
      ...g[0], stress, stressPositions: entries.filter((e) => e.stress).map((e) => e.positions), usage,
      glossText: glosses.join('; ') || undefined, partnersAll: partners, allLowered: g.every((m) => lowered(m)),
      listed: g.some((m) => m.listed) || undefined,
    });
  }
  return out;
}

// ───────────────────────────── order ─────────────────────────────

const CASES = ['Nom', 'Gen', 'Dat', 'Acc', 'Ins', 'Prep', 'Loc', 'Par', 'Voc'];
const rankOf = (order: readonly string[], v: string | undefined): number => {
  if (v === undefined) return -1;
  let best = order.length;
  for (const x of v.split(',')) { const i = order.indexOf(x); if (i >= 0 && i < best) best = i; }
  return best;
};
const featureRank = (m: Morph): number[] => [
  rankOf(['Fin', 'Inf', 'Part', 'Conv'], m.VerbForm),
  rankOf(CASES, m.Case),
  rankOf(['Sing', 'Plur'], m.Number),
  rankOf(['Masc', 'Fem', 'Neut'], m.Gender),
  rankOf(['1', '2', '3'], m.Person),
  rankOf(['Pres', 'Past', 'Fut'], m.Tense),
  rankOf(['Short'], m.Variant),
];
const cmpRank = (a: number[], b: number[]): number => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const lowered = (r: Reading): boolean => r.allLowered ?? r.usage.some((u) => RU_LOWERED_USAGE.has(u));
const countOf = (r: Reading): number => r.row?.[4] ?? 0;

function sameStress(a: readonly number[], b: readonly number[]): boolean { return a.length === b.length && a.every((x) => b.includes(x)); }

// ───────────────────────────── what running text has ─────────────────────────────

const NOMINAL_POS = new Set(['NOUN', 'PROPN', 'ADJ', 'DET', 'PRON', 'NUM']);
/** The prior weight of a reading: the counts of running text (UD Russian-GSD train) of every combination its values allow. */
function weightOf(r: Reading): number {
  const m = r.morph;
  const vals = (k: string): string[] => (m[k] ? m[k].split(',') : ['-']);
  let sum = 0;
  if (m.VerbForm && (r.pos === 'VERB' || r.pos === 'AUX')) {
    for (const mood of m.VerbForm === 'Fin' ? vals('Mood') : ['-'])
      for (const tense of mood === 'Imp' ? ['-'] : vals('Tense'))
        for (const num of m.VerbForm === 'Conv' || m.VerbForm === 'Inf' ? ['-'] : vals('Number'))
          for (const per of m.VerbForm === 'Fin' ? vals('Person') : ['-'])
            for (const vf of vals('VerbForm')) sum += RU_PRIORS.verbal[`${vf}|${mood}|${tense}|${num}|${per}`] ?? 0;
    return sum;
  }
  if (NOMINAL_POS.has(r.pos)) {
    const table = RU_PRIORS.nominal[r.pos] ?? {};
    if (m.Degree === 'Cmp' && !m.Case) return table['Cmp|-'] ?? 0;
    for (const c of m.Variant === 'Short' ? ['Short'] : vals('Case'))
      for (const n of vals('Number')) sum += table[`${c === 'Loc' ? 'Prep' : c}|${n}`] ?? 0;
  }
  return sum;
}

const NOMINAL_TOTAL: Record<string, number> = {};
for (const [pos, t] of Object.entries(RU_PRIORS.nominal)) NOMINAL_TOTAL[pos] = Object.values(t).reduce((a, b) => a + b, 0);
const VERBAL_TOTAL = Object.values(RU_PRIORS.verbal).reduce((a, b) => a + b, 0);
const SHARE_FLOOR = 1e-4;

/**
 * The share of its part of speech's running tokens that have this reading's bundle (1 for a reading with no inflection: an adverb,
 * a preposition, a headword row). A bundle the priors never saw gets a tiny share, so that lemma counts still order such readings.
 */
function shareOf(r: Reading, w: number): number {
  const m = r.morph;
  if (m.VerbForm && (r.pos === 'VERB' || r.pos === 'AUX')) return Math.max(w / VERBAL_TOTAL, SHARE_FLOOR);
  const inflected = m.Case !== undefined || m.Variant === 'Short' || (m.Degree === 'Cmp' && NOMINAL_POS.has(r.pos));
  if (NOMINAL_POS.has(r.pos) && inflected) return Math.max(w / (NOMINAL_TOTAL[r.pos] || 1), SHARE_FLOOR);
  return 1;
}
const scoreOf = (r: Reading, w: number): number => (countOf(r) + 0.5) * shareOf(r, w);

const dictPos = (a: string, b: string): boolean => a === b || (a === 'DET' && b === 'PRON') || (a === 'PRON' && b === 'DET');

/** The treebank's count for a reading of this form (its lemma, through yoFold, and its part of speech; DET and PRON are alike), or undefined. */
function formCount(rows: ReadonlyArray<[string, string, number]>, r: Reading): number | undefined {
  let best: number | undefined;
  for (const [lemma, upos, n] of rows) if (yoFold(lemma) === yoFold(r.lemma) && dictPos(upos, r.pos)) best = Math.max(best ?? 0, n);
  return best;
}

/** B: a lemma that is much rarer than the commonest lemma of the form is lowered (it stays in the list); a lone reading never is. */
function markRarer(readings: Reading[], key?: string): void {
  if (readings.length < 2) return;
  let top: Reading | undefined;
  for (const r of readings) if (!r.hand && (!top || countOf(r) > countOf(top))) top = r;
  if (!top || countOf(top) < RARE_ZERO_TOP_MIN) return;
  const t = countOf(top);
  for (const r of readings) {
    if (r.hand || r.lemmaId === top.lemmaId) continue;
    const c = countOf(r);
    if (c === 0 || (t >= RARE_TOP_MIN && c < t / RARE_RATIO)) {
      r.rarerThan = top.lemma;
      // a lemma's count is over all its forms: where the rarer lemma is written exactly as its headword and the commonest has this very
      // spelling in the same case and number, the counts do not decide (очко "point" counts mostly singular; очки "glasses" is plural only)
      if (key && yoFold(r.lemma) === key && r.pos === top.pos && !!r.morph.Case && r.morph.Case === top.morph.Case && r.morph.Number === top.morph.Number) r.rarerSameSlot = true;
    }
  }
}

// ───────────────────────────── candidates ─────────────────────────────

interface Ctx { anyDirect: boolean }

function toCandidate(r: Reading, ctx: Ctx): AnalysisCandidate {
  let confidence = r.hand ? CONF_HAND : r.viaYo && !r.listed ? (ctx.anyDirect ? CONF_YO_BESIDE : CONF_YO_ALONE) : CONF_AS_WRITTEN;
  if (lowered(r)) confidence -= USAGE_PENALTY;
  if (r.rarerThan) confidence -= r.rarerSameSlot ? RARE_PENALTY / 2 : RARE_PENALTY;
  if (r.unseen) confidence -= RARE_PENALTY;
  if (r.formRarer) confidence -= RARE_PENALTY;
  const notes: Record<string, string | string[]> = {};
  if (r.stress.length) notes.stress = r.stress.join(' / ');
  if (r.viaYo) notes.yo = 'restored';
  if (r.usage.length) notes.usage = [...r.usage];
  const partners = r.partnersAll ?? r.row?.[5];
  if (partners?.length) notes.partners = partners.join(', ');
  if (r.rarerThan) notes.context = `much rarer than ${r.rarerThan} in running text`;
  else if (r.unseen) notes.context = 'not seen with this reading in running text';
  else if (r.formRarer) notes.context = r.formRarer;
  const c: AnalysisCandidate = {
    lemma: r.lemma, pos: r.pos, morph: { ...r.morph }, confidence: round2(confidence),
    origin: r.hand ? 'hand' : 'dictionary', sourceId: r.hand ? RU_SOURCE_IDS.closed : RU_SOURCE_IDS.tables,
  };
  const gloss = r.glossText ?? r.row?.[1];
  if (gloss) c.gloss = gloss;
  if (Object.keys(notes).length) c.notes = notes;
  return c;
}

/** The readings the index holds for a key, merged and ordered, with the hand readings for what the index lacks. */
function dictionaryReadings(key: string, markedStress: number[]): { readings: Reading[]; ctx: Ctx } {
  const hits = lookupRussianForm(key);
  const ctx: Ctx = { anyDirect: hits.some((h) => !h.viaYo) };
  let readings = readingsOf(hits);

  // closed-class forms the index does not hold (same lemma and part of speech)
  for (const e of ruClosedFor(key)) {
    if (readings.some((r) => r.lemma === e.lemma && r.pos === e.pos)) continue;
    const id = `${e.lemma}|${e.pos}`;
    ctx.anyDirect = true;
    readings.push({ lemmaId: id, row: lookupRussianLemma(id), lemma: e.lemma, pos: e.pos, viaYo: false, morph: { ...e.morph }, usage: [], stress: [], stressPositions: [], hand: true });
  }

  // one lemma's readings → unions, per lemma
  const byLemma = new Map<string, Reading[]>();
  for (const r of readings) {
    const k = `${r.lemmaId}	${r.viaYo}	${r.listed ?? false}	${r.hand}`;
    const g = byLemma.get(k);
    if (g) g.push(r); else byLemma.set(k, [r]);
  }
  readings = mergeSameReading([...byLemma.values()].flatMap((g) => mergeUnions(g)), markedStress);
  markRarer(readings, yoFold(key));

  const wt = new Map<Reading, number>();
  const score = new Map<Reading, number>();
  for (const r of readings) { const w = weightOf(r); wt.set(r, w); score.set(r, scoreOf(r, w)); }

  // the treebank's own counts for this form, when it has the form with several readings
  const rows = RU_FORM_PRIORS.forms[key];
  const fc = new Map<Reading, number>();
  const exact = new Set<Reading>();
  if (rows) {
    for (const r of readings) { const n = formCount(rows, r); if (n !== undefined) { fc.set(r, n); exact.add(r); } }
    // a row whose part of speech fits no reading but whose lemma fits some counts for all readings of that lemma
    for (const [lemma, upos, n] of rows) {
      if (readings.some((r) => yoFold(lemma) === yoFold(r.lemma) && dictPos(upos, r.pos))) continue;
      // (a lemma some reading of which the rows already match by part of speech keeps those matches only)
      const lemmaMatched = [...exact].some((e) => yoFold(e.lemma) === yoFold(lemma));
      if (lemmaMatched) continue;
      for (const r of readings) if (yoFold(lemma) === yoFold(r.lemma)) fc.set(r, Math.max(fc.get(r) ?? 0, n));
    }
  }
  // a reading the treebank gives this form is not 'rarer' than another lemma of the form: the treebank has seen it
  for (const r of fc.keys()) r.rarerThan = undefined;
  if (fc.size) {
    let topR: Reading | undefined;
    for (const [r, n] of fc) if (!topR || n > (fc.get(topR) ?? 0)) topR = r;
    const topN = topR ? fc.get(topR) ?? 0 : 0;
    if (topR && topN >= FORM_TOP_MIN) {
      for (const [r, n] of fc) if (r.lemmaId !== topR.lemmaId && n < topN / FORM_RATIO) r.formRarer = `much rarer than ${topR.lemma} (${topR.pos}) in running text`;
    }
  }
  if (fc.size) {
    const matchedTotal = [...fc.values()].reduce((x, y) => x + y, 0);
    const matchedIds = new Set([...fc.keys()].map((r) => r.lemmaId));
    const base = (r: Reading): number => (r.hand ? CONF_HAND : r.viaYo && !r.listed ? 0.7 : CONF_AS_WRITTEN) - (lowered(r) ? USAGE_PENALTY : 0) - (r.rarerThan || r.formRarer ? RARE_PENALTY : 0);
    const targets = readings.filter((r) => !fc.has(r) && !matchedIds.has(r.lemmaId) && !r.rarerThan && !r.hand);
    const keepers = readings.filter((r) => base(r) >= 0.85 && !targets.includes(r));
    if (matchedTotal >= FORM_PRIORS_MIN && keepers.length > 0) for (const r of targets) r.unseen = true;
  }

  const stressOk = (r: Reading): number => (markedStress.length && !r.stressPositions.some((p) => sameStress(p, markedStress)) ? 1 : 0);
  const restored = (r: Reading): number => (r.viaYo && !r.listed ? 1 : 0);
  readings.sort((a, b) =>
    (restored(a) - restored(b))
    || (stressOk(a) - stressOk(b))
    || (fc.size ? Number(!fc.has(a)) - Number(!fc.has(b)) : 0)
    || ((fc.get(b) ?? 0) - (fc.get(a) ?? 0))
    || (Number(exact.has(b)) - Number(exact.has(a)))
    || ((score.get(b) ?? 0) - (score.get(a) ?? 0))
    || a.lemmaId.localeCompare(b.lemmaId)
    || (Number(lowered(a)) - Number(lowered(b)))
    || cmpRank(featureRank(a.morph), featureRank(b.morph)));
  return { readings, ctx };
}

// ───────────────────────────── hyphenated words ─────────────────────────────

/** Particles written after a hyphen that leave the word's own inflection as it is. */
const SUFFIX_PARTICLES: ReadonlySet<string> = new Set(['то', 'либо', 'нибудь', 'ка', 'таки', 'с']);
const PREFIX_PARTICLES: ReadonlySet<string> = new Set(['кое']);
/** A compound adjective's first part ends in -о or -е (северо-, научно-, военно-). */
const COMPOUND_FIRST = /[оеё]$/;

const asRule = (c: AnalysisCandidate, confidence: number): AnalysisCandidate => ({
  ...c, confidence, origin: 'rule', sourceId: RU_SOURCE_IDS.rules, notes: { ...(c.notes ?? {}), source: 'rule' },
});

/** Does the index hold this lemma id under some part of speech of the part's reading (or a pronoun / adverb / particle)? */
function lemmaWith(lemma: string, pos: PartOfSpeech): { id: string; row: RuLemmaRow } | undefined {
  for (const p of [pos, 'PRON', 'DET', 'ADV', 'ADJ', 'NOUN', 'PART', 'CONJ'] as const) {
    const row = lookupRussianLemma(`${lemma}|${p}`);
    if (row) return { id: `${lemma}|${p}`, row };
  }
  return undefined;
}

function partCandidates(partKey: string): AnalysisCandidate[] {
  if (hyphenParts(partKey).length !== 1) return [];
  const { readings, ctx } = dictionaryReadings(partKey, []);
  return readings.map((r) => toCandidate(r, ctx));
}

/** A word the index does not hold whole, read through its parts. Empty when no rule applies. */
function hyphenCandidates(key: string): AnalysisCandidate[] {
  const parts = hyphenParts(key);
  if (parts.length < 2) return [];
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1);

  // кое-кого, какого-нибудь, дай-ка: the inflected part's reading, with the lemma written with the particle when the index has it
  const particleAt = parts.length === 2 && SUFFIX_PARTICLES.has(last) ? 'suffix' : parts.length === 2 && PREFIX_PARTICLES.has(parts[0]) ? 'prefix' : undefined;
  if (particleAt) {
    const word = particleAt === 'suffix' ? parts[0] : parts[1];
    const out: AnalysisCandidate[] = [];
    for (const c of partCandidates(word)) {
      const pos = (c.pos ?? 'X') as PartOfSpeech;
      const joined = particleAt === 'suffix' ? `${c.lemma}-${last}` : `${parts[0]}-${c.lemma}`;
      const own = c.lemma ? lemmaWith(joined, pos) : undefined;
      const x = asRule(c, own ? CONF_PARTS_LEMMA : CONF_PARTS);
      if (own) { x.lemma = joined; x.pos = own.row[2] as PartOfSpeech; if (own.row[1]) x.gloss = own.row[1]; else delete x.gloss; delete x.notes?.partners; }
      const st = typeof c.notes?.stress === 'string' ? c.notes.stress : undefined;
      if (x.notes) { if (st) x.notes.stress = particleAt === 'suffix' ? `${st}-${last}` : `${parts[0]}-${st}`; else delete x.notes.stress; }
      out.push(x);
    }
    return out;
  }

  // по-русски, по-новому: a prefix and an adverb in -ски / -цки / -ому / -ему, read through the last part
  if (parts.length === 2 && parts[0] === 'по' && /(ски|цки|ому|ему)$/.test(last)) {
    const out = partCandidates(last).map((c) => asRule(c, CONF_PARTS));
    if (out.length) return out;
    return [{ pos: 'ADV', morph: {}, confidence: CONF_GUESS, unconfirmed: true, origin: 'rule', sourceId: RU_SOURCE_IDS.rules, notes: { source: 'rule' } }];
  }

  // северо-западный: a compound adjective, read through its last part
  if (head.every((p) => COMPOUND_FIRST.test(p))) {
    const out: AnalysisCandidate[] = [];
    for (const c of partCandidates(last)) {
      if (c.pos !== 'ADJ' || !c.lemma) continue;
      const lemma = `${head.join('-')}-${c.lemma}`;
      const own = lookupRussianLemma(`${lemma}|ADJ`);
      const x = asRule(c, CONF_PARTS);
      x.lemma = lemma;
      if (own?.[1]) x.gloss = own[1]; else delete x.gloss;
      if (x.notes) { delete x.notes.stress; delete x.notes.partners; }
      out.push(x);
    }
    return out;
  }
  return [];
}

// ───────────────────────────── the entrance ─────────────────────────────

/** The context-free readings of one word token, best first; an empty list when nothing is known (and nothing is guessed). */
export function ruWordCandidates(token: RawToken): AnalysisCandidate[] {
  if (!token.isWord) return [];
  const key = ruKey(token.normalized || token.surface);
  if (!CYRILLIC_LETTER.test(key)) return [];
  const marked = stressPositions(token.surface);
  const { readings, ctx } = dictionaryReadings(key, marked);
  if (readings.length) return readings.map((r) => toCandidate(r, ctx));

  if (key.includes('-') || key.includes('‐') || key.includes('‑')) return hyphenCandidates(key);

  return ruGuess(key, token.surface).map((g) => {
    const c: AnalysisCandidate = {
      pos: g.pos, morph: g.morph, confidence: CONF_GUESS, unconfirmed: true, origin: 'rule', sourceId: RU_SOURCE_IDS.rules,
      notes: { source: 'rule' },
    };
    if (g.lemma) c.lemma = g.lemma;
    return c;
  });
}
