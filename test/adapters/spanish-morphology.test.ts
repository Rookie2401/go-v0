import { describe, expect, it } from 'vitest';
import { generateForms, regularParadigm } from '../../src/adapters/spanish/verb-regular';
import { stemChangeParadigm, stemClassOf } from '../../src/adapters/spanish/verb-stem';
import { restress } from '../../src/adapters/spanish/morph-orth';

const forms = (p: ReturnType<typeof regularParadigm>) => generateForms(p!).map((f) => f.form);
const gen = (l: string) => {
  const c = stemClassOf(l);
  return generateForms(c ? stemChangeParadigm(l, c)! : regularParadigm(l)!);
};
const has = (l: string, ...fs: string[]) => { const all = gen(l).map((f) => f.form); for (const f of fs) expect(all, `${l}: ${f}`).toContain(f); };

describe('orthography', () => {
  it('keeps the stress and moves the written accent', () => {
    expect(restress('decir', '', 'selo')).toBe('decírselo');
    expect(restress('corazón', '', 'es')).toBe('corazones');
    expect(restress('joven', '', 'es')).toBe('jóvenes');
    expect(restress('da', '', 'melo')).toBe('dámelo');
    expect(restress('tén', 'de', '')).toBe('detén');
    expect(restress('vio', 'pre', '')).toBe('previó');
  });
});

describe('regular generation', () => {
  it('-ar, -er, -ir', () => {
    has('hablar', 'hablo', 'hablás', 'habláis', 'hablaban', 'hablé', 'habló', 'hablaré', 'hablaríamos', 'habláramos', 'hablasen', 'hablando', 'habladas', 'hablad', 'hablá', 'hablemos', 'hablare', 'habláremos');
    has('comer', 'comí', 'comió', 'comían', 'comeremos', 'comiendo', 'comés', 'comed', 'comé', 'coman', 'comiéramos');
    has('vivir', 'vivieron', 'vivís', 'vivid', 'viví', 'vivamos', 'viviésemos');
  });
  it('spelling changes', () => {
    has('buscar', 'busqué', 'busque', 'busquemos');
    has('llegar', 'llegué', 'llegue');
    has('empezar', 'empecé', 'empiece', 'empieza', 'empezamos');
    has('averiguar', 'averigüé', 'averigüe', 'averiguo');
    has('conocer', 'conozco', 'conozca', 'conocemos');
    has('conducir', 'conduzco', 'conduce');
    has('vencer', 'venzo', 'vences');
    has('escoger', 'escojo', 'escoja', 'escogemos');
    has('dirigir', 'dirijo', 'dirige');
    has('seguir', 'sigo', 'sigue', 'siguió', 'siguiendo', 'siga', 'seguimos');
    has('construir', 'construyo', 'construyó', 'construyeron', 'construyendo', 'construimos', 'construí', 'construiste', 'construyan', 'construido');
    has('leer', 'leyó', 'leyeron', 'leyendo', 'leí', 'leíste', 'leímos', 'leído', 'leyera', 'leéis');
    has('caer', 'cayó', 'cayendo', 'caído');
    has('enviar', 'envío', 'envías', 'envían', 'enviamos', 'enviáis', 'envíe');
    has('cambiar', 'cambio', 'cambias');
    has('continuar', 'continúo', 'continúa', 'continuamos', 'continúe');
    has('bullir', 'bulló', 'bulleron', 'bullendo');
    has('teñir', 'tiñó', 'tiñeron', 'tiñendo', 'tiño');
    has('cocer', 'cuezo', 'cuece', 'cocemos');
  });
  it('stem changes', () => {
    has('pensar', 'pienso', 'piensan', 'pensamos', 'piense', 'pensemos', 'pensás');
    has('volver', 'vuelvo', 'volvemos', 'vuelva', 'volvamos');
    has('pedir', 'pido', 'pidió', 'pidiendo', 'pedimos', 'pida', 'pidamos', 'pidieron', 'pidiera');
    has('dormir', 'duermo', 'durmió', 'durmiendo', 'dormimos', 'duerma', 'durmamos', 'durmiera');
    has('sentir', 'siento', 'sintió', 'sintiendo', 'sentimos', 'sienta', 'sintamos');
    has('jugar', 'juego', 'jugué', 'juegue', 'jugamos');
    has('adquirir', 'adquiero', 'adquirimos', 'adquiera', 'adquiramos', 'adquirió');
    has('errar', 'yerro', 'erramos');
    has('oler', 'huelo', 'olemos');
    has('almorzar', 'almuerzo', 'almorcé', 'almuerce');
    has('elegir', 'elijo', 'eligió', 'elija', 'elegimos');
    has('morir', 'muero', 'murió', 'muriendo', 'morimos');
    has('desmentir', 'desmiento', 'desmintió');
  });
});
void forms;

import { conjugateLemma } from '../../src/adapters/spanish/verbs';
const C = (l: string) => conjugateLemma(l)!.forms.map((f) => f.form);
const hasF = (l: string, ...fs: string[]) => { const all = C(l); for (const f of fs) expect(all, `${l}: ${f}`).toContain(f); };
const lacks = (l: string, ...fs: string[]) => { const all = C(l); for (const f of fs) expect(all, `${l}: ${f}`).not.toContain(f); };

describe('irregular tables', () => {
  it('ser estar haber ir dar ver', () => {
    hasF('ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son', 'sos', 'era', 'éramos', 'fui', 'fue', 'fueron', 'seré', 'sería', 'sea', 'seáis', 'fuera', 'fuésemos', 'fuéramos', 'sé', 'sed', 'siendo', 'sido', 'sida');
    hasF('estar', 'estoy', 'estás', 'está', 'estuve', 'estuvieron', 'esté', 'estés', 'estén', 'estaba', 'estuviéramos');
    hasF('haber', 'he', 'has', 'ha', 'hay', 'hemos', 'habéis', 'han', 'había', 'hube', 'hubo', 'habré', 'habría', 'haya', 'hubiéramos', 'habiendo', 'habido');
    lacks('haber', 'habé', 'habed');
    hasF('ir', 'voy', 'vas', 'va', 'vamos', 'vais', 'van', 'iba', 'íbamos', 'fui', 'fue', 'iré', 'vaya', 'vayamos', 'id', 've', 'yendo', 'ido');
    hasF('dar', 'doy', 'das', 'da', 'dan', 'di', 'diste', 'dio', 'dieron', 'dé', 'des', 'demos', 'diera', 'daré', 'dad');
    hasF('ver', 'veo', 'ves', 've', 'vemos', 'veis', 'ven', 'veía', 'veíamos', 'vi', 'vio', 'vieron', 'vea', 'veamos', 'visto', 'viendo', 'ved');
  });
  it('tener venir poner salir hacer decir', () => {
    hasF('tener', 'tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen', 'tenés', 'tuve', 'tuvo', 'tuvieron', 'tendré', 'tendría', 'tenga', 'tengamos', 'tuviera', 'ten', 'tené', 'teniendo', 'tenido');
    hasF('venir', 'vengo', 'vienes', 'venimos', 'viniendo', 'vine', 'vino', 'vendré', 'venga', 'viniera', 'ven', 'vení');
    hasF('poner', 'pongo', 'pones', 'pone', 'ponemos', 'puse', 'puso', 'pondré', 'ponga', 'pon', 'poné', 'puesto', 'puesta', 'poniendo');
    hasF('salir', 'salgo', 'sales', 'saldré', 'salga', 'sal', 'salí');
    hasF('hacer', 'hago', 'haces', 'hacemos', 'hice', 'hizo', 'hicieron', 'haré', 'haría', 'haga', 'haz', 'hecho', 'hechas', 'haciendo');
    hasF('decir', 'digo', 'dices', 'dice', 'decimos', 'dicen', 'decís', 'dije', 'dijo', 'dijeron', 'diré', 'diga', 'digamos', 'dijera', 'dijéramos', 'dijéremos', 'di', 'decí', 'dicho', 'diciendo', 'decía');
  });
  it('poder querer saber caber valer andar traer caer oír reír asir', () => {
    hasF('poder', 'puedo', 'puedes', 'podemos', 'podés', 'pude', 'pudo', 'podré', 'pueda', 'podamos', 'pudiera', 'pudiendo');
    hasF('querer', 'quiero', 'quieres', 'queremos', 'quise', 'quiso', 'querré', 'quiera', 'queramos', 'quisiera', 'queriendo');
    hasF('saber', 'sé', 'sabes', 'sabemos', 'supe', 'supo', 'sabré', 'sepa', 'sepamos', 'supiera');
    hasF('caber', 'quepo', 'cabes', 'cupo', 'cabré', 'quepa');
    hasF('valer', 'valgo', 'vales', 'valdré', 'valga');
    hasF('andar', 'ando', 'anduve', 'anduvo', 'anduviera', 'andaba', 'andá');
    hasF('traer', 'traigo', 'traes', 'traemos', 'traéis', 'traje', 'trajo', 'trajeron', 'traiga', 'trayendo', 'traído', 'trajera', 'traía');
    lacks('traer', 'traí');
    hasF('caer', 'caigo', 'caes', 'cayó', 'cayeron', 'cayendo', 'caído', 'caí', 'caíste', 'caiga', 'cayera');
    hasF('oír', 'oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen', 'oí', 'oíste', 'oyó', 'oyeron', 'oía', 'oiré', 'oiga', 'oyendo', 'oído', 'oye', 'oíd');
    hasF('reír', 'río', 'ríes', 'ríe', 'reímos', 'reís', 'ríen', 'reí', 'reíste', 'rio', 'rieron', 'reía', 'reiré', 'ría', 'riamos', 'riendo', 'reído', 'ríe');
    hasF('asir', 'asgo', 'ases', 'asga');
  });
  it('prefixed relatives go through their base', () => {
    hasF('mantener', 'mantengo', 'mantienes', 'mantuvo', 'mantendré', 'mantén', 'mantenga', 'mantenido');
    hasF('contener', 'contiene', 'contén', 'contuvieron');
    hasF('obtener', 'obtuvo', 'obtengo');
    hasF('componer', 'compongo', 'compuso', 'compondré', 'compón', 'compuesto', 'componga');
    hasF('deshacer', 'deshago', 'deshizo', 'deshecho', 'deshaz', 'desharé');
    hasF('predecir', 'predigo', 'predijo', 'predice', 'predicho', 'prediré', 'predeciré', 'prediciendo');
    hasF('bendecir', 'bendigo', 'bendijo', 'bendice', 'bendecido', 'bendeciré');
    lacks('bendecir', 'bendiré', 'bendicho');
    hasF('prever', 'preveo', 'previó', 'preví', 'prevé', 'previsto', 'prevemos', 'previmos', 'prevean');
    hasF('convenir', 'convengo', 'convino', 'convendrá', 'convén');
    hasF('atraer', 'atraigo', 'atrajo', 'atrae', 'atrayendo', 'atraído');
    hasF('distraer', 'distraigo', 'distrajo');
    hasF('sonreír', 'sonrío', 'sonríes', 'sonrió', 'sonreímos', 'sonriendo', 'sonreído');
    hasF('conducir', 'conduzco', 'conduje', 'condujo', 'condujeron', 'condujera', 'conducirá', 'conduce', 'condujéramos');
    hasF('producir', 'produzco', 'produjo');
    hasF('traducir', 'traduzco', 'tradujo', 'tradujeron');
    hasF('equivaler', 'equivalgo', 'equivaldrá');
    hasF('desoír', 'desoigo', 'desoyó', 'desoído');
    hasF('retener', 'retiene', 'retuvo', 'retén');
    hasF('imponer', 'impuso', 'impuesto', 'impón');
    hasF('revenir', 'revino');
    hasF('desandar', 'desanduvo');
    hasF('decaer', 'decayó', 'decaigo');
    hasF('sobresalir', 'sobresalgo', 'sobresal');
  });
  it('every conjugation lists no duplicate readings', () => {
    for (const l of ['hablar', 'tener', 'ser', 'ir', 'dar', 'ver', 'estar', 'dormir', 'reír', 'oír', 'haber', 'prever']) {
      const keys = conjugateLemma(l)!.forms.map((f) => JSON.stringify([f.form, f.morph, f.varieties ?? []]));
      expect(new Set(keys).size, l).toBe(keys.length);
    }
  });
});

import { analyzeSpanishForm, conjugateSpanish, describeSpanishMorph } from '../../src/adapters/spanish/morphology';

const ROUND_TRIP = `hablar comer vivir tener ser estar haber ir hacer decir poder querer saber venir poner salir dar ver traer caer oír
conducir andar caber valer reír mantener componer deshacer predecir pensar volver pedir dormir sentir jugar seguir elegir
empezar buscar llegar conocer construir leer enviar continuar escoger averiguar morir oler errar adquirir almorzar cocer
contar entender servir producir prever sonreír convenir bendecir desoír atraer teñir bullir dirigir vencer`.split(/\s+/);

describe('analysis agrees with generation', () => {
  it('every generated form of ~60 verbs analyses back to its verb with the same features and varieties', () => {
    const known = (l: string) => ROUND_TRIP.includes(l);
    for (const lemma of ROUND_TRIP) {
      const forms = conjugateSpanish(lemma);
      expect(forms, lemma).toBeDefined();
      for (const f of forms!) {
        const as = analyzeSpanishForm(f.form, { knownLemma: known });
        const ok = as.some((a) => a.lemma === lemma && Object.entries(f.morph).every(([k, v]) => a.morph[k] === v) && (f.varieties ?? []).every((v) => a.varieties?.includes(v)));
        expect(ok, `${lemma}: ${f.form} ${JSON.stringify(f.morph)} ← ${as.map((a) => a.lemma + JSON.stringify(a.morph)).join(' ; ')}`).toBe(true);
      }
    }
  });
});

const LEX = new Set([
  'hablar', 'ser', 'ir', 'ver', 'dar', 'decir', 'tener', 'poner', 'hacer', 'cantar', 'canto', 'casa', 'casar', 'cerrar', 'sentar', 'sentir',
  'callar', 'levantar', 'vestir', 'mantener', 'prever', 'sonreír', 'comer', 'vivir', 'saber', 'haber', 'pensar',
  'rápido', 'bueno', 'joven', 'español', 'trabajador', 'feliz', 'libro', 'luz', 'corazón', 'lápiz', 'ciudad', 'camión', 'fácil', 'amable', 'rico', 'poco', 'mujer', 'pan',
]);
const known = (l: string) => LEX.has(l);
const find = (form: string, lemma: string, feats: Record<string, string> = {}) =>
  analyzeSpanishForm(form, { knownLemma: known }).find((a) => a.lemma === lemma && Object.entries(feats).every(([k, v]) => a.morph[k] === v));

describe('ambiguity and honesty', () => {
  it('returns every reading and none above 0.75 when readings compete', () => {
    for (const f of ['hablamos', 'vivimos', 'fue', 'fui', 'fuera', 'hable', 've', 'vamos', 'canto', 'siente', 'hablemos', 'sé', 'era', 'hablaba']) {
      const as = analyzeSpanishForm(f, { knownLemma: known });
      const real = as.filter((a) => a.confidence >= 0.5);
      if (real.length > 1) for (const a of real) expect(a.confidence, `${f} ${a.lemma}`).toBeLessThanOrEqual(0.75);
    }
    expect(find('canto', 'cantar', { Person: '1' })).toBeDefined();
    expect(analyzeSpanishForm('canto', { knownLemma: known }).some((a) => a.lemma === 'canto' && a.pos === 'NOUN')).toBe(true);
    expect(find('ve', 'ir', { Mood: 'Imp' })).toBeDefined();
    expect(find('ve', 'ver', { Person: '3' })).toBeDefined();
    // a lone, unambiguous reading is confident
    expect(find('hablaban', 'hablar')!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(find('voy', 'ir')!.confidence).toBe(0.9);
  });
  it('a lemma nobody vouches for stays under 0.6 and says so; assumed stem changes are flagged', () => {
    for (const a of analyzeSpanishForm('hablaron')) { expect(a.lemmaKnown).toBe(false); expect(a.confidence).toBeLessThanOrEqual(0.6); expect(a.rule).toMatch(/not confirmed/); }
    for (const a of analyzeSpanishForm('tuvieron', { knownLemma: () => false })) { expect(a.lemmaKnown).toBe(false); expect(a.confidence).toBeLessThanOrEqual(0.6); }
    // a vouched-for verb that is on no stem-change list: the diphthong reading is only assumed
    const assumed = analyzeSpanishForm('fiero', { knownLemma: (l) => l === 'ferir' }).find((a) => a.lemma === 'ferir');
    expect(assumed).toBeDefined();
    expect(assumed!.lemmaKnown).toBe(true);
    expect(assumed!.confidence).toBeLessThanOrEqual(0.6);
    expect(assumed!.rule).toMatch(/assum/);
  });
  it('non-words and non-forms give nothing', () => {
    for (const f of ['xqzt', '', '   ', 'a b', 'hablar2', 'q', 'zzz']) expect(analyzeSpanishForm(f, { knownLemma: () => false }), f).toEqual([]);
    // the rules cannot derive these
    expect(find('hablaste', 'hablar', { Person: '3' })).toBeUndefined();
    expect(find('tenemos', 'tener', { Tense: 'Past' })).toBeUndefined();
    expect(analyzeSpanishForm('tuvo', { knownLemma: known }).every((a) => a.lemma === 'tener')).toBe(true);
    expect(analyzeSpanishForm('hacemos', { knownLemma: known }).some((a) => a.lemma === 'hacer' && a.morph.Tense === 'Past')).toBe(false);
  });
});

describe('forms of address and varieties', () => {
  it('voseo, vosotros and the future subjunctive carry their tag', () => {
    expect(analyzeSpanishForm('tenés', { knownLemma: known }).some((a) => a.lemma === 'tener' && a.varieties?.includes('voseo'))).toBe(true);
    expect(analyzeSpanishForm('hablá', { knownLemma: known }).some((a) => a.lemma === 'hablar' && a.morph.Mood === 'Imp' && a.varieties?.includes('voseo'))).toBe(true);
    expect(analyzeSpanishForm('tené', { knownLemma: known }).some((a) => a.lemma === 'tener' && a.morph.Mood === 'Imp' && a.varieties?.includes('voseo'))).toBe(true);
    expect(analyzeSpanishForm('tenéis', { knownLemma: known }).some((a) => a.lemma === 'tener' && a.varieties?.includes('vosotros'))).toBe(true);
    expect(analyzeSpanishForm('hablareis', { knownLemma: known }).some((a) => a.morph.Tense === 'Fut' && a.morph.Mood === 'Sub' && a.varieties?.includes('es-hist'))).toBe(true);
    // general Spanish forms carry no tag
    expect(find('hablo', 'hablar')!.varieties).toBeUndefined();
  });
});

describe('attached pronouns', () => {
  it('splits verb and pronouns with offsets, roles and the verb lemma', () => {
    const a = find('decírselo', 'decir', { VerbForm: 'Inf' })!;
    expect(a.parts!.map((p) => p.text)).toEqual(['decír', 'se', 'lo']);
    expect(a.parts!.map((p) => [p.start, p.end])).toEqual([[0, 5], [5, 7], [7, 9]]);
    expect(a.parts![1].role).toBe('indirect object pronoun');
    expect(a.parts![2].role).toBe('direct object pronoun');
    expect(find('verlo', 'ver')!.parts![1].role).toBe('direct object pronoun');
    expect(find('diciéndole', 'decir')!.parts![1].role).toBe('object pronoun');
    expect(find('levantarse', 'levantar')!.parts![1].role).toBe('reflexive');
    expect(find('dámelo', 'dar', { Mood: 'Imp' })!.parts!.map((p) => p.text)).toEqual(['dá', 'me', 'lo']);
  });
  it('handles the dropped -s and -d and the accent', () => {
    expect(find('sentémonos', 'sentar', { Mood: 'Imp', Person: '1' })).toBeDefined();
    expect(find('vámonos', 'ir', { Person: '1', Number: 'Plur' })!.parts!.map((p) => p.text)).toEqual(['vámo', 'nos']);
    expect(find('callaos', 'callar', { Mood: 'Imp', Person: '2', Number: 'Plur' })!.parts!.map((p) => p.text)).toEqual(['calla', 'os']);
    expect(find('siéntese', 'sentar', { Mood: 'Imp', Person: '3' })).toBeDefined();
    expect(find('dile', 'decir', { Mood: 'Imp', Person: '2' })).toBeDefined();
    expect(find('démelo', 'dar', { Mood: 'Imp', Person: '3' })).toBeDefined();
    expect(find('mantenlo', 'mantener', { Mood: 'Imp' })).toBeDefined();
    expect(find('idos', 'ir', { Mood: 'Imp', Number: 'Plur' })).toBeDefined();
  });
  it('does not attach pronouns to the wrong form or the wrong person', () => {
    // "hablolo" is not hablo + lo (that would be written háblolo): only the literary habló + lo, marked as such and lower
    // (test/adapters/spanish-literary.test.ts has the rule)
    const hablolo = analyzeSpanishForm('hablolo', { knownLemma: known });
    expect(hablolo.every((a) => a.afterFinite === true && a.morph.Tense === 'Past' && a.morph.Person === '3' && a.confidence <= 0.5)).toBe(true);
    expect(analyzeSpanishForm('callaste', { knownLemma: known }).every((a) => !a.parts)).toBe(true);
    // os goes with a vosotros imperative, not a tú one
    expect(analyzeSpanishForm('callaos', { knownLemma: known }).some((a) => a.morph.Person === '2' && a.morph.Number === 'Sing')).toBe(false);
  });
});

describe('nouns, adjectives and derivation', () => {
  it('plurals, feminine forms and their features', () => {
    expect(find('casas', 'casa', { Number: 'Plur' })!.pos).toBe('NOUN');
    expect(find('lápices', 'lápiz', { Number: 'Plur' })).toBeDefined();
    expect(find('corazones', 'corazón', { Number: 'Plur' })).toBeDefined();
    expect(find('jóvenes', 'joven', { Number: 'Plur' })).toBeDefined();
    expect(find('españolas', 'español', { Gender: 'Fem', Number: 'Plur' })).toBeDefined();
    expect(find('trabajadora', 'trabajador', { Gender: 'Fem', Number: 'Sing' })).toBeDefined();
    expect(find('buenos', 'bueno', { Gender: 'Masc', Number: 'Plur' })).toBeDefined();
    expect(find('mujeres', 'mujer', { Number: 'Plur' })).toBeDefined();
    expect(find('panes', 'pan', { Number: 'Plur' })).toBeDefined();
  });
  it('superlatives, diminutives, adverbs and contractions', () => {
    const s = find('riquísimo', 'rico', { Degree: 'Abs' });
    expect(s).toBeDefined();
    expect(s!.confidence).toBeLessThanOrEqual(0.6);
    expect(find('facilísimas', 'fácil', { Degree: 'Abs', Gender: 'Fem', Number: 'Plur' })).toBeDefined();
    expect(find('amabilísimo', 'amable', { Degree: 'Abs' })).toBeDefined();
    expect(find('poquito', 'poco', { Degree: 'Dim' })).toBeDefined();
    expect(find('camioncito', 'camión', { Degree: 'Dim' })).toBeDefined();
    expect(find('mujercita', 'mujer', { Degree: 'Dim', Gender: 'Fem' })).toBeDefined();
    expect(find('panecito', 'pan', { Degree: 'Dim' })).toBeDefined();
    expect(find('rápidamente', 'rápido')!.pos).toBe('ADV');
    expect(find('fácilmente', 'fácil')!.pos).toBe('ADV');
    expect(analyzeSpanishForm('rápidamente', { knownLemma: () => false }).every((a) => a.pos === 'VERB')).toBe(true);
    expect(analyzeSpanishForm('casita', {}).some((a) => a.pos === 'NOUN')).toBe(false);
    expect(analyzeSpanishForm('al', {})[0].parts!.map((p) => p.lemma)).toEqual(['a', 'el']);
    expect(analyzeSpanishForm('del', {})[0].parts!.map((p) => [p.text, p.start, p.end])).toEqual([['de', 0, 2], ['l', 2, 3]]);
  });
});

describe('describeSpanishMorph', () => {
  it('speaks plain English', () => {
    expect(describeSpanishMorph({ Mood: 'Sub', Tense: 'Imp', Person: '1', Number: 'Plur' })).toBe('first person plural, imperfect subjunctive');
    expect(describeSpanishMorph({ VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' })).toBe('past participle, feminine plural');
    expect(describeSpanishMorph({ VerbForm: 'Inf' })).toBe('infinitive');
    expect(describeSpanishMorph({ Mood: 'Cnd', Person: '3', Number: 'Sing' })).toBe('third person singular, conditional');
    expect(describeSpanishMorph({ Mood: 'Imp', Person: '3', Number: 'Sing', Polite: 'Form' })).toMatch(/imperative/);
    expect(describeSpanishMorph({ Degree: 'Dim', Gender: 'Fem', Number: 'Plur' })).toBe('feminine plural, diminutive');
    expect(describeSpanishMorph({})).toBe('');
  });
});

const LEX2 = new Set(['amar', 'tener', 'hacer', 'haber', 'ser', 'ir', 'dar', 'ver', 'volver', 'devolver', 'envolver', 'revolver', 'resolver', 'absolver', 'disolver', 'escribir', 'describir', 'inscribir', 'abrir', 'reabrir', 'romper', 'morir', 'cubrir', 'descubrir', 'imprimir', 'proveer', 'reír', 'sonreír', 'freír', 'refreír']);
const known2 = (l: string) => LEX2.has(l);
const find2 = (form: string, lemma: string, feats: Record<string, string> = {}) =>
  analyzeSpanishForm(form, { knownLemma: known2 }).find((a) => a.lemma === lemma && Object.entries(feats).every(([k, v]) => a.morph[k] === v));

describe('older second-person forms in -des', () => {
  it('are generated, tagged es-hist and vosotros, and analysed', () => {
    const forms = conjugateSpanish('amar')!.filter((f) => f.form.endsWith('des')).map((f) => f.form);
    expect(forms.sort()).toEqual(['amábades', 'amaríades', 'amáredes', 'amárades', 'amásedes'].sort());
    for (const f of conjugateSpanish('tener')!.filter((x) => x.form.endsWith('des'))) expect(f.varieties).toEqual(['vosotros', 'es-hist']);
    const cases: Array<[string, string, Record<string, string>]> = [
      ['amábades', 'amar', { Mood: 'Ind', Tense: 'Imp' }], ['teníades', 'tener', { Mood: 'Ind', Tense: 'Imp' }],
      ['amaríades', 'amar', { Mood: 'Cnd' }], ['amárades', 'amar', { Mood: 'Sub', Tense: 'Imp', Variant: 'Ra' }],
      ['amásedes', 'amar', { Mood: 'Sub', Tense: 'Imp', Variant: 'Se' }], ['hiciérades', 'hacer', { Mood: 'Sub', Tense: 'Imp' }],
      ['hiciésedes', 'hacer', { Mood: 'Sub', Tense: 'Imp' }], ['amáredes', 'amar', { Mood: 'Sub', Tense: 'Fut' }],
      ['hiciéredes', 'hacer', { Mood: 'Sub', Tense: 'Fut' }], ['hubiéredes', 'haber', { Mood: 'Sub', Tense: 'Fut' }],
    ];
    for (const [form, lemma, feats] of cases) {
      const a = find2(form, lemma, { ...feats, Person: '2', Number: 'Plur' });
      expect(a, form).toBeDefined();
      expect(a!.varieties).toEqual(expect.arrayContaining(['vosotros', 'es-hist']));
    }
  });
  it('leaves out the medieval present forms and the imperfects of ser, ir and ver', () => {
    expect(analyzeSpanishForm('amades', { knownLemma: known2 }).every((a) => a.lemma !== 'amar' || !a.lemmaKnown)).toBe(true);
    for (const l of ['ser', 'ir', 'ver']) expect(conjugateSpanish(l)!.some((f) => f.morph.Tense === 'Imp' && f.morph.Mood === 'Ind' && f.form.endsWith('des'))).toBe(false);
  });
});

describe('irregular participles of verbs outside the irregular table', () => {
  it('volver, escribir, abrir, romper, morir, cubrir, resolver and their relatives', () => {
    const pairs: Array<[string, string]> = [
      ['vuelto', 'volver'], ['devuelto', 'devolver'], ['envuelto', 'envolver'], ['revuelto', 'revolver'], ['resuelto', 'resolver'], ['absuelto', 'absolver'],
      ['disuelto', 'disolver'], ['escrito', 'escribir'], ['descrito', 'describir'], ['inscrito', 'inscribir'], ['abierto', 'abrir'], ['reabierto', 'reabrir'],
      ['roto', 'romper'], ['muerto', 'morir'], ['cubierto', 'cubrir'], ['descubierto', 'descubrir'], ['impreso', 'imprimir'], ['provisto', 'proveer'],
    ];
    for (const [form, lemma] of pairs) {
      const a = find2(form, lemma, { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' });
      expect(a, form).toBeDefined();
      expect(a!.confidence).toBeGreaterThanOrEqual(0.8);
    }
    expect(find2('vueltas', 'volver', { VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' })).toBeDefined();
    expect(find2('muertas', 'morir', { VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' })).toBeDefined();
  });
  it('does not also generate the regular participle', () => {
    for (const [lemma, regular] of [['volver', 'volvido'], ['escribir', 'escribido'], ['abrir', 'abrido'], ['romper', 'rompido'], ['morir', 'morido'], ['cubrir', 'cubrido'], ['resolver', 'resolvido'], ['devolver', 'devolvido'], ['describir', 'describido']]) {
      expect(conjugateSpanish(lemma)!.map((f) => f.form), lemma).not.toContain(regular);
      expect(analyzeSpanishForm(regular, { knownLemma: known2 }).some((a) => a.lemma === lemma), regular).toBe(false);
    }
    // two participles are both right for these
    expect(conjugateSpanish('imprimir')!.map((f) => f.form)).toEqual(expect.arrayContaining(['imprimido', 'impreso']));
  });
});

describe('older spellings of the preterite', () => {
  it('rió is plain older spelling; dió, vió, fué, fuí are es-hist; the generator writes the 2010 forms', () => {
    const rio = find2('rió', 'reír', { Tense: 'Past', Person: '3', Number: 'Sing' })!;
    expect(rio).toBeDefined();
    expect(rio.varieties ?? []).not.toContain('es-hist');
    expect(find2('rio', 'reír', { Tense: 'Past', Person: '3' })).toBeDefined();
    for (const [form, lemma, person] of [['dió', 'dar', '3'], ['vió', 'ver', '3'], ['fué', 'ser', '3'], ['fué', 'ir', '3'], ['fuí', 'ser', '1'], ['fuí', 'ir', '1']]) {
      const a = find2(form, lemma, { Tense: 'Past', Person: person });
      expect(a, `${form} ${lemma}`).toBeDefined();
      expect(a!.varieties).toContain('es-hist');
    }
    const forms = ['reír', 'dar', 'ver', 'ser', 'ir'].flatMap((l) => conjugateSpanish(l)!.map((f) => f.form));
    for (const old of ['rió', 'dió', 'vió', 'fué', 'fuí']) expect(forms).not.toContain(old);
    for (const cur of ['rio', 'dio', 'vio', 'fue', 'fui']) expect(forms).toContain(cur);
    // a non-word with the same shape stays a non-word
    expect(analyzeSpanishForm('tió', { knownLemma: known2 }).every((a) => !a.lemmaKnown)).toBe(true);
  });
});

describe('freír', () => {
  it('is conjugated like reír, with the participles frito and freído', () => {
    const c = conjugateSpanish('freír')!.map((f) => f.form);
    for (const f of ['frío', 'fríes', 'fríe', 'freímos', 'freís', 'fríen', 'freí', 'freíste', 'frio', 'frieron', 'freía', 'freiré', 'fría', 'friamos', 'friendo', 'frito', 'freído', 'fritas']) expect(c, f).toContain(f);
    expect(find2('fríe', 'freír', { Mood: 'Ind', Person: '3' })).toBeDefined();
    expect(find2('fríe', 'freír', { Mood: 'Imp', Person: '2' })).toBeDefined();
    expect(find2('frito', 'freír', { VerbForm: 'Part' })).toBeDefined();
    expect(find2('freído', 'freír', { VerbForm: 'Part' })).toBeDefined();
    expect(find2('freímos', 'freír', { Person: '1', Number: 'Plur' })).toBeDefined();
    expect(find2('refrito', 'refreír', { VerbForm: 'Part' })).toBeDefined();
    expect(find2('refríe', 'refreír', { Person: '3' })).toBeDefined();
  });
});

describe('speed and the analysis cache', () => {
  it('returns fresh copies, so a caller cannot change what is remembered', () => {
    const a = analyzeSpanishForm('hablamos', { knownLemma: known2 });
    const b = analyzeSpanishForm('hablamos', { knownLemma: known2 });
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    a[0].morph.Person = 'X';
    a.push(a[0]);
    const c = analyzeSpanishForm('hablamos', { knownLemma: known2 });
    expect(c).toEqual(b);
    const d = analyzeSpanishForm('decírselo', { knownLemma: (l) => l === 'decir' });
    d[0].parts![0].text = 'changed';
    expect(analyzeSpanishForm('decírselo', { knownLemma: (l) => l === 'decir' })[0].parts![0].text).toBe('decír');
  });
  it('answers different lexicons differently even for the same form', () => {
    expect(analyzeSpanishForm('canto', { knownLemma: (l) => l === 'cantar' }).some((a) => a.lemmaKnown)).toBe(true);
    expect(analyzeSpanishForm('canto', { knownLemma: () => false }).some((a) => a.lemmaKnown)).toBe(false);
  });
  it('analyses a few thousand mixed forms quickly', () => {
    const forms: string[] = [];
    for (const l of ['hablar', 'comer', 'vivir', 'tener', 'pensar', 'dormir', 'hacer', 'ir']) for (const f of conjugateSpanish(l)!) forms.push(f.form);
    const k = (l: string) => ['hablar', 'comer', 'vivir', 'tener', 'pensar', 'dormir', 'hacer', 'ir'].includes(l);
    const t0 = performance.now();
    for (const f of forms) analyzeSpanishForm(f, { knownLemma: k });
    expect((performance.now() - t0) / forms.length).toBeLessThan(0.5);
  });
});
