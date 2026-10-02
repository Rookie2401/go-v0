/**
 * A Hindi feature bundle in plain English, for the word sheet (package H2, docs/PLAN12.md). Machine-drafted wording.
 * "masculine, oblique plural" · "feminine singular, perfective participle" · "first person singular, future" ·
 * "polite command (आप)" · "bare stem (before a second verb)" · "stem + कर: having done".
 */
import type { PartOfSpeech } from '../../core';

const PERSON: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const CASE: Record<string, string> = {
  Dir: 'direct', Obl: 'oblique', Voc: 'vocative', Erg: 'ergative (ने)', Dat: 'dative (को)', Gen: 'genitive (का)',
};
const TYPE: Record<string, string> = { Dem: 'demonstrative', Int: 'interrogative', Rel: 'relative', Ind: 'indefinite' };
const POLITE_WORD: Record<string, string> = { Infm: 'तू', Fam: 'तुम', Form: 'आप' };

const number = (m: Record<string, string>): string => (m.Number === 'Sing' ? 'singular' : m.Number === 'Plur' ? 'plural' : '');
const gender = (m: Record<string, string>): string => (m.Gender === 'Masc' ? 'masculine' : m.Gender === 'Fem' ? 'feminine' : '');

/** "masculine, oblique plural" / "feminine singular" / "oblique singular": the nominal agreement the form shows. */
function agreement(m: Record<string, string>): string {
  const g = gender(m);
  const n = number(m);
  const c = m.Case && m.Case !== 'Gen' && CASE[m.Case] ? CASE[m.Case] : '';
  const tail = [c, n].filter(Boolean).join(' ');
  if (c) return [g, tail].filter(Boolean).join(', ');
  return [g, n].filter(Boolean).join(' ');
}

/** "first person singular", "first or third person plural", "second person (तुम)". */
function personText(m: Record<string, string>): string {
  const ps = (m.Person ?? '').split(',').filter((p) => PERSON[p]);
  if (!ps.length) return [gender(m), number(m)].filter(Boolean).join(' ');
  const n = number(m);
  let words: string[];
  if (ps.length === 1) {
    words = [PERSON[ps[0]]];
  } else {
    words = ps.map((p) => (p === '2' ? (m.Number === 'Plur' ? 'second (polite, आप)' : 'second (तू)') : PERSON[p]));
  }
  const list = words.length <= 1 ? words[0] : words.slice(0, -1).join(', ') + ' or ' + words[words.length - 1];
  let t = `${list} person${n ? ' ' + n : ''}`;
  if (ps.length === 1 && ps[0] === '2' && m.Polite && POLITE_WORD[m.Polite]) t += ` (${POLITE_WORD[m.Polite]})`;
  return t;
}

function finite(m: Record<string, string>): string {
  if (m.Mood === 'Imp') {
    const who = m.Polite === 'Form' ? 'polite command (आप)' : m.Polite === 'Fam' ? 'familiar command (तुम)' : 'plain command (तू)';
    return m.Tense === 'Fut' ? `${who}, for later (-इएगा)` : who;
  }
  const g = gender(m);
  if (m.Tense === 'Past') return `${[g, number(m)].filter(Boolean).join(' ')}, past (was / were)`;
  const who = personText(m);
  if (m.Mood === 'Sub') return `${who}, subjunctive`;
  if (m.Tense === 'Fut') return `${who}, future${g ? ` (${g})` : ''}`;
  if (m.Tense === 'Pres') return `${who}, present (is / am / are)`;
  return who;
}

function verbal(m: Record<string, string>): string {
  switch (m.VerbForm) {
    case 'Stem': return 'bare stem (before a second verb)';
    case 'Conv': return 'stem + कर: having done';
    case 'Inf': return m.Gender === 'Fem' ? 'feminine infinitive' : m.Case === 'Obl' ? 'infinitive, oblique (before a postposition)' : 'infinitive';
    case 'Part': {
      const kind = m.Aspect === 'Imp' ? 'imperfective participle' : m.Aspect === 'Prog' ? 'progressive auxiliary (रहा)' : m.Aspect === 'Perf' ? 'perfective participle' : 'participle';
      return `${agreement(m)}, ${kind}`.replace(/^, /, '');
    }
    case 'Fin': return finite(m);
    default: return '';
  }
}

function nominal(m: Record<string, string>, pos?: PartOfSpeech): string {
  const bits: string[] = [];
  if (m.PronType || m.Poss) {
    if (m.Poss === 'Yes') {
      bits.push(m.Reflex === 'Yes' ? 'possessive (one\'s own)' : `possessive of the ${PERSON[m.Person ?? ''] ?? 'third'} person`);
      const agr = agreement({ ...m, Case: m.Case === 'Gen' ? '' : m.Case ?? '' });
      if (agr) bits.push(agr);
      if (m.Case === 'Gen') bits.push('genitive (का)');
    } else {
      if (m.PronType && TYPE[m.PronType]) bits.push(TYPE[m.PronType]);
      const who = personText(m);
      if (who) bits.push(who);
      if (m.Case && CASE[m.Case]) bits.push(CASE[m.Case]);
    }
    return bits.join(', ');
  }
  const agr = agreement(m);
  if (agr) return agr;
  return pos === 'ADJ' ? 'does not change' : '';
}

/** "feminine singular, perfective participle", "oblique plural", "polite command": plain words for a feature bundle. */
export function describeMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  let text = morph.VerbForm ? verbal(morph) : nominal(morph, pos);
  if (!text) {
    const entries = Object.entries(morph);
    if (!entries.length) return '';
    text = entries.map(([k, v]) => `${k} ${v}`).join(', ');
  }
  if (morph.Voice === 'Cau') text += ', causative';
  return text;
}
