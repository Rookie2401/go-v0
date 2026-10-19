import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../src/core';
import { loadBundledCorpus } from '../../src/ingest';
import { adapter } from './helpers';
import { SEED_BY_LANG } from '../ingest/seed';

const SAMPLES: Record<string, string[]> = {
  es: ['¿Cómo estás? Muy bien, «gracias».', 'Entenderlo… y perdonarnos: 3 cosas (o 4).', 'Dios ama al mundo — sí.'],
  sq: ['Nuk e kuptoja zemrën time.', 'Çfarë? Një gjë: "mëkat".', 'Perëndia e fali mëkatin tim; tani besoj.'],
  th: ['พระเจ้าทรงรักโลก', 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน', 'ฉันมีหนังสือ 2 เล่ม (ไม่ใช่ 3)'],
  hi: ['उसने काम किया।', 'मैं ठीक हूँ, पॉल, पर मैं एक बात नहीं समझती।', 'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने दिया, ताकि वह नाश न हो।'],
  nb: ['Jeg begynte å forstå det.', 'Hva sa du? Ikke noe: bare «ja» (eller nei).', 'Han kjøpte brød, smør og ost — på Grünerløkka.'],
  nn: ['Eg byrja å forstå det.', 'Kva sa du? Ikkje noko: berre «ja» (eller nei).', 'Ho kjøpte brød, smør og ost — på Grünerløkka.'],
  de: ['Ich fing an, es zu verstehen.', 'Am 3. Mai kam der Gotteshaus-Mann (z. B.) nach Hause!', 'Sünde — „Untugend“ und Wahrheit.'],
  la: ['In principio erat Verbum, et Verbum erat apud Deum.', 'Dixitque Deus : Fiat lux. Et facta est lux.', 'Quid est veritas? Ecce homo — «vidēte» (cap. 3).'],
  he: ['בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', 'וַיֹּ֥אמֶר אֱלֹהִ֖ים יְהִ֣י א֑וֹר וַֽיְהִי־אֽוֹר׃', 'מה זה? אני לא יודע: 3 ספרים (או 4).'],
  el: ['Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.', 'Τὸν δ᾽ ἀπαμειβόμενος προσέφη· οὐκ ἔσθ᾽ οὗτος ἀνήρ.', 'Τι κάνεις; Καλά, ευχαριστώ — 3 βιβλία (όχι 4)!'],
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
      // the three seed documents of each seed language are always there (Hebrew's scripture seed is bible-gen-1); further bundled texts are checked too
      const seed = docs.filter((d) => (SEED_BY_LANG[lang] ?? []).includes(d.id));
      // Latin has course texts only (Vulgate chapters, Ritchie, Caesar), no seed trio
      if (lang in SEED_BY_LANG) expect(seed, lang).toHaveLength(3);
      expect(docs.length).toBeGreaterThanOrEqual(3);
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
