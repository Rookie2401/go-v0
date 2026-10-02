/**
 * Personal difficulty of a text that need not be in the store, from its PROFILE alone (forms, lemmas, phrases, constructions with
 * counts) and the learner's item states. Cost is proportional to the profile: the item rows are read BY ID in batches (never the
 * learner's whole item table), and the only other reads are the works of a domain when the caller names one.
 *
 * Each word token of the profile falls in one of four classes by the learner's state for its FORM:
 *   known     shown understood (reported understanding without help; an explicit "known" mark counts)
 *   familiar  likely familiar (the help-free estimate; an estimate, never a demonstration)
 *   met       met before, or with help, but neither of the above
 *   new       never met
 * LEMMA-AWARE: a form the learner has never met is "met", not "new", when the adapter can read it as a lemma he HAS met (an inflected
 * form of a known verb: he has not seen "hablaban" but he knows "hablar"). It is "met" and not "known" on purpose: knowing the verb does
 * not show he understands this form. A profile carries lemma counts but not which form belongs to which lemma, so the link is made by
 * asking the language adapter for the readings of each new form (confidence of at least LEMMA_MIN_CONFIDENCE, as everywhere else) and
 * only when the learner has met some lemma of the profile at all.
 *
 * COMPOUNDS (a profile that names them): a compound whose whole word the learner does not know is transparent when he knows every
 * component by the same test as "known", partial when he knows some, opaque when he knows none. The shares do not change (a
 * transparent compound is not counted as known); the `new-words` factor leaves out the compounds he has never met but could read.
 * Like the other structural factors, the new ones are said in words and do not move the label, which rests on coverage alone.
 *
 * Coarse on purpose: a label, and for each factor that applies a level and one line. `caveats` says what the data cannot support.
 */
import type {
  AdapterRegistry, LanguageCode, LearnerItemState, PersonalDifficulty, ProfileScore, TextProfile,
} from '../core';
import { ids } from '../core';
import { BAND_THRESHOLDS, FORECAST, LEMMA_MIN_CONFIDENCE, PERSONAL, levelAtLeast } from './policy';
import type { Ctx } from './state';
import { effectiveEstimate, effectiveReadingLevel } from './state';
import { pct1, plural } from './util';

type Cls = 'known' | 'familiar' | 'met' | 'new';
type Level = 'low' | 'moderate' | 'high';
type DifficultyFactor = PersonalDifficulty['factors'][number];

/** How a register layer is named in a difficulty note. A layer without a name here is named by its tag. */
const REGISTER_WORDS: Record<string, string> = {
  sanskritic: 'Sanskrit-derived words', 'perso-arabic': 'Persian- or Arabic-derived words', 'english-loan': 'English loans', biblical: 'biblical vocabulary',
  literary: 'literary words', formal: 'formal words', archaic: 'older words', historical: 'historical words', religious: 'religious vocabulary',
  royal: 'royal vocabulary', colloquial: 'colloquial words', slang: 'slang', 'child-directed': 'words used with children',
};

const CHUNK = 400;

/** Item rows by id, in batches (one `getMany` per chunk). */
export async function rowsByItemId(ctx: Ctx, userId: string, itemIds: string[]): Promise<Map<string, LearnerItemState>> {
  const out = new Map<string, LearnerItemState>();
  const uniq = [...new Set(itemIds)];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    const rows = await ctx.store.learnerItems.getMany(part.map((id) => ids.learnerItem(userId, id)));
    part.forEach((id, j) => { const r = rows[j]; if (r) out.set(id, r); });
  }
  return out;
}

const met = (r?: LearnerItemState) => !!r && (r.reading.level !== 'unseen' || r.listening.level !== 'unseen');

function classOf(row: LearnerItemState | undefined): Cls {
  if (!row) return 'new';
  if (levelAtLeast(effectiveReadingLevel(row), 'recognized')) return 'known';
  if (effectiveEstimate(row)) return 'familiar';
  return met(row) ? 'met' : 'new';
}

/** "lemma:es:hablar:VERB" → "hablar" */
const lemmaText = (lemmaId: string): string => {
  const m = /^lemma:[^:]+:(.*?)(?::[A-Z]+)?$/.exec(lemmaId);
  return m ? m[1] : lemmaId;
};

/** Per-call (or per-ranking) memo of the lemmas an adapter reads in a form. */
export type LemmaReadings = Map<string, string[]>;

function lemmasOfForm(adapters: AdapterRegistry, lang: LanguageCode, form: string, memo: LemmaReadings): string[] {
  const key = `${lang}\u0000${form}`;
  let out = memo.get(key);
  if (out) return out;
  out = [];
  try {
    const adapter = adapters.get(lang);
    const [analysed] = adapter.analyze([{ surface: form, start: 0, end: form.length, isWord: true, normalized: form }]);
    for (const c of analysed?.candidates ?? []) if (c.lemma && c.confidence >= LEMMA_MIN_CONFIDENCE) out.push(c.lemma);
  } catch {
    out = []; // an adapter that cannot read a form simply gives no link: the form stays "new"
  }
  memo.set(key, out);
  return out;
}

const up = (v: number, cut: { low: number; moderate: number }): Level => (v <= cut.low ? 'low' : v <= cut.moderate ? 'moderate' : 'high');
const down = (v: number, cut: { low: number; moderate: number }): Level => (v >= cut.low ? 'low' : v >= cut.moderate ? 'moderate' : 'high');
const share = (x: number) => `${pct1(x)} %`;

export interface ScoreOptions { domains?: string[]; variety?: string }

export async function scoreProfile(
  ctx: Ctx, userId: string, profile: TextProfile, opts: ScoreOptions = {}, memo: LemmaReadings = new Map(),
): Promise<ProfileScore> {
  const lang = profile.lang;
  const forms = [...profile.forms].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const formId = (f: string) => ids.form(lang, f);
  const compoundList = profile.compounds ?? [];
  const rows = await rowsByItemId(ctx, userId, [
    ...forms.map(([f]) => formId(f)), ...profile.lemmas.map(([l]) => l), ...profile.phrases.map(([p]) => p), ...profile.patterns.map(([p]) => p),
    ...compoundList.flatMap(([whole, parts]) => [whole, ...parts]),
  ]);

  // lemma-aware: lemmas of the profile the learner has met, by their written lemma
  const metLemmas = new Set<string>();
  for (const [l] of profile.lemmas) if (met(rows.get(l))) metLemmas.add(lemmaText(l));

  const total = forms.reduce((n, [, c]) => n + c, 0);
  const counts: Record<Cls, number> = { known: 0, familiar: 0, met: 0, new: 0 };
  let newForms = 0;
  let promoted = 0;
  const weak: Array<[string, number]> = [];
  for (const [f, c] of forms) {
    const row = rows.get(formId(f));
    let cls = classOf(row);
    if (cls === 'new' && metLemmas.size > 0 && lemmasOfForm(ctx.adapters, lang, f, memo).some((l) => metLemmas.has(l))) { cls = 'met'; promoted += 1; }
    counts[cls] += c;
    if (cls === 'new') newForms += 1;
    if (row && (cls === 'met') && row.reading.assisted > 0) weak.push([formId(f), c]);
  }
  for (const [p, c] of profile.phrases) {
    const row = rows.get(p);
    if (row && classOf(row) === 'met' && row.reading.assisted > 0) weak.push([p, c]);
  }
  const weakItems = weak.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, PERSONAL.listCap).map(([id]) => id);
  const unmet = (list: Array<[string, number]>) => list.filter(([id]) => !(rows.get(id)?.encounterCount)).map(([id]) => id);
  const newPhrases = unmet(profile.phrases).slice(0, PERSONAL.listCap);
  const newPatterns = unmet(profile.patterns).slice(0, PERSONAL.listCap);

  // ── compounds the learner does not know as wholes, by what he knows of their parts ──
  // `known` is the very test the shares use. A transparent compound is NOT counted as known (the shares do not change), but the
  // `new-words` factor does not judge him on it: it is made of words he knows. Only a compound whose whole word he has never met
  // is taken out of the new count (its form is then new too); the learner's other new words are never discounted for it.
  const isKnown = (id: string) => classOf(rows.get(id)) === 'known';
  const compounds: NonNullable<ProfileScore['compounds']> = { transparent: 0, partial: 0, opaque: 0 };
  let transparentTokens = 0;
  let transparentUnmet = 0;
  let notTransparentTokens = 0; // word tokens that are new compounds he cannot read from known parts (partial + opaque)
  for (const [whole, parts, n] of compoundList) {
    if (isKnown(whole)) continue;
    const knownParts = parts.filter(isKnown).length;
    const kind = parts.length > 0 && knownParts === parts.length ? 'transparent' : knownParts > 0 ? 'partial' : 'opaque';
    compounds[kind] += 1;
    if (kind !== 'transparent') notTransparentTokens += n;
    if (kind === 'transparent' && !met(rows.get(whole))) { transparentTokens += n; transparentUnmet += 1; }
  }

  const t = Math.max(1, total);
  const empty = total === 0;
  const knownShare = empty ? 1 : counts.known / t;
  const familiarShare = empty ? 0 : counts.familiar / t;
  const metShare = empty ? 0 : counts.met / t;
  const newShare = empty ? 0 : counts.new / t;

  // domain familiarity: of the profile's forms that occur in texts of the same domain the learner has read, how much is known
  let domainFamiliarity: number | undefined;
  if (opts.domains?.length) {
    const wanted = new Set(opts.domains);
    const domainTexts = new Set<string>();
    for (const w of await ctx.store.works.where('lang', lang)) {
      if (!(w.domains ?? []).some((d) => wanted.has(d))) continue;
      for (const x of await ctx.store.texts.where('workId', w.id)) domainTexts.add(x.id);
    }
    if (domainTexts.size > 0) {
      let inDomain = 0;
      let inDomainKnown = 0;
      for (const [f, c] of forms) {
        const row = rows.get(formId(f));
        if (!row || !row.textIds.some((x) => domainTexts.has(x))) continue;
        inDomain += c;
        const cls = classOf(row);
        if (cls === 'known' || cls === 'familiar') inDomainKnown += c;
      }
      if (inDomain > 0) domainFamiliarity = inDomainKnown / inDomain;
    }
  }

  // ── the words ──
  const f = profile.features;
  const lexicalCoverage = empty ? undefined : knownShare + familiarShare;
  const topN = forms.slice(0, PERSONAL.historyTopForms);
  const topMet = topN.filter(([x]) => classOf(rows.get(formId(x))) !== 'new').length;
  const littleHistory = topN.length > 0 && topMet / topN.length < PERSONAL.historyMinShare;

  const factors: DifficultyFactor[] = [];
  const add = (key: DifficultyFactor['key'], level: Level, note: string) => factors.push({ key, level, note });
  if (lexicalCoverage !== undefined) {
    add('lexical-coverage', down(lexicalCoverage, PERSONAL.coverage), `About ${share(lexicalCoverage)} of its words are shown understood or likely familiar (an estimate).`);
    // without the compounds made of words he knows (see above); with none of those this is exactly the share of the whole text
    const judgedTokens = Math.max(0, counts.new - transparentTokens);
    const judgedNewShare = empty ? 0 : judgedTokens / t;
    const judgedForms = Math.max(0, newForms - transparentUnmet);
    const notCounting = [promoted > 0 ? 'forms of words you know' : '', transparentUnmet > 0 ? 'compounds made of words you know' : ''].filter(Boolean).join(' or ');
    add('new-words', up(judgedNewShare, PERSONAL.newShare),
      judgedForms === 0 ? `No word in it is new to you${transparentUnmet > 0 ? ', apart from compounds made of words you know' : ''}.`
        : `${plural(judgedForms, 'word')} (${share(judgedNewShare)} of the words) you have not met${notCounting ? `, not counting ${notCounting}` : ''}.`);
  }
  const newCompounds = compounds.transparent + compounds.partial + compounds.opaque;
  if (newCompounds > 0) {
    const notTransparent = compounds.partial + compounds.opaque;
    // judged by the share of the TEXT's words, so that one opaque compound in a long text does not read "high"
    add('compounds', up(empty ? 0 : notTransparentTokens / t, PERSONAL.compoundNotTransparentShare),
      `${plural(newCompounds, 'new compound')}: ${compounds.transparent} made of words you know, ${notTransparent} not.`);
  }
  const phraseNew = profile.phrases.length > 0 ? newPhrases.length / profile.phrases.length : 0;
  if (profile.phrases.length > 0) add('phrases', up(phraseNew, PERSONAL.newPhraseShare), `${newPhrases.length} of its ${plural(profile.phrases.length, 'phrase')} are new to you.`);
  if (profile.patterns.length > 0) add('constructions', up(newPatterns.length, PERSONAL.newPatterns), `${plural(newPatterns.length, 'construction')} you have not met.`);
  if (f.meanSentenceWords > 0) add('sentence-length', up(f.meanSentenceWords, PERSONAL.meanSentenceWords), `Sentences average ${Math.round(f.meanSentenceWords)} words.`);
  if (f.subordinatorsPerSentence !== undefined) add('clause-depth', up(f.subordinatorsPerSentence, PERSONAL.subordinatorsPerSentence), `About ${f.subordinatorsPerSentence.toFixed(1)} subordinating words per sentence.`);
  if (f.subjunctiveShare !== undefined && f.subjunctiveShare > 0) add('subjunctive', up(f.subjunctiveShare, PERSONAL.subjunctiveShare), `${share(f.subjunctiveShare)} of the words are subjunctive forms.`);
  if (f.cliticShare !== undefined && f.cliticShare > 0) add('clitics', up(f.cliticShare, PERSONAL.cliticShare), `${share(f.cliticShare)} of the words carry or are attached pronouns.`);
  // structure the analyses state (each only when the text has it): the verb bracket, the genitive, passives, relative clauses …
  const perSentence = (x: number) => x.toFixed(2);
  if (f.bracketDistance !== undefined) add('verb-bracket', up(f.bracketDistance, PERSONAL.bracketDistance), `Between the two parts of a verb there are ${f.bracketDistance.toFixed(1)} words on average.`);
  if (f.genitiveShare !== undefined && f.genitiveShare > 0) add('genitive', up(f.genitiveShare, PERSONAL.genitiveShare), `${share(f.genitiveShare)} of the words are in the genitive.`);
  if (f.passivePerSentence !== undefined && f.passivePerSentence > 0) add('passive', up(f.passivePerSentence, PERSONAL.passivePerSentence), `About ${perSentence(f.passivePerSentence)} passive constructions per sentence.`);
  if (f.relativePerSentence !== undefined && f.relativePerSentence > 0) add('relative-clauses', up(f.relativePerSentence, PERSONAL.relativePerSentence), `About ${perSentence(f.relativePerSentence)} relative clauses per sentence.`);
  if (f.participialPerSentence !== undefined && f.participialPerSentence > 0) add('participial-modifiers', up(f.participialPerSentence, PERSONAL.participialPerSentence), `About ${perSentence(f.participialPerSentence)} participle phrases describing a noun per sentence.`);
  if (f.nominalizationShare !== undefined && f.nominalizationShare > 0) add('nominalizations', up(f.nominalizationShare, PERSONAL.nominalizationShare), `${share(f.nominalizationShare)} of the words are nouns made from verbs or adjectives.`);
  // register layers: stated as what the vocabulary is made of, never as better or worse language
  if (f.registerShare?.marked) {
    const layers = Object.entries(f.registerShare).filter(([k, v]) => k !== 'marked' && v >= 0.01).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (layers.length) add('register', up(f.registerShare.marked, PERSONAL.registerShare), `Its vocabulary: ${layers.map(([k, v]) => `${share(v)} ${REGISTER_WORDS[k] ?? k}`).join(', ')}.`);
  }
  let regional = 0;
  let historical = 0;
  for (const [tag, s] of Object.entries(f.varietyShare ?? {})) {
    if (tag === PERSONAL.historicalTag) historical += s;
    else if (tag !== opts.variety) regional += s;
  }
  if (regional > 0) add('regional', up(regional, PERSONAL.regionalShare), `${share(regional)} of the words are marked as belonging to another variety of the language.`);
  if (historical > 0) add('historical', up(historical, PERSONAL.historicalShare), `${share(historical)} of the words are in older Spanish.`);
  if (f.historicalSpellingShare !== undefined && f.historicalSpellingShare > 0) add('older-spelling', up(f.historicalSpellingShare, PERSONAL.olderSpellingShare), `${share(f.historicalSpellingShare)} of the words are written in an older spelling.`);
  if (f.properNounShare !== undefined && f.properNounShare > 0) add('proper-names', up(f.properNounShare, PERSONAL.properNounShare), `${share(f.properNounShare)} of the words are names.`);
  if (domainFamiliarity !== undefined) add('domain', down(domainFamiliarity, PERSONAL.domain), `You know about ${share(domainFamiliarity)} of the words it shares with texts of the same subject you have read.`);
  if (f.unanalysedShare !== undefined && f.unanalysedShare > 0) add('unanalysed', up(f.unanalysedShare, PERSONAL.unanalysedShare), `${share(f.unanalysedShare)} of the words could not be analysed.`);

  const caveats: string[] = ["No frequency data: 'new' means not yet met by you, not uncommon."];
  if (littleHistory) caveats.push('You have read little so far, so which words you already know rests on very little.');
  if ((f.unanalysedShare ?? 0) > FORECAST.unanalysedShare) caveats.push(`${share(f.unanalysedShare!)} of its words could not be analysed, so they are counted by form only.`);
  if (empty) caveats.push('The text has no words to count.');

  const label: PersonalDifficulty['label'] = lexicalCoverage === undefined || littleHistory ? 'unknown'
    : lexicalCoverage >= BAND_THRESHOLDS.comfortable ? 'comfortable'
      : lexicalCoverage >= BAND_THRESHOLDS.productiveChallenge ? 'manageable'
        : lexicalCoverage >= BAND_THRESHOLDS.difficult ? 'challenging' : 'hard';
  const personal: PersonalDifficulty = { label, ...(lexicalCoverage !== undefined ? { lexicalCoverage } : {}), factors, caveats };

  return {
    textId: profile.textId, knownShare, familiarShare, metShare, newShare, newForms, weakItems, newPatterns, newPhrases,
    ...(domainFamiliarity !== undefined ? { domainFamiliarity } : {}), ...(compoundList.length > 0 ? { compounds } : {}), personal,
  };
}
