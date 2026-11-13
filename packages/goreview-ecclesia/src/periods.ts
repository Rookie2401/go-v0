/**
 * PERIODS — the historical stages of Hebrew and Greek, laid out for the Ecclesia library.
 *
 *   Hebrew   he-bib  Biblical (Classical)      he-mish  Mishnaic (Rabbinic)      he-med  Medieval      he-mod  Modern
 *   Greek    el-hom  Homeric (Epic)   el-att  Attic (Classical)   el-koi  Koine   el-med  Medieval (Byzantine)   el-mod  Modern
 *   Aramaic  arc-bib Biblical (one period)                         Latin   no periods are modelled (the Latin adapter declares none)
 *
 * The ids are the Repository variety ids of the GoLearn adapters (src/adapters/hebrew/varieties.ts, src/adapters/greek/varieties.ts);
 * a test holds this catalogue to them. Three rules follow from "one language, several periods":
 *
 *  1. IDENTITY IS PERIOD-FREE. `lemma:el:λόγος:NOUN` is one lexeme whether it was met in Homer, Plato, John or a Byzantine
 *     homily; so is `lemma:he:מֶלֶךְ:NOUN` in Kings, the Mishnah and Rashi. Knowledge of the word therefore POOLS across periods.
 *     (Biblical Aramaic is another language, `arc`: nothing pools between it and Hebrew.)
 *  2. THE PERIOD BELONGS TO THE TEXT. Every event carries the period of the passage that was read (`varietyId`), set by the
 *     profile the reader records with (`profileForPeriod`). Evidence can therefore be read per period (`periodEvidence`,
 *     `knowledgeStandings(…, { varietyId })`) without ever having been split.
 *  3. SPELLING IS NOT IDENTITY. Periods write differently: Modern Greek is monotonic (άνθρωπος) where the older periods are
 *     polytonic (ἄνθρωπος); Modern and most Rabbinic and Medieval Hebrew is unpointed where the Bible is pointed. A lemma spelled
 *     two ways is two unit ids. `crossPeriodKey` (./identity) LINKS them (accents, breathings and points removed) without
 *     merging them, and the familiarity estimate may credit the link when the reader asks (`crossPeriodCredit`), saying so.
 *     A reader that wants one unit across periods lemmatises every period to ONE headword spelling (the polytonic / pointed
 *     dictionary form is the convention the Biblical and Koine data already follow).
 *
 * What the shared adapter can analyse differs by period and is stated (`goLearnAnalysis`): a corpus for Biblical Hebrew and
 * Koine, dictionary tables for Modern Hebrew, Homeric, Attic and Modern Greek, labels only for Mishnaic and Medieval Hebrew and
 * Medieval Greek. Ecclesia hands over its own analysed tokens, so those limits bound trust (`defaultStatus`), not coverage.
 *
 * Boundaries are conventions for filing, not claims: Greek between the Koine and the Byzantine centuries (the fourth- to
 * sixth-century Fathers) is filed under Koine, as the adapter files the dictionary label "late Greek"; a reader may file a
 * given author elsewhere, and should then do so consistently.
 */
import type { EcclesiaLanguageId, EcclesiaLanguageProfile, EcclesiaPeriod } from './contract';
import { PROFILES } from './languages';

const CORPUS = { goLearnAnalysis: 'corpus', defaultStatus: 'high-confidence' } as const;
const TABLES = { goLearnAnalysis: 'tables', defaultStatus: 'provisional' } as const;
const LABELS = { goLearnAnalysis: 'labels-only', defaultStatus: 'provisional' } as const;

export const PERIODS: readonly EcclesiaPeriod[] = [
  // ───── Hebrew ─────
  {
    id: 'he-bib', language: 'he', label: 'Biblical Hebrew', aliases: ['classical hebrew', 'classical', 'biblical', 'ancient hebrew', 'masoretic'], order: 1,
    era: { from: -1000, to: -200 }, orthography: 'pointed-cantillated', ...CORPUS,
    exampleTexts: ['the Tanakh as the Masoretes pointed it'],
    note: 'The Hebrew of the Tanakh. Analysed from the Open Scriptures Hebrew Bible morphology over the Miqra according to the Masorah. The default Hebrew period of Ecclesia.',
  },
  {
    id: 'he-mish', language: 'he', label: 'Mishnaic (Rabbinic) Hebrew', aliases: ['mishnaic hebrew', 'mishnaic', 'rabbinic hebrew', 'rabbinic', 'tannaitic', 'talmudic hebrew'], order: 2,
    era: { from: 1, to: 500 }, orthography: 'unpointed', ...LABELS,
    exampleTexts: ['the Mishnah', 'the Tosefta', 'the early midrashim', 'the Hebrew of the Talmuds'],
    note: 'The Hebrew of the Mishnah and its literature: a changed verb system, many Aramaic and Greek loans. Printed editions are often pointed; manuscripts are not. The adapter recognises it from dictionary labels only.',
  },
  {
    id: 'he-med', language: 'he', label: 'Medieval Hebrew', aliases: ['medieval', 'mediaeval hebrew', 'medieval rabbinic'], order: 3,
    era: { from: 500, to: 1800 }, orthography: 'unpointed', ...LABELS,
    exampleTexts: ['Rashi and the commentators', 'Maimonides and the philosophers', 'the liturgical poets (piyyut)', 'the translators from Arabic'],
    note: 'The written Hebrew of the commentators, philosophers, poets and translators: Biblical and Rabbinic layers together, with new technical vocabulary. Recognised by the adapter from dictionary labels only.',
  },
  {
    id: 'he-mod', language: 'he', label: 'Modern Hebrew', aliases: ['modern', 'israeli hebrew', 'israeli', 'ivrit'], order: 4,
    era: { from: 1880, to: null }, orthography: 'unpointed', ...TABLES,
    exampleTexts: ['modern scholarship and commentary', 'modern translations and introductions'],
    note: 'The Hebrew written and spoken today, normally without vowel points. Analysed by the adapter from Wiktionary tables.',
  },
  // ───── Aramaic ─────
  {
    id: 'arc-bib', language: 'arc', label: 'Biblical Aramaic', aliases: ['aramaic', 'imperial aramaic of the bible'], order: 1,
    era: { from: -500, to: -150 }, orthography: 'pointed-cantillated', ...CORPUS,
    exampleTexts: ['Daniel 2:4b–7:28', 'Ezra 4:8–6:18 and 7:12–26', 'Jeremiah 10:11', 'two words of Genesis 31:47'],
    note: 'Its own language, never a period of Hebrew. The Targums and the Talmudic Aramaic are later Aramaic and are not modelled here.',
  },
  // ───── Greek ─────
  {
    id: 'el-hom', language: 'grc', label: 'Homeric Greek', aliases: ['homeric', 'epic', 'epic greek'], order: 1,
    era: { from: -800, to: -600 }, orthography: 'polytonic', ...TABLES,
    exampleTexts: ['the Iliad and the Odyssey', 'Hesiod', 'the Homeric Hymns'],
    note: 'The epic literary language: Ionic-based, with forms and words no later period uses. Analysed by the adapter from the Epic tables of Wiktionary.',
  },
  {
    id: 'el-att', language: 'grc', label: 'Attic Greek', aliases: ['attic', 'classical greek', 'classical'], order: 2,
    era: { from: -500, to: -300 }, orthography: 'polytonic', ...TABLES,
    exampleTexts: ['Plato and Aristotle', 'the tragedians', 'the orators', 'Thucydides and Xenophon'],
    note: 'The Greek of Athens in the fifth and fourth centuries BC, the reference dialect of the ancient grammars and the model later writers imitate. Analysed by the adapter from the Ancient Greek tables.',
  },
  {
    id: 'el-koi', language: 'grc', label: 'Koine Greek', aliases: ['koine', 'hellenistic greek', 'hellenistic', 'new testament greek', 'biblical greek', 'late greek', 'patristic greek'], order: 3,
    era: { from: -300, to: 600 }, orthography: 'polytonic', ...CORPUS,
    exampleTexts: ['the New Testament', 'the Septuagint', 'the Apostolic Fathers', 'Philo and Josephus', 'the Fathers to the sixth century'],
    note: 'The common Greek of the Hellenistic and Roman world. Analysed from MorphGNT over the SBL Greek New Testament. The default Greek period of Ecclesia; Greek of the fourth to sixth centuries is filed here by convention.',
  },
  {
    id: 'el-med', language: 'grc', label: 'Medieval (Byzantine) Greek', aliases: ['medieval greek', 'medieval', 'byzantine greek', 'byzantine'], order: 4,
    era: { from: 600, to: 1500 }, orthography: 'polytonic', ...LABELS,
    exampleTexts: ['John of Damascus', 'the Byzantine liturgy and hymnography', 'the chroniclers', 'Gregory Palamas'],
    note: 'The Greek of the Byzantine centuries: a learned, Atticising register beside a vernacular one. Recognised by the adapter from labels only.',
  },
  {
    id: 'el-mod', language: 'grc', label: 'Modern Greek', aliases: ['modern', 'demotic', 'neo-hellenic'], order: 5,
    era: { from: 1500, to: null }, orthography: 'monotonic', ...TABLES,
    exampleTexts: ['modern scholarship and commentary', 'modern translations of the Fathers'],
    note: 'The Greek written today, in monotonic spelling since 1982 (older printing and Katharevousa are polytonic). Analysed by the adapter from the Wiktionary Modern Greek tables.',
  },
];

const BY_ID = new Map(PERIODS.map((p) => [p.id, p]));

/** The period each language is read in when the reader names none. Latin has none. */
export const DEFAULT_PERIOD: Readonly<Record<EcclesiaLanguageId, string | undefined>> = { he: 'he-bib', arc: 'arc-bib', grc: 'el-koi', la: undefined };

export function periodOf(id: string): EcclesiaPeriod {
  const p = BY_ID.get(id);
  if (!p) throw new RangeError(`not a period: ${id} (${PERIODS.map((x) => x.id).join(', ')})`);
  return p;
}

export const isPeriod = (id: string | undefined): boolean => id !== undefined && BY_ID.has(id);

/** The periods of a language in historical order (empty for Latin). */
export const periodsOf = (language: EcclesiaLanguageId): EcclesiaPeriod[] => PERIODS.filter((p) => p.language === language).sort((a, b) => a.order - b.order);

/** A period from an id, a label or an alias ("Classical Hebrew", "Byzantine"), within a language; undefined when the name fits none. */
export function resolvePeriod(language: EcclesiaLanguageId, name: string): EcclesiaPeriod | undefined {
  const n = name.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ');
  return periodsOf(language).find((p) => p.id === n || p.label.toLowerCase() === n || p.aliases.includes(n));
}

/** How many periods apart two periods of one language are (0 = the same); undefined across languages. */
export function periodDistance(a: string, b: string): number | undefined {
  const pa = periodOf(a), pb = periodOf(b);
  return pa.language === pb.language ? Math.abs(pa.order - pb.order) : undefined;
}

/**
 * The profile to record and review a text of a period with: the language's Repository filing with this period as the variety,
 * so every event carries it. For the language's default period (Biblical Hebrew, Koine Greek, Biblical Aramaic) this is the
 * stock profile. For another period the edition, corpus and analysis are the reader's own, stated as such, with the period's
 * default trust and no licence claim (restrictions unknown until the reader states them through `over`).
 */
export function profileForPeriod(periodId: string, over: Partial<Pick<EcclesiaLanguageProfile, 'textId' | 'corpus' | 'analysis'>> = {}): EcclesiaLanguageProfile {
  const period = periodOf(periodId);
  const base = PROFILES[period.language];
  if (DEFAULT_PERIOD[period.language] === period.id) return { ...base, ...over };
  const has = period.goLearnAnalysis === 'tables' ? 'dictionary tables' : 'dictionary labels only';
  return {
    ...base,
    label: period.label,
    repository: { ...base.repository, varietyId: period.id },
    textId: 'READER',
    corpus: { label: `the reader's edition (${period.label})`, licence: 'as the reader states', restrictions: {} },
    analysis: { label: `the reader's own analysis (the GoLearn adapter has ${has} for ${period.label})`, licence: 'as the reader states', status: period.defaultStatus, analyzerId: 'ecclesia-reader' },
    ...over,
  };
}

/** The period a profile records with, when it has one (Latin has none). */
export const periodOfProfile = (profile: EcclesiaLanguageProfile): EcclesiaPeriod | undefined => BY_ID.get(profile.repository.varietyId ?? '');
