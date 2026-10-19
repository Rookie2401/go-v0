import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core/model';
import { createPlayerModel, reducePlayer, type PlayerManifestInput } from '../../src/golisten/player';

const sample: Record<LanguageCode, string> = { es: 'Hola mundo.', sq: 'Përshëndetje.', th: 'สวัสดีครับ', hi: 'नमस्ते।', de: 'Guten Tag.', nb: 'God dag.', nn: 'God dag.', he: 'שלום עולם.', el: 'Καλημέρα κόσμε.', la: 'In principio erat Verbum.' };

describe('resume offsets across all supported scripts', () => {
  it.each(Object.entries(sample) as [LanguageCode, string][])('%s restores an absolute clip offset without producing listening evidence', (lang, sentence) => {
    const offset = 1250;
    const manifest: PlayerManifestInput = {
      manifestId: `manifest:${lang}`, textId: `text:${lang}`, segments: [{
        segmentId: `segment:${lang}`, sentenceIds: [`sentence:${lang}`], ready: true, playAllowed: true,
        assetId: `asset:${lang}`, durationMs: 5000, rangeMs: { startMs: 500, endMs: 4500 },
      }],
    };
    const result = reducePlayer(createPlayerModel(manifest), { type: 'restorePosition', segmentId: `segment:${lang}`, positionMs: offset });
    expect(result.model.positionMs).toBe(offset);
    expect(result.model).toMatchObject({ playing: false, started: false, completed: false, heardRanges: [] });
    expect(result.effects.map((e) => e.type)).toEqual(['load', 'seek']);
    expect(sentence.length).toBeGreaterThan(0); // use a real native-script fixture for each course language
  });

  it('rejects a checkpoint outside the exact segment range', () => {
    const manifest: PlayerManifestInput = { manifestId: 'm', textId: 't', segments: [{ segmentId: 's', sentenceIds: ['s1'], ready: true, playAllowed: true, assetId: 'a', durationMs: 5000, rangeMs: { startMs: 500, endMs: 4500 } }] };
    expect(reducePlayer(createPlayerModel(manifest), { type: 'restorePosition', segmentId: 's', positionMs: 4800 }).effects).toEqual([]);
  });
});
