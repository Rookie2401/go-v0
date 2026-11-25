// @vitest-environment node
/**
 * French pronunciation help: graphemes, the aspirated-h list, liaison and the notes. The checks are of the described behaviour
 * (machine-drafted rules, not checked by a native speaker); nothing here claims a pronunciation is right.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyzedToken, RawToken } from '../../src/core';
import { FRENCH_PATTERNS, frenchGraphemes } from '../../src/adapters/french/graphemes';
import type { FrGrapheme } from '../../src/adapters/french/graphemes';
import { H_ASPIRE, NO_LIAISON_INITIAL, frenchPronunciation, liaison } from '../../src/adapters/french/pronunciation';

const g = (w: string): FrGrapheme[] => frenchGraphemes(w);
const texts = (w: string): string[] => g(w).map((x) => x.text);
const find = (w: string, text: string): FrGrapheme => {
  const x = g(w).find((y) => y.text === text);
  if (!x) throw new Error(`${w}: no grapheme ${text} in ${JSON.stringify(texts(w))}`);
  return x;
};
const last = (w: string): FrGrapheme => g(w)[g(w).length - 1];
const tok = (normalized: string, isWord = true): RawToken => ({ surface: normalized, start: 0, end: normalized.length, isWord, normalized });
const analysisOf = (t: RawToken, cand: Record<string, unknown>): AnalyzedToken => ({ token: t, candidates: [{ morph: {}, confidence: 0.9, ...cand }] as AnalyzedToken['candidates'], analyzer: 'test' });

const FORTY = [
  'bonjour', 'merci', 'salut', 'oui', 'non', 'vous', 'moi', 'eau', 'beau', 'mais', 'peu', 'cœur', 'sœur', 'tu', 'enfant', 'bon', 'bonne', 'vin', 'pain', 'un',
  'une', 'année', 'important', 'inutile', 'parlent', 'moment', 'souvent', 'petit', 'petite', 'grand', 'montagne', 'chat', 'garçon', 'musique', 'fille', 'ville',
  'maison', 'poisson', 'exemple', 'nuit', "l'homme", 'peut-être', "aujourd'hui", 'nez', 'chez', 'travail', 'mangeons', 'guerre', 'est', 'hôtel',
];

describe('frenchGraphemes covers a word exactly once and in order', () => {
  it.each(FORTY)('%s', (w) => {
    const gs = g(w);
    expect(gs.length).toBeGreaterThan(0);
    let pos = 0;
    for (const x of gs) {
      expect(x.start, `${w}: ${x.text}`).toBe(pos);
      expect(x.end, `${w}: ${x.text}`).toBeGreaterThan(x.start);
      expect(w.slice(x.start, x.end)).toBe(x.text);
      expect(x.sound.length).toBeGreaterThan(0);
      pos = x.end;
    }
    expect(pos).toBe(w.length);
    expect(gs.map((x) => x.text).join('')).toBe(w);
  });

  it('keeps the original casing of the text and handles the empty string', () => {
    expect(g('Bonjour').map((x) => x.text).join('')).toBe('Bonjour');
    expect(g('')).toEqual([]);
  });

  it('never writes IPA: no grapheme sound contains an IPA-only character', () => {
    for (const w of FORTY) for (const x of g(w)) expect(x.sound, `${w}: ${x.text}`).not.toMatch(/[ɛɔœøəʁʒʃɑɲŋ̃]/);
  });
});

describe('nasal vowels are nasal only when the n/m is not followed by a vowel or another n/m', () => {
  it('bon vs bonne', () => {
    expect(find('bon', 'on').kind).toBe('nasal');
    expect(texts('bonne')).toEqual(['b', 'o', 'nn', 'e']);
    expect(g('bonne').some((x) => x.kind === 'nasal')).toBe(false);
  });
  it('an vs année', () => {
    expect(find('an', 'an').kind).toBe('nasal');
    expect(texts('année')).toEqual(['a', 'nn', 'é', 'e']);
  });
  it('important vs inutile', () => {
    expect(find('important', 'im').kind).toBe('nasal');
    expect(find('important', 'an').kind).toBe('nasal');
    expect(g('inutile')[0]).toMatchObject({ text: 'i', kind: 'vowel' });
    expect(g('inutile').some((x) => x.kind === 'nasal')).toBe(false);
  });
  it('un vs une', () => {
    expect(find('un', 'un').kind).toBe('nasal');
    expect(g('une').some((x) => x.kind === 'nasal')).toBe(false);
    expect(find('un', 'un').sound).toMatch(/nasal u/);
  });
  it('the other nasal spellings', () => {
    expect(find('pain', 'ain').kind).toBe('nasal');
    expect(find('plein', 'ein').kind).toBe('nasal');
    expect(find('loin', 'oin').kind).toBe('nasal');
    expect(find('dans', 'an').kind).toBe('nasal');
    expect(find('temps', 'em').kind).toBe('nasal');
    expect(find('pont', 'on').kind).toBe('nasal');
  });
});

describe('vowel and consonant patterns', () => {
  it('ou, oi, eau, au, eu, œu, ai', () => {
    expect(find('vous', 'ou').sound).toMatch(/oo as in food/);
    expect(find('moi', 'oi').sound).toMatch(/^wa/);
    expect(find('beau', 'eau').sound).toMatch(/o as in go/);
    expect(find('au', 'au').sound).toMatch(/o as in go/);
    expect(find('peu', 'eu').sound).toMatch(/u in fur/);
    expect(find('cœur', 'œu').sound).toMatch(/u in fur/);
    expect(find('mais', 'ai').sound).toMatch(/e as in bed/);
    expect(find('tu', 'u').sound).toMatch(/rounded/);
  });
  it('gn, ch, qu, ç, th, ph', () => {
    expect(find('montagne', 'gn').sound).toMatch(/ny as in canyon/);
    expect(find('chat', 'ch').sound).toBe('sh');
    expect(find('musique', 'qu').sound).toBe('k');
    expect(find('garçon', 'ç').sound).toBe('s');
    expect(find('thé', 'th').sound).toBe('t');
    expect(find('photo', 'ph').sound).toBe('f');
  });
  it('Greek-origin ch is k, with a context certainty', () => {
    expect(find('orchestre', 'ch')).toMatchObject({ sound: 'k', certainty: 'context' });
  });
  it('soft and hard c and g, s between vowels, ill and the exceptions', () => {
    expect(find('ici', 'c').sound).toBe('s');
    expect(find('café', 'c').sound).toBe('k');
    expect(find('manger', 'g').sound).toMatch(/^zh/);
    expect(find('gare', 'g').sound).toMatch(/g as in go/);
    expect(find('guerre', 'gu').sound).toMatch(/u is silent/);
    expect(find('mangeons', 'ge').sound).toMatch(/^zh/);
    expect(find('maison', 's').sound).toBe('z');
    expect(find('poisson', 'ss').sound).toBe('s');
    expect(find('fille', 'ill').sound).toMatch(/ee-y/);
    expect(find('travaille', 'ill').sound).toMatch(/^y/);
    expect(find('ville', 'ill').sound).toMatch(/l is said|double l/);
    expect(find('mille', 'ill').sound).toMatch(/double l/);
    expect(find('tranquille', 'ill').sound).toMatch(/double l/);
  });
  it('h is silent, é and è, tion, ex-', () => {
    expect(find('homme', 'h')).toMatchObject({ kind: 'silent' });
    expect(find('été', 'é').sound).toMatch(/^ay/);
    expect(find('mère', 'è').sound).toMatch(/e as in bed/);
    expect(find('nation', 'ti').sound).toMatch(/^s/);
    expect(find('question', 't').sound).toBe('t');
    expect(find('exemple', 'x').sound).toBe('gz');
  });
  it('er, ez and é at the end are ay with a silent r or z, and mer/cher keep the r', () => {
    expect(texts('parler').slice(-2)).toEqual(['e', 'r']);
    expect(g('parler')[g('parler').length - 2].sound).toMatch(/^ay/);
    expect(last('parler').kind).toBe('silent');
    expect(g('chez')[g('chez').length - 2].sound).toMatch(/^ay/);
    expect(last('chez').kind).toBe('silent');
    expect(last('mer')).toMatchObject({ text: 'r', kind: 'consonant' });
    expect(last('cher')).toMatchObject({ text: 'r', kind: 'consonant' });
  });
});

describe('silent and pronounced final letters', () => {
  it.each(['petit', 'grand', 'les', 'nez', 'trop'])('%s ends in a silent letter', (w) => {
    expect(last(w).kind).toBe('silent');
    expect(last(w).certainty).not.toBe('uncertain');
  });
  it.each(['avec', 'pour', 'chef', 'sel'])('%s ends in a pronounced consonant', (w) => {
    expect(last(w).kind).toBe('consonant');
  });
  it('final e is silent after a vowel or consonant, and a weak uh in one-syllable words', () => {
    expect(last('petite')).toMatchObject({ text: 'e', kind: 'silent' });
    expect(last('année')).toMatchObject({ text: 'e', kind: 'silent' });
    expect(last('le')).toMatchObject({ text: 'e', kind: 'vowel' });
    expect(last('que')).toMatchObject({ text: 'e', kind: 'vowel' });
  });
  it('a silent d, s, t, x, ps run is one silent grapheme', () => {
    expect(last('petits').text).toBe('ts');
    expect(last('temps').text).toBe('ps');
    expect(last('deux').kind).toBe('silent');
  });
  it('named exceptions: blanc, sud, bus, gentil', () => {
    expect(last('blanc').kind).toBe('silent');
    expect(last('sud').kind).toBe('consonant');
    expect(last('bus').kind).toBe('consonant');
    expect(last('gentil').kind).toBe('silent');
    expect(last('plus').certainty).toBe('uncertain');
  });
  it('-ent is context: a verb ending or a nasal a', () => {
    for (const w of ['parlent', 'moment', 'souvent', 'dent']) {
      const e = find(w, 'ent');
      expect(e.certainty, w).toBe('context');
      expect(e.note, w).toBeTruthy();
    }
    expect(find('moments', 'ent').certainty).toBe('context');
  });
  it('est: the verb has silent s and t, marked context', () => {
    expect(texts('est')).toEqual(['e', 'st']);
    expect(find('est', 'st').certainty).toBe('context');
  });
  it('elided and hyphenated words do not treat the piece before the apostrophe as final', () => {
    expect(texts("l'homme")).toEqual(['l', "'", 'h', 'o', 'mm', 'e']);
    expect(find("aujourd'hui", 'd').kind).toBe('consonant');
    expect(find("c'est", 'c').sound).toMatch(/^s/);
    expect(find('peut-être', '-').kind).toBe('silent');
  });
});

describe('FRENCH_PATTERNS', () => {
  it('is a teaching-ordered table with examples', () => {
    expect(FRENCH_PATTERNS.length).toBeGreaterThanOrEqual(30);
    for (const p of FRENCH_PATTERNS) {
      expect(p.pattern.length).toBeGreaterThan(0);
      expect(p.sound.length).toBeGreaterThan(0);
      expect(p.examples.length).toBeGreaterThan(0);
    }
    expect(FRENCH_PATTERNS[0].pattern).toBe('ou');
    expect(new Set(FRENCH_PATTERNS.map((p) => p.pattern)).size).toBe(FRENCH_PATTERNS.length);
  });
});

describe('H_ASPIRE and NO_LIAISON_INITIAL', () => {
  it('holds the aspirated-h words and not the mute-h ones', () => {
    for (const w of ['héros', 'haut', 'honte', 'huit', 'haricot', 'hibou', 'hasard', 'hurler', 'hutte']) expect(H_ASPIRE.has(w), w).toBe(true);
    for (const w of ['homme', 'heure', 'hiver', 'hôtel', 'habiter', 'histoire', 'héroïne', 'hôpital']) expect(H_ASPIRE.has(w), w).toBe(false);
  });
  it('keeps onze and oui in a separate list', () => {
    expect(NO_LIAISON_INITIAL.has('onze')).toBe(true);
    expect(NO_LIAISON_INITIAL.has('oui')).toBe(true);
    expect(H_ASPIRE.has('onze')).toBe(false);
  });
});

describe('liaison', () => {
  const L = (a: string, b: string, pa?: string, pb?: string, morph?: Record<string, string>) => liaison({ normalized: a, pos: pa, morph }, { normalized: b, pos: pb });

  it('required: determiners, pronouns, short words, preposed adjectives, inversion', () => {
    expect(L('les', 'amis')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('nous', 'avons')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('vous', 'êtes')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('un', 'enfant')).toMatchObject({ kind: 'required', sound: 'n' });
    expect(L('petit', 'ami')).toMatchObject({ kind: 'required', sound: 't' });
    expect(L('grand', 'homme')).toMatchObject({ kind: 'required', sound: 't' });
    expect(L('bon', 'ami')).toMatchObject({ kind: 'required', sound: 'n' });
    expect(L('deux', 'heures')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('dans', 'un')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('chez', 'elle')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('en', 'avion')).toMatchObject({ kind: 'required', sound: 'n' });
    expect(L('très', 'utile')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('bien', 'aimable')).toMatchObject({ kind: 'required', sound: 'n' });
    expect(L('ont', 'ils', 'VERB', 'PRON')).toMatchObject({ kind: 'required', sound: 't' });
    expect(L('ils', 'ont')).toMatchObject({ kind: 'required', sound: 'z' });
    expect(L('on', 'a')).toMatchObject({ kind: 'required', sound: 'n' });
    expect(L('elles', 'en')).toMatchObject({ kind: 'required', sound: 'z' });
  });
  it('the n note says bon is said like bonne', () => {
    expect(L('bon', 'ami').why).toMatch(/bonne/);
  });
  it('f is v only in neuf ans / neuf heures', () => {
    expect(L('neuf', 'heures')).toMatchObject({ kind: 'required', sound: 'v' });
    expect(L('neuf', 'ans')).toMatchObject({ kind: 'required', sound: 'v' });
    expect(L('neuf', 'enfants').kind).toBe('none');
  });
  it('r in premier / dernier before a vowel', () => {
    expect(L('premier', 'étage', 'ADJ', 'NOUN')).toMatchObject({ kind: 'required', sound: 'r' });
  });
  it('forbidden: after et, before h aspiré, onze, oui, after a singular noun', () => {
    expect(L('et', 'elle').kind).toBe('forbidden');
    expect(L('les', 'héros').kind).toBe('forbidden');
    expect(L('les', 'onze').kind).toBe('forbidden');
    expect(L('les', 'oui').kind).toBe('forbidden');
    expect(L('un', 'garçon', undefined, undefined).kind).toBe('none');
    expect(L('garçon', 'intelligent', 'NOUN', 'ADJ')).toMatchObject({ kind: 'forbidden' });
    expect(L('garçon', 'intelligent', 'NOUN', 'ADJ', { Number: 'Sing' }).kind).toBe('forbidden');
    for (const r of [L('et', 'elle'), L('les', 'héros'), L('garçon', 'intelligent', 'NOUN', 'ADJ')]) expect(r.why.length).toBeGreaterThan(10);
  });
  it('optional: plural noun, forms of être, pas, mais, toujours', () => {
    expect(L('hommes', 'intelligents', 'NOUN', 'ADJ', { Number: 'Plur' })).toMatchObject({ kind: 'optional', sound: 'z' });
    expect(L('hommes', 'intelligents', 'NOUN', 'ADJ').kind).toBe('optional');
    expect(L('est', 'allé', 'AUX', 'VERB')).toMatchObject({ kind: 'optional', sound: 't' });
    expect(L('est', 'allé').kind).toBe('optional');
    expect(L('est', 'ici').kind).toBe('optional');
    expect(L('pas', 'encore').kind).toBe('optional');
    expect(L('mais', 'il').kind).toBe('optional');
    expect(L('toujours', 'ici').kind).toBe('optional');
  });
  it('none: no liaison consonant, or a consonant start; never a sound when none', () => {
    for (const r of [L('le', 'chat'), L('petite', 'amie'), L('les', 'chats'), L('sur', 'un'), L('avec', 'elle'), L('il', 'est')]) {
      expect(r.kind).toBe('none');
      expect(r.sound).toBeUndefined();
      expect(r.why.length).toBeGreaterThan(10);
    }
  });
  it('without a part of speech an unknown word is optional at most, never required by guess', () => {
    const r = L('inconnu', 'ami');
    expect(r.kind).toBe('none');
    const r2 = L('xyzs', 'ami');
    expect(['optional', 'none']).toContain(r2.kind);
  });
});

describe('frenchPronunciation', () => {
  it('passes the dictionary IPA through and never invents one', () => {
    const t = tok('bon');
    const withIpa = frenchPronunciation(t, analysisOf(t, { notes: { ipa: 'DICTIONARY-IPA' } }));
    expect(withIpa.ipa).toBe('DICTIONARY-IPA');
    expect('ipaSource' in withIpa).toBe(false);
    for (const out of [frenchPronunciation(t), frenchPronunciation(t, analysisOf(t, {})), frenchPronunciation(t, analysisOf(t, { notes: { ipa: ['x'] } }))]) {
      expect(out.ipa).toBeUndefined();
      expect(out.transliteration).toBeUndefined();
      expect('ipaSource' in out).toBe(false);
    }
  });
  it('gives at most 5 notes, learner-facing lines, for hard words', () => {
    for (const w of ['bonjour', 'beaucoup', 'montagne', 'fille', 'parlent', 'enfants', 'souvent', 'garçon', 'chaussures', 'oiseaux']) {
      const n = frenchPronunciation(tok(w)).notes ?? [];
      expect(n.length, w).toBeLessThanOrEqual(5);
      for (const line of n) expect(line.length).toBeGreaterThan(10);
    }
  });
  it('explains an elided token', () => {
    const n = frenchPronunciation(tok("l'")).notes ?? [];
    expect(n.join(' ')).toMatch(/l' is le or la with its vowel dropped/);
    expect(n.join(' ')).toMatch(/one syllable with the next word/);
    expect(frenchPronunciation(tok("qu'")).notes?.join(' ')).toMatch(/que/);
  });
  it('explains h aspiré', () => {
    const n = frenchPronunciation(tok('héros')).notes?.join(' ') ?? '';
    expect(n).toMatch(/the h is silent/i);
    expect(n).toMatch(/never l'héros/);
    expect(frenchPronunciation(tok('homme')).notes?.join(' ')).not.toMatch(/never l'/);
  });
  it('explains a silent -ent only when the first candidate is a third person plural verb', () => {
    const t = tok('parlent');
    const verb = frenchPronunciation(t, analysisOf(t, { pos: 'VERB', morph: { Person: '3', Number: 'Plur' } })).notes?.join(' ') ?? '';
    expect(verb).toMatch(/silent/);
    expect(verb).toMatch(/ils parlent is said like il parle/);
    const t2 = tok('moment');
    const noun = frenchPronunciation(t2, analysisOf(t2, { pos: 'NOUN', morph: { Gender: 'Masc', Number: 'Sing' } })).notes?.join(' ') ?? '';
    expect(noun).toMatch(/nasal a/);
    expect(noun).not.toMatch(/ils parlent/);
    expect(frenchPronunciation(t2).notes?.join(' ')).toMatch(/silent on a verb|silent on a verb in the third person plural/);
  });
  it('adds the liaison line for a token that ends in a normally silent consonant', () => {
    expect(frenchPronunciation(tok('les')).notes?.join(' ')).toMatch(/les is said lay; before a vowel the s is heard as z: les amis → lay-za-mee/);
    expect(frenchPronunciation(tok('trop')).notes?.join(' ')).toMatch(/liaison/);
    expect(frenchPronunciation(tok('avec')).notes?.join(' ')).not.toMatch(/liaison/);
  });
  it('names homophones where certain, and stays within five notes', () => {
    const n = frenchPronunciation(tok('verre')).notes ?? [];
    expect(n.join(' ')).toMatch(/verre, vert, vers, ver are said alike/);
    expect(n.length).toBeLessThanOrEqual(5);
    expect(frenchPronunciation(tok('et')).notes?.join(' ') ?? '').not.toMatch(/est/);
  });
  it('gives nothing for a non-word', () => {
    expect(frenchPronunciation(tok(',', false)).notes).toEqual([]);
  });
});
