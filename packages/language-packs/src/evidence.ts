/**
 * What stands behind a pack's lemmas besides its hand word list, and what has been MEASURED: the evidence the capability report
 * (capabilities.ts) derives lemma quality from. Added 2026-11-13, when every pack still reported "seed-only: lemmas come from a small
 * machine-drafted word list", which is false wherever a dictionary's forms index, an attested form index or the analyser's own
 * lexicon answers for the words the list does not hold.
 *
 * Nothing here is an opinion. Every row names a file in this repository that holds the figure, and
 * test/language-packs/capabilities.test.ts reads those files and fails when a figure here differs from them:
 *
 *   lemma sources        a resource a lemma can come from when the hand list has no entry
 *     dictionary-forms-index   the slim form → lemma index built from the pack's declared dictionary (`dict/<lang>/forms/`,
 *                              docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md): a word the analyser cannot confirm is asked of it
 *     attested-form-index      a form index the analyser itself reads its lemmas from (`lexicon/<lang>/…` for Hebrew and Greek; the
 *                              bundled source corpus for Biblical Aramaic). A word it does not hold has no reading: it is a closed list of
 *                              attested forms, and the note says so, but it is not a small machine-drafted word list
 *     analyser-lexicon         the analyser's own large lexicon (Latin), shown by the share of running text it confirms
 *   lemma measurements   first-reading lemma accuracy on running text, with what it was scored against
 *     human-treebank           a treebank annotated by people (PROIEL, Perseus AGLDT)
 *     ai-labelled              labels written by an AI model and checked by nobody: AGREEMENT with a machine, not correctness
 *
 * What is NOT evidence and is never raised by it: review. A pack nobody has reviewed says so whatever its figures are.
 *
 * To add or correct a language: add the row AND the report it cites. A figure with no committed report behind it does not go here.
 */

export type LemmaSourceKind = 'dictionary-forms-index' | 'attested-form-index' | 'analyser-lexicon';

export interface LemmaSource {
  kind: LemmaSourceKind;
  /** The resource's own id (the dictionary manifest's id, the form index's id, the analyser's id). */
  id: string;
  /** What it is, in plain words, as a sentence fragment ("the Wiktionary dictionary's form index"). */
  label: string;
  /** How much it holds, when a committed file states it. */
  size?: { count: number; unit: 'entries' | 'forms' };
  /** Where the claim can be checked (a path in this repository). */
  source: string;
}

export type GoldKind = 'human-treebank' | 'ai-labelled';

export interface LemmaMeasurement {
  id: string;
  /** The text that was read, in plain words ("the Latin New Testament"). */
  corpus: string;
  /** What the readings were scored against, in plain words ("the PROIEL treebank"). */
  gold: string;
  goldKind: GoldKind;
  /** False when the text is course material the hand word list was written from. */
  heldOut: boolean;
  /** Words scored. */
  items: number;
  /** Share of scored words whose FIRST reading has the gold lemma, in percent, as the report states it (strict: spelling folded only). */
  lemmaAccuracy: number;
  /** The analyser that was measured, when the report records it. */
  analyser?: string;
  /** ISO date of the run. */
  measuredOn: string;
  /** The committed report (a path in this repository). */
  source: string;
}

export interface PackEvidence {
  lemmaSources: LemmaSource[];
  lemmaMeasurements: LemmaMeasurement[];
}

const GOLD_REPORT = 'docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.json';
const LATIN_REPORT = 'data/review/latin-eval/report.json';

/** The form index of a pack's declared dictionary: form → lemma and part of speech, for the words the hand list does not hold. */
const formsIndex = (lang: string, id: string): LemmaSource => ({
  kind: 'dictionary-forms-index', id, label: 'the form index of the pack’s Wiktionary dictionary', source: `public/dict/${lang}/forms/manifest.json`,
});

/** One AI-labelled set of the gold report (docs/ecosystem/linguistics/GOLD-SETS.md): `right` of `scored` first readings agree with the label. */
const aiGold = (set: 'dev' | 'unseen', right: number, scored: number): LemmaMeasurement => ({
  id: `gold-2026-10-10-${set}`,
  corpus: set === 'dev' ? 'course texts' : 'held-out text',
  gold: 'labels written by an AI model, checked by nobody',
  goldKind: 'ai-labelled',
  heldOut: set === 'unseen',
  items: scored,
  lemmaAccuracy: Math.round((right / scored) * 1000) / 10,
  measuredOn: '2026-10-10',
  source: GOLD_REPORT,
});

export const PACK_EVIDENCE: Readonly<Record<string, PackEvidence>> = Object.freeze({
  sq: {
    lemmaSources: [formsIndex('sq', 'kaikki-sq@2026-09-28')],
    lemmaMeasurements: [aiGold('dev', 204, 215), aiGold('unseen', 63, 70)],
  },
  es: {
    lemmaSources: [formsIndex('es', 'kaikki-es@2026-09-28')],
    lemmaMeasurements: [aiGold('dev', 206, 215), aiGold('unseen', 66, 80)],
  },
  de: {
    lemmaSources: [formsIndex('de', 'kaikki-de@2026-09-28')],
    lemmaMeasurements: [aiGold('dev', 207, 215), aiGold('unseen', 77, 80)],
  },
  hi: {
    lemmaSources: [formsIndex('hi', 'kaikki-hi@2026-09-28')],
    lemmaMeasurements: [aiGold('dev', 204, 215), aiGold('unseen', 71, 80)],
  },
  th: {
    lemmaSources: [formsIndex('th', 'kaikki-th@2026-09-28')],
    lemmaMeasurements: [aiGold('dev', 181, 214), aiGold('unseen', 73, 80)],
  },
  // Norwegian has no dictionary in the repository: its lemmas really do come from the hand word list and the rules. The figures are
  // agreement with an AI annotator on a 21-sentence corpus and a small blind holdout; they measure, they do not add a source.
  nb: { lemmaSources: [], lemmaMeasurements: [aiGold('dev', 208, 215), aiGold('unseen', 70, 70)] },
  nn: { lemmaSources: [], lemmaMeasurements: [aiGold('dev', 187, 215), aiGold('unseen', 60, 70)] },
  la: {
    lemmaSources: [
      // 97.33 % of the 612,227 words of the whole Clementine Vulgate are confirmed by the analyser's lexicon (report: corpora.vulgate)
      { kind: 'analyser-lexicon', id: 'adapter-la@1', label: 'the analyser’s own Latin lexicon', source: LATIN_REPORT },
      formsIndex('la', 'kaikki-la@2026-10-17'),
    ],
    lemmaMeasurements: [
      {
        id: 'proiel-nt', corpus: 'the Latin New Testament (Clementine Vulgate)', gold: 'the PROIEL treebank', goldKind: 'human-treebank', heldOut: true,
        items: 104345, lemmaAccuracy: 95.64, analyser: 'adapter-la@1', measuredOn: '2026-10-25', source: LATIN_REPORT,
      },
      {
        // the twelve `perseus-<author>` rows of the report, pooled by words (Caesar 87.71 % is the lowest, Jerome 95.45 % the highest)
        id: 'perseus-agldt', corpus: 'twelve classical and late Latin authors', gold: 'the Perseus treebank', goldKind: 'human-treebank', heldOut: true,
        items: 65595, lemmaAccuracy: 90.49, analyser: 'adapter-la@1', measuredOn: '2026-10-25', source: LATIN_REPORT,
      },
    ],
  },
  he: {
    lemmaSources: [
      { kind: 'attested-form-index', id: 'oshb-tanakh', label: 'the forms of the Hebrew Bible with their Open Scriptures morphology', size: { count: 52687, unit: 'forms' }, source: 'public/lexicon/he/biblical/manifest.json' },
      { kind: 'attested-form-index', id: 'kaikki-he-tables', label: 'Wiktionary’s Hebrew inflection tables', size: { count: 149277, unit: 'forms' }, source: 'public/lexicon/he/modern/manifest.json' },
    ],
    lemmaMeasurements: [],
  },
  el: {
    lemmaSources: [
      { kind: 'attested-form-index', id: 'kaikki-el-tables', label: 'Wiktionary’s Modern Greek inflection tables', size: { count: 265701, unit: 'forms' }, source: 'public/lexicon/el/modern/manifest.json' },
      { kind: 'attested-form-index', id: 'kaikki-grc-tables', label: 'Wiktionary’s Ancient Greek inflection tables', size: { count: 660208, unit: 'forms' }, source: 'public/lexicon/el/ancient/manifest.json' },
      { kind: 'attested-form-index', id: 'morphgnt-sblgnt', label: 'the forms of the Greek New Testament with their MorphGNT morphology', size: { count: 18056, unit: 'forms' }, source: 'public/lexicon/el/koine-index.json' },
    ],
    lemmaMeasurements: [],
  },
  // every reading is an annotated word of the Aramaic portions of the Hebrew Bible (4,828 occurrences, docs/aramaic/COVERAGE.md); nothing is
  // generated and a form outside the corpus has no reading
  arc: {
    lemmaSources: [
      { kind: 'attested-form-index', id: 'oshb-aramaic', label: 'the forms of the Aramaic portions of the Hebrew Bible with their Open Scriptures morphology', size: { count: 3151, unit: 'forms' }, source: 'src/adapters/aramaic/seed.ts' },
    ],
    lemmaMeasurements: [],
  },
});

/** The evidence of a language; a language with no row has none (its analyser's own statement stands). */
export function evidenceFor(languageId: string): PackEvidence {
  return Object.prototype.hasOwnProperty.call(PACK_EVIDENCE, languageId) ? PACK_EVIDENCE[languageId] : { lemmaSources: [], lemmaMeasurements: [] };
}
