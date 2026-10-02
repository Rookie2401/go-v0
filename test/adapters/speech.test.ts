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
      const script = { es: /^[\p{Script=Latin}\s.,:;!?¿¡'«»"“”()…-]+$/u, sq: /^[\p{Script=Latin}\s.,!?'-]+$/u, de: /^[\p{Script=Latin}\s.,:;!?'„“‚‘»«()…–—-]+$/u, th: /^[\p{Script=Thai}\s]+$/u, hi: /^[\p{Script=Devanagari}\s।,.?!]+$/u }[lang];
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
            if (lang === 'es' && /[—–]/u.test(s.text)) {
              // Spanish dialogue: the raya is written, not spoken; the change is recorded like any other
              expect(r.speechText).not.toMatch(/[—–]/u);
              expect(r.transformations.map((t) => t.description).join('|')).toMatch(/dialogue dashes/);
              continue;
            }
            expect(r.speechText).toBe(s.text);
            expect(r.transformations).toEqual([]);
          }
        }
      }
    });
  }

  describe('Spanish dialogue dashes (raya)', () => {
    const es = adapter('es');
    const say = (t: string) => es.speechNormalize(t);

    it('the dash that opens a turn is not spoken', () => {
      expect(say('—Hola, Ana.').speechText).toBe('Hola, Ana.');
      expect(say('—¿Cómo estás?').speechText).toBe('¿Cómo estás?');
      expect(say('—Hola.\n—Adiós.').speechText).toBe('Hola.\nAdiós.');
    });

    it('the pair around a reporting clause becomes a pause', () => {
      expect(say('—Hola —dijo Luis—. ¿Qué tal?').speechText).toBe('Hola, dijo Luis. ¿Qué tal?');
      expect(say('—Hola, Ana —dice Juan.').speechText).toBe('Hola, Ana, dice Juan.');
      expect(say('—¿Cómo estás? —preguntó Ana.').speechText).toBe('¿Cómo estás? preguntó Ana.');
      expect(say('—No sé… —dijo Ana.').speechText).toBe('No sé… dijo Ana.');
    });

    it('a spaced dash between words is a pause too', () => {
      expect(say('Dios ama al mundo — sí.').speechText).toBe('Dios ama al mundo, sí.');
    });

    it('the transformation is recorded, deterministic and versioned like the others', () => {
      const r = say('—Hola —dijo Luis—. Son 3.');
      expect(r.transformations[0]).toEqual({ at: '1970-01-01T00:00:00.000Z', tool: 'speech-es@1', description: expect.stringMatching(/dialogue dashes/) });
      expect(r.transformations.map((t) => t.description).join('|')).toMatch(/integers expanded/);
      expect(r.speechText).toBe('Hola, dijo Luis. Son tres.');
      expect(say('—Hola —dijo Luis—. Son 3.')).toEqual(r);
    });

    it('text without a dash is untouched and records nothing for it; a hyphen is not a dash', () => {
      expect(say('Hola, Ana.')).toMatchObject({ speechText: 'Hola, Ana.', transformations: [] });
      expect(say('Es un hombre bien-educado.').speechText).toBe('Es un hombre bien-educado.');
    });
  });

  it('does not strip a genuine leading numeral from scripture (only markers)', () => {
    const r = adapter('es').speechNormalize('3 mil personas', { isScripture: true });
    expect(r.speechText).toBe('tres mil personas');
  });
});
