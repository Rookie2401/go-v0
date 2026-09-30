import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../src/core';
import { loadBundledCorpus } from '../../src/ingest';
import { adapter } from './helpers';

const WITH_MARKERS: Record<string, string> = {
  es: 'Porque [16] de tal manera ¹⁶ amó Dios al mundo.',
  sq: 'Sepse [16] Perëndia ¹⁶ e deshi botën.',
  th: 'เพราะว่า [16] พระเจ้า ¹⁶ ทรงรักโลก',
  hi: 'क्योंकि [16] परमेश्वर ¹⁶ ने प्रेम रखा।',
  de: 'Also [16] hat Gott ¹⁶ die Welt geliebt.',
};

describe('speechNormalize (all languages)', () => {
  for (const lang of LANGUAGES) {
    const ad = adapter(lang);

    it(`${lang}: strips verse markers ([n], superscripts) and records it`, () => {
      const r = ad.speechNormalize(WITH_MARKERS[lang], { isScripture: true });
      expect(r.speechText).not.toMatch(/\[\d+\]/);
      expect(r.speechText).not.toMatch(/[²³¹⁰⁴-⁹]/u);
      expect(r.speechText).not.toMatch(/\d/);
      expect(r.speechText).not.toMatch(/ {2}/);
      expect(r.transformations.map((t) => t.description).join('|')).toMatch(/removed verse markers/);
      // markers go in non-scripture mode too: they are never spoken
      expect(ad.speechNormalize(WITH_MARKERS[lang]).speechText).toBe(r.speechText);
    });

    it(`${lang}: deterministic, versioned, records carry no wall-clock time`, () => {
      const a = ad.speechNormalize(WITH_MARKERS[lang] + ' 3', { isScripture: true });
      const b = ad.speechNormalize(WITH_MARKERS[lang] + ' 3', { isScripture: true });
      expect(a).toEqual(b);
      expect(a.normalizerVersion).toBe(`speech-${lang}@1`);
      for (const t of a.transformations) {
        expect(t.tool).toBe(`speech-${lang}@1`);
        expect(t.at).toBe('1970-01-01T00:00:00.000Z');
      }
    });

    it(`${lang}: a bare digit is spoken as a word (3 is not left as a digit)`, () => {
      expect(ad.speechNormalize('3').speechText).not.toMatch(/\d/);
      expect(ad.speechNormalize('3').speechText.length).toBeGreaterThan(0);
    });

    it(`${lang}: never transliterates: script of the words is unchanged`, () => {
      const script = { es: /^[\p{Script=Latin}\s.,!?¿¡'-]+$/u, sq: /^[\p{Script=Latin}\s.,!?'-]+$/u, de: /^[\p{Script=Latin}\s.,!?'-]+$/u, th: /^[\p{Script=Thai}\s]+$/u, hi: /^[\p{Script=Devanagari}\s।,.?!]+$/u }[lang];
      for (const doc of loadBundledCorpus().filter((d) => d.lang === lang && d.contentType !== 'scripture')) {
        for (const sec of doc.sections) for (const par of sec.paragraphs) {
          if (!('sentences' in par)) continue;
          for (const s of par.sentences) {
            const out = ad.speechNormalize(s.text).speechText;
            expect(out).toMatch(script);
          }
        }
      }
    });

    it(`${lang}: plain corpus sentences pass through unchanged (nothing to normalise)`, () => {
      for (const doc of loadBundledCorpus().filter((d) => d.lang === lang && d.contentType === 'story')) {
        for (const sec of doc.sections) for (const par of sec.paragraphs) {
          if (!('sentences' in par)) continue;
          for (const s of par.sentences) {
            const r = ad.speechNormalize(s.text);
            expect(r.speechText).toBe(s.text);
            expect(r.transformations).toEqual([]);
          }
        }
      }
    });
  }

  it('does not strip a genuine leading numeral from scripture (only markers)', () => {
    const r = adapter('es').speechNormalize('3 mil personas', { isScripture: true });
    expect(r.speechText).toBe('tres mil personas');
  });
});
