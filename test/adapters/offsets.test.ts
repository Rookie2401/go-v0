import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../src/core';
import { loadBundledCorpus } from '../../src/ingest';
import { adapter } from './helpers';

const SAMPLES: Record<string, string[]> = {
  es: ['¿Cómo estás? Muy bien, «gracias».', 'Entenderlo… y perdonarnos: 3 cosas (o 4).', 'Dios ama al mundo — sí.'],
  sq: ['Nuk e kuptoja zemrën time.', 'Çfarë? Një gjë: "mëkat".', 'Perëndia e fali mëkatin tim; tani besoj.'],
  th: ['พระเจ้าทรงรักโลก', 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน', 'ฉันมีหนังสือ 2 เล่ม (ไม่ใช่ 3)'],
  hi: ['उसने काम किया।', 'मैं ठीक हूँ, पॉल, पर मैं एक बात नहीं समझती।', 'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने दिया, ताकि वह नाश न हो।'],
  de: ['Ich fing an, es zu verstehen.', 'Am 3. Mai kam der Gotteshaus-Mann (z. B.) nach Hause!', 'Sünde — „Untugend“ und Wahrheit.'],
};

describe('token offsets round-trip (all five languages)', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: sample strings`, () => {
      const ad = adapter(lang);
      for (const text of SAMPLES[lang]) {
        const tokens = ad.tokenize(text);
        expect(tokens.length).toBeGreaterThan(0);
        let prevEnd = 0;
        for (const t of tokens) {
          expect(text.slice(t.start, t.end)).toBe(t.surface);
          expect(t.start).toBeGreaterThanOrEqual(prevEnd);
          expect(/^\s|\s$/u.test(t.surface)).toBe(false);
          if (t.isWord) expect(t.normalized).toBe(ad.normalize(t.surface));
          prevEnd = t.end;
        }
        // analyze is parallel to tokens and never invents an analysis for punctuation
        const an = ad.analyze(tokens);
        expect(an).toHaveLength(tokens.length);
        an.forEach((a, i) => {
          expect(a.token).toBe(tokens[i]);
          if (!tokens[i].isWord) expect(a.candidates).toEqual([]);
        });
      }
    });

    it(`${lang}: every bundled corpus sentence`, () => {
      const ad = adapter(lang);
      const docs = loadBundledCorpus().filter((d) => d.lang === lang);
      expect(docs).toHaveLength(3);
      let checked = 0;
      for (const doc of docs) for (const sec of doc.sections) for (const par of sec.paragraphs) {
        if (!('sentences' in par)) continue;
        for (const s of par.sentences) {
          for (const t of ad.tokenize(s.text)) { expect(s.text.slice(t.start, t.end)).toBe(t.surface); checked++; }
        }
      }
      expect(checked).toBeGreaterThan(100);
    });
  }

  it('segmentSentences spans slice the input exactly', () => {
    for (const lang of LANGUAGES) {
      const ad = adapter(lang);
      const text = SAMPLES[lang].join(' ');
      for (const sp of ad.segmentSentences(text)) expect(text.slice(sp.start, sp.end)).toBe(sp.text);
    }
  });
});
