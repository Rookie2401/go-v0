// @vitest-environment node
/**
 * Deck-gate follow-up, part 3 (Latin): confident misreadings the audit found, and the rules that fix them. Needs the full lexicon.
 *   - a form that is the ordinary cell of one word and only a shortened genitive plural (-um) of another is the first word's (portum: portus, not porta)
 *   - a capitalised sentence-opener with a name reading beside a singular noun it cannot agree with is the name (Maria virgo)
 *   - the greeting salve / ave / vale before a comma is the verb or interjection, not the adjective salvus
 *   - nostrum / vestrum after a noun they agree with is the possessive adjective, not the genitive of nos / vos
 *   - the word right after a preposition that is also a noun in the governed case: the other readings are lowered harder (ab oris)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';
import { tokenizeLatin } from '../../src/adapters/latin/orthography';

function readings(text: string, surface: string): Array<{ lemma?: string; pos?: string; confidence: number }> {
  const out = laAdapter.analyze(tokenizeLatin(text));
  const t = out.find((x) => x.token.isWord && x.token.surface === surface);
  return (t?.candidates ?? []).map((c) => ({ lemma: c.lemma, pos: c.pos, confidence: c.confidence }));
}
const top = (text: string, surface: string): string => { const r = readings(text, surface)[0]; return `${r.lemma}/${r.pos}`; };

describe('Latin misreadings (deck-gate part 3)', () => {
  beforeAll(async () => { await loadLatinLexicon(); });

  it('the shortened genitive plural of porta does not beat the accusative of portus', () => {
    expect(top('Nautae navem in portum duxerunt, quia tempestas appropinquabat.', 'portum')).toBe('portus/NOUN');
    expect(top('Naves in portum intraverunt.', 'portum')).toBe('portus/NOUN');
    expect(top('Ad portum ierunt.', 'portum')).toBe('portus/NOUN');
  });
  it('counter-example: a genuine genitive plural in -um of a variant-only word is still read', () => {
    expect(top('Nummum copia magna est.', 'Nummum')).toMatch(/nummus|nummum|nummulus/);
    expect(top('Dolor deum magnus est.', 'deum')).toMatch(/^deus\/NOUN$/);
  });

  it('a name opening a sentence beside a singular noun is the name, not the plural of mare', () => {
    expect(top('Maria virgo mater Dei est et omnibus gratiam impetrat.', 'Maria')).toBe('Maria/PROPN');
    expect(top('Maria mater Iesu venit.', 'Maria')).toBe('Maria/PROPN');
    expect(top('Maria soror Marthae est.', 'Maria')).toBe('Maria/PROPN');
  });
  it('counter-example: the plural of mare stays when a plural predicate follows', () => {
    expect(top('Maria sunt magna.', 'Maria')).toBe('mare/NOUN');
  });

  it('the greeting is not the adjective salvus', () => {
    for (const [text, word] of [['Salve, Marce!', 'Salve'], ['Salve, magister!', 'Salve'], ['Ave, Maria, gratia plena.', 'Ave']] as const) {
      const r = readings(text, word);
      expect(r[0].lemma).not.toBe('salvus');
      expect(r[0].confidence).toBeGreaterThan(0.8);
    }
    expect(top('Ave, Maria, gratia plena.', 'Ave')).toBe('ave/INTJ');
  });
  it('counter-example: salve without a comma is left to the lexicon', () => {
    expect(readings('Salve vivit.', 'Salve')[0].confidence).toBeLessThan(0.8);
  });

  it('nostrum / vestrum after a noun they agree with is the possessive adjective', () => {
    expect(top('Panem nostrum quotidianum da nobis hodie.', 'nostrum')).toBe('noster/ADJ');
    expect(top('Patrem vestrum amamus.', 'vestrum')).toBe('vester/ADJ');
    expect(top('Regnum nostrum floret.', 'nostrum')).toBe('noster/ADJ');
  });
  it('counter-example: the partitive genitive stays after quis / multi', () => {
    expect(top('Quis nostrum venit?', 'nostrum')).toBe('ego/PRON');
    expect(top('Multi nostrum veniunt.', 'nostrum')).toBe('ego/PRON');
  });

  it('ab oris: the governed noun is no longer outweighed (the two are undecided or ora leads)', () => {
    const r = readings('Troiae qui primus ab oris Italiam venit.', 'oris');
    const os = r.find((x) => x.lemma === 'os');
    const ora = r.find((x) => x.lemma === 'ora');
    expect(os && ora).toBeTruthy();
    expect(os!.confidence - ora!.confidence).toBeLessThan(0.15);
    const r2 = readings('Ex oris venerunt.', 'oris');
    expect(r2.find((x) => x.lemma === 'os')!.confidence - r2.find((x) => x.lemma === 'ora')!.confidence).toBeLessThan(0.15);
  });
});
