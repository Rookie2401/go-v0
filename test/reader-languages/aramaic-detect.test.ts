// @vitest-environment node
/**
 * Hebrew script is shared by Hebrew and Biblical Aramaic. Hebrew stays the default for an undeclared page (its pack also
 * reads Biblical Aramaic as a period); the Aramaic pack takes a sample only when its attested word list clearly beats
 * Hebrew's. The first Aramaic branch left modern Hebrew undetermined (audit, 2026-11-12).
 */
import { describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { arcAdapter } from '../../src/adapters/arc';
import { createLanguageResolver } from '../../packages/golearn-extension/src/language/resolve';

const both = createLanguageResolver({ adapters: { he: heAdapter, arc: arcAdapter } });
const arcOnly = createLanguageResolver({ adapters: { arc: arcAdapter } });

const MODERN_NEWS = 'הממשלה אישרה היום את התקציב החדש לשנה הבאה לאחר דיון ארוך בכנסת';
const GENESIS_1_1 = 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ';

describe('undeclared Hebrew-script pages with the Hebrew and Aramaic packs installed', () => {
  it('reads modern Hebrew news as Hebrew, not undetermined', () => {
    expect(both({ installed: ['he', 'arc'], sample: MODERN_NEWS })).toMatchObject({ languageId: 'he', basis: 'detection' });
  });

  it('reads Genesis 1:1 as Hebrew', () => {
    expect(both({ installed: ['he', 'arc'], sample: GENESIS_1_1 })).toMatchObject({ languageId: 'he' });
  });

  it('reads Hebrew as Hebrew when only the Hebrew pack is installed', () => {
    expect(both({ installed: ['he'], sample: MODERN_NEWS })).toMatchObject({ languageId: 'he' });
  });

  it('never calls modern Hebrew Aramaic when only the Aramaic word list is loaded', () => {
    expect(arcOnly({ installed: ['he', 'arc'], sample: MODERN_NEWS }).languageId).not.toBe('arc');
  });
});
