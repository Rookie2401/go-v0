/**
 * Spanish contextual syntax (Linguistic Engine V2, Stage 4): shallow dependency relations for ONE sentence, from the
 * adapter's own readings (lemma, part of speech, gender, number, person) and word order. Pure rules, no data files,
 * deterministic and linear in the sentence length.
 *
 * What it does: noun phrases (article, possessive, number, adjective, name sequences), verb groups (haber + participle,
 * estar + gerund, ir a + infinitive, modal + infinitive, ser/estar + predicate), clauses (que, si, porque, cuando…,
 * relative clauses, indirect questions, "y/pero" clause coordination), subject by person/number agreement (or none: Spanish
 * drops it), objects (personal "a", clitics lo/la/le/me/te/se), prepositional phrases, coordination, vocatives.
 * What it will not do: guess. Where agreement and order leave two readings (subject or object around a verb, passive or
 * reflexive "se", "a Juan" as object or indirect object, a phrase for the noun or the verb) it keeps both in
 * `alternatives` (status 'conflicted'). A word with no reading, or a word the rules cannot place, gets no relation.
 * See docs/ecosystem/linguistics/SYNTAX-es.md.
 */
import type { AnalyzedToken, PartOfSpeech, RawToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';

const ANALYZER = 'spanish-syntax@1';

/* ------------------------------------------------------------------------------------------------ word lists */

const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

const CLITIC_LEMMAS = set('me te se lo la los las le les nos os');
const ACC3 = set('lo la los las');
const DAT3 = set('le les');
const COPULA = set('ser estar');
/** Adverbs that may stand between a finite verb and the verb it governs, or between a clitic and its verb. */
const LIGHT_ADV = set('no nunca jamás ya siempre también tampoco todavía aún casi solo sólo apenas');
const DEGREE_ADV = set('muy más menos tan bastante demasiado poco mucho casi sumamente tanto medio qué cuán');
const TITLES = set('don doña señor señora san santo santa fray sor rey reina');
const DAY_NOUN = set('lunes martes miércoles jueves viernes sábado domingo');
const TIME_NOUN = set('día noche mañana tarde semana mes año vez momento rato hora verano invierno primavera otoño vacaciones lunes martes miércoles jueves viernes sábado domingo tiempo instante minuto segundo');
const PSEUDO_COP = set('poner volver hacer quedar sentir resultar parecer andar seguir permanecer mostrar encontrar');
const MOTION = set('ir venir llegar volver regresar salir entrar subir bajar acercar dirigir viajar caminar correr');
/** "ir a + infinitive", "tener que + infinitive", "empezar a …": the verb, with the word that links it to the infinitive. */
const LINK_A = set('poner empezar comenzar volver ayudar aprender enseñar venir llegar negar decidir ponerse atrever dedicar animar invitar echar romper quedar');
const LINK_DE = set('acabar dejar tratar terminar cesar parar acordar encargar deber');
const LINK_QUE = set('tener haber');
/** Verbs whose modal meaning lets an attached pronoun belong to the infinitive ("lo quiero ver"). */
const CLIMB = set('querer poder deber soler saber necesitar desear preferir empezar comenzar seguir intentar tener acabar volver lograr pensar esperar');
const DITRANSITIVE = set('dar decir enviar mandar escribir contar regalar mostrar ofrecer prestar explicar enseñar pedir preguntar responder contestar prometer entregar devolver vender anunciar predicar rogar suplicar agradecer obedecer servir gustar parecer pertenecer traer hablar orar');
const PSYCH = set('gustar encantar parecer doler faltar importar interesar molestar bastar sobrar quedar convenir apetecer fascinar preocupar agradar');
const SUBJECT_AFTER = set('quedar '+'llegar venir salir nacer morir caer ocurrir suceder pasar existir aparecer entrar volver gustar encantar parecer doler faltar importar interesar molestar bastar sobrar convenir apetecer fascinar preocupar agradar surgir crecer');
const SPEECH = set('decir preguntar responder contestar gritar exclamar añadir replicar clamar');
const COGNITION = set('saber preguntar ver dudar averiguar mirar querer comprobar decir');
const DIRECT_PERSON = set('ver conocer amar querer llamar visitar buscar esperar escuchar oír mirar ayudar abrazar saludar perdonar salvar matar invitar encontrar castigar adorar seguir tentar vencer cuidar juzgar bendecir honrar odiar necesitar recibir acompañar besar curar');
const PRONOMINAL = set('ir quejar arrepentir atrever jactar abstener esforzar fugar ausentar');
const HUMAN = set('papá mamá persona gente hombre mujer niño niña hijo hija padre madre hermano hermana amigo amiga esposo esposa marido señor maestro pastor profesor doctor médico rey pueblo discípulo discípula joven muchacho muchacha chico chica abuelo abuela tío tía primo prima vecino vecina dios jesús cristo mundo enemigo');
const CC_SET = set('y e o u pero sino ni mas');
const SUB_SET = set('que si porque cuando aunque mientras pues como apenas donde');
const REL_WORDS = set('quien quienes cual cuales cuyo cuya cuyos cuyas');
/** Words that can stand before "que" and form one connector with it ("para que", "hasta que", "antes de que"). */
const CONNECT_BEFORE_QUE = set('para sin hasta desde ya así antes después de a en con por al del');
const CONN_ALWAYS = set('para sin hasta desde ya así antes después');
const COMPARATIVE = set('más menos tan tanto tanta tantos tantas mejor peor mayor menor');
const ADV_DE = set('cerca lejos antes después dentro fuera encima debajo delante detrás alrededor junto además enfrente');

/* ------------------------------------------------------------------------------------------------ word view */

interface W {
  i: number;
  s: string;
  n: string;
  lemma: string;
  pos: PartOfSpeech | 'UNK';
  m: Record<string, string>;
  conf: number;
  weak: boolean;
  /** The word list does not know the word: its part of speech was guessed from the position (a rule-inferred verb reading after an article, a preposition or "ser"). */
  guessed?: boolean;
  /** 'fin' | 'inf' | 'ger' | 'part' for a verb form. */
  form: '' | 'fin' | 'inf' | 'ger' | 'part';
  persons: string[];
  numbers: string[];
  parts?: { text: string; role?: string; lemma?: string; pos?: string }[];
}

const feats = (w: W, k: string): string[] => (w.m[k] ? w.m[k]!.split(',') : []);
const hasPos = (w: W | undefined, ...p: string[]): boolean => !!w && p.includes(w.pos);
const NAMES: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Sing: 'singular', Plur: 'plural', '1': '1st person', '2': '2nd person', '3': '3rd person' };
const q = (s: string): string => `“${s}”`;
const SMALL_CAP = /^\p{Lu}/u;

function buildWord(i: number, t: RawToken, a: AnalyzedToken | undefined): W | undefined {
  if (!t.isWord) return undefined;
  const base = { i, s: t.surface, n: t.normalized.toLowerCase() };
  const c = a?.candidates?.[0];
  if (!c || !c.pos) return { ...base, lemma: base.n, pos: 'UNK', m: {}, conf: 0, weak: false, form: '', persons: [], numbers: [] };
  const lemmaStatus = typeof c.notes?.lemmaStatus === 'string' ? c.notes.lemmaStatus : '';
  const weak = !!c.unconfirmed || lemmaStatus.startsWith('inferred') || c.confidence < 0.45;
  const m = c.morph ?? {};
  let form: W['form'] = '';
  if (c.pos === 'VERB' || c.pos === 'AUX') {
    if (m.VerbForm === 'Inf') form = 'inf';
    else if (m.VerbForm === 'Ger') form = 'ger';
    else if (m.VerbForm === 'Part') form = 'part';
    else if (m.VerbForm === 'Fin' || m.Mood || m.Tense || m.Person) form = 'fin';
  }
  const w: W = { ...base, lemma: (c.lemma ?? base.n).toLowerCase(), pos: c.pos, m, conf: c.confidence, weak, form, persons: [], numbers: [] };
  if (c.parts && c.parts.length) w.parts = c.parts.map((p) => ({ text: p.text, ...(p.role ? { role: p.role } : {}), ...(p.lemma ? { lemma: p.lemma } : {}), ...(p.pos ? { pos: p.pos } : {}) }));
  if (form === 'fin') {
    const ps = new Set<string>(), ns = new Set<string>();
    for (const x of a!.candidates) {
      if ((x.pos !== 'VERB' && x.pos !== 'AUX') || (x.lemma ?? '').toLowerCase() !== w.lemma || x.confidence < c.confidence - 0.15) continue;
      for (const p of (x.morph.Person ?? '').split(',')) if (p) ps.add(p);
      for (const p of (x.morph.Number ?? '').split(',')) if (p) ns.add(p);
    }
    w.persons = [...ps]; w.numbers = [...ns];
  }
  return w;
}

/** Gender / number agreement of two words where both are known. */
function agree(a: W, b: W): { ok: boolean; known: boolean; text: string } {
  let ok = true, known = false;
  const shown: string[] = [];
  for (const k of ['Gender', 'Number']) {
    const x = feats(a, k), y = feats(b, k);
    if (!x.length || !y.length) continue;
    known = true;
    const common = x.find((v) => y.includes(v));
    if (!common) ok = false; else shown.push(NAMES[common] ?? '');
  }
  return { ok, known, text: shown.filter(Boolean).join(' ') };
}

const verbDesc = (v: W): string => `${v.persons.map((p) => NAMES[p] ?? p).join(' or ') || 'person unknown'}${v.numbers.length ? ' ' + v.numbers.map((p) => NAMES[p] ?? p).join('/') : ''}`;

/* ------------------------------------------------------------------------------------------------ clause model */

type MarkerKind = 'cc' | 'sub' | 'rel' | 'int' | 'conn' | 'prep';

interface Clause {
  k: number;
  anchor: number;
  /** Lexical verbs in order (the finite verb or its participle/gerund, then infinitives it governs; or the copula predicate). */
  lex: number[];
  /** Infinitives and gerunds that depend on the clause but stand apart from the verb group (para + infinitive). */
  loose: number[];
  pred?: number;
  cop?: number;
  start: number;
  end: number;
  run: { i: number; kind: MarkerKind }[];
  /** Marker runs earlier in the same gap that this clause did not take (a relative clause inside the subject of the next clause). */
  earlier?: { i: number; kind: MarkerKind }[][];
  /** Where the clause's own marker run starts when that is before an embedded relative clause. */
  early?: number;
  kind: 'main' | 'subordinate' | 'relative' | 'coordinate';
  groupEnd: number;
  head: number;
  antecedent?: number;
  /** The relative or question pronoun of the clause, when it has one. */
  wh?: number;
  subject?: number;
  quote?: boolean;
}

interface PP { k: number; p: number }

export function spanishSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const n = tokens.length;
  const S = tokens.map((t) => t.surface);
  const ws: (W | undefined)[] = tokens.map((t, i) => buildWord(i, t, analyses[i]));
  const R: (SyntaxRelation | undefined)[] = new Array<SyntaxRelation | undefined>(n).fill(undefined);
  const notes: string[] = [];
  const wordIdx: number[] = [];
  for (let i = 0; i < n; i++) if (ws[i]) wordIdx.push(i);
  const w = (i: number): W | undefined => (i >= 0 && i < n ? ws[i] : undefined);
  const isPunct = (i: number): boolean => i >= 0 && i < n && !tokens[i]!.isWord && /\S/.test(S[i]!);
  const isComma = (i: number): boolean => isPunct(i) && /^[,;:]$/.test(S[i]!);
  const nextWord = (i: number): number => { for (let j = i + 1; j < n; j++) if (ws[j]) return j; return -1; };
  const prevWord = (i: number): number => { for (let j = i - 1; j >= 0; j--) if (ws[j]) return j; return -1; };

  const LABELS: Record<string, (h: string) => string> = {
    root: () => 'the main word of the sentence', nsubj: (h) => `subject of ${q(h)}`, obj: (h) => `direct object of ${q(h)}`,
    iobj: (h) => `indirect object of ${q(h)}`, obl: (h) => `adverbial phrase of ${q(h)}`, nmod: (h) => `noun phrase that completes ${q(h)}`,
    amod: (h) => `adjective describing ${q(h)}`, det: (h) => `article or determiner of ${q(h)}`, case: (h) => `preposition of ${q(h)}`,
    aux: (h) => `auxiliary of ${q(h)}`, cop: (h) => `“to be” linking ${q(h)} to its subject`, mark: (h) => `word that introduces the clause of ${q(h)}`,
    advmod: (h) => `adverb of ${q(h)}`, advcl: (h) => `adverbial clause of ${q(h)}`, acl: (h) => `clause describing ${q(h)}`, ccomp: (h) => `clause that completes ${q(h)}`,
    xcomp: (h) => `verb that completes ${q(h)}`, conj: (h) => `joined with ${q(h)}`, cc: (h) => `“and / or / but” before the next item of ${q(h)}`,
    nummod: (h) => `number of ${q(h)}`, appos: (h) => `renames ${q(h)}`, vocative: (h) => `person addressed by ${q(h)}`, discourse: (h) => `interjection with ${q(h)}`,
    expl: (h) => `“se” with ${q(h)}, not a separate thing`, flat: (h) => `part of the name ${q(h)}`, punct: () => 'punctuation', dep: (h) => `attached to ${q(h)}`,
  };

  const free = (i: number): boolean => i >= 0 && i < n && !R[i];
  function put(dep: number, head: number | undefined, relation: DependencyRelation, basis: string[], confidence: number, alts?: SyntaxAlternative[], label?: string): boolean {
    if (dep < 0 || dep >= n || R[dep] || dep === head) return false;
    const lab = label ?? (LABELS[relation] ? LABELS[relation]!(head !== undefined ? S[head]! : '') : relation);
    const r: SyntaxRelation = {
      dependent: dep, relation, label: lab, basis: basis.length ? basis : ['rule'], confidence: Math.round(confidence * 100) / 100,
      status: alts && alts.length ? 'conflicted' : 'generated',
    };
    if (head !== undefined) r.head = head;
    if (alts && alts.length) r.alternatives = alts;
    R[dep] = r;
    return true;
  }
  const alt = (relation: DependencyRelation, head: number | undefined, confidence: number, why: string): SyntaxAlternative => ({ relation, ...(head !== undefined ? { head } : {}), confidence, why });

  /* -------------------------------------------------------------------------------- P1: small corrections of the readings */
  for (const i of wordIdx) {
    const x = ws[i]!;
    const nx = w(nextWord(i));
    // a rule-inferred verb reading that cannot be a verb where it stands: after an article or a preposition it is a noun, after "ser/estar" an adjective
    if (x.weak && (x.pos === 'VERB' || x.pos === 'AUX') && x.form !== 'inf') {
      const pj = prevWord(i);
      const pw0 = w(pj);
      let k = pj;
      while (k >= 0 && ws[k] && ws[k]!.pos === 'ADV' && (LIGHT_ADV.has(ws[k]!.n) || DEGREE_ADV.has(ws[k]!.n))) k = prevWord(k);
      const copBefore = k >= 0 && ws[k] && (ws[k]!.pos === 'AUX' || ws[k]!.pos === 'VERB') && ws[k]!.form === 'fin' && COPULA.has(ws[k]!.lemma) && !ws[k]!.weak;
      if (pw0 && pj === i - 1 && (pw0.pos === 'DET' || pw0.pos === 'ADP' || pw0.pos === 'NUM' || (pw0.pos === 'PRON' && (pw0.m.PronType === 'Dem' || pw0.m.Poss === 'Yes')) || (pw0.pos === 'ADJ' && !copBefore) || ['mucho', 'poco', 'tanto', 'bastante', 'demasiado', 'más', 'menos', 'otro', 'varios'].includes(pw0.lemma))) { if (pw0.pos === 'PRON') pw0.pos = 'DET'; x.pos = 'NOUN'; x.m = {}; x.weak = false; x.guessed = true; x.form = ''; }
      else if (copBefore) { x.pos = 'ADJ'; x.m = {}; x.weak = false; x.guessed = true; x.form = ''; }
    }
    // "todo aquel que", "mucha gente": a quantifier read as a pronoun, directly before an article, demonstrative or noun, is a determiner
    if (x.pos === 'PRON' && ['todo', 'mucho', 'poco', 'otro', 'tanto', 'vario', 'cierto', 'ambos'].includes(x.lemma) && nextWord(i) === i + 1 && (hasPos(nx, 'NOUN', 'PROPN') || (hasPos(nx, 'DET') && nx!.n !== 'que'))) x.pos = 'DET';
    // "qué libro", "cuánta gente": a question word before a noun is a determiner
    if (x.pos === 'PRON' && x.m.PronType === 'Int' && hasPos(nx, 'NOUN', 'PROPN') && /^(qué|cuál|cuánt)/.test(x.n) && w(prevWord(i))?.n !== 'por') x.pos = 'DET';
    if (x.pos === 'ADV' && x.m.PronType === 'Int' && /^cuánt/.test(x.n) && hasPos(nx, 'NOUN')) x.pos = 'DET';
    // neuter "lo bueno": not a clitic
    if (x.lemma === 'lo' && x.pos === 'PRON' && hasPos(nx, 'ADJ')) x.pos = 'DET';
    // "aquella tierra", "esos días": a demonstrative read as a pronoun, directly before its noun
    if (x.pos === 'PRON' && x.m.PronType === 'Dem' && hasPos(nx, 'NOUN', 'PROPN') && nextWord(i) === i + 1) x.pos = 'DET';
    // "da gracias", "dio las gracias": the noun after a verb of giving
    if (x.pos === 'INTJ' && x.n === 'gracias' && w(prevWord(i))?.form === 'fin' && ['dar', 'decir', 'rendir'].includes(w(prevWord(i))!.lemma)) { x.pos = 'NOUN'; x.m = { Number: 'Plur' }; }
    // "..., joven": the adjective used as a noun of address
    if (x.pos === 'ADJ' && x.n === 'joven' && isPunct(i - 1) && S[i - 1] === ',' && (i + 1 >= n || isPunct(i + 1))) { x.pos = 'NOUN'; x.m = { Number: 'Sing' }; }
    // "las gracias": an interjection read after an article is the noun
    if (x.pos === 'INTJ' && hasPos(w(prevWord(i)), 'DET') && prevWord(i) === i - 1) { x.pos = 'NOUN'; x.m = { Number: 'Plur' }; }
    // "¿Cuánto es?": a question word that is a determiner in the word list but has no noun after it is a pronoun
    if (x.pos === 'DET' && x.m.PronType === 'Int' && !hasPos(nx, 'NOUN', 'PROPN', 'ADJ')) x.pos = 'PRON';
    // "¡Qué bien!": an exclamation word before an adjective or adverb strengthens it
    if ((x.n === 'qué' || x.n === 'cuán') && hasPos(nx, 'ADJ', 'ADV') && nextWord(i) === i + 1 && nx!.m.PronType !== 'Int' && !LIGHT_ADV.has(nx!.n)) { x.pos = 'ADV'; x.m = { ...x.m, PronType: 'Exc' }; }
    // "y la guardó": an article form directly before a finite verb is the object pronoun
    if (x.pos === 'DET' && ACC3.has(x.n) && x.m.PronType === 'Art' && hasPos(nx, 'VERB', 'AUX') && nx!.form === 'fin' && nextWord(i) === i + 1 && nx!.pos !== 'NOUN') { x.pos = 'PRON'; x.m = { Person: '3', Case: 'Acc', PronType: 'Prs' }; }
  }
  /** A pronoun that is a clitic: lo/la/le/me/te/se/nos/os directly before a verb (other clitics and light adverbs may stand between). */
  const clitic = new Array<boolean>(n).fill(false);
  for (const i of wordIdx) {
    const x = ws[i]!;
    if (x.pos !== 'PRON' || !CLITIC_LEMMAS.has(x.lemma) || !CLITIC_LEMMAS.has(x.n)) continue;
    let j = nextWord(i);
    while (j >= 0 && ((ws[j]!.pos === 'ADV' && LIGHT_ADV.has(ws[j]!.n)) || (ws[j]!.pos === 'PRON' && CLITIC_LEMMAS.has(ws[j]!.n)))) j = nextWord(j);
    if (hasPos(w(j), 'VERB', 'AUX')) clitic[i] = true;
  }

  /* -------------------------------------------------------------------------------- P2: noun phrases */
  const promoted = new Set<number>();
  const isCop = (i: number): boolean => { const x = w(i); return !!x && (x.pos === 'AUX' || x.pos === 'VERB') && x.form === 'fin' && COPULA.has(x.lemma) && !x.weak; };
  const nomHead = (i: number): boolean => {
    const x = w(i);
    if (!x) return false;
    if (promoted.has(i)) return true;
    if (x.pos === 'NOUN' || x.pos === 'PROPN') return true;
    if (x.pos === 'PRON') return !clitic[i];
    return false;
  };
  // determiners with no noun after them: "el que", "los buenos", "lo bueno", "todos", "muchos"
  for (const i of wordIdx) {
    const x = ws[i]!;
    if (x.pos !== 'DET') continue;
    if (prevWord(i) === i - 1 && hasPos(w(i - 1), 'DET')) continue; // handled from the first determiner of the run
    let j = i, last = i;
    while (j < n) {
      const y = w(j);
      if (!y) break;
      if (y.pos === 'DET' || y.pos === 'NUM' || y.pos === 'ADJ' || (y.pos === 'ADV' && DEGREE_ADV.has(y.n) && hasPos(w(j + 1), 'ADJ'))) { last = j; j++; continue; }
      break;
    }
    const after = w(j);
    if (hasPos(after, 'NOUN', 'PROPN')) continue;
    const lastW = w(last)!;
    if (lastW.pos === 'ADJ' || lastW.pos === 'NUM') { promoted.add(last); continue; }
    if (after && ['que', 'cual', 'cuales', 'de', 'quien'].includes(after.n)) { promoted.add(last); continue; }
    if (['todo', 'mucho', 'otro', 'ninguno', 'alguno', 'uno', 'poco', 'tanto', 'este', 'ese', 'aquel', 'cuanto', 'vario', 'ambos'].includes(lastW.lemma)) promoted.add(last);
  }
  const chunkOf = new Array<number>(n).fill(-1);
  const chunkEnd = new Array<number>(n).fill(-1);
  const chunkStart = new Array<number>(n).fill(-1);
  const afterCop = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && ws[j] && ws[j]!.pos === 'ADV' && (LIGHT_ADV.has(ws[j]!.n) || DEGREE_ADV.has(ws[j]!.n))) j--;
    return j >= 0 && isCop(j);
  };
  const detCheck = (d: W, h: W): { ok: boolean; note: string; sure: boolean } => {
    const a = agree(d, h);
    if (a.ok) return { ok: true, sure: a.known, note: a.known ? `${q(d.s)} and ${q(h.s)} agree (${a.text})` : `${q(d.s)} stands directly before ${q(h.s)} (the rules know no gender or number for one of them)` };
    if (/^(el|un|algún|ningún|este|ese|aquel)$/.test(d.n) && /^h?[aá]/.test(h.n) && feats(h, 'Gender').includes('Fem')) return { ok: true, sure: true, note: `${q(d.s)} before the feminine ${q(h.s)} (a stressed a-: the masculine form is used)` };
    return { ok: false, sure: false, note: `${q(d.s)} and ${q(h.s)} do not agree in gender or number` };
  };
  for (const h of wordIdx) {
    if (!nomHead(h) || (chunkOf[h] >= 0 && chunkOf[h] !== h)) continue;
    const hw = ws[h]!;
    chunkOf[h] = h; chunkEnd[h] = h; chunkStart[h] = h;
    const pronOnly = hw.pos === 'PRON' && !promoted.has(h); // pronouns take no article
    // left: determiners, numbers, prenominal adjectives (and degree adverbs of those)
    let j = pronOnly ? -1 : h - 1;
    const left: number[] = [];
    while (j >= 0 && ws[j] && chunkOf[j] < 0 && !nomHead(j)) {
      const y = ws[j]!;
      if (y.pos === 'DET' || y.pos === 'NUM') { left.push(j); j--; continue; }
      if (y.pos === 'ADJ' && !afterCop(j) && !left.some((z) => ws[z]!.pos === 'DET' || ws[z]!.pos === 'NUM')) { left.push(j); j--; continue; }
      if (y.pos === 'ADV' && DEGREE_ADV.has(y.n) && left.length && ws[left[left.length - 1]!]!.pos === 'ADJ') { left.push(j); j--; continue; }
      break;
    }
    for (const l of left) {
      const y = ws[l]!;
      if (y.pos === 'DET') {
        const fd = detCheck(y, hw);
        put(l, h, 'det', [fd.note, y.m.Poss === 'Yes' ? 'possessive before the noun' : 'article or determiner before the noun'], fd.ok ? (fd.sure ? 0.92 : 0.8) : 0.45);
      } else if (y.pos === 'NUM') {
        put(l, h, 'nummod', [`number ${q(y.s)} directly before ${q(hw.s)}`], 0.85);
      } else if (y.pos === 'ADJ') {
        const a = agree(y, hw);
        put(l, h, 'amod', [a.known ? `${q(y.s)} (before the noun) agrees with ${q(hw.s)} (${a.text})` : `${q(y.s)} directly before ${q(hw.s)}`], a.ok ? 0.8 : 0.45);
      } else if (y.pos === 'ADV') {
        const adjIdx = left.find((z) => ws[z]!.pos === 'ADJ' && z > l);
        if (adjIdx !== undefined) put(l, adjIdx, 'advmod', [`${q(y.s)} strengthens the adjective ${q(S[adjIdx]!)}`], 0.85);
      }
      chunkOf[l] = h;
      chunkStart[h] = Math.min(chunkStart[h]!, l);
    }
    // right: adjectives, numbers; names in a row
    let k = h + 1;
    while (k < n) {
      const y = ws[k];
      if (!y || chunkOf[k] >= 0) break;
      if (y.pos === 'ADV' && DEGREE_ADV.has(y.n) && hasPos(w(k + 1), 'ADJ') && agree(ws[k + 1]!, hw).ok) {
        put(k, k + 1, 'advmod', [`${q(y.s)} strengthens the adjective ${q(S[k + 1]!)}`], 0.85); chunkOf[k] = h; k++; continue;
      }
      if (pronOnly && !(y.lemma === 'mismo' && (y.pos === 'ADJ' || y.pos === 'DET'))) break;
      if ((y.pos === 'ADJ' || (pronOnly && y.pos === 'DET')) && free(k) && !nomHead(k)) {
        const a = agree(y, hw);
        if (!a.ok) break;
        put(k, h, 'amod', [a.known ? `${q(y.s)} (after the noun) agrees with ${q(hw.s)} (${a.text})` : `${q(y.s)} directly after ${q(hw.s)}`], a.known ? 0.85 : 0.65);
        chunkOf[k] = h; chunkEnd[h] = k; k++; continue;
      }
      if (y.pos === 'NUM' && free(k) && hw.pos === 'NOUN' && !nomHead(k)) {
        put(k, h, 'nummod', [`number ${q(y.s)} directly after ${q(hw.s)}`], 0.6); chunkOf[k] = h; chunkEnd[h] = k; k++; continue;
      }
      if ((y.pos === 'PROPN' || (y.pos === 'NOUN' && TITLES.has(hw.n))) && (hw.pos === 'PROPN' || TITLES.has(hw.n)) && k === chunkEnd[h]! + 1 && SMALL_CAP.test(y.s)) {
        put(k, h, 'flat', [`${q(y.s)} follows the name ${q(hw.s)} without a break: one name`], 0.8); chunkOf[k] = h; chunkEnd[h] = k; k++; continue;
      }
      if (y.pos === 'PROPN' && hw.pos === 'NOUN' && HUMAN.has(hw.lemma) && k === h + 1 && SMALL_CAP.test(y.s)) {
        put(k, h, 'appos', [`the name ${q(y.s)} directly after the noun ${q(hw.s)} names it`], 0.65); chunkOf[k] = h; chunkEnd[h] = k; k++; continue;
      }
      break;
    }
  }

  /* -------------------------------------------------------------------------------- P3: verb groups */
  const groupNext = (from: number): number => {
    let j = from + 1;
    while (j < n && ws[j] && (clitic[j] || (ws[j]!.pos === 'ADV' && LIGHT_ADV.has(ws[j]!.n)))) j++;
    return j < n && ws[j] ? j : -1;
  };
  const clauses: Clause[] = [];
  const inChain = new Array<boolean>(n).fill(false);

  /** The predicate after ser/estar. */
  function findPredicate(c: number): { head: number; caseTok?: number; end: number } | undefined {
    let j = c + 1;
    while (j < n && ws[j] && (clitic[j] || (ws[j]!.pos === 'ADV' && (LIGHT_ADV.has(ws[j]!.n) || (DEGREE_ADV.has(ws[j]!.n) && hasPos(w(j + 1), 'ADJ', 'ADV')))))) j++;
    const t = w(j);
    if (!t) return undefined;
    if (chunkOf[j] >= 0) { const hd = chunkOf[j]!; return { head: hd, end: chunkEnd[hd]! }; }
    if (t.pos === 'ADJ' || (t.form === 'part' && !t.weak)) return { head: j, end: j };
    if (t.form === 'inf' && !t.weak && j + 1 < n) return { head: j, end: j };
    if (t.pos === 'ADP') {
      const o = w(j + 1);
      if (o && chunkOf[j + 1] >= 0) { const hd = chunkOf[j + 1]!; return { head: hd, caseTok: j, end: chunkEnd[hd]! }; }
      if (o && (o.pos === 'ADV' || o.pos === 'PRON') && !clitic[j + 1]) return { head: j + 1, caseTok: j, end: j + 1 };
    }
    if (t.pos === 'ADV' && !LIGHT_ADV.has(t.n) && t.m.PronType !== 'Int') return { head: j, end: j };
    if (t.weak && t.pos !== 'UNK' && t.pos !== 'VERB' && t.pos !== 'AUX') return { head: j, end: j };
    return undefined;
  }

  const anchors: number[] = [];
  for (const i of wordIdx) {
    const x = ws[i]!;
    if ((x.pos === 'VERB' || x.pos === 'AUX') && x.form === 'fin' && !x.weak) anchors.push(i);
  }
  if (!anchors.length) for (const i of wordIdx) { const x = ws[i]!; if ((x.pos === 'VERB' || x.pos === 'AUX') && x.form === 'fin') { anchors.push(i); break; } }

  for (const a of anchors) {
    if (inChain[a]) continue;
    const x = ws[a]!;
    const cl: Clause = { k: clauses.length, anchor: a, lex: [], loose: [], start: 0, end: n - 1, run: [], kind: 'main', groupEnd: a, head: a };
    inChain[a] = true;
    let cur = a;
    let curLex = a;
    const nxt = groupNext(cur);
    const nx = w(nxt);
    const L = x.lemma;
    const takeAux = (tok: number, why: string, conf: number): void => {
      put(a, tok, 'aux', [why], conf);
      inChain[tok] = true; curLex = tok; cur = tok; cl.groupEnd = tok; cl.lex.push(tok);
    };
    if (L === 'haber' && x.n !== 'hay' && nx && nx.form === 'part' && nx.pos !== 'ADJ') takeAux(nxt, `${q(x.s)} is “haber” followed by the participle ${q(nx.s)}: a compound past tense`, 0.92);
    else if (L === 'estar' && nx && nx.form === 'ger') takeAux(nxt, `${q(x.s)} is “estar” followed by the gerund ${q(nx.s)}: “is doing”`, 0.92);
    else if (L === 'ser' && nx && nx.form === 'part' && nx.pos !== 'ADJ') takeAux(nxt, `${q(x.s)} is “ser” followed by the participle ${q(nx.s)}: the passive (“is done”)`, 0.85);
    else if (L === 'ir' && nx && nx.n === 'a' && nx.pos === 'ADP' && w(groupNext(nxt))?.form === 'inf') {
      const inf = groupNext(nxt);
      put(a, inf, 'aux', [`${q(x.s)} + a + infinitive ${q(S[inf]!)}: “going to …”, the near future`], 0.88);
      put(nxt, inf, 'mark', [`${q('a')} links “ir” to the infinitive ${q(S[inf]!)}`], 0.85);
      inChain[inf] = true; inChain[nxt] = true; curLex = inf; cur = inf; cl.groupEnd = inf; cl.lex.push(inf);
    } else if (COPULA.has(L)) {
      let p = findPredicate(a);
      // "¿Qué es esto?": a question pronoun at the start, then a noun phrase: the pronoun is the predicate and the noun phrase the subject
      {
        const pw0 = prevWord(a), pr0 = w(pw0);
        let only0 = pw0 >= 0;
        for (let z = 0; z < pw0; z++) if (ws[z]) only0 = false;
        if (pr0 && pr0.pos === 'PRON' && pr0.m.PronType === 'Int' && only0 && p && p.head > a && (nomHead(p.head) && !hasPos(w(p.head), 'ADJ'))) p = undefined;
      }
      if (p && p.head > a) {
        cl.pred = p.head; cl.cop = a; cl.groupEnd = Math.max(p.end, a);
        cl.lex.push(p.head);
        put(a, p.head, 'cop', [`${q(x.s)} is a form of “${L}” followed by ${q(S[p.head]!)}: the predicate`], 0.9);
        if (p.caseTok !== undefined) put(p.caseTok, p.head, 'case', [`${q(S[p.caseTok]!)} introduces the predicate ${q(S[p.head]!)}`], 0.85);
        inChain[p.head] = true;
        if (p.caseTok !== undefined) inChain[p.caseTok] = true;
      } else {
        // "¿Qué es eso?", "¿Quién es él?": a question pronoun at the start is the predicate
        const pw = prevWord(a);
        const pr = w(pw);
        let onlyPunctBefore = pw >= 0;
        for (let z = 0; z < pw; z++) if (ws[z]) onlyPunctBefore = false;
        if (pr && pr.pos === 'PRON' && pr.m.PronType === 'Int' && onlyPunctBefore && free(pw) && !clitic[pw]) {
          cl.pred = pw; cl.cop = a; cl.lex.push(pw);
          put(a, pw, 'cop', [`${q(x.s)} is a form of “${L}” and the question word ${q(S[pw]!)} before it is what is asked about: the predicate`], 0.8);
          inChain[pw] = true;
        } else cl.lex.push(a);
      }
    } else cl.lex.push(a);
    // xcomp chain (only from a lexical verb, not from the copula predicate)
    if (!cl.cop) {
      let guard = 0;
      /** Add the infinitive at j to the group; a copular infinitive (ser, estar) takes its predicate as the complement. */
      const addInf = (j: number, markTok: number | undefined, why: string, conf: number): 'go' | 'stop' => {
        const t = ws[j]!, lx = ws[curLex]!;
        if (COPULA.has(t.lemma) && !t.weak) {
          const p = findPredicate(j);
          if (p && p.head > j) {
            put(p.head, curLex, 'xcomp', [`${q(lx.s)} is followed by “${t.lemma}” and ${q(S[p.head]!)}: what ${q(lx.s)} wants, can or becomes`], conf - 0.04);
            put(j, p.head, 'cop', [`${q(t.s)} is the infinitive of “${t.lemma}” followed by ${q(S[p.head]!)}`], 0.85);
            if (markTok !== undefined) put(markTok, p.head, 'mark', [`${q(S[markTok]!)} links ${q(lx.s)} to ${q(S[p.head]!)}`], 0.8);
            if (p.caseTok !== undefined) put(p.caseTok, p.head, 'case', [`${q(S[p.caseTok]!)} introduces ${q(S[p.head]!)}`], 0.85);
            inChain[j] = true; inChain[p.head] = true; if (markTok !== undefined) inChain[markTok] = true;
            cl.groupEnd = p.end; cl.lex.push(p.head);
            return 'stop';
          }
        }
        put(j, curLex, 'xcomp', [why], conf);
        if (markTok !== undefined) { put(markTok, j, 'mark', [`${q(S[markTok]!)} links ${q(lx.s)} to the infinitive ${q(t.s)}`], 0.8); inChain[markTok] = true; }
        inChain[j] = true; cl.groupEnd = j; cl.lex.push(j); curLex = j; cur = j;
        return 'go';
      };
      while (guard++ < 4) {
        const lx = ws[curLex]!;
        const j = groupNext(cur);
        const t = w(j);
        if (!t) break;
        if (t.form === 'inf' && !inChain[j]) {
          const done = addInf(j, undefined, `the infinitive ${q(t.s)} follows ${q(lx.s)} directly: what ${q(lx.s)} wants, can or begins to do`, 0.82);
          if (done === 'stop') break;
          continue;
        }
        if (t.form === 'ger' && !inChain[j] && lx.lemma !== 'estar') {
          put(j, curLex, 'xcomp', [`the gerund ${q(t.s)} follows ${q(lx.s)} directly`], 0.6);
          inChain[j] = true; cl.groupEnd = j; cl.lex.push(j); curLex = j; cur = j; continue;
        }
        const link = (t.pos === 'ADP' && (t.n === 'a' || t.n === 'de')) || (t.n === 'que' && t.pos === 'SCONJ');
        if (link) {
          const j2 = groupNext(j);
          const inf = w(j2);
          const lemmaOk = t.n === 'a' ? LINK_A.has(lx.lemma) : t.n === 'de' ? LINK_DE.has(lx.lemma) : LINK_QUE.has(lx.lemma);
          if (inf && inf.form === 'inf' && !inChain[j2] && lemmaOk) {
            const done = addInf(j2, j, `${q(lx.s)} ${q(t.s)} + infinitive ${q(inf.s)}: a fixed pairing (${lx.lemma} ${t.n} …)`, 0.8);
            if (done === 'stop') break;
            continue;
          }
        }
        break;
      }
    }
    cl.head = cl.lex[0] ?? a;
    clauses.push(cl);
  }

  /* -------------------------------------------------------------------------------- P4: clause boundaries and ownership */
  const markerKind = (i: number): MarkerKind | undefined => {
    const x = w(i);
    if (!x || R[i] || inChain[i]) return undefined;
    if (x.pos === 'CONJ' && CC_SET.has(x.n)) return 'cc';
    if (x.m.PronType === 'Int' && (x.pos === 'PRON' || x.pos === 'ADV')) return 'int';
    if (REL_WORDS.has(x.n) && x.pos !== 'NOUN') return 'rel';
    if ((x.pos === 'SCONJ' || (x.pos === 'ADV' && ['cuando', 'donde', 'mientras', 'como', 'apenas'].includes(x.n))) && SUB_SET.has(x.n)) return 'sub';
    return undefined;
  };
  const nominalEndsAt = (i: number): number => { // head of the noun phrase that ends at token i (skipping one comma), or -1
    let j = i;
    if (isComma(j)) j--;
    while (j >= 0 && isPunct(j) && !isComma(j)) j--;
    if (j < 0 || chunkOf[j] < 0) return -1;
    const h = chunkOf[j]!;
    return chunkEnd[h] === j ? h : -1;
  };

  for (const cl of clauses) {
    const gapStart = cl.k === 0 ? 0 : clauses[cl.k - 1]!.groupEnd + 1;
    const gapEnd = cl.anchor - 1;
    // marker runs in the gap: contiguous marker tokens
    const runs: { i: number; kind: MarkerKind }[][] = [];
    let cur: { i: number; kind: MarkerKind }[] = [];
    for (let i = gapStart; i <= gapEnd; i++) {
      let kind = markerKind(i);
      if (!kind && w(i) && (w(i)!.pos === 'ADP' || w(i)!.pos === 'ADV') && CONNECT_BEFORE_QUE.has(w(i)!.n)) {
        // "para que", "hasta que", "antes de que": connector words before a "que"; "en que", "al que": a preposition before a relative word
        let j = i + 1;
        while (j <= gapEnd && w(j) && CONNECT_BEFORE_QUE.has(w(j)!.n) && !markerKind(j)) j++;
        const whMark = j <= gapEnd ? markerKind(j) : undefined;
        const alwaysConn = CONN_ALWAYS.has(w(i)!.n);
        if (w(i)!.n === 'en' && w(i + 1)?.n === 'cuanto' && i + 1 < cl.anchor) { cur.push({ i, kind: 'conn' }); cur.push({ i: i + 1, kind: 'conn' }); i++; continue; }
        if (j <= gapEnd && whMark === 'sub' && w(j)?.n !== 'que') kind = 'conn';
        else if (j <= gapEnd && whMark === 'sub' && w(j)?.n === 'que') kind = alwaysConn || w(i)!.pos === 'ADV' || nominalEndsAt(i - 1) < 0 ? 'conn' : 'prep';
        else if (j <= gapEnd && (whMark === 'rel' || whMark === 'int') && w(i)!.pos === 'ADP') kind = 'prep';
        else if (j === cl.anchor || (j < cl.anchor && w(i)!.pos === 'ADP' && alwaysConn && [...Array(cl.anchor - j).keys()].every((z) => clitic[j + z] || (ws[j + z]?.pos === 'ADV' && LIGHT_ADV.has(ws[j + z]!.n))))) { if (alwaysConn && w(i)!.pos === 'ADP') kind = 'conn'; }
      }
      if (kind) { cur.push({ i, kind }); } else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    // the last run that can start a clause: a coordinating word alone is only a clause boundary if no comma follows it before the verb
    let chosen: { i: number; kind: MarkerKind }[] | undefined;
    for (let r = runs.length - 1; r >= 0; r--) {
      const run = runs[r]!;
      const last = run[run.length - 1]!.i;
      const onlyCc = run.every((x) => x.kind === 'cc');
      let comma = false;
      for (let i = last + 1; i <= gapEnd; i++) if (isPunct(i) || markerKind(i) === 'cc') comma = true;
      if (onlyCc && (comma || cl.k === 0) && !(cl.k === 0 && run[0]!.i === wordIdx[0])) continue;
      // a "que" with a connector word before it that is really part of the previous clause (a verb's own preposition) is accepted as is
      chosen = run;
      break;
    }
    if (chosen) {
      cl.earlier = runs.slice(0, runs.indexOf(chosen));
      cl.run = chosen;
      cl.start = chosen[0]!.i;
      if (cl.start > 0 && isComma(cl.start - 1) && cl.k > 0) cl.start--;
    } else if (cl.k === 0) cl.start = 0;
    else {
      let lastComma = -1;
      for (let i = gapEnd; i >= gapStart; i--) if (isComma(i) || (isPunct(i) && /^[—–»”]$/.test(S[i]!))) { lastComma = i; break; }
      if (lastComma >= 0) cl.start = lastComma;
      else {
        let bare = -1;
        for (let i = gapEnd; i >= gapStart; i--) {
          if (!nomHead(i) || chunkOf[i] !== i) continue;
          const cs = chunkStart[i]!;
          if (hasPos(w(cs - 1), 'ADP')) { i = cs; continue; }
          bare = cs; break;
        }
        if (bare >= 0) cl.start = bare;
        else { let s = cl.anchor; while (s - 1 >= gapStart && w(s - 1) && (clitic[s - 1] || (ws[s - 1]!.pos === 'ADV' && LIGHT_ADV.has(ws[s - 1]!.n)))) s--; cl.start = s; }
      }
    }
    // kind
    const kinds = cl.run.map((x) => x.kind);
    if (kinds.includes('rel') || kinds.includes('int') || kinds.includes('sub')) {
      const first = cl.run.find((x) => x.kind === 'rel' || x.kind === 'int' || x.kind === 'sub')!;
      const runStart = cl.run[0]!.i;
      const pre = nominalEndsAt(runStart - 1);
      const isQue = ws[first.i]!.n === 'que';
      const sentenceInit = prevWord(runStart) < 0 || (cl.k === 0 && !w(prevWord(runStart)));
      if ((first.kind === 'rel' || (first.kind === 'sub' && (isQue || ws[first.i]!.n === 'donde'))) && pre >= 0 && !sentenceInit) {
        // comparative or abstract "que" after a noun is not a relative clause
        let cmp = false;
        for (let i = gapStart; i < runStart; i++) if (w(i) && COMPARATIVE.has(w(i)!.n)) cmp = true;
        if (!cmp && !kinds.includes('conn')) { cl.kind = 'relative'; cl.antecedent = pre; }
        else cl.kind = 'subordinate';
      } else cl.kind = 'subordinate';
      if (first.kind === 'int' && cl.k === 0) cl.kind = 'main';
    } else if (kinds.includes('conn')) cl.kind = 'subordinate';
    else if (kinds.includes('cc')) cl.kind = 'coordinate';
    else cl.kind = 'main';
  }

  // a relative clause inside the subject of a later clause: the connector before it ("para que todo aquel que cree …") belongs to that later clause
  for (const cl of clauses) {
    if (cl.kind !== 'relative' || !cl.earlier?.length) continue;
    const host = clauses.slice(cl.k + 1).find((c) => c.kind !== 'relative');
    const er = cl.earlier[cl.earlier.length - 1]!;
    if (!host || host.run.length || !er.some((x) => x.kind === 'sub' || x.kind === 'conn' || x.kind === 'cc')) continue;
    host.run = er; host.early = er[0]!.i;
    const kk = er.map((x) => x.kind);
    host.kind = kk.includes('sub') || kk.includes('conn') ? 'subordinate' : 'coordinate';
  }
  // the relative pronoun of a clause (its role is set with the clause's arguments)
  for (const cl of clauses) {
    for (const r of cl.run) {
      const x = ws[r.i]!;
      if (cl.kind === 'relative' && (r.kind === 'rel' || r.kind === 'sub') && (x.n === 'que' || x.pos === 'PRON')) { cl.wh = r.i; break; }
      if (r.kind === 'int' && x.pos === 'PRON') { cl.wh = r.i; break; }
    }
  }

  // ownership: which clause every token belongs to
  const owner = new Array<number>(n).fill(-1);
  {
    const firstMain = clauses.findIndex((c) => c.kind === 'main');
    for (const cl of clauses) {
      const next = clauses[cl.k + 1];
      cl.end = next ? next.start - 1 : n - 1;
      if (cl.kind === 'relative') {
        let e = cl.end;
        for (let i = cl.groupEnd + 1; i <= cl.end; i++) if (isComma(i)) { e = i - 1; break; }
        const tail = next ? e < next.start - 1 : false;
        for (let i = cl.start; i <= e; i++) owner[i] = cl.k;
        if (tail && next) for (let i = e + 1; i < next.start; i++) owner[i] = next.k;
        cl.end = e;
      } else {
        for (let i = cl.start; i <= cl.end; i++) if (owner[i] < 0) owner[i] = cl.k;
      }
    }
    if (clauses.length) {
      const first = clauses[0]!;
      const target = firstMain >= 0 && clauses[firstMain]!.start > 0 ? (clauses[firstMain]!.k > first.k ? clauses[firstMain]!.k : first.k) : first.k;
      for (let i = 0; i < first.start; i++) if (owner[i] < 0) owner[i] = target;
      for (let i = 0; i < n; i++) if (owner[i] < 0) owner[i] = clauses[clauses.length - 1]!.k;
    }
  }
  for (const host of clauses) {
    if (host.early === undefined) continue;
    const rel = clauses.find((c) => c.kind === 'relative' && c.k < host.k && c.start > host.early!);
    if (rel) for (let i = host.early; i < rel.start; i++) if (owner[i] !== host.k) owner[i] = host.k;
  }
  const owns = (cl: Clause, i: number): boolean => owner[i] === cl.k;

  /* -------------------------------------------------------------------------------- P5: arguments, phrases, links */
  const targetsOf = (cl: Clause): number[] => [...(cl.lex.length ? cl.lex : [cl.anchor]), ...cl.loose].sort((x, y) => x - y);
  const leftTarget = (cl: Clause, i: number): number | undefined => { const t = targetsOf(cl).filter((x) => x < i); return t.length ? t[t.length - 1] : undefined; };
  const rightTarget = (cl: Clause, i: number): number | undefined => targetsOf(cl).find((x) => x > i);
  const nearTarget = (cl: Clause, i: number): number => leftTarget(cl, i) ?? rightTarget(cl, i) ?? cl.head;
  const coordPlural = new Set<number>();
  const isPPObj = new Set<number>();
  const pps: PP[] = [];
  const predSet = new Set<number>();
  for (const cl of clauses) if (cl.pred !== undefined) predSet.add(cl.pred);
  const looseInf = new Set<number>();

  for (const cl of clauses) {
    const a = cl.anchor;
    const av = ws[a]!;
    const H = cl.head;
    const Hw = ws[H]!;
    const lv = ws[cl.lex[0] ?? a]!;
    const hay = av.n === 'hay' || (av.lemma === 'haber' && !cl.lex.length);
    void Hw;
    const own = (i: number): boolean => owns(cl, i);
    const ownedIdx: number[] = [];
    for (let i = 0; i < n; i++) if (owner[i] === cl.k) ownedIdx.push(i);

    // --- B: prepositional phrases (case)
    for (const i of ownedIdx) {
      const x = ws[i];
      if (!x || !(x.pos === 'ADP' || ((x.n === 'como' || x.n === 'según') && x.pos !== 'VERB' && x.pos !== 'AUX')) || !own(i) || R[i] || inChain[i]) continue;
      if (cl.run.some((r) => r.i === i)) continue;
      const o = w(i + 1);
      if (!o) continue;
      if (o.form === 'inf' && !inChain[i + 1]) { looseInf.add(i + 1); continue; }
      let p = -1;
      if (chunkOf[i + 1] >= 0) p = chunkOf[i + 1]!;
      else if (o.pos === 'ADV' && !LIGHT_ADV.has(o.n)) p = i + 1;
      else if (o.pos === 'PRON' && !clitic[i + 1]) p = i + 1;
      else if (o.pos === 'ADJ' && free(i + 1)) p = i + 1;
      if (p < 0 || predSet.has(p) && cl.pred === p) continue;
      put(i, p, 'case', [x.parts ? `${q(x.s)} = ${x.parts.map((z) => z.text).join(' + ')}: the preposition, with the article joined to it` : `${q(x.s)} directly before ${q(S[p]!)}`], x.pos === 'ADP' ? 0.9 : 0.6);
      if (!isPPObj.has(p) && o.pos !== 'ADJ') pps.push({ k: i, p }); else if (!isPPObj.has(p)) pps.push({ k: i, p });
      isPPObj.add(p);
    }
    // the preposition of the predicate (est. "está en la mesa") and of a relative / question word
    if (cl.pred !== undefined && R[cl.pred] === undefined) { /* the predicate keeps its own relation (root, ccomp …) */ }

    // --- C: coordination inside the clause (nouns, adjectives, adverbs, infinitives)
    for (const c of ownedIdx) {
      const cx = ws[c];
      if (!cx || cx.pos !== 'CONJ' || !CC_SET.has(cx.n) || !own(c) || R[c] || cl.run.some((r) => r.i === c)) continue;
      let j = nextWord(c);
      while (j >= 0 && j === c + 1 + (j - c - 1) && ws[j]!.pos === 'ADV' && ['también', 'tampoco', 'siempre', 'nunca', 'ya', 'solo', 'sólo'].includes(ws[j]!.n) && nextWord(j) === j + 1) j = nextWord(j);
      const rx = w(j);
      if (!rx || j < c + 1) continue;
      let rHead = -1; let rCase = -1;
      if (rx.pos === 'ADP') { const pp = pps.find((z) => z.k === j); if (pp) { rHead = pp.p; rCase = j; } }
      else if (chunkOf[j] >= 0 && chunkOf[j] !== -1) rHead = chunkOf[j]!;
      else if (rx.pos === 'ADV' && ADV_DE.has(rx.n) && w(j + 1)?.n === 'de') { rHead = j; rCase = j; }
      else if (rx.pos === 'ADJ' || rx.pos === 'ADV' || rx.form === 'inf' || rx.form === 'ger') rHead = j;
      if (rHead < 0 || !free(rHead)) continue;
      const rw = ws[rHead]!;
      const cls = (h: number): string => { const y = ws[h]!; return nomHead(h) ? 'N' : y.pos === 'ADJ' ? 'A' : y.pos === 'ADV' ? 'D' : y.form || y.pos; };
      const want = rCase >= 0 && rx.pos === 'ADV' ? 'N' : cls(rHead);
      // find the left conjunct
      let L = -1;
      for (let i = c - 1; i >= 0; i--) {
        const y = ws[i];
        if (!y) { if (isPunct(i) && !isComma(i)) break; continue; }
        if (y.pos === 'VERB' && y.form === 'fin') break;
        const isHeadHere = want === 'N' ? (nomHead(i) && chunkOf[i] === i) : want === 'A' ? (y.pos === 'ADJ' && !nomHead(i)) : want === 'D' ? y.pos === 'ADV' : y.form === rw.form;
        if (!isHeadHere) continue;
        if (!own(i) && !(cl.k > 0 && owner[i] === cl.k - 1 && false)) break;
        if (want === 'N' && (rCase >= 0) !== isPPObj.has(i)) { if (rCase < 0 && isPPObj.has(i)) { /* bare noun after a prepositional noun: different roles */ break; } if (rCase >= 0 && !isPPObj.has(i)) break; }
        L = i; break;
      }
      if (L < 0) continue;
      // earlier members of a comma list: "a, b y c"
      const items = [L];
      if (want === 'N') {
        let first = L;
        for (let g = 0; g < 6; g++) {
          const cs = chunkStart[first]! >= 0 ? chunkStart[first]! : first;
          const cp = rCase >= 0 || isPPObj.has(first) ? (R[cs - 1]?.relation === 'case' || hasPos(w(cs - 1), 'ADP') ? cs - 2 : cs - 1) : cs - 1;
          if (!isComma(cp)) break;
          const before = cp - 1;
          if (before < 0 || chunkOf[before] < 0) break;
          const h2 = chunkOf[before]!;
          if (chunkEnd[h2] !== before || R[h2]?.relation === 'conj' || !own(h2)) break;
          if (isPPObj.has(h2) !== isPPObj.has(first)) break;
          items.push(h2); first = h2;
        }
      }
      const firstConj = items[items.length - 1]!;
      const plural = cx.n === 'y' || cx.n === 'e';
      if (plural) coordPlural.add(firstConj);
      put(rHead, firstConj, 'conj', [`${q(cx.s)} joins ${q(rw.s)} to ${q(S[firstConj]!)}: same kind of word`], 0.82);
      put(c, rHead, 'cc', [`${q(cx.s)} comes right before the second item ${q(rw.s)}`], 0.9);
      for (let g = items.length - 2; g >= 0; g--) put(items[g]!, firstConj, 'conj', [`listed after ${q(S[firstConj]!)} with a comma`], 0.7);
    }

    // --- D: vocative and apposition (a noun set off by commas)
    const setOff = (h: number): { left: boolean; right: boolean } => {
      const cs = chunkStart[h]! >= 0 ? chunkStart[h]! : h, ce = chunkEnd[h]! >= 0 ? chunkEnd[h]! : h;
      const b = cs - 1, f = ce + 1;
      return { left: cs === 0 || isComma(b) || (isPunct(b) && !isComma(b) && !CLOSE.test(S[b]!)), right: f >= n || isComma(f) || (isPunct(f) && CLOSE.test(S[f]!)) };
    };
    const verbImperativeish = av.m.Mood === 'Imp' || av.persons.includes('2');
    const bareHeads: number[] = [];
    let quoteHead = -1;
    const isCopClause0 = cl.cop !== undefined;
    const hasConjDep = (h: number): boolean => R.some((r) => !!r && r.relation === 'conj' && r.head === h);
    for (const i of ownedIdx) {
      if (!own(i) || !nomHead(i) || chunkOf[i] !== i || !free(i) || isPPObj.has(i) || predSet.has(i) || cl.wh === i) continue;
      if (ws[i]!.pos === 'PRON' && (ws[i]!.m.PronType === 'Int' || ws[i]!.m.PronType === 'Rel')) continue;
      const so = setOff(i);
      const cs = chunkStart[i]!;
      if (isComma(cs - 1) && (so.right || cs > a)) {
        const pre = nominalEndsAt(cs - 2);
        if (pre >= 0 && pre !== i && own(pre)) {
          put(i, pre, 'appos', [`${q(S[i]!)} stands between commas right after ${q(S[pre]!)}: it renames it`], 0.65);
          continue;
        }
      }
      const endTok = chunkEnd[i]! + 1;
      if (i > a && ws[i]!.pos === 'NOUN' && (DAY_NOUN.has(ws[i]!.lemma) || (ws[i]!.lemma === 'fin' && w(i + 1)?.n === 'de' && w(i + 2)?.n === 'semana')) && !isCopClause0) {
        put(i, nearTarget(cl, i), 'obl', [`${q(S[i]!)} is a day word after the verb with no preposition: when it happens (“el sábado”, “los domingos”)`], 0.65);
        continue;
      }
      if (TIME_NOUN.has(ws[i]!.lemma) && ws[i]!.pos === 'NOUN') {
        let indef = false;
        for (let z = chunkStart[i]!; z < i; z++) if (ws[z]?.pos === 'DET' && ws[z]!.m.Definite !== 'Def') indef = true;
        if (indef) { put(i, nearTarget(cl, i), 'obl', [`${q(S[i]!)} is a time word with a non-definite determiner and no preposition: when it happened (“un día”, “esta mañana”)`], 0.6); continue; }
      }
      if (i < a && SPEECH.has(lv.lemma)) { // "—El sábado —dijo Pedro": words quoted before a verb of saying
        let dash = false;
        for (let z = endTok; z < a; z++) if (isPunct(z) && /^[—–»”"]$/.test(S[z]!)) dash = true;
        if (dash) {
          if (quoteHead >= 0 && isComma(cs - 1) && (ws[i]!.pos === 'PROPN' || HUMAN.has(ws[i]!.lemma) || TITLES.has(ws[i]!.n))) { put(i, quoteHead, 'vocative', [`${q(S[i]!)} follows a comma inside the quoted words: a person addressed`], 0.6); continue; }
          if (put(i, H, 'ccomp', [`${q(S[i]!)} is quoted before ${q(S[H]!)}, a verb of saying: it is what was said`], 0.5)) quoteHead = i;
          continue;
        }
      }
      if (so.left && so.right && (cs === 0 || isPunct(cs - 1)) && (endTok >= n || isPunct(endTok))) {
        const dir = ws[i]!.pos === 'PROPN' || ws[i]!.pos === 'NOUN';
        if (endTok < n && /^[!?]$/.test(S[endTok]!) && (cs === 0 || /^[¡¿—–«"“]$/.test(S[cs - 1]!)) && dir) {
          put(i, H, 'discourse', [`${q(S[i]!)} stands alone between the marks of an exclamation or question: it is said on its own`], 0.5);
          continue;
        }
        if (dir && endTok < n && isComma(endTok)) {
          const nw = nextWord(endTok);
          const nc = nw >= 0 && owner[nw]! >= 0 ? clauses[owner[nw]!] : undefined;
          if (nc && nc !== cl && (ws[nc.anchor]!.m.Mood === 'Imp' || ws[nc.anchor]!.persons.includes('2'))) {
            put(i, nc.head, 'vocative', [`${q(S[i]!)} is followed by a comma and the next verb ${q(S[nc.anchor]!)} is an order or 2nd person: a person addressed`], 0.7);
            continue;
          }
        }
        const nwAfter = endTok < n && isComma(endTok) ? nextWord(endTok) : -1;
        const relNext = nwAfter >= 0 && (markerKind(nwAfter) === 'rel' || (markerKind(nwAfter) === 'sub' && ws[nwAfter]!.n === 'que'));
        if (dir && (ws[i]!.pos === 'PROPN' || HUMAN.has(ws[i]!.lemma)) && nwAfter >= 0 && !relNext && !hasConjDep(i) && (cs === 0 || /^[¡¿—–«"“]$/.test(S[cs - 1]!)) && subjAgree(i).ok && !verbImperativeish && i < a) {
          put(i, H, 'vocative', [`${q(S[i]!)} is a person word at the start followed by a comma: read as a person addressed`], 0.55,
            [alt('nsubj', H, 0.4, `${q(S[i]!)} agrees with ${q(av.s)}, so it could be the subject written before a comma`)]);
          continue;
        }
        if (dir && endTok < n && isComma(endTok) && !subjAgree(i).ok && !verbImperativeish) {
          if (ws[i]!.pos === 'PROPN' || HUMAN.has(ws[i]!.lemma)) put(i, H, 'vocative', [`${q(S[i]!)} is a person word set off by a comma and does not agree with the verb ${q(av.s)}: a person addressed`], 0.5);
          else put(i, H, 'discourse', [`${q(S[i]!)} is set off by a comma and does not agree with the verb ${q(av.s)}: an exclamation or remark on its own`], 0.4);
          continue;
        }
        if (dir && verbImperativeish) {
          put(i, H, 'vocative', [`${q(S[i]!)} is set off by punctuation and the verb ${q(av.s)} is an order or 2nd person: a person addressed`], 0.7);
          continue;
        }
      }
      bareHeads.push(i);
    }

    // loose non-finite verbs (para + infinitive, antes de + infinitive, gerunds, participles after a noun)
    for (const i of ownedIdx) {
      const x = ws[i];
      if (!x || !free(i) || inChain[i] || x.weak) continue;
      if (x.form === 'inf') {
        const pi = i - 1;
        const pre = w(pi);
        if (pre && pre.pos === 'ADP' && !R[pi]) {
          const adv = w(pi - 1);
          const nom = nominalEndsAt(pi - 1);
          const t = leftTarget(cl, i) ?? rightTarget(cl, i) ?? H;
          if (pre.n === 'a' && t !== undefined && LINK_A.has(ws[t]!.lemma)) put(i, t, 'xcomp', [`${q(ws[t]!.s)} ${q('a')} + infinitive ${q(x.s)}: a fixed pairing (${ws[t]!.lemma} a …), with the object in between`], 0.7);
          else if ((pre.n === 'de' || pre.n === 'a') && nom >= 0 && !(adv && adv.pos === 'ADV')) put(i, nom, 'acl', [`${q(pre.s)} + infinitive ${q(x.s)} right after the noun ${q(S[nom]!)}: what that noun is for or about`], 0.6);
          else put(i, t, 'advcl', [`${q(pre.s)} + infinitive ${q(x.s)}: ${pre.n === 'para' ? 'purpose' : 'a clause of time, manner or reason'}`], 0.7);
          put(pi, i, 'mark', [`${q(pre.s)} introduces the infinitive ${q(x.s)}`], 0.85);
          if (adv && adv.pos === 'ADV' && ADV_DE.has(adv.n) && free(pi - 1)) put(pi - 1, i, 'advmod', [`${q(adv.s)} ${q(pre.s)} + infinitive: “before / after doing”`], 0.7);
          if (R[i]) cl.loose.push(i);
        } else if (i < a && (pi < 0 || !ws[pi] || isPunct(pi)) && cl.cop === undefined) {
          put(i, H, 'nsubj', [`an infinitive at the start, before the verb ${q(av.s)}, is read as the subject (“to love is …”)`], 0.5);
        }
      } else if (x.form === 'ger') {
        const t = leftTarget(cl, i) ?? rightTarget(cl, i) ?? H;
        const nomG = prevWord(i) === i - 1 ? nominalEndsAt(i - 1) : -1;
        if (nomG >= 0 && !isComma(i - 1)) { if (put(i, nomG, 'acl', [`gerund ${q(x.s)} directly after the noun ${q(S[nomG]!)}: “the … doing”`], 0.55, [alt('advcl', t, 0.4, `the gerund may instead describe how ${q(S[t]!)} happens`)])) cl.loose.push(i); }
        else if (put(i, t, 'advcl', [`gerund ${q(x.s)}: an action that goes along with ${q(S[t]!)}`], 0.55)) cl.loose.push(i);
      } else if (x.form === 'part' && x.pos !== 'ADJ') {
        const nom = nominalEndsAt(i - 1);
        if (nom >= 0 && agree(x, ws[nom]!).ok) put(i, nom, 'acl', [`participle ${q(x.s)} directly after ${q(S[nom]!)} and agreeing with it: “the … done”`], 0.55);
      }
    }

    // --- E/F: subject and objects
    const proclitics: number[] = [];
    for (const i of ownedIdx) if (i < a && clitic[i] && ws[i]!.pos === 'PRON') proclitics.push(i);
    const enclitics: string[] = [];
    for (const t of [a, ...cl.lex]) for (const p of ws[t]?.parts ?? []) if (p.pos === 'PRON' && p.lemma && CLITIC_LEMMAS.has(p.lemma)) enclitics.push(p.lemma);
    const cliticLemmas = new Set<string>([...proclitics.map((i) => ws[i]!.lemma), ...enclitics]);
    const hasSe = proclitics.some((i) => ws[i]!.lemma === 'se');
    const accLemma = [...cliticLemmas].find((l) => ACC3.has(l));

    function subjAgree(h: number): { ok: boolean; text: string; sure: boolean } {
      const hw = ws[h]!;
      const cs = feats(hw, 'Case');
      if (hw.pos === 'PRON' && cs.length && !cs.includes('Nom')) return { ok: false, text: 'not a subject form', sure: true };
      let persons = hw.pos === 'PRON' && hw.m.Person ? hw.m.Person.split(',') : ['3'];
      let nums = feats(hw, 'Number');
      if (coordPlural.has(h)) {
        nums = ['Plur'];
        const ps = [...persons];
        for (const r of R) if (r && r.relation === 'conj' && r.head === h && ws[r.dependent]?.pos === 'PRON' && ws[r.dependent]!.m.Person) ps.push(...ws[r.dependent]!.m.Person!.split(','));
        const low = ps.filter((p) => p === '1' || p === '2' || p === '3').sort()[0];
        if (low) persons = [low];
      }
      const okP = !av.persons.length || persons.some((p) => av.persons.includes(p));
      const okN = !av.numbers.length || !nums.length || nums.some((x) => av.numbers.includes(x));
      const sure = !!av.persons.length && !!nums.length;
      const nm = nums.length ? nums.map((x) => NAMES[x] ?? x).join('/') : 'number not known';
      return { ok: okP && okN, sure, text: `${q(hw.s)} (${persons.map((p) => NAMES[p] ?? p).join('/')}, ${nm}) ${okP && okN ? 'agrees with' : 'does not agree with'} ${q(av.s)} (${verbDesc(av)})` };
    }
    // hoisted by function declaration

    const aObjDirect = pps.some((pp) => own(pp.k) && (ws[pp.k]!.n === 'a' || ws[pp.k]!.n === 'al') && free(pp.p) && (ws[pp.p]!.pos === 'PROPN' || HUMAN.has(ws[pp.p]!.lemma)) && DIRECT_PERSON.has(lv.lemma));
    const whIsPron = cl.wh !== undefined && (ws[cl.wh]!.pos === 'PRON' || cl.kind === 'relative');
    const cands = bareHeads.filter((h) => h !== cl.wh && !(ws[h]!.pos === 'PRON' && !ws[h]!.m.Person && ws[h]!.m.PronType === 'Int'));
    const pre = cands.filter((h) => h < a).sort((x, y) => y - x);
    const post = cands.filter((h) => h > a).sort((x, y) => x - y);
    const preOk = pre.filter((h) => subjAgree(h).ok);
    const postOk = post.filter((h) => subjAgree(h).ok);
    let subj = -1;
    const objs: number[] = [];
    const isCopClause = cl.cop !== undefined;
    const transitiveish = !isCopClause && !SUBJECT_AFTER.has(lv.lemma) && !PSYCH.has(lv.lemma);
    const accClitCand = (h: number): boolean => !!accLemma && agree(ws[h]!, { ...ws[h]!, m: { Gender: accLemma === 'lo' || accLemma === 'los' ? 'Masc' : 'Fem', Number: accLemma === 'lo' || accLemma === 'la' ? 'Sing' : 'Plur' } }).ok;
    if (preOk.length) {
      subj = preOk[0]!;
      const sa = subjAgree(subj);
      const rival = postOk.find((h) => h !== subj && !(isPPObj.has(h)) && !['nada', 'algo', 'todo', 'mucho', 'poco'].includes(ws[h]!.n));
      const dup = accLemma !== undefined && accClitCand(subj) && rival !== undefined;
      if (rival !== undefined && transitiveish && !hay && ws[nearTarget(cl, rival)]!.form === 'fin' && !(ws[subj]!.pos === 'PRON' && feats(ws[subj]!, 'Case').includes('Nom'))) {
        const conf = dup ? 0.5 : 0.7;
        put(subj, H, 'nsubj', [sa.text, 'the noun before the verb is read as the subject (usual order: subject, verb, object)'], conf,
          [alt('obj', H, 1 - conf, dup ? `the pronoun ${q([...cliticLemmas].find((l) => ACC3.has(l)) ?? '')} repeats this noun: it may be a fronted object, with ${q(S[rival]!)} as the subject` : `both ${q(S[subj]!)} and ${q(S[rival]!)} agree with the verb; if the order is object, verb, subject (as with a repeated pronoun) the roles swap`)]);
        objs.push(rival);
        const oc = 1 - conf;
        put(rival, nearTarget(cl, rival), 'obj', [`the noun after ${q(S[nearTarget(cl, rival)]!)} is read as its object`], oc > 0.5 ? oc : 0.65,
          [alt('nsubj', H, 1 - (oc > 0.5 ? oc : 0.65), `${q(S[rival]!)} also agrees with the verb: it could be the subject if ${q(S[subj]!)} is the object`)]);
      } else {
        put(subj, H, 'nsubj', [sa.text, 'noun or pronoun before the verb'], sa.sure ? 0.9 : 0.75);
      }
    } else if (postOk.length && !hay) {
      const h0 = postOk.find((h) => ws[h]!.pos === 'PRON' && feats(ws[h]!, 'Case').includes('Nom')) ?? postOk[0]!;
      const sa = subjAgree(h0);
      if (ws[h0]!.pos === 'PRON' && feats(ws[h0]!, 'Case').includes('Nom')) {
        subj = h0;
        put(h0, H, 'nsubj', [sa.text, 'a subject pronoun (yo, tú, él …) can only be the subject'], 0.9);
      } else if (hasSe && !isCopClause && av.persons.includes('3') && ws[h0]!.pos !== 'PRON') {
        subj = h0;
        put(h0, H, 'nsubj', [sa.text, '“se” + 3rd-person verb + a noun that agrees with the verb: the passive (“houses are sold”)'], 0.6,
          [alt('obj', H, 0.4, `“se” + verb + noun can also be the impersonal “one sells houses”, where ${q(S[h0]!)} is the object (the verb is then singular)`)]);
      } else if (aObjDirect && !isCopClause) {
        subj = h0;
        put(h0, H, 'nsubj', [sa.text, `the verb ${q(S[lv.i]!)} already has a personal-“a” object, so the bare noun after it is the subject`], 0.75);
      } else if (cl.run.some((r) => r.kind === 'int' && ws[r.i]!.pos === 'ADV') && !isCopClause) {
        subj = h0;
        put(h0, H, 'nsubj', [sa.text, `a question word (${cl.run.filter((r) => r.kind === 'int').map((r) => S[r.i]).join(' ')}) stands first: the subject usually follows the verb`], 0.7,
          [alt('obj', H, 0.3, `${q(S[h0]!)} could be the object if the subject is only in the verb ending`)]);
      } else if (SUBJECT_AFTER.has(lv.lemma) || SPEECH.has(lv.lemma) || isCopClause) {
        subj = h0;
        put(h0, H, 'nsubj', [sa.text, SPEECH.has(lv.lemma) ? `${q(av.s)} is a verb of saying: the speaker follows it` : 'no noun before the verb; the verb is one that often puts its subject after it'], 0.75);
      } else if (ws[nearTarget(cl, h0)]!.form !== 'fin') {
        const t = nearTarget(cl, h0);
        put(h0, t, 'obj', [`the noun after the verb form ${q(S[t]!)} (infinitive, participle or gerund) is read as its object`], 0.78);
        objs.push(h0);
      } else {
        const t = nearTarget(cl, h0);
        put(h0, t, 'obj', [`no subject word before the verb: ${q(S[h0]!)} after ${q(S[t]!)} is read as its object (the subject is in the verb ending)`], 0.55,
          [alt('nsubj', H, 0.45, `${q(S[h0]!)} agrees with the verb, so it could be the subject (verb–subject order) with the object left out`)]);
        objs.push(h0);
      }
    } else if (hay && post.length) {
      const h0 = post[0]!;
      put(h0, nearTarget(cl, h0), 'obj', [`${q(av.s)} is the impersonal “hay”: the thing that exists is its object`], 0.8);
      objs.push(h0);
    }
    // a relative or question pronoun as the subject or the object of the clause
    if (cl.wh !== undefined && whIsPron && free(cl.wh)) {
      const wx = ws[cl.wh]!;
      const prepTok = cl.run.find((r) => r.kind === 'prep');
      const what = wx.n === 'que' ? 'relative “que”' : wx.m.PronType === 'Int' ? `question word ${q(wx.s)}` : `relative ${q(wx.s)}`;
      if (prepTok) {
        put(prepTok.i, cl.wh, 'case', [`${q(S[prepTok.i]!)} directly before ${q(wx.s)}`], 0.85);
        put(cl.wh, nearTarget(cl, cl.wh), 'obl', [`${what} after the preposition ${q(S[prepTok.i]!)}: the place or thing the verb is related to`], 0.75);
      } else if (subj >= 0 || (isCopClause && cl.pred === undefined)) {
        const t = nearTarget(cl, a);
        put(cl.wh, t, isCopClause && cl.pred === undefined ? 'nsubj' : 'obj', [`${what}; the clause already has its subject ${q(S[subj] ?? '')}, so ${q(wx.s)} is the object`], 0.7);
      } else {
        const ant = cl.antecedent !== undefined ? ws[cl.antecedent] : undefined;
        const agreeAnt = !ant || !av.numbers.length || !feats(ant, 'Number').length || feats(ant, 'Number').some((x) => av.numbers.includes(x));
        const thirdOnly = av.persons.length > 0 && !av.persons.includes('3');
        if (thirdOnly || !agreeAnt) {
          put(cl.wh, nearTarget(cl, a), 'obj', [`${what}; no subject word and the verb ending (${verbDesc(av)}) does not fit ${ant ? q(ant.s) : 'it'}, so ${q(wx.s)} is the object`], 0.65);
        } else {
          const t = nearTarget(cl, a);
          const canObj = !isCopClause && transitiveish;
          put(cl.wh, H, 'nsubj', [`${what}; no other subject word and the verb ending (${verbDesc(av)}) fits ${ant ? q(ant.s) : 'it'}: ${q(wx.s)} is the subject`], canObj && wx.m.PronType === 'Int' ? 0.55 : 0.8,
            canObj && wx.m.PronType === 'Int' ? [alt('obj', t, 0.45, `${q(wx.s)} could also be the object, with the subject only in the verb ending`)] : undefined);
          subj = cl.wh;
        }
      }
    }
    // remaining bare nouns
    const objTargets = new Set<number>(objs.map((o) => R[o]?.head).filter((z): z is number => z !== undefined));
    for (const h of cands) {
      if (h === subj || !free(h)) continue;
      if (isCopClause) continue;
      if (h > a && !objTargets.has(nearTarget(cl, h))) {
        const t = nearTarget(cl, h);
        put(h, t, 'obj', [`noun after the verb ${q(S[t]!)} that is not its subject: read as the direct object`], 0.7); objs.push(h); objTargets.add(t);
      } else if (TIME_NOUN.has(ws[h]!.lemma) && ws[h]!.pos === 'NOUN' && !isCopClause) {
        put(h, nearTarget(cl, h), 'obl', [`${q(S[h]!)} is a time word with no preposition: when it happened (“el sábado”)`], 0.5);
      } else if (h > a && free(h)) {
        put(h, nearTarget(cl, h), 'obl', [`a second noun phrase without a preposition after the verb: time, measure or manner (“tres veces”, “todo el día”)`], 0.4);
      } else if (h < a && !objs.length && subj >= 0 && transitiveish) {
        const t = nearTarget(cl, a);
        put(h, t, 'obj', [`${q(S[h]!)} before the verb does not agree with it${accLemma ? `, and ${q(accLemma)} repeats it` : ''}: read as a fronted object`], accLemma ? 0.6 : 0.4); objs.push(h);
      } else if (h < a && subj < 0 && transitiveish) {
        const t = nearTarget(cl, a);
        put(h, t, 'obj', [`${q(S[h]!)} before the verb does not agree with it (${subjAgree(h).text}): read as a fronted object`], 0.4); objs.push(h);
      }
    }
    cl.subject = subj >= 0 ? subj : undefined;
    // note pro-drop
    if (subj < 0 && cl.wh === undefined && !(av.m.Mood === 'Imp')) {
      notes.push(`No subject word for ${q(av.s)}: the ending shows ${verbDesc(av)} (Spanish leaves the subject out).`);
    } else if (subj < 0 && av.m.Mood === 'Imp') {
      notes.push(`${q(av.s)} is an order: no subject word is expected.`);
    }

    // --- G: clitics
    const cliticItems: { tok: number; lemma: string }[] = proclitics.map((i) => ({ tok: i, lemma: ws[i]!.lemma }));
    const hasBareObj = objs.length > 0;
    const climb = !cl.cop && cl.lex.length > 1 && CLIMB.has(av.lemma) && ws[cl.lex[cl.lex.length - 1]!]!.form === 'inf';
    const cTarget = climb ? cl.lex[cl.lex.length - 1]! : (cl.cop ? a : cl.lex[0] ?? a);
    const climbNote = climb ? [`the pronoun belongs to the infinitive ${q(S[cTarget]!)} (it stands before ${q(av.s)} but is the object of the infinitive)`] : [];
    for (const { tok, lemma } of cliticItems) {
      const t = cTarget;
      const others = [...cliticLemmas].filter((l) => l !== lemma);
      const hasAcc = others.some((l) => ACC3.has(l));
      const hasDat = others.some((l) => DAT3.has(l));
      if (ACC3.has(lemma)) put(tok, t, 'obj', [`${q(ws[tok]!.s)} is a 3rd-person object pronoun (lo/la/los/las) before the verb`, ...climbNote], 0.88);
      else if (DAT3.has(lemma)) {
        const leismo = DIRECT_PERSON.has(ws[t]!.lemma) && !hasAcc && !hasBareObj;
        put(tok, t, 'iobj', [`${q(ws[tok]!.s)} is a 3rd-person indirect object pronoun (le/les)`, ...climbNote], leismo ? 0.6 : 0.85,
          leismo ? [alt('obj', t, 0.35, `with ${q(ws[t]!.s)} some speakers use “le” for the direct object (leísmo)`)] : undefined);
      } else if (lemma === 'se') {
        if (hasAcc || hasDat) put(tok, t, 'iobj', [`${q('se')} before lo/la/le stands for “le/les”: the indirect object`, ...climbNote], 0.85);
        else if (hasBareObj) put(tok, t, 'iobj', [`${q('se')} with a separate direct object: the person who benefits or does it to themselves`, ...climbNote], 0.6,
          [alt('expl', t, 0.4, '“se” may belong to the verb itself (a pronominal verb) or be impersonal')]);
        else if (hasSe && post.length === 0 && PRONOMINAL.has(ws[t]!.lemma)) put(tok, t, 'expl', [`${q(ws[t]!.s)} is a verb used with “se” (${ws[t]!.lemma}se): it is part of the verb`, ...climbNote], 0.8);
        else if (subj >= 0 && ws[subj]!.pos !== 'PRON' && subj > a && av.persons.includes('3')) {
          put(tok, t, 'expl', [`${q('se')} + verb + noun that agrees with the verb: the passive`, ...climbNote], 0.6,
            [alt('obj', t, 0.4, '“se” may also be a reflexive (“washes himself”) or impersonal “one”')]);
        } else put(tok, t, 'expl', [`${q('se')} before the verb: reflexive, passive or impersonal; the rules cannot tell which`, ...climbNote], 0.5,
          [alt('obj', t, 0.35, 'reflexive: the subject acts on itself (“se lava” = washes himself)'), alt('iobj', t, 0.15, 'reflexive with another object: done for oneself')]);
      } else { // me te nos os
        if (hasAcc || PSYCH.has(ws[t]!.lemma) || hasBareObj) put(tok, t, 'iobj', [`${q(ws[tok]!.s)}: ${hasAcc ? 'with lo/la as the direct object, this one is indirect' : PSYCH.has(ws[t]!.lemma) ? `${q(ws[t]!.s)} is a verb that takes its experiencer in the dative (me gusta)` : 'the verb already has a direct object'}`, ...climbNote], 0.8);
        else if (PRONOMINAL.has(ws[t]!.lemma)) put(tok, t, 'expl', [`${q(ws[t]!.s)} is used with a reflexive pronoun (${ws[t]!.lemma}se)`, ...climbNote], 0.6, [alt('obj', t, 0.3, 'the pronoun may be a real object')]);
        else put(tok, t, 'obj', [`${q(ws[tok]!.s)} before the verb with no other object: read as the direct object`, ...climbNote], 0.6, [alt('iobj', t, 0.3, `${q(ws[tok]!.s)} may be the indirect object (me dice = tells me)`), alt('expl', t, 0.1, 'or a reflexive of the verb')]);
      }
    }

    // --- H: prepositional phrases attach
    for (const pp of pps) {
      if (!own(pp.k) || !free(pp.p)) continue;
      const pw = ws[pp.p]!;
      const prep = ws[pp.k]!;
      const before = pp.k - 1;
      const leftN = before >= 0 && chunkOf[before] >= 0 && chunkEnd[chunkOf[before]!] === before ? chunkOf[before]! : (before >= 0 && R[before]?.relation === 'conj' ? -1 : -1);
      const vL = leftTarget(cl, pp.k), vR = rightTarget(cl, pp.k);
      const prevAdj = before >= 0 && ws[before]?.pos === 'ADJ' && !R[before] && !nomHead(before);
      const prevAdvDe = before >= 0 && ws[before]?.pos === 'ADV' && ADV_DE.has(ws[before]!.n) && prep.n === 'de';
      const isPersonal = pw.pos === 'PROPN' || (pw.pos === 'PRON' && (!!pw.m.Person || pw.m.PronType === 'Int')) || HUMAN.has(pw.lemma);
      const cp = prep.parts ? 'with the article' : '';
      void cp;
      if (prep.n === 'a' || prep.n === 'al') {
        const t = vL ?? vR ?? H;
        const hasDatClit = [...cliticLemmas].some((l) => DAT3.has(l));
        const verbLem = ws[t]?.lemma ?? '';
        if (!cl.cop && (TIME_NOUN.has(pw.lemma) || ['final', 'principio', 'comienzo', 'fin', 'inicio', 'veces'].includes(pw.lemma))) { put(pp.p, t, 'obl', [`${q(prep.s)} + a time word (“al final”, “al principio”): when it happened`], 0.75); continue; }
        if (cl.cop && cl.pred !== undefined && !isPersonal) { if (leftN >= 0) put(pp.p, leftN, 'nmod', [`${q(prep.s)}-phrase right after the noun ${q(S[leftN]!)}`], 0.5); else put(pp.p, t, 'obl', [`${q(prep.s)} + place or thing`], 0.6); continue; }
        const poss = pw.pos !== 'PRON' && (() => { for (let z = chunkStart[pp.p]!; z < pp.p; z++) if (ws[z]?.m.Poss === 'Yes') return true; return false; })();
        if (!cl.cop && hasDatClit && (isPersonal || DITRANSITIVE.has(verbLem))) put(pp.p, t, 'iobj', [`${q('a')} + person with the pronoun le/les in the verb: the indirect object is said twice (“le doy a Juan”)`], 0.85);
        else if (!cl.cop && MOTION.has(verbLem) && pw.pos !== 'PRON') put(pp.p, t, 'obl', [`${q('a')} after ${q(S[t]!)}, a verb of going or coming: the place or goal`], 0.8);
        else if (!cl.cop && DITRANSITIVE.has(verbLem) && (isPersonal || objs.length)) put(pp.p, t, 'iobj', [objs.length ? `${q('a')} + noun while the verb already has a direct object: the indirect object` : `${q(S[t]!)} is a verb that takes the person in the dative (decir, dar …)`], 0.75);
        else if (!cl.cop && DITRANSITIVE.has(verbLem)) put(pp.p, t, 'iobj', [`${q('a')} + noun after ${q(S[t]!)}, which takes a recipient`], 0.6, [alt('obl', t, 0.4, `${q('a')} + noun can also be a place or goal`)]);
        else if (!cl.cop && DIRECT_PERSON.has(verbLem)) put(pp.p, t, 'obj', [`${q('a')} + noun after ${q(S[t]!)}: the personal “a” marks a direct object that is a person`], isPersonal ? 0.8 : 0.65);
        else if (!cl.cop && isPersonal) put(pp.p, t, objs.length ? 'iobj' : 'obj', [objs.length ? `${q('a')} + person while the verb already has a direct object: the indirect object` : `${q('a')} + person after ${q(S[t]!)} with no other object: read as the personal “a” (a direct object)`], objs.length ? 0.7 : 0.55,
          objs.length ? undefined : [alt('iobj', t, 0.4, `${q('a')} + person can also be the indirect object (“habla a Juan”)`)]);
        else if (!cl.cop && poss && !objs.length) put(pp.p, t, 'obl', [`${q('a')} + a noun with a possessive (“su familia”): a person is likely, but the rules do not know the verb`], 0.5, [alt('obj', t, 0.45, `${q('a')} + a person after a transitive verb is a direct object (the personal “a”)`)]);
        else put(pp.p, t, 'obl', [`${q('a')} + a place, time or thing: where or to what the action goes`], 0.7);
        continue;
      }
      if (prep.n === 'de' || prep.n === 'del') {
        if (leftN >= 0 && leftN !== pp.p) put(pp.p, leftN, 'nmod', [`${q(prep.s)}-phrase directly after the noun ${q(S[leftN]!)}: it says whose or what kind`], 0.8);
        else if (prevAdvDe) put(pp.p, before, 'obl', [`${q(S[before]!)} ${q(prep.s)} …: the adverb is completed by the phrase`], 0.7);
        else if (prevAdj) put(pp.p, before, 'obl', [`${q(S[before]!)} ${q(prep.s)} …: the adjective takes this phrase`], 0.6);
        else if (vL !== undefined) put(pp.p, vL, 'obl', [`${q(prep.s)} + noun after the verb ${q(S[vL]!)}`], 0.65);
        else if (vR !== undefined) put(pp.p, vR, 'obl', [`${q(prep.s)} + noun before the verb ${q(S[vR]!)}`], 0.6);
        continue;
      }
      // other prepositions
      if (prevAdj && ['en', 'con', 'para', 'por', 'contra'].includes(prep.n)) { put(pp.p, before, 'obl', [`${q(S[before]!)} ${q(prep.s)} …: the adjective takes this phrase`], 0.55); continue; }
      if (leftN >= 0 && leftN !== pp.p && (leftN < a || (vL === undefined))) {
        put(pp.p, leftN, 'nmod', [`${q(prep.s)}-phrase directly after the noun ${q(S[leftN]!)}${leftN < a ? ' (before the verb)' : ''}`], 0.7);
      } else if (vL !== undefined) {
        const adjacentArg = leftN >= 0 && leftN !== pp.p && (objs.includes(leftN) || leftN === cl.pred);
        put(pp.p, vL, 'obl', [`${q(prep.s)} + noun after the verb ${q(S[vL]!)}: where, when, with whom or why`], adjacentArg ? 0.55 : 0.75,
          adjacentArg ? [alt('nmod', leftN, 0.45, `the phrase directly follows the noun ${q(S[leftN]!)}: it may describe that noun instead of the verb`)] : undefined);
      } else if (vR !== undefined) put(pp.p, vR, 'obl', [`${q(prep.s)} + noun before the verb ${q(S[vR]!)}`], 0.7);
      else if (leftN >= 0) put(pp.p, leftN, 'nmod', [`${q(prep.s)}-phrase after the noun ${q(S[leftN]!)}`], 0.6);
    }

    // --- I: adverbs, interjections, other clause material
    for (const i of ownedIdx) {
      const x = ws[i];
      if (!x || !own(i) || !free(i) || inChain[i]) continue;
      if (cl.run.some((r) => r.i === i)) continue;
      if (x.pos === 'ADV') {
        const nw = nextWord(i);
        if (DEGREE_ADV.has(x.n) && hasPos(w(nw), 'ADJ', 'ADV') && own(nw)) { put(i, nw, 'advmod', [`${q(x.s)} strengthens ${q(S[nw]!)}`], 0.8); continue; }
        if ((x.n === 'más' || x.n === 'menos') && nextWord(i) !== i - 1 && hasPos(w(prevWord(i)), 'ADV') && prevWord(i) === i - 1 && own(prevWord(i))) { put(i, prevWord(i), 'advmod', [`${q(x.s)} follows the adverb ${q(S[prevWord(i)]!)} directly: “never more”, “no longer”`], 0.7); continue; }
        const neg = LIGHT_ADV.has(x.n);
        const t = rightTarget(cl, i);
        const lt = leftTarget(cl, i);
        const target = neg || i < a ? (t ?? lt ?? H) : (lt ?? t ?? H);
        const closeNext = t !== undefined && t > i;
        void closeNext;
        put(i, target, 'advmod', [x.n === 'no' ? `${q('no')} negates the verb ${q(S[target]!)}` : `adverb ${i < target ? 'before' : 'after'} the verb ${q(S[target]!)}`], neg ? 0.85 : 0.7);
      } else if (x.pos === 'INTJ') {
        put(i, H, 'discourse', [`${q(x.s)} is an interjection`], 0.7);
      } else if (x.pos === 'PART') {
        put(i, nearTarget(cl, i), 'advmod', [`particle ${q(x.s)} next to the verb`], 0.5);
      } else if (x.pos === 'CONJ' || (x.pos === 'SCONJ' && !cl.run.some((r) => r.i === i))) {
        put(i, H, i < a ? 'cc' : 'mark', [`${q(x.s)} is a linking word that stands at the start of the clause of ${q(S[H]!)}`], 0.4);
      } else if (x.pos === 'ADJ' && R[i - 1]?.relation === 'advmod' && ws[i - 1]?.m.PronType === 'Exc') {
        put(i, H, 'discourse', [`${q(S[i - 1]!)} ${q(x.s)}: an exclamation without a verb`], 0.4);
      } else if (x.pos === 'ADJ' && !cl.cop && i > a && !nomHead(i)) {
        const sj = cl.subject !== undefined ? ws[cl.subject]! : undefined;
        const ag = sj ? agree(x, sj) : undefined;
        const pt = leftTarget(cl, i);
        if (ws[i]!.lemma === 'junto') { put(i, pt ?? H, 'advmod', [`${q(x.s)} (“together”) is used like an adverb after the verb`], 0.6); continue; }
        if (pt !== undefined && PSEUDO_COP.has(ws[pt]!.lemma) && !hasPos(w(prevWord(i)), 'NOUN', 'PROPN')) put(i, pt, 'xcomp', [`${q(ws[pt]!.s)} (${ws[pt]!.lemma}) links the subject to an adjective: ${q(x.s)} says what the subject becomes or is like`], 0.7);
        else if (!sj && pt !== undefined && i === Math.max(...targetsOf(cl).filter((z) => z < i)) + 1) put(i, pt, 'xcomp', [`${q(x.s)} stands right after the verb ${q(S[pt]!)}: it says in what state or way (no subject word to check agreement with)`], 0.4);
        else if (sj && ag && ag.ok && ag.known) put(i, nearTarget(cl, i), 'xcomp', [`${q(x.s)} agrees with the subject ${q(sj.s)} (${ag.text}) and follows the verb: it says how the subject is while doing it`], 0.45);
      }
    }
  }

  /* -------------------------------------------------------------------------------- P6: links between clauses */
  const clauseHead = (cl: Clause): number => cl.head;
  const nonRel = (k: number): boolean => clauses[k]!.kind !== 'relative';
  let root = -1;
  for (const cl of clauses) {
    const Hk = clauseHead(cl);
    const run = cl.run;
    const cc = run.find((r) => r.kind === 'cc');
    const subs = run.filter((r) => r.kind === 'sub' || r.kind === 'conn');
    const anyWh = run.find((r) => r.kind === 'rel' || r.kind === 'int');
    const prevClause = (() => { for (let j = cl.k - 1; j >= 0; j--) if (nonRel(j)) return clauses[j]!; return undefined; })();
    const nextMain = (() => { for (let j = cl.k + 1; j < clauses.length; j++) if (clauses[j]!.kind === 'main') return clauses[j]!; return undefined; })();
    // tokens of the run
    if (cc) {
      const ccHead = !prevClause && nextMain ? clauseHead(nextMain) : Hk;
      put(cc.i, ccHead, 'cc', [`${q(S[cc.i]!)} starts the clause of ${q(S[ccHead]!)}, joining it to the clause before`], 0.88);
    }
    for (const s of subs) {
      if (cl.kind === 'relative' && ws[s.i]!.n === 'donde') put(s.i, Hk, 'advmod', [`${q('donde')} (“where”) refers back to ${q(S[cl.antecedent ?? Hk]!)} and says where the clause happens`], 0.8);
      else put(s.i, Hk, 'mark', [`${q(S[s.i]!)} introduces the clause of ${q(S[Hk]!)}`], 0.88);
    }
    for (const r of run) if (r.kind === 'rel' && free(r.i) && cl.wh !== r.i) {
      const x = ws[r.i]!;
      if (x.n.startsWith('cuy')) { const nw = nextWord(r.i); if (nw >= 0 && chunkOf[nw] >= 0) put(r.i, chunkOf[nw]!, 'det', [`${q(x.s)} (“whose”) stands before the noun ${q(S[chunkOf[nw]!]!)} it belongs to`], 0.8); }
      else put(r.i, Hk, 'advmod', [`${q(x.s)} introduces the clause of ${q(S[Hk]!)}`], 0.6);
    }
    for (const r of run) if (r.kind === 'int' && free(r.i) && cl.wh !== r.i) {
      const x = ws[r.i]!;
      put(r.i, Hk, 'advmod', [`question word ${q(x.s)}: how, where, when or how much about ${q(S[Hk]!)}`], 0.75);
    }
    for (const r of run) if (r.kind === 'prep' && free(r.i)) put(r.i, Hk, 'case', [`${q(S[r.i]!)} before the relative or question word`], 0.5);

    if (!free(Hk)) { cl.head = Hk; continue; }
    // the relation of the clause head
    if (cl.kind === 'relative' && cl.antecedent !== undefined) {
      put(Hk, cl.antecedent, 'acl', [`${q(S[run[0]!.i]!)} follows the noun ${q(S[cl.antecedent]!)} and starts a clause about it: a relative clause`], 0.8);
    } else if (cl.kind === 'coordinate' && prevClause) {
      const sub = subs[0];
      let pc = prevClause;
      if (!sub) for (let j = cl.k - 1; j >= 0; j--) if (clauses[j]!.kind === 'main' || clauses[j]!.kind === 'coordinate') { pc = clauses[j]!; break; }
      if (!sub && prevClause.kind === 'subordinate' && ws[cl.anchor]!.m.Mood === 'Sub' && ws[prevClause.anchor]!.m.Mood === 'Sub') pc = prevClause;
      let firstC = clauseHead(pc);
      for (let g = 0; g < 8 && R[firstC]?.relation === 'conj' && R[firstC]!.head !== undefined; g++) firstC = R[firstC]!.head!;
      put(Hk, firstC, 'conj', [`${q(S[cc!.i]!)} joins the clause of ${q(S[Hk]!)} to the clause of ${q(S[firstC]!)}${sub ? ' (and the new clause is itself introduced by ' + q(S[sub.i]!) + ')' : ''}`], 0.8);
    } else if (cl.kind === 'subordinate' || (cl.kind === 'coordinate' && !prevClause)) {
      if (cc && prevClause && prevClause.kind === 'subordinate' && free(Hk)) {
        let firstC = clauseHead(prevClause);
        for (let g = 0; g < 8 && R[firstC]?.relation === 'conj' && R[firstC]!.head !== undefined; g++) firstC = R[firstC]!.head!;
        put(Hk, firstC, 'conj', [`${q(S[cc.i]!)} ${q(S[subs[0]?.i ?? cc.i]!)} joins a second clause of the same kind to the clause of ${q(S[firstC]!)}`], 0.75);
        continue;
      }
      const parent = prevClause ?? nextMain;
      const first = subs[0] ?? anyWh;
      if (!parent || !first) { if (root < 0) { root = Hk; } continue; }
      const P = clauseHead(parent);
      const sw = ws[first.i]!;
      const word = sw.n;
      const pLemma = ws[parent.lex[0] ?? parent.anchor]!.lemma;
      const after = prevClause !== undefined;
      let rel: DependencyRelation = 'advcl';
      let why = '';
      let alts: SyntaxAlternative[] | undefined;
      if (anyWh && !subs.length) { rel = 'ccomp'; why = `the question word ${q(sw.s)} starts an indirect question after ${q(S[P]!)}`; }
      else if (word === 'que' && first.kind === 'sub') {
        let cmp = false;
        for (let i = 0; i < first.i; i++) if (w(i) && COMPARATIVE.has(w(i)!.n) && i > (parent.start ?? 0) - 1) cmp = true;
        if (run.some((r) => r.kind === 'conn')) { rel = 'advcl'; why = `${q(S[run[0]!.i]!)} ${q('que')} is a connector (“so that / until / although …”)`; }
        else if (cmp) { rel = 'advcl'; why = `${q('que')} after a comparing word: the second part of a comparison`; }
        else { rel = 'ccomp'; why = `${q('que')} after ${q(S[P]!)} introduces what is said, thought or wanted`; }
      } else if (word === 'si') {
        if (COGNITION.has(pLemma) && after) { rel = 'ccomp'; why = `${q('si')} after ${q(S[P]!)} (a verb of knowing or asking): “whether”`; alts = [alt('advcl', P, 0.3, `${q('si')} can also mean “if” (a condition)`)]; }
        else { rel = 'advcl'; why = `${q('si')} opens a condition (“if”) for ${q(S[P]!)}`; if (COGNITION.has(pLemma)) alts = [alt('ccomp', P, 0.3, `${q('si')} may mean “whether”`)]; }
      } else { rel = 'advcl'; why = `${q(sw.s)} opens an adverbial clause (time, reason, concession …) for ${q(S[P]!)}`; }
      put(Hk, P, rel, [why, after ? 'the clause follows the one it depends on' : 'the clause comes first and depends on the main clause after it'], 0.75, alts);
    } else if (cl.kind === 'main') {
      const lemmaK = ws[cl.lex[0] ?? cl.anchor]!.lemma;
      let dashBefore = false;
      for (let i = Math.max(0, cl.start - 1); i < cl.anchor; i++) if (isPunct(i) && /^[—–»”"]$/.test(S[i]!)) dashBefore = true;
      if (root < 0) { root = Hk; }
      else if (SPEECH.has(lemmaK) && dashBefore && free(root) && root !== Hk) {
        put(root, Hk, 'ccomp', [`${q(S[Hk]!)} is a verb of saying after the quoted words: what was said depends on it`], 0.7);
        cl.quote = true; root = Hk;
      } else {
        const prevMain = (() => { for (let j = cl.k - 1; j >= 0; j--) if (clauses[j]!.kind !== 'relative') return clauses[j]!; return undefined; })();
        if (prevMain) {
          const pl = ws[prevMain.lex[0] ?? prevMain.anchor]!.lemma;
          const speech = SPEECH.has(pl);
          put(Hk, clauseHead(prevMain), speech ? 'ccomp' : 'conj', [speech ? `${q(S[clauseHead(prevMain)]!)} is a verb of saying: the clause after it is what was said` : 'two clauses side by side without a joining word'], 0.5);
          if (speech) cl.quote = true;
        }
      }
    }
  }
  // the first main clause is the root; a subordinate-only sentence keeps its first clause head
  if (root < 0 && clauses.length) { const c0 = clauses.find((c) => free(clauseHead(c))); if (c0) root = clauseHead(c0); }
  if (root >= 0 && free(root)) {
    const cl = clauses.find((c) => clauseHead(c) === root);
    const prod = cl && cl.subject === undefined && cl.wh === undefined ? ' no subject word is written (pro-drop)' : '';
    const sw = ws[root]!;
    const bas = cl?.pred !== undefined ? [`${q(sw.s)} is what the sentence says about its subject (the predicate of ${q(S[cl.cop!]!)})`] : [`${q(sw.s)} is the finite verb of the main clause${prod ? ';' + prod : ''}`];
    put(root, undefined, 'root', bas, 0.9);
  }
  // sentence without any verb: the first phrase is the main word
  if (!clauses.length) {
    const cand = wordIdx.find((i) => free(i) && (nomHead(i) && chunkOf[i] === i || hasPos(ws[i], 'ADJ', 'INTJ', 'ADV')));
    if (cand !== undefined) {
      put(cand, undefined, 'root', [`${q(S[cand]!)} is the first phrase of a sentence with no verb`], 0.5);
      notes.push('No verb in this sentence: only the first phrase was marked as the main word.');
      root = cand;
      for (const i of wordIdx) if (free(i) && nomHead(i) && chunkOf[i] === i && isComma(chunkStart[i]! - 1)) put(i, cand, 'vocative', [`${q(S[i]!)} follows a comma in a sentence with no verb: a person addressed`], 0.5);
    }
  }

  /* -------------------------------------------------------------------------------- P7: punctuation, checks, notes */
  if (root >= 0) {
    for (let i = 0; i < n; i++) {
      if (!isPunct(i) || R[i]) continue;
      const s = S[i]!;
      let head = root;
      if (!CLOSE.test(s)) {
        const nw = nextWord(i);
        if (nw >= 0) head = R[nw]?.head ?? nw;
      }
      if (head === i) head = root;
      put(i, head, 'punct', [`punctuation ${q(s)}`], 0.6);
    }
  }
  // no cycles
  for (let i = 0; i < n; i++) {
    const r = R[i];
    if (!r || r.head === undefined) continue;
    let h: number | undefined = r.head, steps = 0;
    while (h !== undefined && steps++ <= n) { if (h === i) break; h = R[h]?.head; }
    if (h === i || steps > n) { R[i] = undefined; notes.push(`A relation for ${q(S[i]!)} was dropped: it would have made a loop.`); }
  }
  // words whose part of speech was guessed from the position
  const guessedWords: string[] = [];
  for (const i of wordIdx) if (ws[i]!.guessed) guessedWords.push(S[i]!);
  if (guessedWords.length) {
    for (const r of R) {
      if (!r) continue;
      if (ws[r.dependent]?.guessed || (r.head !== undefined && ws[r.head]?.guessed)) {
        r.confidence = Math.min(r.confidence, 0.45);
        r.basis = [...r.basis, 'the word list does not know one of these words: its part of speech is guessed from its position'];
      }
    }
    notes.push(`Not in the word list: ${guessedWords.map(q).join(', ')}. The part of speech is guessed from the position (after an article, a preposition or “ser”), so the roles around ${guessedWords.length > 1 ? 'them are' : 'it are'} less sure.`);
  }
  // attached pronouns inside a verb token
  for (const i of wordIdx) {
    const x = ws[i]!; const r = R[i];
    if (!r || !x.parts) continue;
    const pr = x.parts.filter((p) => p.pos === 'PRON');
    if (pr.length) r.basis = [...r.basis, `pronoun${pr.length > 1 ? 's' : ''} written onto the verb: ${pr.map((p) => `${p.text}${p.role ? ' (' + p.role + ')' : ''}`).join(', ')}`];
  }
  // unattached
  const loose: string[] = [], unknown: string[] = [];
  for (const i of wordIdx) {
    if (R[i]) continue;
    if (ws[i]!.pos === 'UNK') unknown.push(S[i]!); else loose.push(S[i]!);
  }
  if (unknown.length) notes.push(`No reading for ${unknown.map(q).join(', ')}: no relation is given for ${unknown.length > 1 ? 'them' : 'it'}.`);
  if (loose.length) notes.push(`The rules could not place ${loose.map(q).join(', ')}: role unknown.`);
  if (wordIdx.length > 45) notes.push('A long sentence: the rules look at it in one piece and may be less reliable.');

  const relations = R.filter((r): r is SyntaxRelation => !!r && ws[r.dependent] !== undefined || (!!r && r.relation === 'punct'));
  const attachedWords = wordIdx.filter((i) => R[i]).length;
  const spans: ClauseSpan[] = clauses.map((cl) => {
    const owned: number[] = []; for (let i = 0; i < n; i++) if (owner[i] === cl.k && ws[i]) owned.push(i);
    const kind: ClauseSpan['kind'] = cl.quote ? 'quote' : cl.kind === 'relative' ? 'relative' : cl.kind === 'coordinate' ? 'coordinate' : cl.kind === 'subordinate' ? 'subordinate' : 'main';
    const marker = cl.run.find((r) => r.kind !== 'prep')?.i;
    return { start: owned.length ? owned[0]! : cl.anchor, end: owned.length ? owned[owned.length - 1]! : cl.anchor, kind, ...(marker !== undefined ? { marker } : {}), label: `${kind === 'main' ? 'main clause' : kind + ' clause'} of ${q(S[cl.head]!)}` };
  });
  return {
    languageId: 'es', analyzer: ANALYZER, tokens: S, relations, ...(spans.length ? { clauses: spans } : {}), notes,
    attached: wordIdx.length ? Math.round((attachedWords / wordIdx.length) * 1000) / 1000 : 1,
  };
}

const CLOSE = /^[.?!…»"”)\]]$/;
