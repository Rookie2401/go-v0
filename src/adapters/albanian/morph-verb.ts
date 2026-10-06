/**
 * Verb inflection: present, imperfect, aorist, subjunctive, imperative, optative, admirative, participle, active and
 * non-active, from a verb's principal parts; and readings by ending for a verb the word list does not hold. Package Q2.
 *
 * The language is contemporary STANDARD Albanian. Machine-drafted rules, not checked by a native speaker. Where a
 * pattern is not certain for a class, the form is not generated (optative and admirative exist only for verbs in -oj
 * with a participle in -uar, and for the irregular verbs that list them in `forms`).
 *
 * Model: every form is first an atomic slot (one form, one person, one mood, one voice); `forms` entries of the lexeme
 * replace the slot with the same feature bundle (and may add readings); then slots that only differ in the person or in
 * Ind / Sub are united, so that "punon" is one reading with Person '2,3' and "punoj" one with Mood 'Ind,Sub'.
 *
 * Explicit `forms` ("form: tags", parsed with sqMorph): a finite form without Voice is active, without Mood is
 * indicative; a union of persons or moods is split into its parts first. An entry replaces what the rules would have
 * made for the same person / number / tense / mood / voice. Two entries are also read by the engine itself:
 *   - an explicit "2 pl pres ind" form (flisni, dilni, shihni) states the second present stem of a consonant verb; the
 *     imperfect (flisja), the plural imperative and the non-active stem follow from it;
 *   - an explicit "1 sg pres ind mid" form (flitem, blihem, shitem) states the non-active stem; the whole non-active
 *     present and imperfect follow from it (also for class 'irr' when `nonActive` is set).
 * Class 'irr' takes everything from `forms` (and the participle from `participle` when given).
 *
 * Aorist (from `aorist` = 1sg, `aorist3`, `participle`):
 *   - 1sg in -shë (dhashë, pashë, thashë, lashë): 2sg = `aorist3` with a to e (dhe, pe, the, le), plural stem + më / të / në;
 *   - 1sg in -va with participle in -uar / -yer (punova, ktheva): -ve, 3sg `aorist3` or stem + i, plural from the
 *     participle (punuam, kthyem);
 *   - 1sg in -va with `aorist3` in -u (lava / lau, piva / piu): -ve, plural stem + më / të / në (lamë);
 *   - 1sg in -a (hapa, mora, dita, luajta): -e, -i (or `aorist3`), -ëm / -ët / -ën.
 * Mixed paradigms (vura / vumë, bëra / bëmë, hyra / hymë) state their odd forms in `forms`: which short -ra aorists
 * have the strong plural (hyj, bëj, vë, zë) and which the weak one (marr: morëm, ha: hëngrëm) is lexical.
 * Vowel stems in -e / -ë take the i-stem in the 2nd plural (flini, lini, vini, ngrini); for consonant stems the change
 * (e/a/o to i: ndizni, flisni, shihni; but qeshni, pyesni) is lexical and stated in `forms`.
 */
import type { SqForm, SqLexeme } from './types';
import { sqMorph } from './types';

export { guessVerb } from './morph-verb-guess';

type M = Record<string, string>;
interface Slot { form: string; morph: M }

const PN: Array<[string, string]> = [['1', 'Sing'], ['2', 'Sing'], ['3', 'Sing'], ['1', 'Plur'], ['2', 'Plur'], ['3', 'Plur']];
const keyOf = (m: M, skip: string[] = []): string =>
  Object.keys(m).filter((k) => !skip.includes(k)).sort().map((k) => `${k}=${m[k]}`).join(';');

function fin6(out: Slot[], forms: ReadonlyArray<string | undefined>, extra: M): void {
  forms.forEach((f, i) => {
    if (f) out.push({ form: f, morph: { Person: PN[i][0], Number: PN[i][1], ...extra, VerbForm: 'Fin' } });
  });
}

// ───────────────────────────── explicit forms of the lexeme ─────────────────────────────

function parseExplicit(lex: SqLexeme): Slot[] {
  const atoms: Slot[] = [];
  for (const entry of lex.forms ?? []) {
    const i = entry.indexOf(':');
    if (i < 1) throw new Error(`verb ${lex.lemma}: malformed form entry "${entry}"`);
    const form = entry.slice(0, i).trim().normalize('NFC').toLowerCase();
    const m = sqMorph(entry.slice(i + 1));
    if (m.VerbForm === 'Fin') {
      m.Voice ??= 'Act';
      m.Mood ??= 'Ind';
    }
    let parts: M[] = [m];
    for (const feat of ['Person', 'Mood', 'Number']) {
      parts = parts.flatMap((p) => (p[feat] && p[feat].includes(',') ? p[feat].split(',').map((v) => ({ ...p, [feat]: v })) : [p]));
    }
    for (const p of parts) atoms.push({ form, morph: p });
  }
  return atoms;
}

const isPres2pl = (s: Slot): boolean =>
  s.morph.Person === '2' && s.morph.Number === 'Plur' && s.morph.Tense === 'Pres' && s.morph.Voice === 'Act' && s.morph.Mood === 'Ind';
const isMid1sg = (s: Slot): boolean =>
  s.morph.Person === '1' && s.morph.Number === 'Sing' && s.morph.Tense === 'Pres' && s.morph.Voice === 'Mid' && s.morph.Mood === 'Ind';

// ───────────────────────────── active paradigms by class ─────────────────────────────

interface Paradigm {
  pres: string[];
  subj2: string;
  subj3: string;
  impf?: string[];
  impSg?: string;
  impPl?: string;
  opt?: string[];
  adm?: string[];
  /** Non-active stem (lahem: lah). */
  na?: string;
}

function ojParadigm(lex: SqLexeme): Paradigm | undefined {
  const l = lex.lemma;
  if (!l.endsWith('j')) return undefined;
  const s = l.slice(0, -1);
  const p: Paradigm = {
    pres: [l, `${s}n`, `${s}n`, `${l}më`, `${s}ni`, `${l}në`],
    subj2: `${s}sh`,
    subj3: `${l}ë`,
    impf: [`${l}a`, `${l}e`, `${s}nte`, `${s}nim`, `${s}nit`, `${s}nin`],
    impPl: `${s}ni`,
    na: l.endsWith('uaj') ? `${l.slice(0, -2)}h` : `${s}h`,
  };
  if (l.endsWith('oj')) {
    p.impSg = s;
    p.opt = ['fsha', 'fsh', 'ftë', 'fshim', 'fshi', 'fshin'].map((x) => s + x);
    const part = lex.participle;
    if (part?.endsWith('uar')) p.adm = ['kam', 'ke', 'ka', 'kemi', 'keni', 'kan'].map((x) => part.slice(0, -1) + x);
  } else if (/[aë]j$/.test(l)) {
    p.impSg = l;
  }
  return p;
}

function consParadigm(lex: SqLexeme, ex: Slot[]): Paradigm {
  const l = lex.lemma;
  const [a, b] = (lex.pres23 ?? '').split('/');
  const s2 = a || l;
  const s3 = (b ?? a) || l;
  const given = ex.find(isPres2pl)?.form;
  const S2 = given?.endsWith('ni') ? given.slice(0, -2) : s2;
  return {
    pres: [l, s2, s3, `${l}im`, `${S2}ni`, `${l}in`],
    subj2: `${l}ësh`,
    subj3: `${l}ë`,
    impf: [`${S2}ja`, `${S2}je`, `${S2}te`, `${S2}nim`, `${S2}nit`, `${S2}nin`],
    impSg: S2 === s2 ? s2 : undefined,
    impPl: `${S2}ni`,
    na: S2,
  };
}

function vowelParadigm(lex: SqLexeme): Paradigm {
  const l = lex.lemma;
  const b = l.endsWith('e') ? `${l.slice(0, -1)}i` : l.endsWith('ë') ? undefined : l;
  // a stem in -e / -ë takes the i-stem before -ni (fle: flini, lë: lini, vë: vini, ngre: ngrini) and in the imperfect
  const i2 = l.endsWith('e') || l.endsWith('ë') ? `${l.slice(0, -1)}i` : l;
  return {
    pres: [l, l, l, `${l}më`, `${i2}ni`, `${l}në`],
    subj2: `${l}sh`,
    subj3: l.endsWith('ë') ? `${l}rë` : `${l}jë`,
    impf: b ? [`${b}ja`, `${b}je`, `${b}nte`, `${b}nim`, `${b}nit`, `${b}nin`] : undefined,
    impPl: `${i2}ni`,
    na: l.endsWith('e') || l.endsWith('ë') ? `${l.slice(0, -1)}ih` : `${l}h`,
  };
}

// ───────────────────────────── aorist ─────────────────────────────

interface Aorist { forms: Array<string | undefined>; mid3?: string }

function aoristOf(lex: SqLexeme): Aorist | undefined {
  const a = lex.aorist;
  if (!a) return undefined;
  const a3 = lex.aorist3;
  const p = lex.participle ?? '';
  if (a.endsWith('shë')) {
    if (!a3) return undefined;
    const st = a.slice(0, -3);
    return { forms: [a, a3.endsWith('a') ? `${a3.slice(0, -1)}e` : a3, a3, `${st}më`, `${st}të`, `${st}në`] };
  }
  if (a.endsWith('va')) {
    const st = a.slice(0, -2);
    if (/(uar|yer)$/.test(p)) {
      const base = p.slice(0, -1);
      return { forms: [a, `${st}ve`, a3 ?? `${st}i`, `${base}m`, `${base}t`, `${base}n`], mid3: base };
    }
    if (a3?.endsWith('u')) return { forms: [a, `${st}ve`, a3, `${st}më`, `${st}të`, `${st}në`], mid3: st };
    return { forms: [a, `${st}ve`, a3 ?? `${st}i`] };
  }
  if (a.endsWith('a')) {
    const st = a.slice(0, -1);
    return { forms: [a, `${st}e`, a3 ?? `${st}i`, `${st}ëm`, `${st}ët`, `${st}ën`], mid3: st };
  }
  return undefined;
}

// ───────────────────────────── non-active ─────────────────────────────

function midSlots(out: Slot[], st: string, withImperative: boolean): void {
  const pres = ['em', 'esh', 'et', 'emi', 'eni', 'en'].map((x) => st + x);
  fin6(out, pres, { Tense: 'Pres', Mood: 'Ind', Voice: 'Mid' });
  fin6(out, pres, { Tense: 'Pres', Mood: 'Sub', Voice: 'Mid' });
  fin6(out, ['esha', 'eshe', 'ej', 'eshim', 'eshit', 'eshin'].map((x) => st + x), { Tense: 'Imp', Mood: 'Ind', Voice: 'Mid' });
  if (withImperative) {
    fin6(out, [undefined, `${st}u`], { Mood: 'Imp', Voice: 'Mid' });
    fin6(out, [undefined, undefined, undefined, undefined, `${st}uni`], { Mood: 'Imp', Voice: 'Mid' });
  }
}

// ───────────────────────────── generation ─────────────────────────────

function generate(lex: SqLexeme, ex: Slot[]): Slot[] {
  const out: Slot[] = [];
  const only = lex.nonActive === 'only';
  const aor = aoristOf(lex);
  const midStated = ex.find(isMid1sg)?.form;
  let par: Paradigm | undefined;

  if (!only && lex.cls !== 'irr') {
    par = lex.cls === 'oj' ? ojParadigm(lex) : lex.cls === 'cons' ? consParadigm(lex, ex) : lex.cls === 'vowel' ? vowelParadigm(lex) : undefined;
    if (par) {
      const p = par;
      const act = { Voice: 'Act' };
      fin6(out, p.pres, { Tense: 'Pres', Mood: 'Ind', ...act });
      fin6(out, p.pres.map((f, i) => (i === 1 ? p.subj2 : i === 2 ? p.subj3 : f)), { Tense: 'Pres', Mood: 'Sub', ...act });
      if (p.impf) fin6(out, p.impf, { Tense: 'Imp', Mood: 'Ind', ...act });
      if (p.impSg) fin6(out, [undefined, p.impSg], { Mood: 'Imp', ...act });
      if (p.impPl) fin6(out, [undefined, undefined, undefined, undefined, p.impPl], { Mood: 'Imp', ...act });
      if (p.opt) fin6(out, p.opt, { Mood: 'Opt', ...act });
      if (p.adm) fin6(out, p.adm, { Tense: 'Pres', Mood: 'Adm', ...act });
    }
    if (aor) fin6(out, aor.forms, { Tense: 'Past', Mood: 'Ind', Voice: 'Act' });
  }

  // A verb that exists only in the non-active (lindem, mbetem, ndodhem, nisem, ulem): its aorist is written with the active
  // endings, with "u" before it (u ula, u nisëm, u lindën) or without (mbeti, lindi, ndodhi); both are the non-active aorist.
  // The third person singular is generated only when the list states it (aorist3: mbeti, lindi, ndodhi); the special
  // non-active third person (u ul, u nis) follows below as mid3.
  if (only && aor) {
    fin6(out, aor.forms.map((f, i) => (i === 2 && !lex.aorist3 ? undefined : f)), { Tense: 'Past', Mood: 'Ind', Voice: 'Mid' });
  }

  if (lex.participle) out.push({ form: lex.participle, morph: { VerbForm: 'Part' } });

  let naStem: string | undefined;
  if (only) naStem = midStated ? midStated.replace(/em$/, '') : lex.lemma.endsWith('em') ? lex.lemma.slice(0, -2) : undefined;
  else if (lex.nonActive) naStem = midStated ? midStated.replace(/em$/, '') : par?.na;
  if (naStem) midSlots(out, naStem, lex.cls !== 'irr');
  if ((only || lex.nonActive) && aor?.mid3 && aor.mid3 !== aor.forms[2]) {
    out.push({ form: aor.mid3, morph: { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Mid', VerbForm: 'Fin' } });
  }
  return out;
}

// ───────────────────────────── merging and rule text ─────────────────────────────

function uniteMood(list: Slot[]): Slot[] {
  const twinOf = new Map<Slot, Slot>(); // Ind slot -> its Sub twin
  for (const s of list) {
    if (s.morph.Mood !== 'Ind') continue;
    const twin = list.find((t) => t.form === s.form && t.morph.Mood === 'Sub' && keyOf(t.morph, ['Mood']) === keyOf(s.morph, ['Mood']));
    if (twin) twinOf.set(s, twin);
  }
  const twins = new Set(twinOf.values());
  const out: Slot[] = [];
  for (const s of list) {
    if (twins.has(s)) continue;
    out.push(twinOf.has(s) ? { form: s.form, morph: { ...s.morph, Mood: 'Ind,Sub' } } : s);
  }
  return out;
}

function unitePerson(list: Slot[]): Slot[] {
  const out: Slot[] = [];
  const done = new Set<Slot>();
  for (const s of list) {
    if (done.has(s)) continue;
    const group = s.morph.Person ? list.filter((t) => t.form === s.form && keyOf(t.morph, ['Person']) === keyOf(s.morph, ['Person'])) : [s];
    group.forEach((g) => done.add(g));
    if (group.length > 1) out.push({ form: s.form, morph: { ...s.morph, Person: group.map((g) => g.morph.Person).sort().join(',') } });
    else out.push(s);
  }
  return out;
}

const ORD: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const MOODS: Record<string, string> = { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative', Opt: 'optative', Adm: 'admirative' };
const TENSES: Record<string, string> = { Pres: 'present', Imp: 'imperfect', Past: 'aorist' };

function ruleOf(m: M, lemma: string): string {
  if (m.VerbForm === 'Part') return `participle of ${lemma}`;
  const voice = m.Voice === 'Mid' ? 'non-active ' : '';
  const tense = m.Tense ? TENSES[m.Tense] : '';
  const mood = (m.Mood ?? '').split(',').map((x) => MOODS[x]).join(' or ');
  const what = m.Mood === 'Ind' && (m.Tense === 'Imp' || m.Tense === 'Past') ? tense : [tense, mood].filter(Boolean).join(' ');
  const who = `${(m.Person ?? '').split(',').map((x) => ORD[x]).join(' or ')} person ${m.Number === 'Plur' ? 'plural' : 'singular'}`;
  return `${voice}${what}, ${who}, of ${lemma}`;
}

// ───────────────────────────── public ─────────────────────────────

/** Every simple (one-word) form of a verb. Compound tenses (kam punuar, do të punoj) are constructions, not forms. */
export function verbForms(lex: SqLexeme): SqForm[] {
  const ex = parseExplicit(lex);
  const slots = generate(lex, ex);
  // explicit entries replace the generated slot with the same feature bundle, and may add readings
  const replaced = new Set(ex.map((e) => keyOf(e.morph)));
  const kept = slots.filter((s) => !replaced.has(keyOf(s.morph)));
  const seen = new Set<string>();
  const all = [...kept, ...ex].filter((s) => {
    const k = `${s.form}|${keyOf(s.morph)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unitePerson(uniteMood(all)).map((s) => ({ form: s.form, morph: s.morph, rule: ruleOf(s.morph, lex.lemma) }));
}
