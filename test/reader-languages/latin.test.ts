// @vitest-environment node
/**
 * Latin in the language resolver (packages/golearn-extension/src/language/resolve.ts): the tag table maps la / lat to the Latin
 * pack, a declared Latin page is recognised, and, with the real analysers, a Latin sentence (the Clementine Vulgate) is told
 * apart from Spanish, German and Albanian without breaking their detection. The detection checks need the Latin analyser
 * (the adapter lane's src/adapters/la.ts) and are skipped, not failed, while it does not exist.
 */
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { PACK_VARIETIES, createLanguageResolver, mapLanguageTag, resolveLanguage } from '../../packages/golearn-extension/src/language/resolve';
import { languageNameOf } from '../../packages/golearn-extension/src/protocol';
import { PACKS } from '../../packages/language-packs/src';
import { laAdapter } from '../support/latin';

const doc = (languageId: string, confidence = 0.8) => ({ languageId, source: 'html-lang' as const, confidence });

describe('the BCP-47 table knows Latin', () => {
  it('la and lat (ISO 639-3) are the Latin pack; a region, or the Latin script stated outright, does not change that', () => {
    expect(mapLanguageTag('la')).toEqual({ kind: 'pack', languageId: 'la', notes: [] });
    expect(mapLanguageTag('lat')).toEqual({ kind: 'pack', languageId: 'la', notes: [] });
    expect(mapLanguageTag('la-VA')).toMatchObject({ kind: 'pack', languageId: 'la' });
    expect(mapLanguageTag('la-Latn')).toMatchObject({ kind: 'pack', languageId: 'la' });
  });

  it('Latin written in another script names something no pack analyses', () => {
    const m = mapLanguageTag('la-Grek');
    expect(m.kind).toBe('ambiguous');
    expect(m.kind === 'ambiguous' && m.reason).toMatch(/written in GREK script; the la pack analyses the LATN script only/);
  });

  it('Lao (lo) is not Latin, and the Spanish tags are untouched', () => {
    expect(mapLanguageTag('lo').kind).toBe('no-pack');
    expect(mapLanguageTag('es-419')).toMatchObject({ kind: 'pack', languageId: 'es' });
  });

  it('the variety table agrees with the manifest: the one analysed variety is Ecclesiastical, and Classical is never a hint', () => {
    expect([...PACK_VARIETIES.la]).toEqual(['la-ecclesiastical']);
    expect(PACKS.la.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual([...PACK_VARIETIES.la]);
  });

  it('the learner-facing name is Latin', () => {
    expect(languageNameOf('la')).toBe('Latin');
    expect(languageNameOf('th')).toBe('Thai'); // the others are untouched
  });
});

describe('a page that declares Latin', () => {
  it('is Latin when the Latin pack is installed, by its html lang', () => {
    expect(resolveLanguage({ installed: ['sq', 'la'], documentLanguage: doc('la') })).toMatchObject({ languageId: 'la', basis: 'document-metadata' });
    expect(resolveLanguage({ installed: ['sq', 'la'], documentLanguage: doc('lat') })).toMatchObject({ languageId: 'la' });
  });

  it('is NOT read with another language’s word list when the Latin pack is not installed', () => {
    const r = resolveLanguage({ installed: ['es', 'sq'], documentLanguage: doc('la'), teamDefault: 'es' });
    expect(r.languageId).not.toBe('es');
    expect(r.reasons.join(' ')).toMatch(/names la, but the la pack is not installed/);
  });
});

const VULGATE = [
  'In principio erat Verbum, et Verbum erat apud Deum, et Deus erat Verbum.',
  'Hoc erat in principio apud Deum. Omnia per ipsum facta sunt, et sine ipso factum est nihil.',
  'Dominus regit me, et nihil mihi deerit: in loco pascuae ibi me collocavit.',
];
const SPANISH = ['Los niños leen los libros en la escuela.', 'En el principio existía la Palabra, y la Palabra estaba con Dios, y la Palabra era Dios.'];
const GERMAN = ['Wir gehen heute in die Stadt und kaufen Brot.', 'Im Anfang war das Wort, und das Wort war bei Gott, und Gott war das Wort.'];
const ALBANIAN = ['Ana shkon në shkollë dhe ha çaj.', 'Në fillim ishte Fjala, dhe Fjala ishte pranë Perëndisë, dhe Fjala ishte Perëndi.'];

describe.skipIf(!laAdapter)('detection with the Latin pack installed (the real analysers)', () => {
  const adapters = { sq: sqAdapter, es: esAdapter, de: deAdapter, la: laAdapter! };
  const resolver = createLanguageResolver({ adapters });
  const installed = ['sq', 'es', 'de', 'la'];

  it.each(VULGATE)('Vulgate: “%s” is Latin', (sample) => {
    expect(resolver({ installed, sample })).toMatchObject({ languageId: 'la', basis: 'detection' });
  });

  it.each(SPANISH)('Spanish: “%s” is still Spanish', (sample) => {
    expect(resolver({ installed, sample })).toMatchObject({ languageId: 'es', basis: 'detection' });
  });

  it.each(GERMAN)('German: “%s” is still German', (sample) => {
    expect(resolver({ installed, sample })).toMatchObject({ languageId: 'de', basis: 'detection' });
  });

  it.each(ALBANIAN)('Albanian: “%s” is still Albanian', (sample) => {
    expect(resolver({ installed, sample })).toMatchObject({ languageId: 'sq', basis: 'detection' });
  });

  it('Latin text is not called Spanish (or anything else) when the Latin pack is not installed', () => {
    const r = resolver({ installed: ['sq', 'es', 'de'], sample: VULGATE[0] });
    expect(r.languageId, r.reasons.join(' ')).toBeUndefined();
  });

  it('English stays undetermined with Latin installed, and a lone word is never enough', () => {
    expect(resolver({ installed, sample: 'The children read the books at school.' }).languageId).toBeUndefined();
    expect(resolver({ installed, sample: 'Deus' }).languageId).toBeUndefined();
  });

  it('a page labelled Spanish whose text is plainly Latin keeps the declared language but is less certain, and says why', () => {
    const r = resolver({ installed, documentLanguage: doc('es', 0.9), sample: VULGATE[1] });
    expect(r.languageId).toBe('es');
    expect(r.confidence).toBeLessThanOrEqual(0.55);
    expect(r.reasons.join(' ')).toMatch(/looks like la, not es/);
  });
});
