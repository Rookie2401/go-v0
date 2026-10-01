/**
 * Coordinator's independent check of the Thai orthography engine (not written by the package that built it).
 *
 * The one unacceptable outcome is a confident wrong tone. Three tables:
 *   CORE  — regular one-syllable words: must decode to exactly one syllable with the right tone, confidence ≥ 0.8.
 *   HARD  — thanthakhat words and polysyllabic words: whenever every syllable is returned with confidence ≥ 0.8,
 *           the tones must be right; lower confidence (or no answer) is allowed and counted.
 *   RESP  — dictionary-style phonemic respellings: regular by construction, must decode exactly.
 * Tones are the citation tones of the written form (เขา, ฉัน, ไหม: rising, as spelled).
 */
import { describe, expect, it } from 'vitest';
import { decodeThai, decodeThaiRespelling, thaiOrthFeatures, tonesFromIpa } from '../../src/adapters/thai/orthography';

import { CORE, HARD, HELD_OUT, RESP, T, tonesOf, words } from './thai-tone-tables';

describe('Thai orthography engine — coordinator table', () => {
  describe('regular one-syllable words decode confidently and correctly', () => {
    for (const [letter, list] of Object.entries(CORE)) {
      it.each(words(list))(`%s → ${T[letter]}`, (word) => {
        const syl = decodeThai(word);
        expect(syl.map((s) => s.tone), `${word}: ${JSON.stringify(syl)}`).toEqual([T[letter]]);
        expect(syl[0].confidence, `${word} confidence`).toBeGreaterThanOrEqual(0.8);
        expect(word.slice(syl[0].start, syl[0].end)).toBe(syl[0].text);
      });
    }
  });

  it('harder words are never confidently wrong', () => {
    const wrong: string[] = [];
    let confidentRight = 0;
    const unsure: string[] = [];
    for (const [word, letters] of HARD) {
      const syl = decodeThai(word);
      const confident = syl.length > 0 && syl.every((s) => s.confidence >= 0.8 && s.tone);
      if (!confident) { unsure.push(word); continue; }
      const got = syl.map((s) => s.tone);
      if (JSON.stringify(got) === JSON.stringify(tonesOf(letters))) confidentRight++;
      else wrong.push(`${word}: expected ${tonesOf(letters).join(' ')}, got ${got.join(' ')} (${syl.map((s) => `${s.text}@${s.confidence}`).join(' ')})`);
    }
    console.info(`[thai-tones] harder words: ${confidentRight} confident and right, ${unsure.length} left uncertain, ${wrong.length} confidently wrong of ${HARD.length}`);
    if (unsure.length) console.info(`[thai-tones] uncertain: ${unsure.join(' ')}`);
    expect(wrong).toEqual([]);
    // the engine must be useful, not merely cautious
    expect(confidentRight).toBeGreaterThanOrEqual(Math.floor(HARD.length * 0.5));
  });

  it('held-out words (never shown to the engine\'s author) are never confidently wrong', () => {
    const wrong: string[] = [];
    let confidentRight = 0;
    const unsure: string[] = [];
    for (const [word, letters] of HELD_OUT) {
      const syl = decodeThai(word);
      const confident = syl.length > 0 && syl.every((s) => s.confidence >= 0.8 && s.tone);
      if (!confident) { unsure.push(word); continue; }
      const got = syl.map((s) => s.tone);
      if (JSON.stringify(got) === JSON.stringify(tonesOf(letters))) confidentRight++;
      else wrong.push(`${word}: expected ${tonesOf(letters).join(' ')}, got ${got.join(' ')} (${syl.map((s) => `${s.text}@${s.confidence}`).join(' ')})`);
    }
    console.info(`[thai-tones] held-out: ${confidentRight} confident and right, ${unsure.length} left uncertain, ${wrong.length} confidently wrong of ${HELD_OUT.length}`);
    if (unsure.length) console.info(`[thai-tones] held-out uncertain: ${unsure.join(' ')}`);
    expect(wrong).toEqual([]);
  });

  it.each(RESP)('respelling %s (%s) decodes exactly', (word, respelling, letters) => {
    const syl = decodeThaiRespelling(word, respelling);
    expect(syl.map((s) => s.tone), JSON.stringify(syl)).toEqual(tonesOf(letters));
  });

  it('IPA is the authority for tone when a respelling comes with one', () => {
    expect(tonesFromIpa('/kʰa˨˩.nom˩˩˦/')).toEqual(['low', 'rising']);
    expect(tonesFromIpa('/ta˨˩.laːt̚˨˩/')).toEqual(['low', 'low']);
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˩˩˦/').map((s) => s.tone)).toEqual(['low', 'rising']);
    // spoken น้ำ is long and high: the tone letters win and the word is flagged irregular where spelling and sound part
    const nam = decodeThaiRespelling('น้ำ', 'น้าม', '/naːm˦˥/');
    expect(nam.map((s) => s.tone)).toEqual(['high']);
  });

  it('features come only from confident syllables and name the rule that applied', () => {
    const f = thaiOrthFeatures(decodeThai('บ้าน'));
    expect(f).toContain('class:mid');
    expect(f).toContain('mark:mai-tho');
    expect(f.some((k) => k.startsWith('rule:mid+mai-tho=falling'))).toBe(true);
    const none = thaiOrthFeatures([{ text: 'x', start: 0, end: 1, ending: 'live', confidence: 0.3 }]);
    expect(none).toEqual([]);
  });

  it('non-Thai input and signs do not produce syllables', () => {
    expect(decodeThai('abc')).toEqual([]);
    expect(decodeThai('ๆ')).toEqual([]);
    expect(decodeThai('')).toEqual([]);
  });
});
