/**
 * The neighbour rules of the Spanish adapter once a dictionary's readings stand in the sentence (src/adapters/spanish/
 * disambiguate.ts): noun, adjective, adverb, preposition and name among themselves; an interjection alone between
 * pauses; "lo" before an adjective; the verb before "a" + infinitive and at the opening of a sentence — and the rule
 * above all of them: a dictionary's reading that the importer put BESIDE the adapter's own goes in front only on a
 * cue strong enough for it.
 *
 * Every sentence is written here. Dictionary-shaped tokens are built by hand, as the importer builds them: a token
 * the dictionary decided (its analyzer, only its readings) or a token of ours with dictionary readings beside ours
 * (named in `given`). Each rule has at least one sentence in which it must not fire.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { esAdapter as es } from '../../src/adapters/es';

const OWN = `adapter-es@${es.version}`;
const DICT = 'dict:kaikki-es@test';
const BOTH = new Set([OWN, DICT]);

/** A dictionary reading as the importer builds it. */
function d(lemma: string, pos: AnalysisCandidate['pos'], tags: string[] = [], gloss = `${lemma} (dictionary)`): AnalysisCandidate {
  return { lemma, pos, morph: es.morphFromTags!(tags), confidence: 0.45, origin: 'dictionary', sourceId: DICT, gloss };
}
const V3S = (lemma: string) => d(lemma, 'VERB', ['third-person', 'singular', 'present', 'indicative']);
const V1S = (lemma: string) => d(lemma, 'VERB', ['first-person', 'singular', 'present', 'indicative']);

interface Shape { decided?: Record<string, AnalysisCandidate[]>; beside?: Record<string, AnalysisCandidate[]> }

/**
 * The pipeline's result for one sentence: the adapter's analysis, the named words decided by the dictionary or
 * given its readings beside ours, then `refine`. Returns a reader of the first reading and of the whole order.
 */
function read(text: string, shape: Shape = {}) {
  const tokens: RawToken[] = es.tokenize(text);
  const analyzed = es.analyze(tokens);
  const given = new Set<number>();
  const mixed: AnalyzedToken[] = analyzed.map((a, i) => {
    const s = tokens[i].surface;
    if (shape.decided?.[s]) { given.add(i); return { token: tokens[i], candidates: shape.decided[s].map((c) => ({ ...c })), analyzer: DICT }; }
    if (shape.beside?.[s]) { given.add(i); return { ...a, candidates: [...a.candidates, ...shape.beside[s].map((c) => ({ ...c }))] }; }
    return a;
  });
  for (const key of [...Object.keys(shape.decided ?? {}), ...Object.keys(shape.beside ?? {})]) {
    if (!tokens.some((t) => t.surface === key)) throw new Error(`"${key}" is not a word of "${text}"`);
  }
  const out = given.size ? es.refine!(tokens, mixed, BOTH, given) : analyzed;
  // nothing is ever added or dropped
  out.forEach((o, i) => expect(o.candidates.map((c) => `${c.lemma}|${c.pos}`).sort(), `${text} / ${tokens[i].surface}`).toEqual(mixed[i].candidates.map((c) => `${c.lemma}|${c.pos}`).sort()));
  const at = (word: string, nth = 0) => {
    const hits = tokens.map((t, i) => (t.surface === word ? i : -1)).filter((i) => i >= 0);
    if (hits[nth] === undefined) throw new Error(`"${word}" is not a word of "${text}"`);
    return out[hits[nth]].candidates;
  };
  return {
    first: (word: string, nth = 0) => { const c = at(word, nth)[0]; return `${c?.lemma}/${c?.pos}`; },
    order: (word: string, nth = 0) => at(word, nth).map((c) => `${c.lemma}/${c.pos}`),
    why: (word: string, nth = 0) => String(at(word, nth)[0]?.notes?.context ?? ''),
    cands: at,
  };
}

describe('a name: written with a capital inside the sentence', () => {
  const jamaica = [d('jamaica', 'NOUN', ['feminine', 'singular'], 'hibiscus tea'), d('Jamaica', 'PROPN', [], 'Jamaica (a country)')];

  it('after a word or a comma the name comes first', () => {
    const r = read('Mi hermana viajó a Jamaica.', { decided: { Jamaica: jamaica } });
    expect(r.first('Jamaica')).toBe('Jamaica/PROPN');
    expect(r.why('Jamaica')).toMatch(/capital/);
    expect(read('Visitó Cuba, Jamaica y Haití.', { decided: { Jamaica: jamaica } }).first('Jamaica')).toBe('Jamaica/PROPN');
    // a word of ours with the name beside it: Rosa the person, not the flower
    expect(read('La madre se llama Rosa.', { beside: { Rosa: [d('Rosa', 'PROPN', [], 'a female given name')] } }).first('Rosa')).toBe('Rosa/PROPN');
  });

  it('a capital that only opens a sentence, a quotation or an exclamation says nothing', () => {
    expect(read('Jamaica es una bebida fría.', { decided: { Jamaica: jamaica } }).first('Jamaica')).toBe('jamaica/NOUN');
    expect(read('Ella dijo: —Jamaica es mi bebida.', { decided: { Jamaica: jamaica } }).first('Jamaica')).toBe('jamaica/NOUN');
    // ¡Gracias …! after a dash and ¡ is the interjection of the word list, not a name
    expect(read('Al final Marta dijo: —¡Gracias a todos!', { beside: { Gracias: [d('Gracias', 'PROPN', [], 'a surname')] } }).first('Gracias')).toBe('gracias/INTJ');
  });

  it('also after an article: la India, la FAO (so "la Red" reads as a name too: the rules cannot tell them apart)', () => {
    const india = [d('india', 'NOUN', ['feminine', 'singular'], 'Indian woman'), d('India', 'PROPN', [], 'India')];
    expect(read('Viajó a la India.', { decided: { India: india } }).first('India')).toBe('India/PROPN');
    expect(read('Lo dice la FAO.', { decided: { FAO: [d('fao', 'NOUN', ['masculine', 'singular']), d('FAO', 'PROPN', [], 'Food and Agriculture Organization')] } }).first('FAO')).toBe('FAO/PROPN');
    const red = [d('red', 'NOUN', ['feminine', 'singular'], 'net, network'), d('Red', 'PROPN', [], 'the Internet')];
    expect(read('Lo encontré en la Red.', { decided: { Red: red } }).first('Red')).toBe('Red/PROPN');
    expect(read('Lo encontré en la red.', { decided: { red } }).first('red')).toBe('red/NOUN');
  });

  it('written small, a name waits behind the other readings', () => {
    const r = read('Tomamos una jamaica fría.', { decided: { jamaica: [d('Jamaica', 'PROPN', [], 'Jamaica (a country)'), d('jamaica', 'NOUN', ['feminine', 'singular'], 'hibiscus tea')] } });
    expect(r.order('jamaica')).toEqual(['jamaica/NOUN', 'Jamaica/PROPN']);
  });

  it('a capital inside the sentence is not a conjugated verb either (doña Reina)', () => {
    const r = read('Hoy doña Reina compra café.', { beside: { Reina: [V3S('reinar'), d('Reina', 'PROPN', [], 'a female given name')] } });
    expect(r.first('Reina')).toBe('Reina/PROPN');
    expect(r.order('Reina').indexOf('reinar/VERB')).toBeGreaterThan(0);
    // written small after a subject, the verb of the word list still leads as before
    expect(read('La reina cocina arroz.').first('cocina')).toBe('cocinar/VERB');
  });
});

describe('a word that is also a preposition (bajo, salvo)', () => {
  it('before a noun phrase it is the preposition, also after ser or estar, after a noun, after "todos"', () => {
    expect(read('El gato duerme bajo la mesa.').first('bajo')).toBe('bajo/ADP');
    expect(read('La caja está bajo la mesa.').first('bajo')).toBe('bajo/ADP');
    expect(read('Todos fueron salvo Ana.').first('salvo')).toBe('salvo/ADP');
    expect(read('Abrieron una investigación bajo la nueva ley.').first('bajo')).toBe('bajo/ADP');
    // menos: an adverb in the word list, with the dictionary's preposition beside it
    expect(read('Vinieron todos menos Juan.', { beside: { menos: [d('menos', 'ADP', [], 'except')] } }).first('menos')).toBe('menos/ADP');
  });

  it('menos before a bare noun is "less", not "except"', () => {
    expect(read('Hoy tengo menos trabajo.', { beside: { menos: [d('menos', 'ADP', [], 'except')] } }).first('menos')).not.toBe('menos/ADP');
  });

  it('after a noun, an article or another preposition it is not', () => {
    expect(read('Es un hombre bajo.').first('bajo')).toBe('bajo/ADJ');
    expect(read('Compra a bajo precio.').first('bajo')).toBe('bajo/ADJ');
    expect(read('Ya está a salvo.').first('salvo')).toBe('salvo/ADJ');
    expect(read('Ella toca el bajo.').first('bajo')).toBe('bajo/ADJ');
    // with the dictionary's noun beside ours, the article makes it the noun (the bass)
    expect(read('Ella toca el bajo.', { beside: { bajo: [d('bajo', 'NOUN', ['masculine', 'singular'], 'bass')] } }).first('bajo')).toBe('bajo/NOUN');
  });
});

describe('after a word of degree: a quality', () => {
  const listo = [d('listo', 'NOUN', ['masculine', 'singular'], 'smart aleck'), d('listo', 'ADJ', ['masculine', 'singular'], 'clever; ready')];

  it('muy, tan: the adjective or adverb, whatever the standing of the readings', () => {
    expect(read('Mi primo es muy pillo.', { decided: { pillo: [d('pillo', 'NOUN', ['masculine', 'singular']), d('pillo', 'ADJ', ['masculine', 'singular'])] } }).first('pillo')).toBe('pillo/ADJ');
    // a noun of the word list with the dictionary's adjective beside it
    const r = read('Ese caballo es muy burro.', { beside: { burro: [d('burro', 'ADJ', ['masculine', 'singular'], 'stupid')] } });
    expect(r.first('burro')).toBe('burro/ADJ');
    expect(r.why('burro')).toMatch(/after "muy"/);
  });

  it('más, bastante, poco also stand before a noun: they order equals only', () => {
    expect(read('Hoy está más listo.', { decided: { listo } }).first('listo')).toBe('listo/ADJ');
    // más pollo: the noun of the word list stays in front of the dictionary's adjective
    expect(read('El niño quiere más pollo.', { beside: { pollo: [d('pollo', 'ADJ', ['masculine', 'singular'], 'inexperienced')] } }).first('pollo')).toBe('pollo/NOUN');
  });

  it('with no word of degree before it nothing is preferred', () => {
    expect(read('Llegó pillo.', { decided: { pillo: [d('pillo', 'NOUN', ['masculine', 'singular']), d('pillo', 'ADJ', ['masculine', 'singular'])] } }).first('pillo')).toBe('pillo/NOUN');
  });
});

describe('after estar or parecer: a quality, not a bare noun', () => {
  const besideAdj = { beside: { padre: [d('padre', 'ADJ', [], 'great, cool (Mexico)')] } };

  it('está padre: the adjective', () => {
    const r = read('Esa canción está padre.', besideAdj);
    expect(r.first('padre')).toBe('padre/ADJ');
    expect(r.why('padre')).toMatch(/estar/);
    expect(read('La fiesta parece muy padre.', besideAdj).first('padre')).toBe('padre/ADJ');
  });

  it('after ser both a noun and an adjective stand, and an adverb after estar stays an adverb', () => {
    expect(read('Don José es padre.', besideAdj).first('padre')).toBe('padre/NOUN');
    expect(read('Todo está bien.', { beside: { bien: [d('bien', 'ADJ', [], 'posh'), d('bien', 'NOUN', ['masculine', 'singular'], 'good')] } }).first('bien')).toBe('bien/ADV');
  });
});

describe('after a determiner: the noun', () => {
  const joven = { beside: { joven: [d('joven', 'NOUN', ['singular'], 'young person')] } };

  it('an article or a possessive puts the dictionary\'s noun before our adjective', () => {
    const r = read('El joven llegó tarde.', joven);
    expect(r.first('joven')).toBe('joven/NOUN');
    expect(r.why('joven')).toMatch(/after "el"/);
    expect(read('Saludé a los jóvenes.', { beside: { jóvenes: [d('joven', 'NOUN', ['plural'], 'young person')] } }).first('jóvenes')).toBe('joven/NOUN');
    expect(read('Llegó mi joven.', joven).first('joven')).toBe('joven/NOUN');
  });

  it('qué, mucho, todo and numbers stand before adverbs and adjectives too: our own reading stays', () => {
    expect(read('¡Qué bien cantas!', { beside: { bien: [d('bien', 'NOUN', ['masculine', 'singular'], 'good')] } }).first('bien')).toBe('bien/ADV');
    expect(read('¡Qué joven es!', joven).first('joven')).toBe('joven/ADJ');
    // … but among readings of one standing they still decide
    expect(read('Tiene mucho pillo.', { decided: { pillo: [d('pillo', 'ADJ', ['masculine', 'singular']), d('pillo', 'NOUN', ['masculine', 'singular'])] } }).first('pillo')).toBe('pillo/NOUN');
  });

  it('with a plain noun after it the word between is the adjective (among equals)', () => {
    const r = read('Fue un valeroso soldado.', { decided: { valeroso: [d('valeroso', 'NOUN', ['masculine', 'singular']), d('valeroso', 'ADJ', ['masculine', 'singular'])] } });
    expect(r.first('valeroso')).toBe('valeroso/ADJ');
    // … and with nothing after it, the noun
    expect(read('Llegó un valeroso.', { decided: { valeroso: [d('valeroso', 'ADJ', ['masculine', 'singular']), d('valeroso', 'NOUN', ['masculine', 'singular'])] } }).first('valeroso')).toBe('valeroso/NOUN');
  });

  it('after a determiner and an adjective: the noun (among equals)', () => {
    const vecinos = [d('vecino', 'ADJ', ['masculine', 'plural']), d('vecino', 'NOUN', ['masculine', 'plural'])];
    expect(read('Llegaron sus nuevos inquilinos.', { decided: { inquilinos: [d('inquilino', 'ADJ', ['masculine', 'plural']), d('inquilino', 'NOUN', ['masculine', 'plural'])] } }).first('inquilinos')).toBe('inquilino/NOUN');
    // without the determiner the order is left alone
    expect(read('Llegaron nuevos y vecinos.', { decided: { vecinos } }).first('vecinos')).toBe('vecino/ADJ');
  });
});

describe('after a preposition with no article: the noun rather than the adjective', () => {
  it('en inglés, de jóvenes', () => {
    const r = read('La carta está escrita en inglés.', { beside: { inglés: [d('inglés', 'NOUN', ['masculine', 'singular'], 'English (language)')] } });
    expect(r.first('inglés')).toBe('inglés/NOUN');
    expect(r.why('inglés')).toMatch(/preposition "en"/);
    expect(read('Vino un grupo de jóvenes.', { beside: { jóvenes: [d('joven', 'NOUN', ['plural'], 'young person')] } }).first('jóvenes')).toBe('joven/NOUN');
  });

  it('not when a noun or a name follows (the word qualifies it), and never against our adverb or a function word', () => {
    // de buen humor, a San Pedro
    expect(read('Hoy vamos a San Pedro.', { beside: { San: [d('san', 'NOUN', ['masculine', 'singular'], 'saint')] } }).first('San')).toBe('santo/ADJ');
    expect(read('Vendrá en cuanto pueda.', { beside: { cuanto: [d('cuanto', 'NOUN', ['masculine', 'singular'], 'quantum')] } }).first('cuanto')).toBe('cuanto/ADV');
    expect(read('Habló de cómo ayudar.', { beside: { cómo: [d('cómo', 'NOUN', ['masculine', 'singular'], 'the how')] } }).first('cómo')).toBe('cómo/ADV');
    expect(read('Es la casa de mi padre.', { beside: { mi: [d('mi', 'NOUN', ['masculine', 'singular'], 'mi (musical note)')] } }).first('mi')).toBe('mi/DET');
  });
});

describe('after a noun: the adjective that agrees with it (a weak cue)', () => {
  const parlanchina = [d('parlanchín', 'NOUN', ['feminine', 'singular']), d('parlanchín', 'ADJ', ['feminine', 'singular'])];

  it('among readings of one standing the agreeing adjective comes first', () => {
    const r = read('Vive con una mujer parlanchina.', { decided: { parlanchina } });
    expect(r.first('parlanchina')).toBe('parlanchín/ADJ');
    expect(r.why('parlanchina')).toMatch(/after the noun "mujer"/);
  });

  it('not when it does not agree, and not against a noun or adverb of the word list', () => {
    const masculine = [d('parlanchín', 'NOUN', ['masculine', 'singular']), d('parlanchín', 'ADJ', ['masculine', 'singular'])];
    expect(read('Vive con una mujer parlanchín.', { decided: { parlanchín: masculine } }).first('parlanchín')).toBe('parlanchín/NOUN');
    // Reina compra café: café is the noun, although "compra" could be a noun before it
    expect(read('La señora compra café.', { beside: { café: [d('café', 'ADJ', [], 'coffee-coloured')] } }).first('café')).toBe('café/NOUN');
    expect(read('Salieron de la casa temprano.', { beside: { temprano: [d('temprano', 'ADJ', ['masculine', 'singular'], 'early')] } }).first('temprano')).toBe('temprano/ADV');
  });
});

describe('an adverb before an adjective or adverb (a weak cue)', () => {
  const re = [d('re', 'NOUN', ['masculine', 'singular'], 're (the second note of the scale)'), d('re', 'ADV', [], 'very (Rioplatense)')];

  it('re lindo: the adverb, among equals', () => {
    expect(read('El vestido es re lindo.', { decided: { re } }).first('re')).toBe('re/ADV');
    const algo = [d('medio', 'ADJ', ['masculine', 'singular']), d('medio', 'ADV')];
    expect(read('Anda medio triste.', { decided: { medio: algo } }).first('medio')).toBe('medio/ADV');
  });

  it('a pronoun of the word list is not given up for the dictionary\'s adverb', () => {
    expect(read('Me parece algo raro.', { beside: { algo: [d('algo', 'ADV', [], 'somewhat')] } }).first('algo')).toBe('algo/PRON');
  });
});

describe('qué: determiner before a noun, "how" before an adjective, else the pronoun', () => {
  const que = (w: string) => ({ beside: { [w]: [d('qué', 'DET', [], 'what, which'), d('qué', 'ADV', [], 'how'), d('qué', 'INTJ', [], 'what!')] } });

  it('¿Qué camisa quieres? ¡Qué suerte!', () => {
    const r = read('¿Qué camisa quieres?', que('Qué'));
    expect(r.first('Qué')).toBe('qué/DET');
    expect(r.why('Qué')).toMatch(/before a noun/);
    expect(read('¡Qué suerte tienes!', que('Qué')).first('Qué')).toBe('qué/DET');
  });

  it('¡Qué alto estás! —Qué raro —dijo ella.', () => {
    expect(read('¡Qué alto estás!', que('Qué')).first('Qué')).toBe('qué/ADV');
    expect(read('—Qué raro —dijo ella.', que('Qué')).first('Qué')).toBe('qué/ADV');
  });

  it('before a verb, or a word that may be a conjugated verb, it stays the pronoun', () => {
    expect(read('¿Qué quieres?', que('Qué')).first('Qué')).toBe('qué/PRON');
    expect(read('¿Qué compra Pedro?', que('Qué')).first('Qué')).toBe('qué/PRON'); // compra: a noun or a form of comprar
    expect(read('No sé qué decir.', que('qué')).first('qué')).toBe('qué/PRON');
    expect(read('¿Qué?', que('Qué')).first('Qué')).toBe('qué/PRON');
  });
});

describe('an adverb with "de" after it: the preposition, where the word has that reading', () => {
  const antes = { beside: { antes: [d('antes', 'ADP', [], 'before')] } };

  it('antes de la cena, cerca del río', () => {
    const r = read('Llegó antes de la cena.', antes);
    expect(r.first('antes')).toBe('antes/ADP');
    expect(r.why('antes')).toMatch(/before "de"/);
    expect(read('Vive cerca del río.', { beside: { cerca: [d('cerca', 'ADP', [], 'near'), d('cerca', 'NOUN', ['feminine', 'singular'], 'fence')] } }).first('cerca')).toBe('cerca/ADP');
  });

  it('without "de", or without a preposition reading, the adverb stays', () => {
    expect(read('Llegó antes.', antes).first('antes')).toBe('antes/ADV');
    expect(read('Llegó antes que yo.', antes).first('antes')).toBe('antes/ADV');
    expect(read('Vive cerca de aquí.', { beside: { cerca: [d('cerca', 'NOUN', ['feminine', 'singular'], 'fence')] } }).first('cerca')).toBe('cerca/ADV');
  });

  it('a word of degree before "de" is a comparison, not a preposition: menos de diez, el menos de todos', () => {
    const menos = { beside: { menos: [d('menos', 'ADP', [], 'except')] } };
    expect(read('Vinieron menos de diez personas.', menos).first('menos')).not.toBe('menos/ADP');
    expect(read('Come el menos de todos.', menos).first('menos')).not.toBe('menos/ADP');
  });
});

describe('someone addressed after a comma, closing a question or an exclamation', () => {
  const viejo = { beside: { viejo: [d('viejo', 'NOUN', ['masculine', 'singular'], 'old man; (colloquial) dad, mate')] } };

  it('¿Qué dices, viejo? ¡Ven aquí, viejo!: the noun', () => {
    const r = read('¿Qué dices, viejo?', viejo);
    expect(r.first('viejo')).toBe('viejo/NOUN');
    expect(r.why('viejo')).toMatch(/addressed/);
    expect(read('¡Ven aquí, viejo!', viejo).first('viejo')).toBe('viejo/NOUN');
  });

  it('in a statement, or inside the clause, the adjective of the word list stays', () => {
    expect(read('Volvió a casa cansado, viejo.', viejo).first('viejo')).toBe('viejo/ADJ');
    expect(read('¿Es viejo tu perro?', viejo).first('viejo')).toBe('viejo/ADJ');
    expect(read('¿Está viejo, enfermo o cansado?', viejo).first('viejo')).toBe('viejo/ADJ');
  });
});

describe('after a verb, a plural with an adjective after it: the noun', () => {
  const jovenes = { beside: { jóvenes: [d('joven', 'NOUN', ['plural'], 'young person')] } };

  it('busco jóvenes altos: the noun that the adjective describes', () => {
    const r = read('Busco jóvenes altos.', jovenes);
    expect(r.first('jóvenes')).toBe('joven/NOUN');
    expect(r.why('jóvenes')).toMatch(/after a verb/);
  });

  it('with nothing after it, or a noun after it, it stays the adjective', () => {
    expect(read('Mis hermanos son jóvenes.', jovenes).first('jóvenes')).toBe('joven/ADJ');
    expect(read('Busco jóvenes amigos.', jovenes).first('jóvenes')).toBe('joven/ADJ');
    // the singular is left alone too
    expect(read('Parece joven alto.', { beside: { joven: [d('joven', 'NOUN', ['singular'], 'young person')] } }).first('joven')).toBe('joven/ADJ');
  });
});

describe('a label of a few words opens with its noun (a weak cue)', () => {
  const personal = [d('personal', 'ADJ', ['singular']), d('personal', 'NOUN', ['masculine', 'singular'], 'staff')];

  it('personal de seguridad, personal sanitario: among readings of one standing, the noun', () => {
    expect(read('personal de seguridad', { decided: { personal } }).first('personal')).toBe('personal/NOUN');
    const sanitario = [d('sanitario', 'ADJ', ['masculine', 'singular'])];
    expect(read('personal sanitario', { decided: { personal, sanitario } }).first('personal')).toBe('personal/NOUN');
  });

  it('not in a sentence with closing punctuation, not after another word, and never against an adjective of the word list', () => {
    expect(read('Personal de seguridad.', { decided: { Personal: personal } }).first('Personal')).toBe('personal/ADJ');
    expect(read('solo personal de seguridad', { decided: { personal } }).first('personal')).toBe('personal/ADJ');
    expect(read('Lleno de agua', { beside: { Lleno: [d('lleno', 'NOUN', ['masculine', 'singular'], 'full house')] } }).first('Lleno')).toBe('lleno/ADJ');
  });
});

describe('after "hay": a noun', () => {
  const menores = { beside: { menores: [d('menor', 'NOUN', ['plural'], 'minor')] } };

  it('no hay menores: the noun, though our reading is the adjective', () => {
    const r = read('Aquí no hay menores.', menores);
    expect(r.first('menores')).toBe('menor/NOUN');
    expect(r.why('menores')).toMatch(/hay/);
  });

  it('after another verb the adjective of the word list stays', () => {
    expect(read('Mis hermanos son menores.', menores).first('menores')).toBe('menor/ADJ');
    expect(read('Tengo dos hermanos menores.', menores).first('menores')).toBe('menor/ADJ');
  });
});

describe('directly after a verb that is not ser or estar: the adverb', () => {
  const alto = { beside: { alto: [d('alto', 'ADV', [], 'loudly'), d('alto', 'NOUN', ['masculine', 'singular'], 'stop, halt')] } };

  it('habla alto, corre rápido', () => {
    const r = read('Mi abuelo habla alto.', alto);
    expect(r.first('alto')).toBe('alto/ADV');
    expect(r.why('alto')).toMatch(/after a verb/);
    expect(read('El perro corre rápido.', { beside: { rápido: [d('rápido', 'ADV', [], 'quickly')] } }).first('rápido')).toBe('rápido/ADV');
  });

  it('not after ser or estar, not after a noun, and not before the noun it qualifies', () => {
    expect(read('Mi abuelo es alto.', alto).first('alto')).toBe('alto/ADJ');
    expect(read('Vive en un pueblo alto.', alto).first('alto')).toBe('alto/ADJ');
    expect(read('El libro tiene alto precio.', alto).first('alto')).toBe('alto/ADJ');
    // a word the adapter does not know may be a noun (nivel) or a verb guessed by rule (edificio): nothing is concluded
    expect(read('El equipo tiene alto nivel.', alto).first('alto')).toBe('alto/ADJ');
    expect(read('Vive en un edificio alto.', alto).first('alto')).toBe('alto/ADJ');
  });
});

describe('the name of a letter, a note of the scale, an abbreviation', () => {
  const elle = [d('elle', 'NOUN', ['feminine', 'singular'], 'name of the letter ll'), d('elle', 'PRON', [], 'they (gender-neutral)')];

  it('waits behind the other readings, also after a preposition', () => {
    expect(read('Ayer hablé con elle.', { decided: { elle } }).first('elle')).toBe('elle/PRON');
    expect(read('Canta re bien.', { decided: { re: [d('re', 'NOUN', ['masculine', 'singular'], 'the musical note re'), d('re', 'ADV', [], 'very')] } }).first('re')).toBe('re/ADV');
  });

  it('after a determiner it is the letter or the note', () => {
    expect(read('Escribe la elle.', { decided: { elle } }).first('elle')).toBe('elle/NOUN');
  });

  it('beside a function word of ours it never leads (es is not the plural of e)', () => {
    const e = [d('e', 'NOUN', ['feminine', 'plural'], 'plural of e (name of the letter e)')];
    expect(read('Lo bueno es que vino.', { beside: { es: e } }).first('es')).toBe('ser/AUX');
    expect(read('Todo es nuevo.', { beside: { es: e } }).first('es')).toBe('ser/AUX');
    expect(read('Esta es la carta.', { beside: { es: e } }).first('es')).toBe('ser/AUX');
  });
});

describe('a function word of the word list yields only to a certain cue', () => {
  const parar = { beside: { para: [V3S('parar')] } };

  it('para stays the preposition after a noun, at the opening of a sentence, after "que"', () => {
    expect(read('Compró pan para su familia.', parar).first('para')).toBe('para/ADP');
    expect(read('Para mí es fácil.', { beside: { Para: [V3S('parar')] } }).first('Para')).toBe('para/ADP');
    expect(read('Dijo que para mañana.', parar).first('para')).toBe('para/ADP');
  });

  it('after me, te, se, le only a verb can come: el autobús se para', () => {
    const r = read('El autobús se para aquí.', parar);
    expect(r.first('para')).toBe('parar/VERB');
    expect(r.why('para')).toMatch(/after the pronoun "se"/);
  });

  it('a, la, de, dos, una keep their reading after mucho, todo, los, a preposition', () => {
    expect(read('Marta quiere mucho a su familia.', { beside: { a: [d('a', 'NOUN', ['feminine', 'singular'], 'name of the letter a')] } }).first('a')).toBe('a/ADP');
    expect(read('Buscaron en toda la casa.', { beside: { la: [d('la', 'NOUN', ['masculine', 'singular'], 'la (musical note)')] } }).first('la')).toBe('la/DET');
    expect(read('Muchos de sus alumnos llegaron.', { beside: { de: [d('de', 'NOUN', ['feminine', 'singular'], 'name of the letter d')] } }).first('de')).toBe('de/ADP');
    expect(read('Los dos estaban contentos.', { beside: { dos: [d('do', 'NOUN', ['masculine', 'plural'], 'plural of do (musical note)')] } }).first('dos')).toBe('dos/NUM');
    expect(read('Guardaba el dinero en una lata.', { beside: { una: [d('uno', 'NOUN', ['feminine', 'singular'])] } }).first('una')).toBe('una/DET');
  });
});

describe('a verb of the word list and a dictionary\'s noun beside it', () => {
  const toca = { beside: { toca: [d('toca', 'NOUN', ['feminine', 'singular'], 'headdress')] } };

  it('weak cues leave the verb in front: after an adjective, a noun, a conjugated verb, la / las / los', () => {
    expect(read('Un grupo de jóvenes toca la guitarra.', toca).first('toca')).toBe('tocar/VERB');
    expect(read('Mi hermano toca la guitarra.', toca).first('toca')).toBe('tocar/VERB');
    expect(read('Ella la toca bien.', toca).first('toca')).toBe('tocar/VERB');
    // haces is hacer, not the plural of haz, though nothing around it decides
    expect(read('Para él haces una fiesta.', { beside: { haces: [d('haz', 'NOUN', ['masculine', 'plural'], 'bundle')] } }).first('haces')).toBe('hacer/VERB');
  });

  it('strong cues bring the noun forward: an article or possessive, mucho, a preposition', () => {
    expect(read('Lleva una toca blanca.', toca).first('toca')).toBe('toca/NOUN');
    // an article and an adjective before it: un buen sentido (sentido: of the word list only the participle of sentir)
    const sentido = { beside: { sentido: [d('sentido', 'ADJ', ['masculine', 'singular'], 'heartfelt'), d('sentido', 'NOUN', ['masculine', 'singular'], 'sense')] } };
    expect(read('Lo dijo en un buen sentido.', sentido).first('sentido')).toBe('sentido/NOUN');
    expect(read('Lo he sentido mucho.', sentido).first('sentido')).toBe('sentir/VERB');
    expect(read('Lo hizo con mucho gusto.', { beside: { gusto: [d('gusto', 'NOUN', ['masculine', 'singular'], 'pleasure, taste')] } }).first('gusto')).toBe('gusto/NOUN');
    expect(read('Tienen pan de sobra.', { beside: { sobra: [d('sobra', 'NOUN', ['feminine', 'singular'], 'surplus')] } }).first('sobra')).toBe('sobra/NOUN');
  });

  it('and a dictionary\'s verb beside a noun of ours comes forward after "no" or a subject pronoun, not after a noun', () => {
    const marchar = { beside: { marcha: [V3S('marchar')] } };
    expect(read('El reloj no marcha.', marchar).first('marcha')).toBe('marchar/VERB');
    expect(read('Ella marcha despacio.', marchar).first('marcha')).toBe('marchar/VERB');
    expect(read('La gente marcha despacio.', marchar).first('marcha')).toBe('marcha/NOUN'); // a noun before it is only a likely subject
    expect(read('Empezó la marcha.', marchar).first('marcha')).toBe('marcha/NOUN');
  });
});

describe('an interjection alone between pauses', () => {
  const claro = { beside: { Claro: [d('claro', 'INTJ', [], 'of course')] } };

  it('alone in an exclamation, or opening the sentence before a comma', () => {
    const r = read('¡Claro!', claro);
    expect(r.first('Claro')).toBe('claro/INTJ');
    expect(r.why('Claro')).toMatch(/interjection/);
    expect(read('Claro, vamos mañana.', claro).first('Claro')).toBe('claro/INTJ');
    expect(read('—¡Claro! —dijo Ana.', claro).first('Claro')).toBe('claro/INTJ');
  });

  it('closing the sentence after a comma: ¡Vamos, hombre!', () => {
    expect(read('¡Vamos, hombre!', { beside: { hombre: [d('hombre', 'INTJ', [], 'man! come on!')] } }).first('hombre')).toBe('hombre/INTJ');
  });

  it('not inside a clause, not between two commas, not a single bare word', () => {
    const inside = { beside: { claro: [d('claro', 'INTJ', [], 'of course')] } };
    expect(read('El cielo está claro.', inside).first('claro')).toBe('claro/ADJ');
    expect(read('Era azul, claro, limpio.', inside).first('claro')).toBe('claro/ADJ');
    expect(read('claro', inside).first('claro')).toBe('claro/ADJ');
  });

  it('a verb of ours that closes the sentence stays a verb, and a fronted adverb stays an adverb', () => {
    expect(read('Bueno, vamos.', { beside: { vamos: [d('vamos', 'INTJ', [], 'come on')] } }).first('vamos')).toBe('ir/VERB');
    const adentro = { beside: { Adentro: [d('adentro', 'INTJ', [], 'come in!')] } };
    expect(read('Adentro, la iglesia está llena.', adentro).first('Adentro')).toBe('adentro/ADV');
    expect(read('¡Adentro!', adentro).first('Adentro')).toBe('adentro/INTJ');
    expect(read('Uno, dos, tres, ya.', { beside: { ya: [d('ya', 'INTJ', [], 'go!')] } }).first('ya')).toBe('ya/ADV');
  });
});

describe('lo before an adjective: the neuter article', () => {
  const lo = (w: string) => ({ beside: { [w]: [d('lo', 'DET', [], 'the (neuter article)')] } });

  it('lo necesario, lo más importante', () => {
    const r = read('Haremos lo necesario.', lo('lo'));
    expect(r.first('lo')).toBe('lo/DET');
    expect(r.why('lo')).toMatch(/neuter article/);
    expect(read('Lo más importante es vivir.', lo('Lo')).first('Lo')).toBe('lo/DET');
    expect(read('Lo bueno es que vino.', lo('Lo')).first('Lo')).toBe('lo/DET');
  });

  it('before a verb, or a word that may be a conjugated verb, it is the pronoun', () => {
    expect(read('Lo veo todos los días.', lo('Lo')).first('Lo')).toBe('lo/PRON');
    expect(read('No lo sé.', lo('lo')).first('lo')).toBe('lo/PRON');
    expect(read('Lo limpio todos los días.', lo('Lo')).first('Lo')).toBe('lo/PRON');
    expect(read('Dime lo que quieres.', lo('lo')).first('lo')).toBe('lo/PRON');
  });
});

describe('di: the command of decir, or "I gave"', () => {
  it('opening a sentence the command is the likelier reading, and nothing is marked down', () => {
    const r = read('Di la verdad.');
    expect(r.first('Di')).toBe('decir/VERB');
    expect(r.cands('Di')[0].morph.Mood).toBe('Imp');
    expect(r.cands('Di').find((c) => c.lemma === 'dar')!.confidence).toBeGreaterThan(0.4);
  });

  it('after a subject, "no" or an object pronoun it is dar', () => {
    expect(read('Le di un libro.').first('di')).toBe('dar/VERB');
    expect(read('No di nada.').first('di')).toBe('dar/VERB');
    expect(read('Yo di la vuelta.').first('di')).toBe('dar/VERB');
  });
});

describe('a conjugated verb before "a" and an infinitive', () => {
  it('ayuda a vivir: the verb', () => {
    const r = read('Ayuda a vivir mejor.');
    expect(r.first('Ayuda')).toBe('ayudar/VERB');
    expect(r.why('Ayuda')).toMatch(/infinitive/);
    expect(read('Mi madre me ayuda a cocinar.').first('ayuda')).toBe('ayudar/VERB');
  });

  it('not after a determiner, a preposition or a conjugated verb, and not before "a" and a noun', () => {
    expect(read('La ayuda a vivir mejor.').first('ayuda')).toBe('ayuda/NOUN');
    expect(read('Vamos de camino a comprar pan.').first('camino')).toBe('camino/NOUN');
    expect(read('Pidió ayuda a pagar la cuenta.').first('ayuda')).toBe('ayuda/NOUN');
    expect(read('Pidió ayuda a su madre.').first('ayuda')).toBe('ayuda/NOUN');
  });
});

describe('a word that opens a sentence before its complement', () => {
  it('before a preposition and an infinitive, an adverb or a pronoun, or before "que": likelier the verb', () => {
    for (const [text, word, verb] of [
      ['Sueño con volver.', 'Sueño', 'soñar/VERB'], ['Sal de aquí.', 'Sal', 'salir/VERB'],
      ['Cuenta con nosotros.', 'Cuenta', 'contar/VERB'], ['Cuento que vendrás.', 'Cuento', 'contar/VERB'],
    ]) {
      const r = read(text);
      expect(r.first(word), text).toBe(verb);
      expect(r.why(word), text).toMatch(/opens the sentence/);
      // only the likelier reading: the noun is not marked down
      expect(r.cands(word).find((c) => c.pos === 'NOUN')!.confidence, text).toBeGreaterThan(0.4);
    }
  });

  it('before a preposition and a noun phrase: the verb only when the sentence has no other verb and is no short label', () => {
    expect(read('Sal de mi casa ahora mismo.').first('Sal')).toBe('salir/VERB');
    expect(read('Cuenta con la ayuda de todos.').first('Cuenta')).toBe('contar/VERB');
    // another verb follows: the opening word is its subject
    expect(read('Parte de la gente canta.').first('Parte')).toBe('parte/NOUN');
    expect(read('Falta de respeto fue lo que mostró.').first('Falta')).toBe('falta/NOUN');
    // two or three words: a label
    expect(read('Falta de respeto.').first('Falta')).toBe('falta/NOUN');
    expect(read('Paso a paso.').first('Paso')).toBe('paso/NOUN');
    expect(read('Trabajo en equipo.').first('Trabajo')).toBe('trabajo/NOUN');
  });

  it('not without closing punctuation (a heading), and not for a word that is also a preposition', () => {
    expect(read('Sueño con volver').first('Sueño')).toBe('sueño/NOUN');
    expect(read('Salvo que llueva.').first('Salvo')).not.toBe('salvar/VERB');
  });

  it('a conjunction or interjection of ours is never read as the dictionary\'s verb there', () => {
    expect(read('Pero por la mañana llovió.', { beside: { Pero: [V1S('perar')] } }).first('Pero')).toBe('pero/CONJ');
    expect(read('Ojalá que puedas venir.', { beside: { Ojalá: [V3S('ojalar')] } }).first('Ojalá')).toBe('ojalá/INTJ');
  });
});
