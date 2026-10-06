/**
 * Vivís, escribís, decís: spelled alike in voseo (vos vivís) and vosotros (vosotros vivís). The course variety is
 * es-HN with voseo, so the voseo reading must lead unless the sentence shows a plural "you"; Scripture (RV1909), which
 * uses vosotros, keeps reading it wherever the verse says so. The "Vosotros (used in Spain)" note must never be shown
 * on a Honduran learner's own form.
 */
import { describe, expect, it } from 'vitest';
import { adapter, patterns, run } from './helpers';

const es = adapter('es');
const reading = (text: string, surface: string) => {
  const r = run('es', text);
  const i = r.tokens.findIndex((t) => t.surface === surface);
  return r.analyses[i].candidates;
};
const keys = (text: string) => patterns('es', text).map((p) => p.key);

describe('voseo before vosotros on the shared -ís form', () => {
  it('"¿Dónde vivís?" reads vos first and shows no vosotros note (ladder unit es-a1-1-01)', () => {
    const [a, b] = reading('¿Dónde vivís?', 'vivís');
    expect(a.morph).toMatchObject({ Person: '2', Number: 'Sing' });
    expect(a.varieties).toContain('voseo');
    expect(b.morph).toMatchObject({ Person: '2', Number: 'Plur' }); // still one tap away
    expect(keys('¿Cómo te llamás? ¿Dónde vivís?')).toEqual(['voseo', 'voseo']);
  });

  it('every -ís verb of the course reads voseo first, without any plural sign', () => {
    for (const w of ['escribís', 'decís', 'venís', 'sentís', 'vestís', 'pedís', 'dormís', 'sugerís', 'traducís', 'salís']) {
      const c = reading(`Mientras ${w}, yo espero.`, w);
      expect(c[0].morph, w).toMatchObject({ Person: '2', Number: 'Sing' });
      expect(keys(`Mientras ${w}, yo espero.`), w).not.toContain('vosotros');
    }
  });

  it('vos, te and tu mark the vosotros reading down', () => {
    const c = reading('¿Y vos, te vestís antes del desayuno?', 'vestís');
    expect(c[0].morph.Number).toBe('Sing');
    expect(c.find((x) => x.morph.Number === 'Plur')!.confidence).toBeLessThanOrEqual(0.4);
  });

  it('a plural "you" in the sentence keeps vosotros first', () => {
    for (const s of ['Vosotros vivís en Madrid.', 'Si os decís la verdad, vivís en paz.', 'Vuestros hijos decís que vienen.', 'Vosotros decís y tenéis.', 'Los que decís: Demonio tiene.']) {
      const w = s.match(/\b(vivís|decís)\b/u)![1];
      expect(reading(s, w)[0].morph.Number, s).toBe('Plur');
    }
    expect(keys('Vosotros vivís en Madrid.')).toContain('vosotros');
    expect(keys('Vosotros vivís en Madrid.')).not.toContain('voseo');
  });

  it('Scripture sentences with a plural sign still read vosotros', () => {
    const s = 'Porque vosotros sois mis amigos, si hacéis lo que os mando, y vivís en él.';
    expect(reading(s, 'vivís')[0].morph.Number).toBe('Plur');
    expect(keys(s)).toContain('vosotros');
    expect(es.version).toBeTruthy();
  });

  it('a vosotros reading that is not the leading one (sed the noun) never raises the note', () => {
    expect(keys('Si tenés sed, tomá agua fresca.')).not.toContain('vosotros');
    expect(keys('Tengo mucha sed, y los labios me duelen.')).not.toContain('vosotros');
  });
});
