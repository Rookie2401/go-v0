/**
 * Spanish constructions: grammar patterns the reader can name (ir a + infinitive, haber + participle, aunque +
 * subjunctive …). Each detector reads the part of speech and the features of its neighbours from the analyses, so it
 * fires only where the words around are known (hand lexicon or morphology engine). A detector whose evidence is a
 * lexical coincidence reports a confidence below 0.6. `example` and `nearMiss` are used by the tests: the detector
 * fires on the example and stays silent on every near miss.
 *
 * Machine-drafted, not native-reviewed. voseo, vosotros and the future subjunctive are tagged in their titles: voseo is
 * part of the Honduran target, vosotros is the form of Spain, the future subjunctive is older Spanish.
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../core';

export interface SpanishConstruction {
  key: string;
  title: string;
  /** One or two sentences with one Spanish example and its English. */
  explanation: string;
  example: { es: string; en: string };
  nearMiss: string[];
  detect(c: Ctx): PatternCandidate[];
}

export interface Ctx {
  tokens: RawToken[];
  analyses: AnalyzedToken[];
  n(i: number): string;
  /** Candidates of token i when it is a word. */
  cands(i: number): AnalysisCandidate[];
  /** The best candidate of token i that satisfies `pred`, if any. */
  find(i: number, pred: (c: AnalysisCandidate) => boolean): AnalysisCandidate | undefined;
  verb(i: number, pred?: (c: AnalysisCandidate) => boolean): AnalysisCandidate | undefined;
  lemma(i: number, ...lemmas: string[]): AnalysisCandidate | undefined;
  /** Index of the next word token after i (-1 when none). */
  next(i: number): number;
  /** Index of the previous word token before i (-1 when none). */
  prev(i: number): number;
}

const isVerb = (c: AnalysisCandidate) => c.pos === 'VERB' || c.pos === 'AUX';
const has = (c: AnalysisCandidate, k: string, v: string) => (c.morph[k] ?? '').split(',').includes(v);
const finite = (c: AnalysisCandidate) => c.morph.VerbForm === undefined || c.morph.VerbForm === 'Fin';
const isInf = (c: AnalysisCandidate) => has(c, 'VerbForm', 'Inf');
const isGer = (c: AnalysisCandidate) => has(c, 'VerbForm', 'Ger');
const isPart = (c: AnalysisCandidate) => has(c, 'VerbForm', 'Part');
const isSubj = (c: AnalysisCandidate) => has(c, 'Mood', 'Sub');
/** A statement (indicative or conditional) with a pronoun written after it as part of the word: díjole, hallábase. */
const afterConjugated = (c: AnalysisCandidate) =>
  isVerb(c) && c.morph.VerbForm === 'Fin' && (c.morph.Mood === 'Ind' || c.morph.Mood === 'Cnd') && (c.parts ?? []).some((p) => /pronoun|reflexive/u.test(p.role ?? ''));

function makeCtx(tokens: RawToken[], analyses: AnalyzedToken[]): Ctx {
  const cands = (i: number): AnalysisCandidate[] => (tokens[i]?.isWord ? analyses[i]?.candidates ?? [] : []);
  const find = (i: number, pred: (c: AnalysisCandidate) => boolean) => cands(i).filter(pred).sort((a, b) => b.confidence - a.confidence)[0];
  return {
    tokens, analyses, cands, find,
    n: (i) => tokens[i]?.normalized ?? '',
    verb: (i, pred) => find(i, (c) => isVerb(c) && (!pred || pred(c))),
    lemma: (i, ...l) => find(i, (c) => c.lemma !== undefined && l.includes(c.lemma)),
    next: (i) => { for (let k = i + 1; k < tokens.length; k++) if (tokens[k].isWord) return k; return -1; },
    prev: (i) => { for (let k = i - 1; k >= 0; k--) if (tokens[k].isWord) return k; return -1; },
  };
}

const hit = (key: string, title: string, explanation: string, confidence: number, tokenIndexes: number[]): PatternCandidate =>
  ({ key, title, explanation, confidence: Math.min(0.95, confidence), tokenIndexes: [...new Set(tokenIndexes)].sort((a, b) => a - b) });

/** Run `f` at each word index. */
function each(c: Ctx, f: (i: number) => PatternCandidate | undefined): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) if (c.tokens[i].isWord) { const r = f(i); if (r) out.push(r); }
  return out;
}

/** The first word after i (within `within` word tokens) with a candidate satisfying pred; returns its index. */
function ahead(c: Ctx, i: number, within: number, pred: (c: AnalysisCandidate) => boolean): number {
  let k = i;
  for (let s = 0; s < within; s++) {
    k = c.next(k);
    if (k < 0) return -1;
    if (c.find(k, pred)) return k;
  }
  return -1;
}

const DATIVE = new Set(['me', 'te', 'le', 'les', 'nos', 'os']);
const GUSTAR = new Set(['gustar', 'encantar', 'interesar', 'parecer', 'doler', 'faltar', 'importar', 'molestar', 'fascinar', 'sobrar', 'bastar']);
const OBJECT = new Set(['lo', 'la', 'los', 'las']);
const PRONOUN_FIRST = new Set(['me', 'te', 'nos', 'os', 'se']);

export const SPANISH_CONSTRUCTIONS: readonly SpanishConstruction[] = [
  {
    key: 'imperfect',
    title: 'Imperfect (pretérito imperfecto)',
    explanation: 'Describes how things used to be or were ongoing in the past: "cuando era joven…", "no entendía" (when I was young, I did not understand).',
    example: { es: 'Yo no entendía.', en: 'I did not understand.' },
    nearMiss: ['Yo entiendo.'],
    detect: (c) => each(c, (i) => {
      const a = c.analyses[i].candidates[0];
      return a && isVerb(a) && a.morph.Tense === 'Imp' && !isSubj(a) ? hit('imperfect', 'Imperfect (pretérito imperfecto)', 'Describes how things used to be or were ongoing in the past: "cuando era joven…", "no entendía".', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'preterite',
    title: 'Preterite (pretérito indefinido)',
    explanation: 'A completed event in the past: "empecé a entender", "Dios perdonó" (God forgave).',
    example: { es: 'Dios perdonó mi pecado.', en: 'God forgave my sin.' },
    nearMiss: ['Dios perdona mi pecado.'],
    detect: (c) => each(c, (i) => {
      const a = c.analyses[i].candidates[0];
      return a && isVerb(a) && a.morph.Tense === 'Past' && a.morph.Aspect === 'Perf' && !isSubj(a) ? hit('preterite', 'Preterite (pretérito indefinido)', 'A completed event in the past: "empecé a entender", "Dios perdonó".', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'enclitic-pronoun',
    title: 'Pronouns attached to the verb',
    explanation: 'Object pronouns attach to the end of an infinitive, a gerund or a command: entender + lo → entenderlo, decir + se + lo → decírselo (to say it to him).',
    example: { es: 'Quiero entenderlo.', en: 'I want to understand it.' },
    nearMiss: ['Quiero entender.'],
    detect: (c) => each(c, (i) => {
      const a = c.analyses[i].candidates[0];
      if (!a) return undefined;
      const attachedParts = (a.parts ?? []).filter((p) => /pronoun|reflexive/u.test(p.role ?? '')).length;
      if (afterConjugated(a)) return undefined; // díjole: the construction below
      return a.notes?.clitics || attachedParts ? hit('enclitic-pronoun', 'Pronouns attached to the verb', 'Object pronouns attach to the end of an infinitive, a gerund or a command: entender + lo → entenderlo, decir + se + lo → decírselo.', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'enclitic-after-conjugated-verb',
    title: 'A pronoun after a conjugated verb (older and literary Spanish)',
    explanation: 'Older and literary Spanish may write the pronoun after a conjugated verb, as one word: le dijo → díjole (he said to him), se hallaba → hallábase (he found himself). Today the pronoun goes before the verb.',
    example: { es: 'Díjole que no.', en: 'He told him no.' },
    nearMiss: ['Le dijo que no.'],
    detect: (c) => each(c, (i) => {
      const a = c.analyses[i].candidates[0];
      return a && afterConjugated(a) ? hit('enclitic-after-conjugated-verb', 'A pronoun after a conjugated verb (older and literary Spanish)', 'Older and literary Spanish may write the pronoun after a conjugated verb, as one word: le dijo → díjole, se hallaba → hallábase. Today the pronoun goes before the verb.', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'personal-a',
    title: 'Personal "a"',
    explanation: 'Spanish marks a person as direct object with "a": amo a Dios, perdona a todos (he forgives everyone).',
    example: { es: 'Yo amo a Dios.', en: 'I love God.' },
    nearMiss: ['Yo voy a casa.', 'Yo amo la vida.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'a') return undefined;
      const p = c.prev(i);
      const nx = c.next(i);
      if (p < 0 || nx < 0 || !c.verb(p)) return undefined;
      const person = c.cands(nx).some((x) => x.pos === 'PROPN' || ['todo', 'alguien', 'nadie', 'quién'].includes(x.lemma ?? ''));
      // "voy a Roma" is a place: only a verb of acting on a person, not of motion, takes the personal a
      const motion = c.lemma(p, 'ir', 'venir', 'llegar', 'volver', 'regresar', 'salir', 'entrar');
      return person && !motion ? hit('personal-a', 'Personal "a"', 'Spanish marks a person as direct object with "a": amo a Dios, perdona a todos.', 0.8, [p, i, nx]) : undefined;
    }),
  },
  {
    key: 'ir-a-infinitive',
    title: 'Going to: ir a + infinitive',
    explanation: 'Ir (to go) + a + infinitive says what is going to happen: "Voy a comer" (I am going to eat). It is the everyday way to talk about the near future.',
    example: { es: 'Voy a comer.', en: 'I am going to eat.' },
    nearMiss: ['Voy a casa.', 'Ella come.'],
    detect: (c) => each(c, (i) => {
      const v = c.lemma(i, 'ir');
      const a = c.next(i);
      if (!v || !finite(v) || a < 0 || c.n(a) !== 'a') return undefined;
      const inf = c.next(a);
      const ic = inf >= 0 ? c.verb(inf, isInf) : undefined;
      return ic ? hit('ir-a-infinitive', 'Going to: ir a + infinitive', 'Ir (to go) + a + infinitive says what is going to happen: "Voy a comer" (I am going to eat).', Math.min(v.confidence, ic.confidence), [i, a, inf]) : undefined;
    }),
  },
  {
    key: 'perfect-tense',
    title: 'Perfect tenses: haber + participle',
    explanation: 'Haber + participle makes the perfect tenses: "He comido" (I have eaten), "había dicho" (he had said). The participle ends in -ado or -ido and does not change.',
    example: { es: 'He dado el libro.', en: 'I have given the book.' },
    nearMiss: ['Hay un libro.', 'Él tiene un libro.'],
    detect: (c) => each(c, (i) => {
      const h = c.lemma(i, 'haber');
      if (!h || !finite(h)) return undefined;
      let k = c.next(i);
      if (k >= 0 && c.n(k) === 'no') k = c.next(k);
      const p = k >= 0 ? c.verb(k, isPart) : undefined;
      return p ? hit('perfect-tense', 'Perfect tenses: haber + participle', 'Haber + participle makes the perfect tenses: "He comido" (I have eaten), "había dicho" (he had said).', Math.min(h.confidence, p.confidence), [i, k]) : undefined;
    }),
  },
  {
    key: 'estar-gerund',
    title: 'Happening now: estar + gerund',
    explanation: 'Estar + a form in -ando or -iendo says that something is in progress: "Estoy leyendo" (I am reading).',
    example: { es: 'Estoy comiendo.', en: 'I am eating.' },
    nearMiss: ['Estoy cansado.', 'Estoy en casa.'],
    detect: (c) => each(c, (i) => {
      const e = c.lemma(i, 'estar');
      if (!e || !finite(e)) return undefined;
      const k = c.next(i);
      const g = k >= 0 ? c.verb(k, isGer) : undefined;
      return g ? hit('estar-gerund', 'Happening now: estar + gerund', 'Estar + a form in -ando or -iendo says that something is in progress: "Estoy leyendo" (I am reading).', Math.min(e.confidence, g.confidence), [i, k]) : undefined;
    }),
  },
  {
    key: 'llevar-gerund',
    title: 'For how long: llevar + gerund',
    explanation: 'Llevar + time + gerund says how long something has been going on: "Llevo dos años estudiando español" (I have been studying Spanish for two years).',
    example: { es: 'Llevo dos años estudiando.', en: 'I have been studying for two years.' },
    nearMiss: ['Llevo el libro.', 'Estoy estudiando.'],
    detect: (c) => each(c, (i) => {
      const l = c.lemma(i, 'llevar');
      if (!l || !finite(l)) return undefined;
      const g = ahead(c, i, 4, (x) => isVerb(x) && isGer(x));
      return g > 0 ? hit('llevar-gerund', 'For how long: llevar + gerund', 'Llevar + time + gerund says how long something has been going on: "Llevo dos años estudiando español".', Math.min(l.confidence, 0.8), [i, g]) : undefined;
    }),
  },
  {
    key: 'acabar-de',
    title: 'Just done: acabar de + infinitive',
    explanation: 'Acabar de + infinitive means "to have just done": "Acabo de comer" (I have just eaten).',
    example: { es: 'Acabo de comer.', en: 'I have just eaten.' },
    nearMiss: ['Acabo la tarea.', 'Voy a comer.'],
    detect: (c) => each(c, (i) => {
      const a = c.lemma(i, 'acabar');
      const d = c.next(i);
      if (!a || !finite(a) || d < 0 || c.n(d) !== 'de') return undefined;
      const k = c.next(d);
      const ic = k >= 0 ? c.verb(k, isInf) : undefined;
      return ic ? hit('acabar-de', 'Just done: acabar de + infinitive', 'Acabar de + infinitive means "to have just done": "Acabo de comer".', Math.min(a.confidence, ic.confidence), [i, d, k]) : undefined;
    }),
  },
  {
    key: 'tener-que',
    title: 'Must: tener que / hay que + infinitive',
    explanation: 'Tener que + infinitive says what someone has to do: "Tengo que trabajar" (I have to work). Hay que + infinitive says what one must do in general: "Hay que comer".',
    example: { es: 'Tengo que trabajar.', en: 'I have to work.' },
    nearMiss: ['Tengo una casa.', 'Creo que sí.'],
    detect: (c) => each(c, (i) => {
      const t = c.lemma(i, 'tener', 'haber');
      const q = c.next(i);
      if (!t || !finite(t) || q < 0 || c.n(q) !== 'que') return undefined;
      const k = c.next(q);
      const ic = k >= 0 ? c.verb(k, isInf) : undefined;
      return ic ? hit('tener-que', 'Must: tener que / hay que + infinitive', 'Tener que + infinitive says what someone has to do: "Tengo que trabajar". Hay que + infinitive says what one must do in general.', Math.min(t.confidence, ic.confidence), [i, q, k]) : undefined;
    }),
  },
  {
    key: 'se-impersonal',
    title: 'Se: impersonal or passive',
    explanation: 'Se + a third-person verb can mean "one does" or "is done": "Se habla español aquí" (Spanish is spoken here). No person is named.',
    example: { es: 'Se habla español.', en: 'Spanish is spoken.' },
    nearMiss: ['Se lo dije.', 'Ella se lava.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'se') return undefined;
      const first = c.tokens.findIndex((t) => t.isWord);
      const before = [...Array(i).keys()].reverse().find((k) => c.tokens[k].isWord);
      const opener = i === first || (before !== undefined && ['no', 'aquí', 'allí', 'así', 'que', 'como', 'donde'].includes(c.n(before)));
      const k = c.next(i);
      if (!opener || k < 0 || OBJECT.has(c.n(k))) return undefined;
      const v = c.verb(k, (x) => finite(x) && (x.morph.Person ?? '').split(',').includes('3'));
      return v ? hit('se-impersonal', 'Se: impersonal or passive', 'Se + a third-person verb can mean "one does" or "is done": "Se habla español aquí".', Math.min(v.confidence, 0.6), [i, k]) : undefined;
    }),
  },
  {
    key: 'gustar-type',
    title: 'Verbs like gustar',
    explanation: 'Gustar works backwards: the thing liked is the subject and the person is an indirect object. "Me gusta el café" is "the coffee is pleasing to me". Encantar, interesar, doler and faltar work the same way.',
    example: { es: 'Me gusta el café.', en: 'I like coffee.' },
    nearMiss: ['Me ayuda.', 'Ana ama el café.'],
    detect: (c) => each(c, (i) => {
      const g = c.find(i, (x) => isVerb(x) && x.lemma !== undefined && GUSTAR.has(x.lemma) && finite(x));
      if (!g) return undefined;
      const before = [...Array(i).keys()].reverse().find((k) => c.tokens[k].isWord);
      return before !== undefined && DATIVE.has(c.n(before)) ? hit('gustar-type', 'Verbs like gustar', 'Gustar works backwards: the thing liked is the subject and the person is an indirect object. "Me gusta el café" is "the coffee is pleasing to me".', g.confidence, [before, i]) : undefined;
    }),
  },
  {
    key: 'aunque-subjunctive',
    title: 'Aunque + subjunctive',
    explanation: 'Aunque with the subjunctive concedes something that may or may not be so: "Aunque llueva, voy" (even if it rains, I will go). With the indicative it states a fact: "aunque llueve" (although it is raining).',
    example: { es: 'Aunque tenga miedo, voy.', en: 'Even if I am afraid, I will go.' },
    nearMiss: ['Aunque tiene miedo, va.', 'Voy a casa.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'aunque') return undefined;
      const k = ahead(c, i, 3, (x) => isVerb(x) && isSubj(x) && finite(x));
      return k > 0 ? hit('aunque-subjunctive', 'Aunque + subjunctive', 'Aunque with the subjunctive concedes something that may or may not be so: "Aunque llueva, voy".', 0.75, [i, k]) : undefined;
    }),
  },
  {
    key: 'si-conditional',
    title: 'If … would: si + imperfect subjunctive, conditional',
    explanation: 'For something unlikely or untrue, si takes the imperfect subjunctive and the result is in the conditional: "Si tuviera tiempo, viajaría" (if I had time, I would travel).',
    example: { es: 'Si tuviera tiempo, viajaría.', en: 'If I had time, I would travel.' },
    nearMiss: ['Si tengo tiempo, viajo.', 'Sí, tengo tiempo.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'si') return undefined;
      const k = ahead(c, i, 4, (x) => isVerb(x) && isSubj(x) && has(x, 'Tense', 'Imp'));
      if (k < 0) return undefined;
      const cond = c.tokens.findIndex((t, m) => m > k && t.isWord && c.cands(m).some((x) => isVerb(x) && has(x, 'Mood', 'Cnd')));
      return hit('si-conditional', 'If … would: si + imperfect subjunctive, conditional', 'For something unlikely or untrue, si takes the imperfect subjunctive and the result is in the conditional: "Si tuviera tiempo, viajaría".', cond >= 0 ? 0.85 : 0.7, cond >= 0 ? [i, k, cond] : [i, k]);
    }),
  },
  {
    key: 'para-que-subjunctive',
    title: 'Para que + subjunctive',
    explanation: 'Para que (so that) takes the subjunctive when the two clauses have different subjects: "Te lo digo para que entiendas" (I tell you so that you understand).',
    example: { es: 'Lo digo para que entiendas.', en: 'I say it so that you understand.' },
    nearMiss: ['Lo digo para entender.', 'Es para ti.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'para') return undefined;
      const q = c.next(i);
      if (q < 0 || c.n(q) !== 'que') return undefined;
      const k = ahead(c, q, 3, (x) => isVerb(x) && isSubj(x) && finite(x));
      return k > 0 ? hit('para-que-subjunctive', 'Para que + subjunctive', 'Para que (so that) takes the subjunctive when the two clauses have different subjects.', 0.85, [i, q, k]) : undefined;
    }),
  },
  {
    key: 'cuando-subjunctive',
    title: 'Cuando + subjunctive (future)',
    explanation: 'When "cuando" looks to the future it takes the subjunctive: "Cuando llegues, llámame" (when you arrive, call me). For a habit or the past it takes the indicative.',
    example: { es: 'Cuando llegues, llámame.', en: 'When you arrive, call me.' },
    nearMiss: ['Cuando llegas, llamas.', 'Cuando era joven, creía.'],
    detect: (c) => each(c, (i) => {
      if (c.n(i) !== 'cuando') return undefined;
      const k = ahead(c, i, 3, (x) => isVerb(x) && isSubj(x) && finite(x) && !has(x, 'Tense', 'Imp'));
      return k > 0 ? hit('cuando-subjunctive', 'Cuando + subjunctive (future)', 'When "cuando" looks to the future it takes the subjunctive: "Cuando llegues, llámame".', 0.75, [i, k]) : undefined;
    }),
  },
  {
    key: 'querer-que-subjunctive',
    title: 'Wanting someone else to act: querer que + subjunctive',
    explanation: 'After querer que (and other verbs of wish or request) the verb is in the subjunctive: "Quiero que vengas" (I want you to come).',
    example: { es: 'Quiero que tenga paz.', en: 'I want him to have peace.' },
    nearMiss: ['Quiero tener paz.', 'Creo que tiene paz.'],
    detect: (c) => each(c, (i) => {
      const w = c.lemma(i, 'querer', 'desear', 'pedir', 'esperar', 'necesitar');
      const q = c.next(i);
      if (!w || !finite(w) || q < 0 || c.n(q) !== 'que') return undefined;
      const k = ahead(c, q, 3, (x) => isVerb(x) && isSubj(x) && finite(x));
      return k > 0 ? hit('querer-que-subjunctive', 'Wanting someone else to act: querer que + subjunctive', 'After querer que (and other verbs of wish or request) the verb is in the subjunctive: "Quiero que vengas".', Math.min(w.confidence, 0.85), [i, q, k]) : undefined;
    }),
  },
  {
    key: 'comparison',
    title: 'Comparing: más … que, tan … como',
    explanation: 'Más / menos + adjective or adverb + que compares unequal things: "más alto que tú" (taller than you). Tan + adjective + como says equal: "tan alto como tú" (as tall as you).',
    example: { es: 'Ella es más alta que él.', en: 'She is taller than he is.' },
    nearMiss: ['Creo que sí.', 'Quiero más pan.'],
    detect: (c) => each(c, (i) => {
      const w = c.n(i);
      if (w !== 'más' && w !== 'menos' && w !== 'tan') return undefined;
      const closer = w === 'tan' ? 'como' : 'que';
      let k = i;
      for (let s = 0; s < 3; s++) {
        k = c.next(k);
        if (k < 0) return undefined;
        if (c.n(k) === closer) return s > 0 ? hit('comparison', 'Comparing: más … que, tan … como', 'Más / menos + adjective or adverb + que compares unequal things; tan + adjective + como says equal.', 0.8, [i, k]) : undefined;
      }
      return undefined;
    }),
  },
  {
    key: 'ser-estar-adjective',
    title: 'Ser or estar with an adjective',
    explanation: 'Ser says what someone or something is like: "Ella es alta" (she is tall). Estar says how it is now: "Ella está cansada" (she is tired). The same adjective can change meaning: "es listo" (is clever), "está listo" (is ready).',
    example: { es: 'Ella está cansada.', en: 'She is tired.' },
    nearMiss: ['Ella está en casa.', 'Ella come.'],
    detect: (c) => each(c, (i) => {
      const v = c.lemma(i, 'ser', 'estar');
      if (!v || !finite(v)) return undefined;
      let k = c.next(i);
      if (k >= 0 && ['muy', 'tan', 'más', 'menos', 'no'].includes(c.n(k))) k = c.next(k);
      const adj = k >= 0 ? c.find(k, (x) => x.pos === 'ADJ') : undefined;
      return adj && !c.find(k, (x) => isVerb(x) && isPart(x)) ? hit('ser-estar-adjective', 'Ser or estar with an adjective', 'Ser says what someone or something is like; estar says how it is now.', Math.min(v.confidence, adj.confidence), [i, k]) : undefined;
    }),
  },
  {
    key: 'double-object-pronouns',
    title: 'Two object pronouns: se lo, me lo',
    explanation: 'Two object pronouns go together before the verb, indirect first: "Me lo dio" (he gave it to me). Before lo / la / los / las, le and les become se: "Se lo di" (I gave it to him). Attached to a verb the order is the same: decírselo.',
    example: { es: 'Se lo di.', en: 'I gave it to him.' },
    nearMiss: ['Lo vi.', 'Se cae.'],
    detect: (c) => each(c, (i) => {
      if (!PRONOUN_FIRST.has(c.n(i))) return undefined;
      const k = c.next(i);
      if (k >= 0 && OBJECT.has(c.n(k)) && c.next(k) >= 0 && c.verb(c.next(k)!)) return hit('double-object-pronouns', 'Two object pronouns: se lo, me lo', 'Two object pronouns go together before the verb, indirect first.', 0.8, [i, k, c.next(k)]);
      return undefined;
    }).concat(each(c, (i) => {
      const a = c.analyses[i].candidates[0];
      const parts = (a?.parts ?? []).filter((p) => /pronoun|reflexive/u.test(p.role ?? ''));
      return a && parts.length >= 2 ? hit('double-object-pronouns', 'Two object pronouns: se lo, me lo', 'Attached to a verb, two object pronouns keep the same order: decírselo (to say it to him).', a.confidence, [i]) : undefined;
    })),
  },
  {
    key: 'voseo',
    title: 'Voseo: vos and its verb forms',
    explanation: 'In Honduras and much of Central America "vos" replaces "tú" in everyday speech, with its own verb forms: "vos tenés", "vos hablás", and the command "hablá". It is part of the Spanish you are aiming to use.',
    example: { es: 'Vos tenés razón.', en: 'You are right.' },
    nearMiss: ['Tú tienes razón.', 'Ellos tienen razón.'],
    detect: (c) => each(c, (i) => {
      const a = c.find(i, (x) => (x.varieties ?? []).includes('voseo'));
      return a ? hit('voseo', 'Voseo: vos and its verb forms', 'In Honduras and much of Central America "vos" replaces "tú" in everyday speech, with its own verb forms: "vos tenés", "vos hablás".', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'vosotros',
    title: 'Vosotros (used in Spain)',
    explanation: 'In Spain "vosotros" is the informal plural of "tú": "vosotros tenéis", "os lo digo". Latin America, Honduras included, uses "ustedes" with the third-person plural instead. Worth recognising, not your default.',
    example: { es: 'Vosotros tenéis razón.', en: 'You (all) are right.' },
    nearMiss: ['Ustedes tienen razón.', 'Nosotros tenemos razón.'],
    detect: (c) => each(c, (i) => {
      const a = c.find(i, (x) => (x.varieties ?? []).includes('vosotros'));
      return a ? hit('vosotros', 'Vosotros (used in Spain)', 'In Spain "vosotros" is the informal plural of "tú"; Latin America uses "ustedes" instead.', a.confidence, [i]) : undefined;
    }),
  },
  {
    key: 'future-subjunctive',
    title: 'Future subjunctive (older Spanish)',
    explanation: 'Older Spanish, including old Bible translations, has a future subjunctive: "si dijéremos" (if we say). Today ordinary speech uses the present subjunctive or the present indicative instead. Recognise it when reading; do not use it.',
    example: { es: 'Si dijéremos que no tenemos pecado.', en: 'If we say that we have no sin.' },
    nearMiss: ['Si decimos que no tenemos pecado.', 'Si dijéramos que no.'],
    detect: (c) => each(c, (i) => {
      const a = c.find(i, (x) => isVerb(x) && isSubj(x) && has(x, 'Tense', 'Fut'));
      return a ? hit('future-subjunctive', 'Future subjunctive (older Spanish)', 'Older Spanish has a future subjunctive: "si dijéremos" (if we say). Today ordinary speech uses the present subjunctive or the indicative instead.', a.confidence, [i]) : undefined;
    }),
  },
];

/** Every construction detector over one sentence. */
export function detectSpanishConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const ctx = makeCtx(tokens, analyses);
  return SPANISH_CONSTRUCTIONS.flatMap((k) => k.detect(ctx));
}
