/**
 * What guidance may read from a language pack: the pack's own grammar notes (machine-drafted unless the pack says
 * otherwise), its tutorial sentence patterns and a small word-to-topic table. It reads the manifest and the tutorial only;
 * it never invents a sentence.
 */
import { PACKS, SQ_TUTORIAL_STEPS } from '../../../language-packs/src';

export interface GuidancePattern { id: string; title: string; example: string; gloss: string }

export interface GuidancePack {
  explainConstruction(id: string): string | undefined;
  explainFeature(key: string, value?: string): string | undefined;
  /** Sentence patterns the pack teaches, with one of its own example sentences each. */
  tutorialPatterns?(): GuidancePattern[];
  /** Topic domains a lemma unit belongs to, when the pack can tell (empty when it cannot). */
  unitDomains?(unitId: string): string[];
}

/** Lemmas the Albanian tutorial and passage use, grouped by topic. Matching is by lemma only; absent words are simply unknown. */
const SQ_LEMMA_DOMAINS: Record<string, string[]> = {
  'nënë': ['family'], 'fëmijë': ['family'], 'vajzë': ['family'],
  'shtëpi': ['home', 'daily-life'], 'dhomë': ['home'], 'kuzhinë': ['home'],
  'shkollë': ['education'], 'libër': ['education', 'interests'], 'gjuhë': ['education'],
  'çaj': ['daily-life', 'hospitality'], 'ujë': ['daily-life'], 'bukë': ['daily-life', 'hospitality'],
  'faleminderit': ['gratitude'], 'mirëmëngjes': ['introductions'], 'jetë': ['time', 'daily-life'],
};

const lemmaOf = (unitId: string): string | undefined => (unitId.startsWith('lemma:') ? unitId.split(':')[2] : undefined);

/** A guidance pack for one language; for a language without a pack, every lookup answers `undefined`. */
export function guidancePackFor(languageId: string): GuidancePack {
  const m = PACKS[languageId];
  const out: GuidancePack = {
    explainConstruction: (id) => m?.grammar.constructions.find((c) => c.id === id)?.explain,
    explainFeature: (key, value) => {
      const f = m?.grammar.features.find((x) => x.key === key);
      if (!f) return undefined;
      const name = value !== undefined ? f.values[value] : undefined;
      return name ? `${f.explain} (${value}: ${name})` : f.explain;
    },
  };
  if (languageId === 'sq') {
    out.tutorialPatterns = () => SQ_TUTORIAL_STEPS
      .filter((s) => s.kind === 'patterns' && s.examples?.length)
      .map((s) => ({ id: s.id, title: s.title, example: s.examples![0].surface, gloss: s.examples![0].gloss }));
    out.unitDomains = (unitId) => SQ_LEMMA_DOMAINS[lemmaOf(unitId) ?? ''] ?? [];
  }
  return out;
}
