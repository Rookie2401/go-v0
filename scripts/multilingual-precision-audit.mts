import { allPackCapabilities } from '../packages/language-packs/src/capabilities';
import { hindiManifest } from '../packages/language-packs/src/packs/hi';
import { spanishManifest } from '../packages/language-packs/src/packs/es';
import { germanManifest } from '../packages/language-packs/src/packs/de';
import { thaiManifest } from '../packages/language-packs/src/packs/th';
import { bokmalManifest } from '../packages/language-packs/src/packs/nb';
import { nynorskManifest } from '../packages/language-packs/src/packs/nn';
import { hiLexicon, hiLexiconStats, hiLexiconProblems } from '../src/adapters/hi';
import { esLexicon, esLexiconStats, esLexiconProblems } from '../src/adapters/es';
import { deLexiconStats, deLexiconView } from '../src/adapters/german/lexicon';
import { thLexicon } from '../src/adapters/th';
import { lexiconFor } from '../src/adapters/norwegian/lexicon';
import { HINDI_CONSTRUCTION_TABLE, HINDI_UBIQUITOUS_CONSTRUCTIONS } from '../src/adapters/hindi/construction-data';
import { HINDI_COMPLEX_PREDICATES, HINDI_COMPOUND_POSTPOSITIONS, HINDI_FIXED_EXPRESSIONS } from '../src/adapters/hindi/phrase-data';
import { PHRASE_UNITS as ES_PHRASES } from '../src/adapters/spanish/phrases';
import { SPANISH_CONSTRUCTIONS } from '../src/adapters/spanish/constructions';
import { GERMAN_PHRASE_RULES } from '../src/adapters/german/constructions';
import { GERMAN_CONSTRUCTION_KEYS, GERMAN_CONSTRUCTION_INFO } from '../src/adapters/german/constructions';
import { PHRASE_UNITS as TH_PHRASES } from '../src/adapters/thai/phrases';
import { THAI_CONSTRUCTIONS } from '../src/adapters/thai/constructions';
import { NORWEGIAN_PHRASE_RULES, NORWEGIAN_CONSTRUCTION_INFO } from '../src/adapters/norwegian/constructions';
import { nbAdapter, nnAdapter, hiAdapter, esAdapter, deAdapter, thAdapter } from '../src/adapters';

const manifests = [hindiManifest(), spanishManifest(), germanManifest(), thaiManifest(), bokmalManifest(), nynorskManifest()];
const manifestById = new Map(manifests.map((m) => [m.languageId, m]));
const adapters = { hi: hiAdapter, es: esAdapter, de: deAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter } as const;
const noLex = { nb: lexiconFor('nb'), nn: lexiconFor('nn') };

const inventory = {
  hi: {
    lemmas: hiLexiconStats.lemmas, byPos: hiLexiconStats.byPos, parseProblems: hiLexiconProblems.length,
    missingGloss: hiLexicon.entries.filter((e) => !e.gloss?.trim()).length,
    phrases: HINDI_COMPLEX_PREDICATES.length + HINDI_COMPOUND_POSTPOSITIONS.length + HINDI_FIXED_EXPRESSIONS.length,
    constructionExplanations: Object.keys(HINDI_CONSTRUCTION_TABLE).length,
    ubiquitousConstructionRules: HINDI_UBIQUITOUS_CONSTRUCTIONS.size,
  },
  es: {
    lemmas: esLexiconStats.lemmas, byPos: esLexiconStats.byPos, byVariety: esLexiconStats.byVariety,
    parseProblems: esLexiconProblems.length, missingGloss: esLexicon.entries.filter((e) => !e.gloss?.trim()).length,
    phraseUnits: ES_PHRASES.length, constructions: SPANISH_CONSTRUCTIONS.length,
  },
  de: {
    ...deLexiconStats,
    missingGloss: [...deLexiconView.allNouns(), ...deLexiconView.allVerbs(), ...deLexiconView.allAdjectives()].filter((e) => !e.gloss?.trim()).length,
    phraseRules: GERMAN_PHRASE_RULES.length, constructionKeys: GERMAN_CONSTRUCTION_KEYS.length,
    constructionsMissingExplanation: GERMAN_CONSTRUCTION_KEYS.filter((key) => !GERMAN_CONSTRUCTION_INFO[key]?.explanation.trim()),
  },
  th: {
    lexemes: thLexicon.entries.length,
    byPos: thLexicon.entries.reduce<Record<string, number>>((out, e) => { out[e.pos] = (out[e.pos] ?? 0) + 1; return out; }, {}),
    missingGloss: thLexicon.entries.filter((e) => !e.gloss?.trim()).length,
    phraseUnits: TH_PHRASES.length, constructionRules: THAI_CONSTRUCTIONS.length,
  },
  nb: { ...noLex.nb.stats, constructionExplanations: Object.keys(NORWEGIAN_CONSTRUCTION_INFO).length, phraseRules: NORWEGIAN_PHRASE_RULES.nb.length },
  nn: { ...noLex.nn.stats, constructionExplanations: Object.keys(NORWEGIAN_CONSTRUCTION_INFO).length, phraseRules: NORWEGIAN_PHRASE_RULES.nn.length },
};

const morphologyCoverage = Object.fromEntries(Object.entries(adapters).map(([id, adapter]) => {
  const manifest = manifestById.get(id)!;
  const observed = new Set<string>();
  for (const c of manifest.validation) {
    if (!c.sentence) continue;
    const tokens = adapter.tokenize(c.sentence);
    for (const token of adapter.analyze(tokens)) for (const key of Object.keys(token.candidates[0]?.morph ?? {})) observed.add(key);
  }
  const explained = manifest.grammar.features.map((f) => f.key);
  return [id, { declaredFeatures: explained, validationCases: manifest.validation.length, topReadingFeaturesInValidation: [...observed].sort(), unexplainedObservedFeatures: [...observed].filter((f) => !explained.includes(f)).sort() }];
}));

const adapterMetadata = Object.fromEntries(Object.entries(adapters).map(([id, adapter]) => {
  const manifest = manifestById.get(id)!;
  return [id, {
    packId: manifest.packId, status: manifest.status, reviewStatus: manifest.rights.reviewStatus,
    adapterId: `adapter-${id}@${adapter.version}`, support: adapter.support,
    dictionary: manifest.lexical.dictionary ? { id: manifest.lexical.dictionary.id, entries: manifest.lexical.dictionary.entries } : 'no bundled dictionary',
    validationCases: manifest.validation.length, featureDefinitions: manifest.grammar.features.length,
    constructionDefinitions: manifest.grammar.constructions.length,
    writtenStandard: manifest.varieties.find((v) => v.writtenStandard)?.writtenStandard,
  }];
}));

console.log(JSON.stringify({
  builtDictionaryMetadata: Object.fromEntries(manifests.map((m) => [m.languageId, m.lexical.dictionary ? { id: m.lexical.dictionary.id, entries: m.lexical.dictionary.entries, attribution: m.lexical.dictionary.attribution } : { entries: 0, note: 'No repository dictionary declared for this pack.' }])),
  adapterMetadata,
  inventory,
  morphologyCoverage,
  capabilityReports: allPackCapabilities().filter((p) => ['hi', 'es', 'de', 'th', 'nb', 'nn'].includes(p.languageId)),
  translationImplementation: {
    bundledLanguageSpecificLocalProviders: ['sq'],
    genericBrowserProvider: 'Uses runtime Translator availability; this repository does not generate or certify translation outputs for these six language IDs.',
  },
}, null, 2));
