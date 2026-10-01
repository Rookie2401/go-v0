/**
 * Coordinator's test: which reading of a Spanish homograph does the adapter put first, in a sentence?
 *
 * Found in the browser audit: the difficulty preview listed "sé — to be" for "No sé dónde está", and a measurement
 * over the course's own texts showed the first reading wrong for about one word in a hundred ("—pregunta Marvin" as
 * a noun, "fue al mercado" as ser, "muchas tiendas" as a form of tender), with guessed verbs offered beside adverbs
 * ("después" → "despuer").
 *
 * The expected readings below are my own judgement of each sentence, written before looking at what the rules
 * return; they are not copied from the adapter's output. Sentences marked (course) are from data/corpus/es.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';

const es = createAdapterRegistry().get('es');

function analyse(sentence: string, word: string, nth = 0) {
  const tokens = es.tokenize(sentence);
  const res = es.analyze(tokens);
  const hits = tokens.map((t, i) => (t.surface === word ? i : -1)).filter((i) => i >= 0);
  const i = hits[nth];
  if (i === undefined) throw new Error(`"${word}" is not in "${sentence}"`);
  return res[i].candidates;
}
const first = (sentence: string, word: string, nth = 0) => {
  const c = analyse(sentence, word, nth)[0];
  return `${c?.lemma}/${c?.pos}`;
};

type Row = [sentence: string, word: string, expected: string, nth?: number];

const ROWS: Row[] = [
  // ── noun or verb ──
  ['¿Vos tenés los boletos? —pregunta Marvin.', 'pregunta', 'preguntar/VERB'], // (course)
  ['¿Qué desea? —pregunta la vendedora.', 'pregunta', 'preguntar/VERB'], // (course)
  ['Tengo una pregunta.', 'pregunta', 'pregunta/NOUN'],
  ['La pregunta es difícil.', 'pregunta', 'pregunta/NOUN'],
  ['El maestro quiere que hagamos preguntas.', 'preguntas', 'pregunta/NOUN'], // (course)
  ['Ella me pregunta la hora.', 'pregunta', 'preguntar/VERB'],
  ['Doña Reina cocina el pollo.', 'cocina', 'cocinar/VERB'], // (course)
  ['Marta va a la cocina.', 'cocina', 'cocina/NOUN'], // (course)
  ['En la cocina hay pan.', 'cocina', 'cocina/NOUN'], // (course)
  ['Yo cocino y ella cocina también.', 'cocina', 'cocinar/VERB'],
  ['Pedro compra el pan.', 'compra', 'comprar/VERB'], // (course)
  ['La compra fue rápida.', 'compra', 'compra/NOUN'],
  ['La abuela cuenta una historia de su vida.', 'cuenta', 'contar/VERB'], // (course)
  ['El señor paga la cuenta.', 'cuenta', 'cuenta/NOUN'],
  ['Ana tiene una casa.', 'casa', 'casa/NOUN'], // (course)
  ['Volvieron a casa con las bolsas.', 'casa', 'casa/NOUN'], // (course)
  ['Mi hermano se casa mañana.', 'casa', 'casar/VERB'],
  ['En la ciudad hay muchas casas y muchas tiendas.', 'tiendas', 'tienda/NOUN'], // (course)
  ['En la ciudad hay muchas casas y muchas tiendas.', 'casas', 'casa/NOUN'], // (course)
  ['El perro corrió por todas partes.', 'partes', 'parte/NOUN'], // (course)
  ['Marta regaba las plantas.', 'plantas', 'planta/NOUN'], // (course)
  ['Conoceré todas las calles.', 'calles', 'calle/NOUN'], // (course)
  ['—Buenas tardes, señor.', 'tardes', 'tarde/NOUN'], // (course)
  ['Llamó a sus criados y les dijo.', 'criados', 'criado/NOUN'], // (course)
  ['Les dio un regalo a los niños.', 'regalo', 'regalo/NOUN'], // (course)
  ['Yo te regalo este libro.', 'regalo', 'regalar/VERB'],
  ['Buscó trabajo en la ciudad.', 'trabajo', 'trabajo/NOUN'], // (course)
  ['Yo trabajo en una tienda.', 'trabajo', 'trabajar/VERB'],
  ['No trabajo los domingos.', 'trabajo', 'trabajar/VERB'],
  ['El camino subía por las montañas.', 'camino', 'camino/NOUN'], // (course)
  ['Yo camino una hora cada mañana.', 'camino', 'caminar/VERB'],
  ['Por las noches, cuando recuerdo las historias, pienso en ella.', 'recuerdo', 'recordar/VERB'], // (course)
  ['Tengo un buen recuerdo de ese día.', 'recuerdo', 'recuerdo/NOUN'],
  ['Quiero que veas dónde vivo.', 'vivo', 'vivir/VERB'], // (course)
  ['Juan toma vino.', 'vino', 'vino/NOUN'],
  ['El vino es bueno.', 'vino', 'vino/NOUN'],
  ['Ana vino ayer.', 'vino', 'venir/VERB'],
  ['Ella no vino a la fiesta.', 'vino', 'venir/VERB'],
  ['Te mando un abrazo muy fuerte.', 'abrazo', 'abrazo/NOUN'], // (course)
  // ── adjective or verb ──
  ['La iglesia está llena de gente.', 'llena', 'lleno/ADJ'], // (course)
  ['La lata estaba casi llena.', 'llena', 'lleno/ADJ'], // (course)
  ['Con las bolsas llenas, las dos vuelven a casa.', 'llenas', 'lleno/ADJ'], // (course)
  ['La abuela llena la jarra.', 'llena', 'llenar/VERB'],
  ['Tenía calor y estaba cansada.', 'cansada', 'cansado/ADJ'], // (course)
  // ── participle after haber ──
  ['Su hermana Sofía había pasado por la casa.', 'pasado', 'pasar/VERB'], // (course)
  ['El pasado no vuelve.', 'pasado', 'pasado/NOUN'],
  ['He pecado contra Dios.', 'pecado', 'pecar/VERB'], // (course)
  ['Dios perdona el pecado.', 'pecado', 'pecado/NOUN'], // (course)
  ['Comieron lo que había preparado.', 'preparado', 'preparar/VERB'], // (course)
  ['Era como si hubiera muerto.', 'muerto', 'morir/VERB'], // (course)
  ['¿Has visto mi libro?', 'visto', 'ver/VERB'], // (course)
  // ── pairs that share a spelling ──
  ['—Pues no sé dónde está.', 'sé', 'saber/VERB'], // (course)
  ['Yo sé la respuesta.', 'sé', 'saber/VERB'],
  ['Sé que vendrá mañana.', 'Sé', 'saber/VERB'],
  ['Sé bueno con tu hermano.', 'Sé', 'ser/AUX'],
  ['Esta mañana Rosa fue al mercado con su madre.', 'fue', 'ir/VERB'], // (course)
  ['Juan fue a la casa.', 'fue', 'ir/VERB'],
  ['Tenía poco dinero y se fue a un país lejano.', 'fue', 'ir/VERB'], // (course)
  ['Después de todo, fue un buen día.', 'fue', 'ser/AUX'], // (course)
  ['La fiesta fue muy bonita.', 'fue', 'ser/AUX'],
  ['Marta y Luis fueron a la casa de su abuela.', 'fueron', 'ir/VERB'], // (course)
  ['Fueron días felices.', 'Fueron', 'ser/AUX'],
  ['Ayer fui al mercado.', 'fui', 'ir/VERB'],
  ['Yo fui maestro muchos años.', 'fui', 'ser/AUX'],
  ['Tienes razón, lo siento —dijo Sofía.', 'siento', 'sentir/VERB'], // (course)
  ['Me siento bien.', 'siento', 'sentir/VERB'],
  ['Me siento en la silla.', 'siento', 'sentar/VERB'],
  ['La abuela se sienta en la sala.', 'sienta', 'sentar/VERB'], // (course)
  ['Los niños se sientan con sus padres.', 'sientan', 'sentar/VERB'], // (course)
  ['Yo como pan.', 'como', 'comer/VERB'],
  ['No como carne.', 'como', 'comer/VERB'],
  ['Es como su padre.', 'como', 'como/SCONJ'],
  ['Marta quiere un perro como Sol.', 'como', 'como/SCONJ'], // (course)
  ['Ya no son como antes.', 'como', 'como/SCONJ'], // (course)
  ['Ve a la casa.', 'Ve', 'ir/VERB'],
  ['Él ve la casa.', 've', 'ver/VERB'],
  ['Juan no ve nada.', 've', 'ver/VERB'],
  ['Cuando la ven por la calle, la saludan.', 'ven', 'ver/VERB'], // (course)
  ['Ven aquí.', 'Ven', 'venir/VERB'],
  // ── adverb or adjective ──
  ['Tenía un asiento junto a la ventana.', 'junto', 'junto/ADV'], // (course)
  ['—Yo solo quería que ustedes estuvieran bien.', 'solo', 'solo/ADV'], // (course)
  ['No pudo ir ni un solo sábado.', 'solo', 'solo/ADJ'], // (course)
  ['Te lo traeré, aunque tarde unos días.', 'tarde', 'tardar/VERB'], // (course)
  ['Se hizo muy tarde.', 'tarde', 'tarde/ADV'], // (course)
  ['Por la tarde, Marta va a la tienda.', 'tarde', 'tarde/NOUN'], // (course)
];

describe('Spanish homographs in context', () => {
  it.each(ROWS)('%s — %s → %s', (sentence, word, expected, nth) => {
    expect(first(sentence, word, nth ?? 0)).toBe(expected);
  });

  it('keeps the other reading, below the chosen one, and says which neighbour decided', () => {
    const c = analyse('¿Vos tenés los boletos? —pregunta Marvin.', 'pregunta');
    expect(c[0].lemma).toBe('preguntar');
    expect(String(c[0].notes?.context)).toMatch(/dialogue dash/);
    const noun = c.find((x) => x.lemma === 'pregunta' && x.pos === 'NOUN');
    expect(noun).toBeDefined();
    expect(noun!.confidence).toBeLessThan(c[0].confidence);
  });

  it('does not raise the confidence of the reading it chooses', () => {
    const alone = es.analyze(es.tokenize('fue'))[0].candidates.find((x) => x.lemma === 'ir')!;
    const chosen = analyse('Juan fue a la casa.', 'fue')[0];
    expect(chosen.lemma).toBe('ir');
    expect(chosen.confidence).toBe(alone.confidence);
  });

  it('leaves the order alone where the neighbours do not decide', () => {
    const tokens = es.tokenize('casa');
    const c = es.analyze(tokens)[0].candidates;
    expect(c[0].lemma).toBe('casa');
    expect(c[0].notes?.context).toBeUndefined();
  });

  it('offers no guessed verb beside a word the list knows', () => {
    for (const w of ['después', 'aquí', 'mucho', 'entonces', 'bien', 'ahora', 'siempre', 'nunca', 'todavía', 'primer', 'buen', 'Biblia']) {
      const c = es.analyze(es.tokenize(w))[0].candidates;
      expect(c.length, w).toBeGreaterThan(0);
      expect(c.filter((x) => x.notes?.lemmaStatus === 'inferred by the rules').map((x) => x.lemma), w).toEqual([]);
    }
  });

  it('offers no guessed derivation beside a word the list knows (pelota is not "a big pelo")', () => {
    const c = es.analyze(es.tokenize('pelota'))[0].candidates;
    expect(c.map((x) => x.lemma)).toEqual(['pelota']);
  });

  it('still explains a word the list does not know by the rules, marked as inferred', () => {
    const c = es.analyze(es.tokenize('trabucaban'))[0].candidates;
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].notes?.lemmaStatus).toBe('inferred by the rules');
    expect(c[0].confidence).toBeLessThanOrEqual(0.6);
  });
});
