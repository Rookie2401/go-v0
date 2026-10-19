/**
 * Latin verb GENERATION: the cells of a regular verb of the four conjugations (and the third in -io), active and passive,
 * deponent and semi-deponent, from the principal parts. Plain spelling, no macrons. The endings are the Romance app's
 * (verb-tables.ts, ported). A periphrastic cell (amatus sum, amatum esse) has two words and is marked `periphrastic`: it is a
 * paradigm cell, not a word the analysis can find.
 *
 * Features (Universal-Dependencies-style): VerbForm = Fin | Inf | Part | Ger | Gdv | Sup; Mood = Ind | Sub | Imp; Tense = Pres | Imp (imperfect) | Fut |
 * Perf | Pqp (pluperfect) | FutPerf; Voice = Act | Pass; Person; Number = Sing | Plur; a participle also Case, Number, Gender.
 * A deponent's forms are Voice=Act (the meaning) and the lexeme carries `deponent`; they look passive.
 */
import { IMPERATIVE, IMPF_IND_ACT, IMPF_IND_PASS, IMPF_SUBJ_ACT, IMPF_SUBJ_PASS, FUT_IND_ACT, FUT_IND_PASS, FUT_PERF_IND_ACT, NON_FINITE, PERF_IND_ACT, PERF_SUBJ_ACT, PLUP_IND_ACT, PLUP_SUBJ_ACT, PRES_IND_ACT, PRES_IND_PASS, PRES_SUBJ_ACT, PRES_SUBJ_PASS, SUM_AUX } from './verb-tables';
import type { ConjClass, MarkerEnding } from './verb-tables';
import { adjectiveCells } from './morph-noun';
import type { Cell, Feats, VerbRow } from './types';

const PERSONS: Array<[string, string]> = [['1', 'Sing'], ['2', 'Sing'], ['3', 'Sing'], ['1', 'Plur'], ['2', 'Plur'], ['3', 'Plur']];

export { presentParticipleCells };

export function conjClassOf(c: string): ConjClass {
  return c === '1' ? 1 : c === '2' ? 2 : c === '4' ? 4 : c === '3io' ? '3io' : 3;
}

/** The present stem ("root") of a verb from its infinitive: am- (amare), mon-, reg-, cap-, aud-; for a deponent loqu- (loqui), mir- (mirari). */
export function verbRoot(inf: string, conj: ConjClass, deponent: boolean): string {
  const suffixes = deponent
    ? { 1: 'ari', 2: 'eri', 3: 'i', '3io': 'i', 4: 'iri' }[conj]
    : { 1: 'are', 2: 'ere', 3: 'ere', '3io': 'ere', 4: 'ire' }[conj];
  return inf.endsWith(suffixes) ? inf.slice(0, inf.length - suffixes.length) : inf.replace(/(are|ere|ire|ari|eri|iri|i)$/, '');
}

function fin(out: Cell[], root: string, table: MarkerEnding[], mood: 'Ind' | 'Sub', tense: string, voice: 'Act' | 'Pass', note?: string): void {
  table.forEach(([marker, ending], i) => {
    const [person, number] = PERSONS[i];
    out.push({ form: root + marker + ending, features: { VerbForm: 'Fin', Mood: mood, Tense: tense, Voice: voice, Person: person, Number: number }, ...(note ? { note } : {}) });
    // the second person singular of a passive or deponent verb in -re beside -ris (amare, amabare, amabere, sequere)
    if (ending === 'ris' && person === '2' && number === 'Sing') out.push({ form: root + marker + 're', features: { VerbForm: 'Fin', Mood: mood, Tense: tense, Voice: voice, Person: person, Number: number }, note: 'variant' });
  });
}

function periphrasticFin(out: Cell[], ppp: string, pppPl: string, aux: readonly string[], mood: 'Ind' | 'Sub', tense: string, voice: 'Act' | 'Pass'): void {
  aux.forEach((a, i) => {
    const [person, number] = PERSONS[i];
    out.push({ form: `${number === 'Sing' ? ppp : pppPl} ${a}`, features: { VerbForm: 'Fin', Mood: mood, Tense: tense, Voice: voice, Person: person, Number: number }, periphrastic: true });
  });
}

/** Present active participle cells (third declension, i-stem: gen. pl. -ium, neuter -ia, ablative -e when verbal, -i as an adjective). */
function presentParticipleCells(stemNom: string, stemObl: string, voice: 'Act' | 'Pass'): Cell[] {
  const out: Cell[] = [];
  const extra: Feats = { VerbForm: 'Part', Tense: 'Pres', Voice: voice };
  const cases = (g: 'Masc' | 'Fem' | 'Neut'): Array<[string, string, string]> => {
    const n = g === 'Neut';
    return [
      ['Nom', 'Sing', stemNom], ['Gen', 'Sing', stemObl + 'is'], ['Dat', 'Sing', stemObl + 'i'], ['Acc', 'Sing', n ? stemNom : stemObl + 'em'], ['Abl', 'Sing', stemObl + 'e|' + stemObl + 'i'], ['Voc', 'Sing', stemNom],
      ['Nom', 'Plur', stemObl + (n ? 'ia' : 'es')], ['Gen', 'Plur', stemObl + 'ium'], ['Dat', 'Plur', stemObl + 'ibus'], ['Acc', 'Plur', stemObl + (n ? 'ia' : 'es|' + stemObl + 'is')], ['Abl', 'Plur', stemObl + 'ibus'], ['Voc', 'Plur', stemObl + (n ? 'ia' : 'es')],
    ];
  };
  for (const g of ['Masc', 'Fem', 'Neut'] as const) {
    for (const [c, num, forms] of cases(g)) {
      for (const [k, form] of forms.split('|').entries()) out.push({ form, features: { ...extra, Case: c, Number: num, Gender: g }, ...(k > 0 ? { note: 'variant' } : {}) });
    }
  }
  return out;
}

/** The cells of an adjective-like verb form (perfect participle, future participle, gerundive): a first / second declension adjective with the verb features. */
function adjLikeCells(lemmaMasc: string, extra: Feats): Cell[] {
  const stem = lemmaMasc.replace(/us$/, '');
  return adjectiveCells(lemmaMasc, '12', stem + 'a', stem + 'um', { degrees: false }).map((c) => ({ ...c, features: { ...c.features, ...extra } }));
}

/** The active perfect system built on a perfect stem: perfect, pluperfect and future perfect indicative, perfect and pluperfect subjunctive, the infinitive in -isse. */
export function perfectSystemCells(perfStem: string, note?: string): Cell[] {
  const out: Cell[] = [];
  const tables: Array<[MarkerEnding[], 'Ind' | 'Sub', string]> = [[PERF_IND_ACT, 'Ind', 'Perf'], [PLUP_IND_ACT, 'Ind', 'Pqp'], [FUT_PERF_IND_ACT, 'Ind', 'FutPerf'], [PERF_SUBJ_ACT, 'Sub', 'Perf'], [PLUP_SUBJ_ACT, 'Sub', 'Pqp']];
  for (const [t, mood, tense] of tables) fin(out, perfStem, t, mood, tense, 'Act', note);
  out.push({ form: perfStem + 'isse', features: { VerbForm: 'Inf', Tense: 'Perf', Voice: 'Act' }, ...(note ? { note } : {}) });
  return out;
}

const SYNC_SUFFIX = /(av|ev|iv|ov)$/;

const REDUPLICATION: Array<[string, string]> = [['cucurr', 'curr'], ['pepend', 'pend'], ['tetend', 'tend'], ['momord', 'mord'], ['pepul', 'pul'], ['tetig', 'tig'], ['spopond', 'spond'], ['cecid', 'cid'], ['didic', 'dic'], ['tetul', 'tul'], ['pepig', 'pig']];

/** The stem the contracted perfects are built on (amav- to ama-, audiv- to audi-): amasti, audisse, audierunt. */
export function contractedPerfectStem(perfStem: string): string | undefined {
  if (!SYNC_SUFFIX.test(perfStem)) return undefined;
  return perfStem.slice(0, -2) + (perfStem.endsWith('iv') ? 'i' : perfStem.slice(-2, -1));
}

/** All the cells of a regular verb from a seed row. */
export function verbCells(row: VerbRow): Cell[] {
  const [lemma, inf, perf, sup, conjS, kind] = row;
  const conj = conjClassOf(conjS);
  const dep = kind === 'DEP';
  const semi = kind === 'SEMIDEP';
  const impers = kind === 'IMPERS';
  const out: Cell[] = [];
  const root = verbRoot(inf, conj, dep);
  const rootFut = conj === 1 ? root + 'a' : conj === 2 ? root + 'e' : root;
  const nf = NON_FINITE[conj];
  const im = IMPERATIVE[conj];

  // ── present system
  const act = !dep;
  const pas = dep ? 'Act' : 'Pass';
  if (act) {
    fin(out, root, PRES_IND_ACT[conj], 'Ind', 'Pres', 'Act');
    fin(out, root, IMPF_IND_ACT[conj], 'Ind', 'Imp', 'Act');
    fin(out, rootFut, FUT_IND_ACT[conj], 'Ind', 'Fut', 'Act');
    fin(out, root, PRES_SUBJ_ACT[conj], 'Sub', 'Pres', 'Act');
    fin(out, root, IMPF_SUBJ_ACT[conj], 'Sub', 'Imp', 'Act');
  }
  if (!semi || dep) {
    // passive (or the passive-looking forms of a deponent, which mean the active)
    const voice = dep ? 'Act' : 'Pass';
    fin(out, root, PRES_IND_PASS[conj], 'Ind', 'Pres', voice);
    fin(out, root, IMPF_IND_PASS[conj], 'Ind', 'Imp', voice);
    fin(out, rootFut, FUT_IND_PASS[conj], 'Ind', 'Fut', voice);
    fin(out, root, PRES_SUBJ_PASS[conj], 'Sub', 'Pres', voice);
    fin(out, root, IMPF_SUBJ_PASS[conj], 'Sub', 'Imp', voice);
  }
  void pas;

  // ── perfect system
  const perfStem = !dep && !semi && perf ? perf.replace(/i$/, '') : '';
  const pppStem = dep || semi ? perf.replace(/\s*us sum$/, '').replace(/us$/, '') : sup.replace(/um$/, '');
  if (perfStem) {
    const tables: Array<[MarkerEnding[], 'Ind' | 'Sub', string]> = [[PERF_IND_ACT, 'Ind', 'Perf'], [PLUP_IND_ACT, 'Ind', 'Pqp'], [FUT_PERF_IND_ACT, 'Ind', 'FutPerf'], [PERF_SUBJ_ACT, 'Sub', 'Perf'], [PLUP_SUBJ_ACT, 'Sub', 'Pqp']];
    for (const [t, mood, tense] of tables) fin(out, perfStem, t, mood, tense, 'Act');
    // the third person plural in -ere (dixere) and the contracted perfects (amasti, amarunt, audisse): older or poetic forms, listed as variants
    // fourth-conjugation perfects drop the v before e and i: audii, audiit, audierunt, audieram, audierit
    if (/iv$/.test(perfStem)) out.push(...perfectSystemCells(perfStem.slice(0, -1), 'contracted').filter((c) => c.features.VerbForm !== 'Inf'));
    // the contracted second person of the s- and x- perfects (dixti, scripsti, direxti)
    if (/[sx]$/.test(perfStem)) {
      out.push({ form: perfStem + 'ti', features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '2', Number: 'Sing' }, note: 'contracted' });
      out.push({ form: perfStem + 'tis', features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '2', Number: 'Plur' }, note: 'contracted' });
    }
    // contracted future perfect, perfect subjunctive and pluperfect (iudicarit, decrerit, conciliarat)
    const shortStem = contractedPerfectStem(perfStem);
    if (shortStem && !/iv$/.test(perfStem)) {
      const R: Array<[string, string, string[]]> = [['Ind', 'FutPerf', ['ro', 'ris', 'rit', 'rimus', 'ritis', 'rint']], ['Sub', 'Perf', ['rim', 'ris', 'rit', 'rimus', 'ritis', 'rint']], ['Ind', 'Pqp', ['ram', 'ras', 'rat', 'ramus', 'ratis', 'rant']]];
      for (const [mood, tense, ends] of R) ends.forEach((e, i) => out.push({ form: shortStem + e, features: { VerbForm: 'Fin', Mood: mood, Tense: tense, Voice: 'Act', Person: PERSONS[i][0], Number: PERSONS[i][1] }, note: 'contracted' }));
    }
    if (shortStem && /iv$/.test(perfStem)) out.push({ form: shortStem + 'ere', features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'contracted' });
    // a compound of a reduplicating verb drops the reduplication (occurrit for occucurrit); some first-conjugation verbs have a perfect in -ui
    for (const [from, to] of REDUPLICATION) if (perfStem.endsWith(from) && perfStem.length > from.length) out.push(...perfectSystemCells(perfStem.slice(0, -from.length) + to, 'variant'));
    if (conj === 1 && /(plic|crep|cub|son|ton|vet|dom|iuv)$/.test(root)) out.push(...perfectSystemCells(root + 'u', 'variant'));
    // a first-conjugation verb with an irregular perfect also takes the regular one in the Vulgate (cubavit, domavit)
    if (conj === 1 && !/av$/.test(perfStem)) out.push(...perfectSystemCells(root + 'av', 'variant'));
    out.push({ form: perfStem + 'ere', features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'variant' });
    if (SYNC_SUFFIX.test(perfStem)) {
      const short = perfStem.slice(0, -2) + (perfStem.endsWith('iv') ? 'i' : perfStem.slice(-2, -1));
      const sy = (f: string, features: Feats): void => { out.push({ form: f, features, note: 'contracted' }); };
      sy(short + 'sti', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '2', Number: 'Sing' });
      sy(short + 'stis', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '2', Number: 'Plur' });
      sy(short + 'runt', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' });
      sy(short + 'sse', { VerbForm: 'Inf', Tense: 'Perf', Voice: 'Act' });
      PLUP_SUBJ_ACT.forEach(([m, e], i) => {
        const [person, number] = PERSONS[i];
        sy(short + 's' + m.replace(/^isse/, 'se') + e, { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pqp', Voice: 'Act', Person: person, Number: number });
      });
    }
  }
  if (pppStem) {
    const ppp = pppStem + 'us';
    const pppPl = pppStem + 'i';
    const voice = dep || semi ? 'Act' : 'Pass';
    periphrasticFin(out, ppp, pppPl, SUM_AUX.presInd, 'Ind', 'Perf', voice);
    periphrasticFin(out, ppp, pppPl, SUM_AUX.imperfInd, 'Ind', 'Pqp', voice);
    periphrasticFin(out, ppp, pppPl, SUM_AUX.futInd, 'Ind', 'FutPerf', voice);
    periphrasticFin(out, ppp, pppPl, SUM_AUX.presSubj, 'Sub', 'Perf', voice);
    periphrasticFin(out, ppp, pppPl, SUM_AUX.imperfSubj, 'Sub', 'Pqp', voice);
  }

  // ── imperatives
  const imp = (form: string, tense: string, voice: string, person: string, number: string): void => {
    out.push({ form, features: { VerbForm: 'Fin', Mood: 'Imp', Tense: tense, Voice: voice, Person: person, Number: number } });
  };
  if (!dep) {
    imp(root + im.presActSg, 'Pres', 'Act', '2', 'Sing');
    imp(root + im.presActPl, 'Pres', 'Act', '2', 'Plur');
    imp(root + im.futActSgAndThird, 'Fut', 'Act', '2', 'Sing');
    imp(root + im.futActSgAndThird, 'Fut', 'Act', '3', 'Sing');
    imp(root + im.futActPl2, 'Fut', 'Act', '2', 'Plur');
    imp(root + im.futActPl3, 'Fut', 'Act', '3', 'Plur');
    if (conj === 3 && /(dic|duc)$/.test(root)) imp(root, 'Pres', 'Act', '2', 'Sing'); // dic, duc, adduc: the bare-stem imperative
    if (lemma === 'facio') imp('fac', 'Pres', 'Act', '2', 'Sing');
  }
  const pv = dep ? 'Act' : 'Pass';
  if (!semi || dep) {
    imp(root + im.presPassSg, 'Pres', pv, '2', 'Sing');
    imp(root + im.presPassPl, 'Pres', pv, '2', 'Plur');
    imp(root + im.futPassSgAndThird, 'Fut', pv, '2', 'Sing');
    imp(root + im.futPassSgAndThird, 'Fut', pv, '3', 'Sing');
    imp(root + im.futPassPl3, 'Fut', pv, '3', 'Plur');
  }

  // ── infinitives
  if (!dep) {
    out.push({ form: inf, features: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' } });
    out.push({ form: root + nf.infPresPass, features: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Pass' } });
    // the archaic and poetic passive infinitive in -ier (dicier, amarier)
    out.push({ form: root + nf.infPresPass + 'er', features: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Pass' }, note: 'variant' });
  } else {
    out.push({ form: inf, features: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' } });
  }
  if (perfStem) out.push({ form: perfStem + 'isse', features: { VerbForm: 'Inf', Tense: 'Perf', Voice: 'Act' } });
  if (pppStem) {
    const dv = dep || semi ? 'Act' : 'Pass';
    out.push({ form: pppStem + 'um esse', features: { VerbForm: 'Inf', Tense: 'Perf', Voice: dv }, periphrastic: true });
    out.push({ form: pppStem + 'urum esse', features: { VerbForm: 'Inf', Tense: 'Fut', Voice: 'Act' }, periphrastic: true });
    if (!dep && !semi) out.push({ form: pppStem + 'um iri', features: { VerbForm: 'Inf', Tense: 'Fut', Voice: 'Pass' }, periphrastic: true });
  }

  // ── participles, gerundive, gerund, supine
  if (act || dep) out.push(...presentParticipleCells(root + nf.ptcpPresNom, root + nf.ptcpPresStem, 'Act'));
  if (pppStem) {
    out.push(...adjLikeCells(pppStem + 'us', { VerbForm: 'Part', Tense: 'Perf', Voice: dep || semi ? 'Act' : 'Pass' }));
    out.push(...adjLikeCells(pppStem + 'urus', { VerbForm: 'Part', Tense: 'Fut', Voice: 'Act' }));
  }
  out.push(...adjLikeCells(root + nf.gerundive, { VerbForm: 'Gdv', Voice: 'Pass' }));
  // the archaic gerundive and gerund in -undus (faciundum, ferundum, defendundae) of the third and fourth conjugations
  if (conj === 3 || conj === '3io' || conj === 4) {
    const und = root + (conj === 3 ? 'und' : 'iund');
    out.push(...adjLikeCells(und + 'us', { VerbForm: 'Gdv', Voice: 'Pass' }).map((c) => ({ ...c, note: 'variant' })));
    for (const [c, e] of [['Gen', 'i'], ['Dat', 'o'], ['Acc', 'um'], ['Abl', 'o']] as const) out.push({ form: und + e, features: { VerbForm: 'Ger', Case: c, Number: 'Sing' }, note: 'variant' });
  }
  const gstem = root + nf.gerundive.replace(/us$/, '');
  for (const [c, e] of [['Gen', 'i'], ['Dat', 'o'], ['Acc', 'um'], ['Abl', 'o']] as const) out.push({ form: gstem + e, features: { VerbForm: 'Ger', Case: c, Number: 'Sing' } });
  if (pppStem) {
    out.push({ form: pppStem + 'um', features: { VerbForm: 'Sup', Case: 'Acc' } });
    out.push({ form: pppStem + 'u', features: { VerbForm: 'Sup', Case: 'Abl' } });
  }

  if (impers) {
    // an impersonal verb (oportet, licet, decet): only the third person singular, the infinitive and the non-finite forms
    return out.filter((c) => c.features.VerbForm !== 'Fin' || (c.features.Person === '3' && c.features.Number === 'Sing' && c.features.Mood !== 'Imp'))
      .filter((c) => c.features.VerbForm === 'Fin' || c.features.VerbForm === 'Inf' || c.features.VerbForm === 'Ger' || c.features.VerbForm === 'Part');
  }
  return out;
}
