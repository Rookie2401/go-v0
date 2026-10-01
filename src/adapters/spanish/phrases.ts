/**
 * Spanish phrase units: words that travel together or whose meaning is not the sum of the parts. A unit is written
 * as a spec string; its words match an inflected form through the lemma (tener que matches tengo que, tuvimos que),
 * so the lexicon or the morphology engine must know the verb. Machine-drafted, not native-reviewed.
 *
 * Spec syntax (one space between words):
 *   word       the written form, or any word whose lemma it is
 *   _          a verb (an infinitive complement): volver a _
 *   *          any one word: pensar en *
 *   tener~     up to two modifier words may follow (tengo muchas ganas, tienes toda la razón)
 *   dar(se)    a pronominal verb: a reflexive pronoun before it (me di cuenta) or attached to it (darse, dándose)
 */
import type { PhraseItem, PhraseRule } from '../shared';

type Kind = PhraseRule['kind'];
/** [spec, gloss, kind, display (defaults to the spec words)] */
type Unit = readonly [spec: string, gloss: string, kind: Kind, display?: string];

export const PHRASE_UNITS: readonly Unit[] = [
  // ── verb + particle: the verb's lemma matches every inflected form
  ['tener que _', 'to have to (do something)', 'construction'],
  ['acabar de _', 'to have just (done something)', 'construction'],
  ['volver a _', 'to do (something) again', 'construction'],
  ['dejar de _', 'to stop (doing something)', 'construction'],
  ['poner(se) a _', 'to start (doing something)', 'construction'],
  ['llegar a _', 'to manage to, to come to (do something)', 'construction'],
  ['ir a _', 'to be going to (do something)', 'construction'],
  ['soler _', 'to usually (do something)', 'construction'],
  ['seguir _', 'to keep on, to continue (doing something)', 'construction'],
  ['empezar a _', 'to begin to (do something)', 'construction'],
  ['comenzar a _', 'to begin to (do something)', 'construction'],
  ['tratar de _', 'to try to (do something)', 'construction'],
  ['estar a punto de _', 'to be about to (do something)', 'construction'],
  ['haber que _', 'one must (hay que)', 'construction'],
  ['dar(se) cuenta de', 'to realize, to become aware of', 'idiom'],
  ['tener~ ganas de', 'to feel like (doing or having)', 'idiom'],
  ['tener~ razón', 'to be right', 'idiom'],
  ['tener~ miedo', 'to be afraid', 'idiom'],
  ['tener~ hambre', 'to be hungry', 'idiom'],
  ['tener~ sed', 'to be thirsty', 'idiom'],
  ['tener~ frío', 'to be cold (a person)', 'idiom'],
  ['tener~ calor', 'to be hot (a person)', 'idiom'],
  ['tener~ sueño', 'to be sleepy', 'idiom'],
  ['tener~ prisa', 'to be in a hurry', 'idiom'],
  ['tener~ cuidado', 'to be careful', 'idiom'],
  ['tener~ éxito', 'to be successful', 'idiom'],
  ['tener lugar', 'to take place', 'collocation'],
  ['tener en cuenta', 'to take into account', 'idiom'],
  ['hacer~ falta', 'to be needed, to be lacking', 'idiom'],
  ['echar de menos', 'to miss (someone or something)', 'idiom'],
  ['hacer calor', 'to be hot (weather)', 'collocation'],
  ['hacer frío', 'to be cold (weather)', 'collocation'],
  ['hacer sol', 'to be sunny', 'collocation'],
  ['hacer viento', 'to be windy', 'collocation'],
  ['hacer caso', 'to pay attention, to obey', 'idiom'],
  ['hacer daño', 'to hurt, to harm', 'collocation'],
  ['hacer cola', 'to queue, to stand in line', 'collocation'],
  ['hacer ejercicio', 'to exercise', 'collocation'],
  ['hacer~ una pregunta', 'to ask a question', 'collocation'],
  ['dar un paseo', 'to go for a walk', 'collocation'],
  ['dar las gracias', 'to give thanks, to thank', 'collocation'],
  ['dar de comer', 'to feed', 'collocation'],
  ['prestar atención', 'to pay attention', 'collocation'],
  ['llevar a cabo', 'to carry out', 'idiom'],
  ['tomar~ una decisión', 'to make a decision', 'collocation'],
  ['cambiar de idea', 'to change one\'s mind', 'idiom'],
  ['pasar el tiempo', 'to spend time', 'collocation'],
  ['estar de acuerdo', 'to agree', 'idiom'],
  ['estar harto de', 'to be fed up with', 'idiom'],
  ['estar de pie', 'to be standing', 'collocation'],
  ['poner(se) de pie', 'to stand up', 'collocation'],
  ['quedar(se) dormido', 'to fall asleep', 'collocation'],
  ['caer bien', 'to make a good impression on, to be liked', 'idiom'],
  ['caer mal', 'to make a bad impression on, to be disliked', 'idiom'],
  ['ir de compras', 'to go shopping', 'collocation'],
  ['pensar en *', 'to think about', 'frame', 'pensar en …'],
  ['soñar con *', 'to dream of, about', 'frame', 'soñar con …'],
  ['depender de *', 'to depend on', 'frame', 'depender de …'],
  ['preocupar(se) por *', 'to worry about', 'frame', 'preocuparse por …'],
  ['acordar(se) de *', 'to remember', 'frame', 'acordarse de …'],
  ['olvidar(se) de *', 'to forget', 'frame', 'olvidarse de …'],
  ['casar(se) con *', 'to marry', 'frame', 'casarse con …'],
  // ── greetings and everyday formulas
  ['por favor', 'please', 'formula'],
  ['de nada', 'you are welcome', 'formula'],
  ['por supuesto', 'of course', 'formula'],
  ['claro que sí', 'of course', 'formula'],
  ['cómo no', 'of course, certainly', 'formula'],
  ['mucho gusto', 'pleased to meet you', 'formula'],
  ['con mucho gusto', 'gladly, with pleasure', 'formula'],
  ['con permiso', 'excuse me (to pass, to enter)', 'formula'],
  ['lo sentir', 'I am sorry', 'formula', 'lo siento'],
  ['no hay de qué', 'do not mention it', 'formula'],
  ['no importar', 'it does not matter', 'formula', 'no importa'],
  ['no pasar nada', 'it is fine, nothing is wrong', 'formula', 'no pasa nada'],
  ['qué tal', 'how are things?', 'formula'],
  ['cómo estar', 'how are you?', 'formula', 'cómo estás'],
  ['buenos días', 'good morning', 'formula'],
  ['buenas tardes', 'good afternoon', 'formula'],
  ['buenas noches', 'good evening, good night', 'formula'],
  ['hasta luego', 'see you later', 'formula'],
  ['hasta mañana', 'see you tomorrow', 'formula'],
  ['buen provecho', 'enjoy your meal', 'formula'],
  ['feliz cumpleaños', 'happy birthday', 'formula'],
  ['feliz navidad', 'merry Christmas', 'formula'],
  ['dios mío', 'my God', 'formula'],
  ['gracias a dios', 'thank God', 'formula'],
  ['así es', 'that is right', 'formula'],
  ['eso es', 'that is it, exactly', 'formula'],
  ['de acuerdo', 'agreed, all right', 'formula'],
  ['está bien', 'it is fine, all right', 'formula'],
  // ── adverbs of time and manner
  ['a veces', 'sometimes', 'collocation'],
  ['de repente', 'suddenly', 'collocation'],
  ['de pronto', 'suddenly', 'collocation'],
  ['en seguida', 'immediately, at once', 'collocation'],
  ['tal vez', 'perhaps', 'collocation'],
  ['a lo mejor', 'maybe, perhaps', 'idiom'],
  ['de vez en cuando', 'from time to time', 'idiom'],
  ['de nuevo', 'again', 'collocation'],
  ['otra vez', 'again', 'collocation'],
  ['una vez', 'once; one time', 'collocation'],
  ['muchas veces', 'often, many times', 'collocation'],
  ['todos los días', 'every day', 'collocation'],
  ['cada vez más', 'more and more', 'idiom'],
  ['cada vez menos', 'less and less', 'idiom'],
  ['hoy en día', 'nowadays', 'idiom'],
  ['ahora mismo', 'right now', 'collocation'],
  ['al mismo tiempo', 'at the same time', 'collocation'],
  ['al principio', 'at first, at the beginning', 'collocation'],
  ['al final', 'in the end, at the end', 'collocation'],
  ['por fin', 'at last, finally', 'collocation'],
  ['por último', 'lastly, finally', 'collocation'],
  ['por primera vez', 'for the first time', 'collocation'],
  ['dentro de poco', 'soon, before long', 'collocation'],
  ['poco a poco', 'little by little', 'idiom'],
  ['más o menos', 'more or less, roughly', 'idiom'],
  ['por la mañana', 'in the morning', 'collocation'],
  ['por la tarde', 'in the afternoon, in the evening', 'collocation'],
  ['por la noche', 'at night, in the evening', 'collocation'],
  ['todo el día', 'all day', 'collocation'],
  ['todo el mundo', 'everyone, everybody', 'idiom'],
  ['la mayoría de', 'most of, the majority of', 'collocation'],
  ['un poco de', 'a little (of)', 'collocation'],
  ['en voz alta', 'aloud, out loud', 'collocation'],
  ['en voz baja', 'quietly, in a low voice', 'collocation'],
  ['de memoria', 'by heart', 'collocation'],
  ['a pie', 'on foot', 'collocation'],
  ['a mano', 'by hand', 'collocation'],
  ['por casualidad', 'by chance', 'collocation'],
  ['por si acaso', 'just in case', 'idiom'],
  ['lo antes posible', 'as soon as possible', 'formula'],
  // ── connectives and prepositional phrases
  ['a pesar de', 'in spite of', 'collocation'],
  ['por lo tanto', 'therefore', 'formula'],
  ['sin embargo', 'however, nevertheless', 'formula'],
  ['no obstante', 'nevertheless', 'formula'],
  ['por eso', 'that is why, for that reason', 'formula'],
  ['por ejemplo', 'for example', 'formula'],
  ['es decir', 'that is to say', 'formula'],
  ['o sea', 'that is, I mean', 'formula'],
  ['es que', 'the thing is, it is that', 'formula'],
  ['de todos modos', 'anyway, in any case', 'formula'],
  ['de todas formas', 'anyway, in any case', 'formula'],
  ['en cambio', 'on the other hand, whereas', 'formula'],
  ['por otro lado', 'on the other hand', 'formula'],
  ['por cierto', 'by the way', 'formula'],
  ['en realidad', 'in fact, actually', 'formula'],
  ['en efecto', 'indeed, in fact', 'formula'],
  ['en general', 'in general', 'formula'],
  ['por lo general', 'usually, as a rule', 'formula'],
  ['por lo menos', 'at least', 'formula'],
  ['al menos', 'at least', 'formula'],
  ['sobre todo', 'above all, especially', 'formula'],
  ['ni siquiera', 'not even', 'formula'],
  ['ya que', 'since, given that', 'formula'],
  ['puesto que', 'since, given that', 'formula'],
  ['así que', 'so, therefore', 'formula'],
  ['de manera que', 'so that; so', 'formula'],
  ['para que', 'so that, in order that', 'formula'],
  ['sino que', 'but rather', 'formula'],
  ['a menos que', 'unless', 'formula'],
  ['en cuanto', 'as soon as', 'formula'],
  ['por qué', 'why', 'formula'],
  ['a pesar de que', 'even though, although', 'formula'],
  ['a partir de', 'starting from, from … on', 'collocation'],
  ['a lo largo de', 'throughout, along', 'collocation'],
  ['a través de', 'through, across', 'collocation'],
  ['acerca de', 'about, concerning', 'collocation'],
  ['antes de', 'before', 'collocation'],
  ['después de', 'after', 'collocation'],
  ['cerca de', 'near, close to', 'collocation'],
  ['lejos de', 'far from', 'collocation'],
  ['al lado de', 'next to, beside', 'collocation'],
  ['delante de', 'in front of', 'collocation'],
  ['detrás de', 'behind', 'collocation'],
  ['encima de', 'on top of, above', 'collocation'],
  ['debajo de', 'underneath, below', 'collocation'],
  ['dentro de', 'inside, within', 'collocation'],
  ['fuera de', 'outside of', 'collocation'],
  ['en lugar de', 'instead of', 'collocation'],
  ['en vez de', 'instead of', 'collocation'],
  ['junto a', 'next to, together with', 'collocation'],
  ['gracias a', 'thanks to', 'collocation'],
  ['debido a', 'due to, because of', 'collocation'],
  ['a causa de', 'because of', 'collocation'],
  ['de acuerdo con', 'in accordance with, according to', 'collocation'],
  ['por medio de', 'by means of, through', 'collocation'],
  ['en contra de', 'against', 'collocation'],
  ['a favor de', 'in favour of', 'collocation'],
  ['con respecto a', 'with regard to', 'collocation'],
  ['en cuanto a', 'as for, as regards', 'collocation'],
];

const REFLEXIVE = ['me', 'te', 'se', 'nos', 'os'];

/** Attached-pronoun spellings of an infinitive and its gerund (darse, dándose); used where the engine is not asked. */
function attached(lemma: string): string[] {
  const out = REFLEXIVE.map((c) => `${lemma}${c}`);
  const stem = lemma.slice(0, -2);
  const gerund = lemma.endsWith('ar') ? `${stem.normalize('NFC')}ándo` : lemma.endsWith('er') || lemma.endsWith('ir') ? `${stem}iéndo` : '';
  if (gerund) out.push(...REFLEXIVE.map((c) => `${gerund}${c}`));
  return out;
}

interface Parsed { pattern: string[]; variants: PhraseItem[][]; display: string }

function parseSpec(spec: string, display?: string): Parsed {
  const pattern: string[] = [];
  const base: PhraseItem[] = [];
  let reflexive: { at: number; lemma: string } | undefined;
  for (const raw of spec.split(' ')) {
    let w = raw;
    let gap = false;
    if (w.endsWith('~')) { gap = true; w = w.slice(0, -1); }
    const refl = /^(\p{L}+)\(se\)$/u.exec(w);
    if (refl) { reflexive = { at: base.length, lemma: refl[1] }; w = refl[1]; }
    if (w === '_') { pattern.push('_'); base.push({ slot: true, pos: ['VERB', 'AUX'] }); } else if (w === '*') { pattern.push('_'); base.push({ slot: true }); } else {
      pattern.push(refl ? `${w}se` : w);
      base.push(w);
    }
    if (gap) base.push({ gap: 2, only: ['DET', 'ADJ', 'ADV'] });
  }
  const shown = display ?? spec.replace(/[~]/gu, '').replace(/\((se)\)/gu, '$1').replace(/ _$/u, ' …').replace(/ \*$/u, ' …');
  if (!reflexive) return { pattern, variants: [base], display: shown };
  // pronominal: a reflexive pronoun before the verb, or one attached to it
  const before: PhraseItem[] = [REFLEXIVE, ...base];
  const after: PhraseItem[] = [...base];
  after[reflexive.at] = attached(reflexive.lemma);
  return { pattern, variants: [before, after], display: shown };
}

/** The rules the adapter matches. `normalize` is not needed here: the matcher normalises items itself. */
export function buildPhraseRules(units: readonly Unit[] = PHRASE_UNITS): PhraseRule[] {
  return units.map(([spec, gloss, kind, display]) => {
    const p = parseSpec(spec, display);
    return { pattern: p.pattern, display: p.display, gloss, kind, variants: p.variants };
  });
}

/** Patterns whose last word must be an infinitive or gerund (volver a _): a noun that is also a verb form does not count. */
export const VERB_SLOT_PATTERNS: ReadonlySet<string> = new Set(
  PHRASE_UNITS.filter((u) => u[0].endsWith(' _')).map((u) => parseSpec(u[0]).pattern.join(' ')),
);
