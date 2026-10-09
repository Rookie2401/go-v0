/**
 * Test support for GoReview's assessment module: the REAL Albanian pack, adapter and dictionary; a fake Repository `unit()`
 * assembled from the REAL resolver's output (so statuses, relations and construction ids are exactly what the Repository
 * would hold); a fake GoListen AssessmentSource. Nothing here is imported by production code.
 */
import { sqAdapter } from '../../../src/adapters/sq';
import { albanianManifest, createPackRuntime } from '../../../packages/language-packs/src';
import { resolveSelection } from '../../../packages/repository-linguistics/src/resolver';
import { STATUS_RANK } from '../../../packages/repository-contract/src';
import type { FormAnalysis, LinguisticUnit, UnitRelation } from '../../../packages/repository-contract/src';
import type { AssessmentSource, AudioStimulus, ScoringMetadata, VoiceDescriptor } from '../../../packages/golisten/src/contracts';
import { createFactsProvider } from '../../../packages/goreview/src/facts';
import type { ReviewFacts } from '../../../packages/goreview/src/facts';
import type { AssessmentDimension, BuildContext, ReviewTarget } from '../../../packages/goreview/src/types';
import { BASE, diskFetch } from '../../language-packs/helpers';

export const NOW = '2026-10-08T10:00:00.000Z';

export interface Selection { surface: string; sentence?: string; selStart?: number; selEnd?: number }

export const SENT = {
  librin: 'Fëmijët lexojnë librin.',
  liber: 'Ajo ka një libër.',
  shkolle: 'Ana shkon në shkollë.',
  quhem: 'Unë quhem Sam.',
  nena: 'Nëna pi çaj në shtëpi.',
  cajin: 'Nëna pi çajin.',
};

export const SELECTIONS: Selection[] = [
  { surface: 'librin', sentence: SENT.librin },
  { surface: 'libër', sentence: SENT.liber },
  { surface: 'shkollë', sentence: SENT.shkolle },
  { surface: 'quhem Sam', sentence: SENT.quhem, selStart: SENT.quhem.indexOf('quhem'), selEnd: SENT.quhem.length - 1 },
  { surface: 'Nëna', sentence: SENT.nena },
  { surface: 'çajin', sentence: SENT.cajin },
];

/** A Repository `unit()` over the resolver's output for the given selections (the higher status wins when a unit is met twice). */
export function fakeRepository(selections: Selection[] = SELECTIONS) {
  const units = new Map<string, LinguisticUnit>();
  const relations = new Map<string, UnitRelation>();
  const analyses: FormAnalysis[] = [];
  for (const s of selections) {
    const r = resolveSelection({
      languageId: 'sq', surface: s.surface, ...(s.sentence ? { sentence: s.sentence } : {}),
      ...(s.selStart !== undefined ? { selStart: s.selStart, selEnd: s.selEnd } : {}), now: NOW,
    });
    for (const u of r.units) {
      const old = units.get(u.unitId);
      if (!old || STATUS_RANK[u.status] > STATUS_RANK[old.status]) units.set(u.unitId, u);
    }
    for (const x of r.relations) relations.set(`${x.fromId}|${x.relation}|${x.toId}`, x);
    analyses.push(r.analysis);
  }
  const calls: string[] = [];
  return {
    units, relations, analyses, calls,
    async unit(unitId: string) {
      calls.push(unitId);
      const unit = units.get(unitId);
      if (!unit) return undefined;
      return {
        unit,
        relations: [...relations.values()].filter((x) => x.fromId === unitId || x.toId === unitId),
        analyses: analyses.filter((a) => a.formId === unitId),
      };
    },
  };
}

export interface World {
  repo: ReturnType<typeof fakeRepository>;
  provider: ReturnType<typeof createFactsProvider>;
  manifest: ReturnType<typeof albanianManifest>;
  facts(unitId: string): Promise<ReviewFacts>;
}

export function makeWorld(opts: { selections?: Selection[]; noDictionary?: boolean } = {}): World {
  const repo = fakeRepository(opts.selections);
  const manifest = albanianManifest();
  const runtime = createPackRuntime(manifest, { fetch: diskFetch(), baseUrl: BASE });
  const provider = createFactsProvider({
    unit: (id) => repo.unit(id),
    pack: { manifest, runtime: opts.noDictionary ? { gloss: async () => undefined } : runtime },
    adapter: sqAdapter,
    now: () => NOW,
  });
  return {
    repo, provider, manifest,
    async facts(unitId: string) {
      const f = await provider.factsFor(unitId, 'sq');
      if (!f) throw new Error(`no facts for ${unitId}`);
      return f as ReviewFacts;
    },
  };
}

export const IDS = {
  liber: 'lemma:sq:libër:NOUN',
  librin: 'form:sq:librin',
  shkolle: 'form:sq:shkollë',
  shkolleLemma: 'lemma:sq:shkollë:NOUN',
  construction: 'morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing',
  constructionInd: 'morph:sq:NOUN:Case=Nom,Acc|Definite=Ind|Gender=Masc|Number=Sing',
  phrase: 'phrase:sq:quhem__',
  nena: 'form:sq:nëna',
  cajin: 'form:sq:çajin',
};

export const kindOfId = (id: string): string => (id.startsWith('lemma:') ? 'lexeme' : id.startsWith('form:') ? 'form' : id.startsWith('morph:') ? 'morph-construction' : 'multiword');

export function target(unitId: string, dimension: AssessmentDimension): ReviewTarget {
  return { unitId, unitKind: kindOfId(unitId), languageId: 'sq', varietyId: 'sq-standard', dimension };
}

export function ctxOf(extra: Partial<BuildContext> = {}): BuildContext {
  return { now: NOW, random: () => 0.1, ...extra };
}

// ───────────────────────────── a fake GoListen assessment source ─────────────────────────────

export function voice(over: Partial<VoiceDescriptor> = {}): VoiceDescriptor {
  return {
    voiceId: 'test-voice', languageId: 'sq', provider: 'recorded', execution: 'local', synthetic: false, licence: 'test', qualityVerification: 'native-reviewed',
    knownLimitations: [], supports: ['word', 'sentence'], suitableForAssessment: true, label: 'recording sq-01.wav', ...over,
  };
}

export type AudioMode = 'recorded' | 'synthetic' | 'unavailable' | 'throws';

export function fakeAudio(mode: AudioMode = 'recorded'): AssessmentSource & { requests: Array<{ text: string; itemIds: string[]; kind: string }> } {
  const requests: Array<{ text: string; itemIds: string[]; kind: string }> = [];
  return {
    requests,
    async prepareStimulus(req) {
      requests.push({ text: req.text, itemIds: req.itemIds, kind: req.kind });
      if (mode === 'throws') throw new Error('provider exploded');
      if (mode === 'unavailable') return { unavailable: true as const, reason: 'no recording and no voice for sq' };
      const synthetic = mode === 'synthetic';
      const stimulus: AudioStimulus = {
        stimulusId: `stim:${requests.length}`, languageId: req.languageId, kind: req.kind, itemIds: [...req.itemIds],
        voice: voice(synthetic ? { synthetic: true, provider: 'device', suitableForAssessment: false, qualityVerification: 'unverified', voiceId: 'device-sq' } : {}),
        audio: synthetic ? { kind: 'device', text: req.text } : { kind: 'recorded', url: 'blob:test' },
        answerHidden: true, replaysAllowed: req.replaysAllowed ?? 2,
        validity: synthetic
          ? { eligibleForEvidence: false, reason: 'Synthetic speech is generated from the text: practice only, never listening evidence.' }
          : { eligibleForEvidence: true, reason: 'A reviewed human recording that exists independently of the text.' },
      };
      return stimulus;
    },
    playbackOf() { throw new Error('not used in these tests'); },
    scoringMetadata(stimulus, replaysUsed): ScoringMetadata {
      return {
        voice: stimulus.voice.synthetic ? 'synthetic' : 'recorded', hinted: replaysUsed > stimulus.replaysAllowed, replays: replaysUsed,
        eligibleForEvidence: stimulus.validity.eligibleForEvidence && !stimulus.voice.synthetic,
      };
    },
  };
}
