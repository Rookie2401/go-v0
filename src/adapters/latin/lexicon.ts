/**
 * The Latin lexicon of the adapter: every lexeme (the generated seed lexicon, the hand additions, the closed classes ported from
 * the Romance app, the compound verbs, and, once it has been loaded, the full Whitaker lexicon), each able to produce its cells, and
 * the indexes the analysis looks words up in.
 *
 * Two kinds of lexeme. A REGULAR lexeme (a noun, adjective, verb or indeclinable word generated from its principal parts) lists the
 * stems every one of its forms starts with; it sits in a stem index and its cells are generated, once, only when a written form that
 * starts with one of its stems is looked up. An IRREGULAR lexeme (closed classes, compounds of sum / eo / fero, deus, domus ...) is
 * expanded into a small direct form index. Nothing is generated until it is asked for.
 */
import type { PartOfSpeech } from '../../core';
import { ADJ_ROWS, ADV_ROWS, CONJ_ROWS, INTJ_ROWS, NOUN_ROWS, PREP_ROWS, PROPER_ROWS, VERB_ROWS } from './lexicon-data';
import { CLOSED_ROWS } from './closed-data';
import { COMPOUNDS, DEFECTIVE_ROWS, EXTRA_ADJS, EXTRA_ADVS, EXTRA_NOUNS, EXTRA_NUMERALS, EXTRA_VERBS, HUNDREDS } from './lexicon-extra';
import type { Compound } from './lexicon-extra';
import { adjectiveCells, adjectiveStem, adverbOf, comparativeCells, declensionOf, latinisedForms, nounCells } from './morph-noun';
import { conjClassOf, contractedPerfectStem, perfectSystemCells, presentParticipleCells, verbCells, verbRoot } from './morph-verb';
import { GLOSS_LEAD } from './gloss-data';
import { foldKey } from './orthography';
import { PRONOUN_BUILT, PRONOUN_TABLES, builtPronounCells, pronounCells } from './morph-pronoun';
import type { Cell, ClosedRow, Feats, LexKind, Lexeme, VerbRow } from './types';

const SCONJ = new Set(['ut', 'ne', 'cum', 'si', 'nisi', 'quod', 'quia', 'quoniam', 'dum', 'postquam', 'ubi', 'quamquam', 'quamvis', 'quin', 'quominus', 'utinam', 'priusquam', 'antequam', 'donec', 'quando', 'sicut', 'quasi', 'dummodo', 'etsi', 'tametsi', 'quomodo', 'simulac']);
const GENDER_UD: Record<string, string | undefined> = { m: 'Masc', f: 'Fem', n: 'Neut', c: 'Fem,Masc', x: undefined };

export function parseFeats(s: string): Feats {
  const out: Feats = {};
  if (!s) return out;
  for (const kv of s.split('|')) {
    const eq = kv.indexOf('=');
    if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  return out;
}

function memo<T>(f: () => T): () => T {
  let v: T | undefined;
  let done = false;
  return () => { if (!done) { v = f(); done = true; } return v as T; };
}

function make(init: Omit<Lexeme, 'cells' | 'id'> & { id?: string }, cells: () => Cell[]): Lexeme {
  return { ...init, id: init.id ?? `la:${init.lemma}:${init.pos}`, cells: memo(cells) };
}

const POS_KIND: Record<string, LexKind> = { NOUN: 'noun', PROPN: 'proper', ADJ: 'adj', VERB: 'verb', AUX: 'verb', ADV: 'adv', ADP: 'prep', CONJ: 'conj', SCONJ: 'conj', INTJ: 'intj', PRON: 'pron', DET: 'det', NUM: 'num', PART: 'part' };

// ───────────────── the irregular adjectives and possessives: regular 1st / 2nd declension, with the pronominal genitive and dative ─────────────────

const EXPAND: Record<string, { type: string; fem: string }> = {
  meus: { type: '12', fem: 'mea' }, tuus: { type: '12', fem: 'tua' }, suus: { type: '12', fem: 'sua' }, noster: { type: '12r', fem: 'nostra' }, vester: { type: '12r', fem: 'vestra' },
  totus: { type: '12', fem: 'tota' }, solus: { type: '12', fem: 'sola' }, nullus: { type: '12', fem: 'nulla' }, ullus: { type: '12', fem: 'ulla' }, alter: { type: '12r', fem: 'altera' },
  uter: { type: '12r', fem: 'utra' }, alius: { type: '12', fem: 'alia' }, primus: { type: '12', fem: 'prima' }, secundus: { type: '12', fem: 'secunda' }, tertius: { type: '12', fem: 'tertia' },
  quartus: { type: '12', fem: 'quarta' }, quintus: { type: '12', fem: 'quinta' }, sextus: { type: '12', fem: 'sexta' }, septimus: { type: '12', fem: 'septima' }, octavus: { type: '12', fem: 'octava' },
  nonus: { type: '12', fem: 'nona' }, decimus: { type: '12', fem: 'decima' },
};

const GENDERS = ['Masc', 'Fem', 'Neut'];
function overlay(base: Cell[], literal: Cell[]): Cell[] {
  const out = base.slice();
  const key = (f: Feats): string => `${f.Case}|${f.Number}|${f.Gender}`;
  for (const l of literal) {
    const genders = l.features.Gender ? l.features.Gender.split(',') : GENDERS;
    for (const g of genders) {
      const f: Feats = { ...l.features, Gender: g };
      delete f.PronType;
      const i = out.findIndex((c) => key(c.features) === key(f));
      const cell: Cell = { form: l.form, features: f };
      if (i >= 0) out[i] = cell;
      else out.push(cell);
    }
  }
  return out;
}

function closedCells(row: ClosedRow): Cell[] {
  return row.forms.map(([form, fs]) => ({ form, features: parseFeats(fs), ...(/\s/.test(form) ? { periphrastic: true } : {}) }));
}

// the Vulgate's dictionaries list a / ab / abs and e / ex under one headword
const MERGE_INTO: Record<string, string> = { a: 'ab', e: 'ex' };

/**
 * Gloss ordering for a reader of the Vulgate: the curated lead for the commonest lemmas (gloss-data.ts) comes first, then Whitaker's own senses that the
 * lead does not already say (a sense is dropped when every content word of it is in the lead). Lemmas without a lead keep Whitaker's order.
 */
export function orderGloss(lemma: string, pos: string, gloss: string): string {
  const lead = GLOSS_LEAD[`${lemma}|${pos}`];
  if (!lead) return gloss;
  const words = (t: string): string[] => t.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z']+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|esp|also|any|one|that)$/.test(w));
  const said = new Set(words(lead));
  const rest = gloss.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean).filter((sense) => {
    const w = words(sense);
    return w.length === 0 || w.some((x) => !said.has(x));
  });
  return rest.length ? `${lead}; ${rest.join('; ')}` : lead;
}

function lexemeFromClosed(row: ClosedRow): Lexeme {
  const kind = POS_KIND[row.pos] ?? 'part';
  const info: Lexeme['info'] = { pronType: row.pronType, governs: row.governs, indeclinable: row.kind === 'prep' || row.kind === 'part' || row.forms.length <= 1 };
  const lemma = row.lemma;
  const ex = EXPAND[lemma];
  if (row.pos === 'PRON' && PRONOUN_TABLES[lemma]) {
    const full = pronounCells(lemma) as Cell[];
    return make({ lemma, pos: 'PRON', kind: 'pron', gloss: row.gloss, count: row.count, origin: 'romance', info: { ...info, pronType: PRONOUN_TABLES[lemma].pronType, indeclinable: false } }, () => [...full, ...row.forms.filter(([f]) => /cum$/.test(f)).map(([form, fs]) => ({ form, features: parseFeats(fs) }))]);
  }
  if ((row.pos === 'ADJ' || row.pos === 'NUM') && ex) {
    return make({ lemma, pos: row.pos, kind: row.pos === 'ADJ' ? 'adj' : 'num', gloss: row.gloss, count: row.count, origin: 'romance', info: { ...info, adjType: ex.type, indeclinable: false } },
      () => overlay(adjectiveCells(lemma, ex.type, ex.fem, ex.fem.replace(/a$/, 'um'), { degrees: false }), closedCells(row)));
  }
  if ((lemma === 'volo' || lemma === 'nolo') && row.pos === 'VERB') {
    // the present participle (volens, nolens) and the infinitives the table lacks
    const pre = lemma === 'volo' ? 'vol' : 'nol';
    return make({ lemma, pos: 'VERB', kind: 'verb', gloss: row.gloss, count: row.count, origin: 'romance', info }, () => [...closedCells(row).filter((c) => !/^non /.test(c.form)), ...presentParticipleCells(pre + 'ens', pre + 'ent', 'Act')]);
  }
  if (lemma === 'sum') {
    // fore (= futurum esse) and the forem series (= essem) are forms of sum
    const forem: Cell[] = ['forem', 'fores', 'foret', 'foremus', 'foretis', 'forent'].map((form, i) => ({ form, features: { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Voice: 'Act', Person: String((i % 3) + 1), Number: i < 3 ? 'Sing' : 'Plur' } }));
    return make({ lemma, pos: 'AUX', kind, gloss: row.gloss, count: row.count, origin: 'romance', info }, () => [...closedCells(row), { form: 'fore', features: { VerbForm: 'Inf', Tense: 'Fut', Voice: 'Act' } }, { form: 'fuere', features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'variant' }, ...forem]);
  }
  if (lemma === 'se' && row.pos === 'PRON') {
    // the reflexive pronoun's headword is sui (se is its accusative / ablative)
    return make({ lemma: 'sui', pos: 'PRON', kind, gloss: row.gloss, count: row.count, origin: 'romance', info }, () => [...closedCells(row), { form: 'sese', features: { Case: 'Acc', PronType: 'Prs', Reflex: 'Yes' } }, { form: 'sese', features: { Case: 'Abl', PronType: 'Prs', Reflex: 'Yes' } }]);
  }
  // eo has a second perfect stem in -iv- (ivi, exivit) beside ii: the Vulgate uses both
  if (lemma === 'eo') return make({ lemma, pos: 'VERB', kind, gloss: row.gloss, count: row.count, origin: 'romance', info }, () => [...closedCells(row), ...perfectSystemCells('iv', 'variant')]);
  return make({ lemma, pos: row.pos as PartOfSpeech, kind, gloss: row.gloss, count: row.count, origin: 'romance', info }, () => closedCells(row));
}

/** A compound of sum / eo / fero: the literal table of its base verb with the prefix (and, for fero, the perfect and participle stems) swapped in. */
function compoundCells(base: ClosedRow, c: Compound): Cell[] {
  const out: Cell[] = [];
  for (const [form, fs] of base.forms) {
    const features = parseFeats(fs);
    const words = form.split(' ').map((w) => {
      if (c.base === 'sum') {
        const perfectSystem = (features.Tense === 'Perf' || features.Tense === 'Pqp' || features.Tense === 'FutPerf') && features.VerbForm !== 'Part' || (features.VerbForm === 'Inf' && features.Tense === 'Perf');
        if (perfectSystem && /^fu/.test(w)) return (c.perf ?? c.pres + 'fu') + w.slice(2);
        if (c.lemma === 'prosum' && /^e/.test(w)) return c.pres + 'd' + w;
        return c.pres + w;
      }
      if (c.base === 'fero') {
        if (/^tul/.test(w)) return (c.perf ?? c.pres + 'tul') + w.slice(3);
        if (/^lat/.test(w)) return (c.ppp ?? c.pres + 'lat') + w.slice(3);
        return c.pres + w;
      }
      return c.pres + w;
    });
    const f = words.join(' ');
    out.push({ form: f, features, ...(/\s/.test(f) ? { periphrastic: true } : {}) });
  }
  if (c.base === 'eo') out.push(...perfectSystemCells(c.pres + 'iv', 'variant'));
  return out;
}

export interface Reading { lex: Lexeme; cell: Cell }

/** Whitaker's frequency letters as pseudo counts, so that a homograph the Vulgate seed does not rank is still ranked (A is the commonest). */
const FREQ_COUNT: Record<string, number> = { A: 60, B: 30, C: 12, D: 5, E: 2, F: 1 };

/** Nouns with forms that do not all start with the lemma or the genitive stem. */
const IRREGULAR_NOUNS = new Set(['deus', 'domus', 'Iesus', 'Moyses', 'vis', 'bos', 'Iuppiter']);
/** Short forms and spellings the treebanks file under another headword. */
const ALIAS_FORMS: Record<string, string[]> = { atque: ['ac'], neque: ['nec'], nihil: ['nil', 'nichil', 'nihilum'], quoque: [], etiam: [], tamquam: ['tanquam'], quamquam: [], sicut: ['sicuti'], velut: ['veluti'], ubique: [], utrimque: [] };
const IRREGULAR_COMPARISON_LEMMAS = new Set(['bonus', 'malus', 'magnus', 'parvus', 'multus']);

const genStem = (lemma: string, gen: string): string => (gen ? gen.replace(/(ae|ei|us|is|i)$/, '') : lemma);

/** Whitaker entries that put a rare word or a different analysis ahead of the one the texts mean: left out (lemma|kind). */
const SUPPRESSED = new Set(['verb|coepio', 'intj|absit', 'noun|modicum']);

export class LatinLexicon {
  readonly lexemes: Lexeme[] = [];
  readonly byLemma = new Map<string, Lexeme[]>();
  private readonly seen = new Set<string>();
  private readonly stemIndex = new Map<string, Lexeme[]>();
  private readonly eager: Lexeme[] = [];
  private direct: Map<string, Reading[]> | undefined;
  private readonly formMaps = new Map<Lexeme, Map<string, Cell[]>>();
  private compoundBases: Record<string, ClosedRow | undefined> = {};
  /** True once the full Whitaker lexicon has been added. */
  full = false;
  /** Second (third…) perfects of verbs the dictionary lists more than once. */
  private altPerf = new Map<string, string[]>();

  private add(lexIn: Lexeme, key?: string): void {
    const dup = key ?? `${lexIn.kind}|${lexIn.lemma}`;
    if (this.seen.has(dup)) return;
    if (SUPPRESSED.has(`${lexIn.kind}|${lexIn.lemma}`)) return;
    let lex = lexIn;
    if (lex.gloss !== undefined && GLOSS_LEAD[`${lex.lemma}|${lex.pos}`]) lex = { ...lex, gloss: orderGloss(lex.lemma, lex.pos, lex.gloss) };
    const alias = ALIAS_FORMS[lex.lemma];
    if (alias && (lex.kind === 'conj' || lex.kind === 'adv' || lex.kind === 'pron')) {
      // another spelling or a short form the treebanks file under the same headword (ac under atque, nec under neque)
      const base = lex.cells;
      lex = { ...lex, cells: memo(() => [...base(), ...alias.map((form): Cell => ({ form, features: {} }))]), ...(lex.stems ? { stems: [...lex.stems, ...alias] } : {}) };
    }
    this.seen.add(dup);
    this.lexemes.push(lex);
    const list = this.byLemma.get(lex.lemma) ?? [];
    list.push(lex);
    this.byLemma.set(lex.lemma, list);
    if (lex.stems?.length) {
      for (const st of new Set(lex.stems.map(foldKey))) {
        if (!st) continue;
        const l = this.stemIndex.get(st);
        if (l) l.push(lex);
        else this.stemIndex.set(st, [lex]);
      }
    } else {
      this.eager.push(lex);
      this.direct = undefined;
    }
  }

  constructor() {
    // closed classes first (their rank is high)
    const closedByLemma = new Map<string, ClosedRow>();
    for (const row of CLOSED_ROWS) closedByLemma.set(row.lemma + '|' + row.pos, row);
    this.compoundBases = {
      sum: CLOSED_ROWS.find((r) => r.lemma === 'sum'), eo: CLOSED_ROWS.find((r) => r.lemma === 'eo'), fero: CLOSED_ROWS.find((r) => r.lemma === 'fero'),
    };
    // a pronoun whose every form is built from qui (quidam, aliquis, quisque…) is read from the built table, not from the partial closed row; the closed row's count is kept
    const builtLemmas = new Map(PRONOUN_BUILT.map((p) => [p.lemma, p]));
    for (const row of CLOSED_ROWS) {
      if (row.pos === 'PRON' && builtLemmas.has(row.lemma)) continue;
      // the hundreds decline: the generated row below replaces the closed row that gave one form
      if (row.pos === 'NUM' && HUNDREDS.some(([l]) => l.replace(/us$/, 'i') === row.lemma)) continue;
      if (row.pos === 'ADP' && MERGE_INTO[row.lemma]) continue;
      if (row.pos === 'CONJ' && row.lemma === 'ac') continue;
      if (row.pos === 'ADP' && (row.lemma === 'ab' || row.lemma === 'ex')) {
        const extra = row.lemma === 'ab' ? ['a', 'abs'] : ['e'];
        const lex = lexemeFromClosed(row);
        const base = lex.cells;
        this.add({ ...lex, cells: memo(() => [...base(), ...extra.map((form): Cell => ({ form, features: {} }))]) });
        continue;
      }
      if (row.pos === 'PRON' && row.lemma === 'ego') {
        // mi is a short dative of ego; the plural stays under ego (the pack's frozen cases read nobis as ego)
        this.add(lexemeFromClosed({ ...row, forms: [...row.forms, ['mi', 'Case=Dat|Number=Sing|Person=1|PronType=Prs'], ['nostrum', 'Case=Gen|Number=Plur|Person=1|PronType=Prs']] }));
        continue;
      }
      if (row.pos === 'PRON' && row.lemma === 'tu') {
        // vestrum is the genitive plural (quis vestrum), beside vestri
        this.add(lexemeFromClosed({ ...row, forms: [...row.forms, ['vestrum', 'Case=Gen|Number=Plur|Person=2|PronType=Prs']] }));
        continue;
      }
      this.add(lexemeFromClosed(row));
    }
    for (const row of DEFECTIVE_ROWS) this.add(make({ lemma: row.lemma, pos: 'VERB', kind: 'verb', gloss: row.gloss, count: row.count, origin: 'romance', info: { defective: true } }, () => closedCells(row)));
    for (const c of COMPOUNDS) this.addCompound(c);
    for (const spec of PRONOUN_BUILT) this.add(make({ lemma: spec.lemma, pos: 'PRON', kind: 'pron', gloss: spec.gloss, count: Math.max(spec.count, closedByLemma.get(spec.lemma + '|PRON')?.count ?? 0), origin: 'romance', info: { pronType: spec.pronType } }, () => builtPronounCells(spec)));
    for (const lemma of ['unusquisque', 'uterque', 'semetipse', 'ambo']) {
      const t = PRONOUN_TABLES[lemma];
      this.add(make({ lemma, pos: 'PRON', kind: 'pron', gloss: ({ uterque: 'each of two, both', unusquisque: 'each one, every one', semetipse: 'oneself, himself, herself (emphatic)', ambo: 'both' } as Record<string, string>)[lemma], count: ({ uterque: 60, unusquisque: 268, semetipse: 33, ambo: 45 } as Record<string, number>)[lemma], origin: 'rule', info: { pronType: t.pronType } }, () => pronounCells(lemma) as Cell[]));
    }

    // seed lexicon
    for (const row of [...NOUN_ROWS, ...EXTRA_NOUNS]) this.addNoun(row[0], row[1], row[2], row[3], row[4], 'whitaker');
    for (const [name, gen, g, gloss, count, origin] of PROPER_ROWS) this.addNoun(name, gen, g, gloss, count, origin === 'w' ? 'whitaker' : 'rule', true);
    for (const row of [...ADJ_ROWS, ...EXTRA_ADJS]) {
      if (EXPAND[row[0]] && closedByLemma.has(row[0] + '|ADJ')) continue;
      this.addAdj(row[0], row[1], row[2], row[3], row[4], row[5]);
    }
    for (const row of [...VERB_ROWS, ...EXTRA_VERBS] as VerbRow[]) this.addVerb(row);
    for (const [lemma, gloss, count] of [...ADV_ROWS, ...EXTRA_ADVS]) this.addAdv(lemma, gloss, count);
    for (const [lemma, cases, gloss, count] of PREP_ROWS) this.addPrep(lemma, cases, gloss, count);
    for (const [lemma, gloss, count] of CONJ_ROWS) this.addConj(lemma, gloss, count);
    for (const [lemma, gloss, count] of INTJ_ROWS) this.addIntj(lemma, gloss, count);
    for (const [lemma, gloss, count] of EXTRA_NUMERALS) this.addNum(lemma, 'I', gloss, count);
    for (const [lemma, gloss] of HUNDREDS) this.addNum(lemma.replace(/us$/, 'i'), 'P', gloss, Math.max(20, closedByLemma.get(lemma.replace(/us$/, 'i') + '|NUM')?.count ?? 0));

    // adverbs formed from the adjectives (clare, fortiter, melius): rule-built, said so
    const adverbs = new Set(this.lexemes.filter((l) => l.kind === 'adv').map((l) => l.lemma));
    for (const l of [...this.lexemes]) {
      if (l.kind !== 'adj' || !l.info.adjType || l.origin === 'romance') continue;
      const [lemma, fem] = l.info.principal as string[];
      const a = adverbOf(lemma, l.info.adjType, fem ?? '');
      if (!a || adverbs.has(a.positive)) continue;
      adverbs.add(a.positive);
      this.add(make({ lemma: a.positive, pos: 'ADV', kind: 'adv', gloss: `adverb of ${lemma}: ${l.gloss.split(/[;,]/)[0]}`, count: Math.max(1, Math.round(l.count / 20)), origin: 'rule', info: { indeclinable: true }, stems: [a.positive, a.comparative, a.superlative] },
        (): Cell[] => [{ form: a.positive, features: {} }, { form: a.comparative, features: { Degree: 'Cmp' } }, { form: a.superlative, features: { Degree: 'Sup' } }]));
    }
    // 'prior' and a few comparatives that stand alone
    this.add(make({ lemma: 'prior', pos: 'ADJ', kind: 'adj', gloss: 'earlier, former, first of two', count: 64, origin: 'whitaker', info: { adjType: 'cmp' } }, () => comparativeCells('pr').map((c) => ({ ...c, features: { ...c.features } }))));
  }

  private addCompound(c: Compound): void {
    const base = this.compoundBases[c.base];
    if (!base) return;
    this.add(make({ lemma: c.lemma, pos: 'VERB', kind: 'verb', gloss: c.gloss, count: c.count, origin: 'rule', info: { principal: [c.lemma] } }, () => compoundCells(base, c)), `verb|${c.lemma}`);
  }

  private addNoun(lemma: string, gen: string, g: string, gloss: string, count: number, origin: 'whitaker' | 'rule', proper = false): void {
    // a capitalised entry for a word that is also a common noun (Deus, Dominus) adds nothing: the common noun reads it
    if (proper && this.seen.has(`noun|${lemma.toLowerCase()}|${gen.toLowerCase()}|${g[0]}`)) return;
    const decl = gen ? declensionOf(gen, lemma) : undefined;
    const stems = IRREGULAR_NOUNS.has(lemma) ? undefined : gen ? [lemma, genStem(lemma, gen)] : [lemma, ...latinisedForms(lemma)];
    this.add(make({ lemma, pos: proper ? 'PROPN' : 'NOUN', kind: proper ? 'proper' : 'noun', gloss, count, origin, info: { gender: GENDER_UD[g[0]], declension: decl, principal: [lemma, gen], indeclinable: !gen }, stems }, () => nounCells(lemma, gen, g)), `${proper ? 'proper' : 'noun'}|${lemma}|${gen}|${g[0]}`);
  }

  private addAdj(lemma: string, type: string, fem: string, neut: string, gloss: string, count: number, cmpStem = '', supStem = ''): void {
    const stems = IRREGULAR_COMPARISON_LEMMAS.has(lemma) ? undefined : [lemma, adjectiveStem(type, lemma, fem), fem, neut, cmpStem, supStem].filter(Boolean);
    this.add(make({ lemma, pos: 'ADJ', kind: 'adj', gloss, count, origin: 'whitaker', info: { adjType: type, principal: [lemma, fem, neut], indeclinable: type === 'I' }, stems }, () => adjectiveCells(lemma, type, fem, neut, { cmpStem, supStem })), `adj|${lemma}|${type}`);
  }

  private addVerb(row: VerbRow): void {
    const [lemma, inf, perf, sup, conj, kind, gloss, count] = row;
    const dep = kind === 'DEP';
    const perfdef = kind === 'PERFDEF';
    const root = verbRoot(inf, conjClassOf(conj), dep);
    const perfStem = !dep && kind !== 'SEMIDEP' && perf ? perf.replace(/i$/, '') : '';
    const pppStem = dep || kind === 'SEMIDEP' ? perf.replace(/\s*us sum$/, '').replace(/us$/, '') : sup.replace(/um$/, '');
    const short = perfStem ? contractedPerfectStem(perfStem) : undefined;
    const stems = perfdef ? [perfStem, lemma] : [root, perfStem, pppStem, lemma, short ?? ''].filter(Boolean);
    const key = `verb|${lemma}|${inf}`;
    if (this.seen.has(key)) {
      // the same verb listed again with another perfect (acquiesco: acquiei / acquievi): the first entry takes the second perfect system too
      const ex = (this.byLemma.get(lemma) ?? []).find((l) => l.kind === 'verb' && l.info.principal?.[1] === inf);
      if (ex && (perfStem || pppStem) && ex.info.principal?.[2] !== perf) {
        const list = this.altPerf.get(key) ?? [];
        if (!list.includes(perf)) {
          list.push(perf);
          this.altPerf.set(key, list);
          for (const st of [perfStem, short ?? '', pppStem]) {
            const k = foldKey(st);
            if (!k) continue;
            ex.stems?.push(st);
            const l = this.stemIndex.get(k);
            if (l) { if (!l.includes(ex)) l.push(ex); } else this.stemIndex.set(k, [ex]);
          }
        }
      }
      return;
    }
    this.add(make({ lemma, pos: 'VERB', kind: 'verb', gloss, count, origin: 'whitaker', info: { conjugation: conj, principal: [lemma, inf, perf, sup].filter(Boolean), deponent: dep || kind === 'SEMIDEP', defective: perfdef }, stems }, () => {
      const base = verbCells(row);
      const alts = this.altPerf.get(key);
      if (!alts) return base;
      const extra = alts.flatMap((p) => verbCells([lemma, inf, p, sup, conj, kind, gloss, count] as VerbRow).filter((c) => (dep || kind === 'SEMIDEP')
        ? (c.features.VerbForm === 'Part' && c.features.Tense === 'Perf') || c.features.VerbForm === 'Sup'
        : c.features.Voice === 'Act' && (c.features.Tense === 'Perf' || c.features.Tense === 'Pqp' || c.features.Tense === 'FutPerf')));
      return [...base, ...extra];
    }), key);
  }

  private addAdv(lemma: string, gloss: string, count: number, cmp = '', sup = '', degree = ''): void {
    this.add(make({ lemma, pos: 'ADV', kind: 'adv', gloss, count, origin: 'whitaker', info: { indeclinable: true }, stems: [lemma, cmp, sup].filter(Boolean) },
      (): Cell[] => [{ form: lemma, features: degree ? { Degree: degree } : {} }, ...(cmp ? [{ form: cmp, features: { Degree: 'Cmp' } }] : []), ...(sup ? [{ form: sup, features: { Degree: 'Sup' } }] : [])]));
  }

  private addPrep(lemma: string, cases: string[], gloss: string, count: number): void {
    if (MERGE_INTO[lemma]) return;
    this.add(make({ lemma, pos: 'ADP', kind: 'prep', gloss, count, origin: 'whitaker', info: { governs: cases, indeclinable: true }, stems: [lemma] }, () => [{ form: lemma, features: {} }]));
  }

  private addConj(lemma: string, gloss: string, count: number): void {
    const pos: PartOfSpeech = SCONJ.has(lemma) ? 'SCONJ' : 'CONJ';
    this.add(make({ lemma, pos, kind: 'conj', gloss, count, origin: 'whitaker', info: { indeclinable: true }, stems: [lemma] }, () => [{ form: lemma, features: {} }]));
  }

  private addIntj(lemma: string, gloss: string, count: number): void {
    this.add(make({ lemma, pos: 'INTJ', kind: 'intj', gloss, count, origin: 'whitaker', info: { indeclinable: true }, stems: [lemma] }, () => [{ form: lemma, features: {} }]));
  }

  /** kind: I indeclinable, 12 an ordinal declined like bonus, P a plural first / second declension distributive or hundred (ducenti). */
  private addNum(lemma: string, kind: string, gloss: string, count: number): void {
    if (kind === 'I') {
      this.add(make({ lemma, pos: 'NUM', kind: 'num', gloss, count, origin: 'whitaker', info: { indeclinable: true }, stems: [lemma] }, () => [{ form: lemma, features: { NumType: 'Card' } }]));
      return;
    }
    const stem = lemma.replace(/(us|i)$/, '');
    const plural = kind === 'P';
    this.add(make({ lemma, pos: 'NUM', kind: 'num', gloss, count, origin: 'whitaker', info: {}, stems: [stem] },
      () => adjectiveCells(stem + 'us', '12', stem + 'a', stem + 'um', { degrees: false }).filter((c) => !plural || c.features.Number === 'Plur').map((c) => ({ ...c, features: { ...c.features, NumType: plural ? 'Card' : 'Ord' } }))));
  }

  /** Add the full Whitaker lexicon (lexicon-full-data.ts, loaded lazily): rows the seed already holds are skipped, so the seed's ranking stays. Returns the number of lexemes added. */
  extend(text: string): number {
    const before = this.lexemes.length;
    // the frequency field is a letter (Whitaker's A..F) or, where the Vulgate concordance has the lemma, its occurrence count
    const freq = (x: string): number => FREQ_COUNT[x] ?? (Number(x) || 1);
    for (const line of text.split('\n')) {
      const f = line.split('\t');
      switch (f[0]) {
        case 'N': this.addNoun(f[1], f[2], f[3], f[5], freq(f[4]), 'whitaker', /^[A-Z]/.test(f[1])); break;
        case 'V': this.addVerb([f[1], f[2], f[3], f[4], f[5], f[6], f[8], freq(f[7])]); break;
        case 'A': if (f[1] && !EXPAND[f[1]]) this.addAdj(f[1], f[2], f[3], f[4], f[6], freq(f[5]), f[7], f[8]); break;
        case 'D': this.addAdv(f[1], f[3], freq(f[2]), f[4], f[5], f[6]); break;
        case 'R': this.addPrep(f[1], f[2] ? [f[2]] : [], f[4], freq(f[3])); break;
        case 'C': this.addConj(f[1], f[3], freq(f[2])); break;
        case 'I': this.addIntj(f[1], f[3], freq(f[2])); break;
        case 'M': if (!EXPAND[f[1]]) this.addNum(f[1], f[2], f[4], freq(f[3])); break;
        case 'K': if (f[2] === 'sum' || f[2] === 'eo' || f[2] === 'fero') this.addCompound({ lemma: f[1], base: f[2], pres: f[3], ...(f[4] ? { perf: f[4] } : {}), ...(f[5] ? { ppp: f[5] } : {}), gloss: f[7], count: freq(f[6]) }); break;
        default: break;
      }
    }
    this.full = true;
    return this.lexemes.length - before;
  }

  private directMap(): Map<string, Reading[]> {
    if (this.direct) return this.direct;
    const map = new Map<string, Reading[]>();
    for (const lex of this.eager) {
      const seen = new Set<string>();
      for (const cell of lex.cells()) {
        if (cell.periphrastic) continue;
        const key = foldKey(cell.form);
        const dup = key + '|' + Object.keys(cell.features).sort().map((k) => `${k}=${cell.features[k]}`).join('|');
        if (seen.has(dup)) continue;
        seen.add(dup);
        const list = map.get(key);
        if (list) list.push({ lex, cell });
        else map.set(key, [{ lex, cell }]);
      }
    }
    this.direct = map;
    return map;
  }

  private formMap(lex: Lexeme): Map<string, Cell[]> {
    let m = this.formMaps.get(lex);
    if (m) return m;
    m = new Map();
    const seen = new Set<string>();
    for (const cell of lex.cells()) {
      if (cell.periphrastic) continue;
      const key = foldKey(cell.form);
      const dup = key + '|' + Object.keys(cell.features).sort().map((k) => `${k}=${cell.features[k]}`).join('|');
      if (seen.has(dup)) continue;
      seen.add(dup);
      const l = m.get(key);
      if (l) l.push(cell);
      else m.set(key, [cell]);
    }
    this.formMaps.set(lex, m);
    return m;
  }

  /** Every reading of a folded written form, the most frequent lexeme first. */
  lookup(key: string): Reading[] {
    const out: Reading[] = [...(this.directMap().get(key) ?? [])];
    const done = new Set<Lexeme>();
    for (let k = 1; k <= key.length; k++) {
      const lexs = this.stemIndex.get(key.slice(0, k));
      if (!lexs) continue;
      for (const lex of lexs) {
        if (done.has(lex)) continue;
        done.add(lex);
        const cells = this.formMap(lex).get(key);
        if (cells) for (const cell of cells) out.push({ lex, cell });
      }
    }
    if (out.length > 1) out.sort((a, b) => b.lex.count - a.lex.count);
    return out;
  }

  find(lemma: string, pos?: PartOfSpeech): Lexeme | undefined {
    const list = this.byLemma.get(lemma) ?? this.byLemma.get(this.alias(lemma)) ?? [];
    return list.find((l) => !pos || l.pos === pos || (pos === 'VERB' && l.pos === 'AUX') || (pos === 'AUX' && l.pos === 'VERB')) ?? list[0];
  }
  private alias(lemma: string): string {
    for (const k of this.byLemma.keys()) if (foldKey(k) === foldKey(lemma)) return k;
    return lemma;
  }
}

let singleton: LatinLexicon | undefined;
export function latinLexicon(): LatinLexicon {
  if (!singleton) singleton = new LatinLexicon();
  return singleton;
}

export const LATIN_GENDER_UD = GENDER_UD;
