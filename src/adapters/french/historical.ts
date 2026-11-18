/**
 * Older French spelling, recognised without altering the text: the spelling of La Fontaine, Perrault, Molière, Voltaire and Rousseau
 * as printed before the Académie's reform of 1835 and as many digital editions still print it (avoit, estoit, les enfans, le tems,
 * roy). This module only proposes the MODERN spelling of a written form; the adapter then returns the modern lemma tagged `fr-hist`,
 * with the modern spelling in `notes.modern` and the rule in `notes.historical`. The written form itself is never changed.
 *
 * Machine-drafted, not checked by a native speaker. Certain rules only:
 *  - an EXACT table of common words (estre → être, mesme → même, roy → roi ...): the s before a consonant that the modern word
 *    replaced with a circumflex is NOT a general rule here, because a general s-deletion over-generates (reste, poste, triste);
 *  - a few general rules whose result must be a word the word list reads (`solid`), and some of them keep only the readings that
 *    fit the rule (the -oit ending must give a verb form or a nationality, -ans must give a plural noun or adjective).
 * Rules may combine (connoissoit → connaissait: two oi rules; estoit → était is in the table with both its rules named).
 * Two guards: a written form that is itself a word the list reads is never a historical spelling (returns []), and a modern spelling
 * is only ever reached from the form by the listed rules.
 * Out of scope on purpose: sixteenth-century spellings (faict, dict, poinct), phonetic respellings, the ampersand (punctuation),
 * long s, and any rule I was not certain of.
 */
import type { AnalysisCandidate } from '../../core';

export interface HistoricalReading {
  /** The modern spelling of the written form. */
  modern: string;
  /** In plain words, the spelling habit that was undone ("-oit for -ait in the imperfect"). */
  rule: string;
  /** A reading of the modern spelling, as `solid` gave it. */
  reading: AnalysisCandidate;
}

export type HistoricalRuleId = 'oi' | 'oiss' | 'oi-circ' | 's-circ' | 's-dropped' | 's-kept' | 'y-i' | 'nts' | 'tems' | 'sc' | 'circ-ptcp' | 'tez' | 'e-grave' | 'ay-ais' | 'plural';

/** The rules in plain words (the written form and its modern spelling are appended to the result as an example). */
export const HISTORICAL_RULES: Readonly<Record<HistoricalRuleId, string>> = {
  oi: 'oi for ai (the imperfect and conditional endings -oit, -ois, -oient; françois, foible, monnoie)',
  oiss: 'oi for ai before -ss- (connoissance, paroissoit)',
  'oi-circ': 'oî for aî (connoître, paroître)',
  's-circ': 'an s before a consonant that the modern word replaced with an accent, usually a circumflex (estre for être)',
  's-dropped': 'an s before a consonant that the modern word no longer has (nostre for notre)',
  's-kept': 'a final s the modern word no longer has (jusques for jusque)',
  'y-i': 'y for i (roy for roi, luy for lui, ay for ai)',
  nts: '-ans, -ens for -ants, -ents (enfans for enfants)',
  tems: 'tems for temps (no p)',
  sc: 'sç for s (sçavoir for savoir)',
  'circ-ptcp': 'a circumflex on the participle (vû for vu)',
  tez: '-tez for -tés in a plural noun (bontez for bontés)',
  'e-grave': 'é for è before a consonant and a final e (siécle for siècle)',
  'ay-ais': '-ay for -ais (sçay for sais)',
  plural: 'the plural -s added to the modern word',
};

export interface HistoricalExact { modern: string; rules: HistoricalRuleId[] }

/** [written, modern, rules...]: the exact words. A plural -s is added by the module itself (mesmes → mêmes). */
const EXACT_ROWS: ReadonlyArray<readonly [string, string, ...HistoricalRuleId[]]> = [
  // être and its old forms
  ['estre', 'être', 's-circ'], ['estoit', 'était', 's-circ', 'oi'], ['estoient', 'étaient', 's-circ', 'oi'], ['estois', 'étais', 's-circ', 'oi'],
  ['estions', 'étions', 's-circ'], ['estiez', 'étiez', 's-circ'], ['estant', 'étant', 's-circ'], ['esté', 'été', 's-circ'], ['estes', 'êtes', 's-circ'],
  ['fust', 'fût', 's-circ'], ['eust', 'eût', 's-circ'], ['peust', 'pût', 's-circ'], ['plaist', 'plaît', 's-circ'],
  // s before a consonant, circumflex in the modern word
  ['teste', 'tête', 's-circ'], ['mesme', 'même', 's-circ'], ['isle', 'île', 's-circ'], ['hoste', 'hôte', 's-circ'], ['forest', 'forêt', 's-circ'],
  ['beste', 'bête', 's-circ'], ['feste', 'fête', 's-circ'], ['maistre', 'maître', 's-circ'], ['maistresse', 'maîtresse', 's-circ'],
  ['goust', 'goût', 's-circ'], ['coste', 'côte', 's-circ'], ['costé', 'côté', 's-circ'], ['tost', 'tôt', 's-circ'], ['plustost', 'plutôt', 's-circ'],
  ['aussi-tost', 'aussitôt', 's-circ'], ['aussitost', 'aussitôt', 's-circ'], ['bien-tost', 'bientôt', 's-circ'], ['bientost', 'bientôt', 's-circ'],
  ['arrest', 'arrêt', 's-circ'], ['bastir', 'bâtir', 's-circ'], ['hostel', 'hôtel', 's-circ'], ['prestre', 'prêtre', 's-circ'], ['fenestre', 'fenêtre', 's-circ'],
  ['tempeste', 'tempête', 's-circ'], ['conqueste', 'conquête', 's-circ'], ['honneste', 'honnête', 's-circ'], ['trosne', 'trône', 's-circ'],
  ['pasle', 'pâle', 's-circ'], ['disner', 'dîner', 's-circ'], ['abysme', 'abîme', 's-circ'], ['apostre', 'apôtre', 's-circ'], ['ancestre', 'ancêtre', 's-circ'],
  ['chasteau', 'château', 's-circ'], ['bastiment', 'bâtiment', 's-circ'], ['mesler', 'mêler', 's-circ'],
  ['connoistre', 'connaître', 's-circ', 'oi'], ['paroistre', 'paraître', 's-circ', 'oi'], ['croistre', 'croître', 's-circ'],
  ['naistre', 'naître', 's-circ'], ['paistre', 'paître', 's-circ'],
  // s before a consonant, nothing in the modern word
  ['nostre', 'notre', 's-dropped'], ['vostre', 'votre', 's-dropped'], ['tousjours', 'toujours', 's-dropped'],
  ['jusques', 'jusque', 's-kept'],
  // oi for ai
  ['françois', 'français', 'oi'], ['françoise', 'française', 'oi'], ['anglois', 'anglais', 'oi'], ['angloise', 'anglaise', 'oi'],
  ['foible', 'faible', 'oi'], ['foiblesse', 'faiblesse', 'oi'], ['foiblement', 'faiblement', 'oi'], ['monnoie', 'monnaie', 'oi'],
  ['roide', 'raide', 'oi'], ['roideur', 'raideur', 'oi'], ['harnois', 'harnais', 'oi'],
  // y for i
  ['roy', 'roi', 'y-i'], ['moy', 'moi', 'y-i'], ['toy', 'toi', 'y-i'], ['soy', 'soi', 'y-i'], ['loy', 'loi', 'y-i'], ['foy', 'foi', 'y-i'],
  ['luy', 'lui', 'y-i'], ['icy', 'ici', 'y-i'], ['celuy', 'celui', 'y-i'], ['vray', 'vrai', 'y-i'], ['vraye', 'vraie', 'y-i'], ['amy', 'ami', 'y-i'],
  ['ennemy', 'ennemi', 'y-i'], ['ainsy', 'ainsi', 'y-i'], ['aussy', 'aussi', 'y-i'], ['ay', 'ai', 'y-i'], ['mary', 'mari', 'y-i'],
  ['party', 'parti', 'y-i'], ['ennuy', 'ennui', 'y-i'], ['aujourd\'huy', 'aujourd\'hui', 'y-i'],
  // sç
  ['sçavoir', 'savoir', 'sc'], ['sçait', 'sait', 'sc'], ['sçais', 'sais', 'sc'], ['sçavez', 'savez', 'sc'], ['sçachant', 'sachant', 'sc'], ['sçu', 'su', 'sc'],
  ['sçay', 'sais', 'sc', 'ay-ais'],
  // tems
  ['tems', 'temps', 'tems'], ['longtems', 'longtemps', 'tems'], ['long-tems', 'longtemps', 'tems'], ['printems', 'printemps', 'tems'],
  // the participles with a circumflex
  ['vû', 'vu', 'circ-ptcp'], ['pû', 'pu', 'circ-ptcp'], ['sû', 'su', 'circ-ptcp'], ['eû', 'eu', 'circ-ptcp'], ['lû', 'lu', 'circ-ptcp'],
  // é for è
  ['siécle', 'siècle', 'e-grave'], ['piéce', 'pièce', 'e-grave'], ['pére', 'père', 'e-grave'], ['mére', 'mère', 'e-grave'], ['frére', 'frère', 'e-grave'],
  ['premiére', 'première', 'e-grave'], ['derniére', 'dernière', 'e-grave'], ['lumiére', 'lumière', 'e-grave'], ['maniére', 'manière', 'e-grave'],
  ['riviére', 'rivière', 'e-grave'], ['matiére', 'matière', 'e-grave'], ['siége', 'siège', 'e-grave'],
];

export const HISTORICAL_EXACT: Readonly<Record<string, HistoricalExact>> = Object.fromEntries(
  EXACT_ROWS.map(([written, modern, ...rules]) => [written, { modern, rules }]),
);

// ── the general rules ──
const hasPos = (c: AnalysisCandidate, ...pos: string[]): boolean => c.pos !== undefined && pos.includes(c.pos);
const plural = (c: AnalysisCandidate): boolean => (c.morph.Number ?? '').split(',').includes('Plur');

/** Which readings of the modern spelling fit a general rule (a rule without an entry keeps every reading). The exact table is not filtered. */
const FITS: Partial<Record<HistoricalRuleId, (c: AnalysisCandidate, modern: string) => boolean>> = {
  oi: (c, modern) => hasPos(c, 'VERB', 'AUX') || (/ais(?:e|es)?$/u.test(modern) && hasPos(c, 'ADJ', 'NOUN')),
  nts: (c) => hasPos(c, 'NOUN', 'ADJ') && plural(c),
  'circ-ptcp': (c) => c.morph.VerbForm === 'Part',
  tez: (c) => hasPos(c, 'NOUN') && plural(c),
  plural: (c) => plural(c),
};

interface Transform { id: HistoricalRuleId; apply(s: string): string[] }

/** One replacement; the regexps are not global (a global `test` would carry its position into the next call). */
const sub = (re: RegExp, to: string) => (s: string): string[] => (re.test(s) ? [s.replace(re, to)] : []);

const TRANSFORMS: readonly Transform[] = [
  { id: 'oiss', apply: sub(/oiss/u, 'aiss') },
  { id: 'oi-circ', apply: sub(/oî/u, 'aî') },
  { id: 'oi', apply: sub(/oi(t|s|ent)$/u, 'ai$1') },
  { id: 'y-i', apply: (s) => (/ys$/u.test(s) ? [s.replace(/ys$/u, 'is')] : /y$/u.test(s) ? [s.replace(/y$/u, 'i')] : []) },
  { id: 'nts', apply: sub(/([ae])ns$/u, '$1nts') },
  { id: 'tems', apply: sub(/tems$/u, 'temps') },
  { id: 'sc', apply: sub(/^sç/u, 's') },
  { id: 'circ-ptcp', apply: sub(/û(e|s|es)?$/u, 'u$1') },
  { id: 'tez', apply: sub(/tez$/u, 'tés') },
  { id: 'e-grave', apply: sub(/é([bcdfgjklmnprstv]{1,2})(es?)$/u, 'è$1$2') },
];

interface Step { to: string; rules: HistoricalRuleId[]; generic: boolean }

/** The modern spellings the exact table gives for a written form, and with its plural -s (mesmes → mêmes). */
function exactSteps(s: string): Step[] {
  const out: Step[] = [];
  const direct = HISTORICAL_EXACT[s];
  if (direct) out.push({ to: direct.modern, rules: direct.rules, generic: false });
  if (s.endsWith('s')) {
    const base = HISTORICAL_EXACT[s.slice(0, -1)];
    if (base) out.push({ to: `${base.modern}s`, rules: [...base.rules, 'plural'], generic: false });
  }
  return out;
}

interface State { s: string; rules: HistoricalRuleId[]; generic: HistoricalRuleId[] }

const MAX_DEPTH = 3;
const MAX_MODERN = 3;
const MAX_READINGS = 6;

/**
 * The readings of an older spelling: the modern spellings the rules reach, kept only when `solid(modern)` (the word list or a lemma the
 * word list knows) reads them. The written form itself is never changed. The fewest rules first: a longer chain is only tried when the
 * shorter ones gave no word. A form that is itself read is not old.
 */
export function historicalReadings(form: string, solid: (modern: string) => AnalysisCandidate[]): HistoricalReading[] {
  const word = form.normalize('NFC').toLowerCase();
  if (!word || solid(word).length > 0) return [];
  const out: HistoricalReading[] = [];
  const seen = new Set<string>([word]);
  let frontier: State[] = [{ s: word, rules: [], generic: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next: State[] = [];
    for (const { s, rules, generic } of frontier) {
      const steps: Step[] = exactSteps(s);
      for (const t of TRANSFORMS) for (const to of t.apply(s)) steps.push({ to, rules: [t.id], generic: true });
      for (const step of steps) {
        if (step.to === s || seen.has(step.to)) continue;
        seen.add(step.to);
        const used = [...rules];
        for (const id of step.rules) if (!used.includes(id)) used.push(id);
        const filters = [...generic, ...(step.generic ? step.rules : step.rules.filter((id) => id === 'plural'))];
        const readings = solid(step.to).filter((c) => filters.every((id) => FITS[id]?.(c, step.to) ?? true));
        if (readings.length) {
          const rule = `${used.map((id) => HISTORICAL_RULES[id]).join('; ')} (${word} → ${step.to})`;
          for (const reading of readings.slice(0, MAX_READINGS)) out.push({ modern: step.to, rule, reading });
        }
        next.push({ s: step.to, rules: used, generic: filters });
      }
    }
    if (out.length) break;
    frontier = next;
  }
  const moderns = [...new Set(out.map((r) => r.modern))].slice(0, MAX_MODERN);
  return out.filter((r) => moderns.includes(r.modern)).slice(0, MAX_READINGS);
}
