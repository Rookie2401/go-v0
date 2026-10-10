import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SQ_LEXEMES } from '../src/adapters/albanian/morphology';
import { SQ_CONSTRUCTIONS } from '../src/adapters/albanian/constructions';
import { LITERARY_GHEG_PARTICIPLES } from '../src/adapters/albanian/gheg';

type DictEntry = { w?: string; p?: string; s?: Array<{ g?: string; t?: string[] }>; f?: Array<{ f?: string; t?: string[] }> };
const fullDir = resolve('public/dict/sq/full');
const dictionary: Record<string, DictEntry[]> = {};
for (const file of readdirSync(fullDir).filter((name) => name.endsWith('.json'))) {
  Object.assign(dictionary, JSON.parse(readFileSync(resolve(fullDir, file), 'utf8')) as Record<string, DictEntry[]>);
}

const byPos = (pos: string) => SQ_LEXEMES.filter((item) => item.pos === pos);
const verbs = byPos('VERB');
const adjectives = byPos('ADJ');
const nouns = [...byPos('NOUN'), ...byPos('PROPN')];
const missingGloss = SQ_LEXEMES.filter((item) => !item.gloss?.trim());
const missingNounFeatures = nouns.filter((item) => !item.gender || !item.def);
const missingVerbParts = verbs.filter((item) => !item.cls || !item.aorist || !item.participle);
const articulated = adjectives.filter((item) => item.articulated);
const missingConstructionExplanation = SQ_CONSTRUCTIONS.filter((item) => !item.explanation.trim());
const recordSummary = (lemma: string) => (dictionary[lemma] ?? []).map(({ p, s, f }) => ({
  pos: p,
  senses: (s ?? []).map(({ g, t }) => ({ gloss: g, tags: t })),
  participles: (f ?? []).filter(({ t }) => t?.includes('participle')).map(({ f: form, t }) => ({ form, tags: t })),
}));

console.log(JSON.stringify({
  dictionary: {
    manifest: JSON.parse(readFileSync(resolve('public/dict/sq/manifest.json'), 'utf8')).id,
    attribution: JSON.parse(readFileSync(resolve('public/dict/sq/manifest.json'), 'utf8')).attribution,
    entries: JSON.parse(readFileSync(resolve('public/dict/sq/manifest.json'), 'utf8')).entries,
    targetRecords: Object.fromEntries(['vuaj', 'vuajtur', 'kënaq', 'kënaqur', 'kënaqem', 'vuejtun', 'kënaqun'].map((lemma) => [lemma, recordSummary(lemma)])),
  },
  adapterInventory: {
    totalLexemes: SQ_LEXEMES.length,
    byPartOfSpeech: { nounsAndNames: nouns.length, adjectives: adjectives.length, verbs: verbs.length, other: SQ_LEXEMES.length - nouns.length - adjectives.length - verbs.length },
    missingGloss: missingGloss.length,
    nounsMissingGenderOrDefiniteForm: missingNounFeatures.length,
    verbsMissingClassOrAoristOrParticiple: missingVerbParts.length,
    verbsMissingPrincipalPartData: missingVerbParts.map(({ lemma, cls, aorist, participle }) => ({ lemma, cls: Boolean(cls), aorist: Boolean(aorist), participle: Boolean(participle) })),
    articulatedAdjectives: articulated.length,
    articulatedAdjectivesWithoutAnyListedInflectedVariant: articulated.filter((item) => !item.fem && !item.plM && !item.plF).length,
    articulatedAdjectivesWithoutVariants: articulated.filter((item) => !item.fem && !item.plM && !item.plF).map(({ lemma }) => lemma),
  },
  constructions: {
    count: SQ_CONSTRUCTIONS.length,
    missingExplanation: missingConstructionExplanation.length,
    missingExample: SQ_CONSTRUCTIONS.filter((item) => !item.example.trim()).length,
  },
  literaryGhegExactPairs: LITERARY_GHEG_PARTICIPLES,
}, null, 2));
