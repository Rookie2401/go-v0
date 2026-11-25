/**
 * Plain words for an Arabic feature bundle: the one line of morphology on the word card. Unknown values pass through as they are.
 *
 *   verb       "perfect (completed action), 3rd person masculine singular, active"
 *              "imperfect (action in progress or not completed), you (m. sg.) or she, indicative, active"
 *   noun       "noun, genitive, definite"   /   "noun, nominative, accusative or genitive, construct state, dual"
 *   participle "active participle, ..." / verbal noun
 * It never says "past tense" or "present tense" as a fact: the two conjugations are about completed and uncompleted action, and the
 * time is the sentence's. A union of readings is told as the readings ("you (m. sg.) or she"), never as a cross product.
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive' };
const CASE_ORDER = ['Nom', 'Acc', 'Gen'];
const NUMBER: Record<string, string> = { Sing: 'singular', Dual: 'dual', Plur: 'plural', Coll: 'collective', Pauc: 'paucal' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine' };
const GENDER_ORDER = ['Masc', 'Fem'];
const DEFINITE: Record<string, string> = { Def: 'definite', Ind: 'indefinite', Cons: 'construct state' };
const PERSON: Record<string, string> = { 1: '1st person', 2: '2nd person', 3: '3rd person' };
const MOOD: Record<string, string> = { Ind: 'indicative', Sub: 'subjunctive', Jus: 'jussive', Imp: 'imperative' };
const MOOD_ORDER = ['Ind', 'Sub', 'Jus', 'Imp'];
const ASPECT: Record<string, string> = { Perf: 'perfect (completed action)', Imp: 'imperfect (action in progress or not completed)' };
const VOICE: Record<string, string> = { Act: 'active', Pass: 'passive' };
const POS_WORD: Record<string, string> = {
  NOUN: 'noun', PROPN: 'proper noun', ADJ: 'adjective', ADV: 'adverb', PRON: 'pronoun', DET: 'determiner', ADP: 'preposition', CONJ: 'conjunction',
  SCONJ: 'conjunction', PART: 'particle', NUM: 'numeral', INTJ: 'interjection',
};

/** "a", "a or b", "a, b or c". */
function words(map: Record<string, string>, v: string | undefined, order?: readonly string[]): string {
  if (!v) return '';
  let list = v.split(',');
  if (order) list = [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const w = list.map((x) => map[x] ?? x);
  return w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`;
}

const SHORT_N: Record<string, string> = { Sing: 'sg.', Dual: 'du.', Plur: 'pl.', Coll: 'coll.', Pauc: 'pauc.' };
const SHORT_G: Record<string, string> = { Masc: 'm.', Fem: 'f.' };

/** One person-gender-number cell in the words a learner knows: "she", "you (m. sg.)", "they (f.)", "we". */
function cellWords(p: string, g: string | undefined, n: string): string {
  const num = n === 'Sing' ? 'sg.' : SHORT_N[n] ?? n;
  const gen = g ? SHORT_G[g] ?? g : '';
  if (p === '1') return n === 'Sing' ? 'I' : n === 'Dual' ? 'we two' : 'we';
  if (p === '2') return `you (${[gen, num].filter(Boolean).join(' ')})`;
  if (n === 'Sing') return g === 'Fem' ? 'she' : g === 'Masc' ? 'he' : 'he or she';
  if (n === 'Dual') return g ? `they two (${gen})` : 'they two';
  return g ? `they (${gen})` : 'they';
}

/**
 * Person, gender and number of a verb or pronoun reading. Where the bundle holds a union that is really several cells (the imperfect
 * تَكْتُبُ is "you (m. sg.)" or "she"), the cells are told one by one from the known syncretisms; any other union is told feature
 * by feature.
 */
function personWords(m: Record<string, string>): string {
  const ps = (m.Person ?? '').split(',').filter(Boolean);
  const gs = (m.Gender ?? '').split(',').filter(Boolean);
  const ns = (m.Number ?? '').split(',').filter(Boolean);
  if (!ps.length && !gs.length && !ns.length) return '';
  if (ps.length === 1 && gs.length <= 1 && ns.length <= 1) {
    const p = ps[0], g = gs[0], n = ns[0] ?? 'Sing';
    if (p === '3' || p === '2') return `${PERSON[p]} ${[g ? GENDER[g] : '', NUMBER[n] ?? n].filter(Boolean).join(' ')}`.trim();
    return `${PERSON[p]} ${NUMBER[n] ?? n}`.trim();
  }
  // the known syncretisms of the imperfect: 2 m. = 3 f. (sg., du.), 2 f. pl. = 3 f. pl.
  if (ps.length === 2 && ps.includes('2') && ps.includes('3') && ns.length === 1) {
    const n = ns[0];
    if (n === 'Sing') return `${cellWords('2', 'Masc', n)} or ${cellWords('3', 'Fem', n)}`;
    if (n === 'Dual') return `${cellWords('2', undefined, n)} or ${cellWords('3', 'Fem', n)}`;
    if (n === 'Plur' && gs.length === 1 && gs[0] === 'Fem') return `${cellWords('2', 'Fem', n)} or ${cellWords('3', 'Fem', n)}`;
  }
  const parts: string[] = [];
  if (ps.length) parts.push(words(PERSON, m.Person));
  if (gs.length) parts.push(words(GENDER, m.Gender, GENDER_ORDER));
  if (ns.length) parts.push(words(NUMBER, m.Number));
  return parts.join(' ');
}

export function describeArMorph(morph: Record<string, string>, pos?: PartOfSpeech | string): string {
  const out: string[] = [];
  const voice = words(VOICE, morph.Voice);
  const cs = words(CASE, morph.Case, CASE_ORDER);
  const def = words(DEFINITE, morph.Definite);
  const form = morph.Form ? `form ${morph.Form}` : '';

  if (morph.VerbForm === 'Part') {
    out.push(`${voice ? `${voice} ` : ''}participle`);
    if (form) out.push(form);
  } else if (morph.VerbForm === 'Vnoun') {
    out.push('verbal noun');
    if (form) out.push(form);
  } else if (morph.VerbForm === 'Fin' || morph.Aspect || morph.Mood) {
    if (morph.Mood === 'Imp') {
      out.push('imperative');
      const pw = personWords({ ...morph, Person: morph.Person ?? '2' });
      if (pw) out.push(pw);
    } else {
      const aspect = words(ASPECT, morph.Aspect);
      if (aspect) out.push(aspect);
      const pw = personWords(morph);
      if (pw) out.push(pw);
      const mood = words(MOOD, morph.Mood, MOOD_ORDER);
      if (mood && !(morph.Mood === 'Ind' && morph.Aspect === 'Perf')) out.push(mood);
    }
    if (voice) out.push(voice);
    if (form) out.push(form);
    return out.join(', ');
  } else if (pos && POS_WORD[pos] && (morph.Case || morph.Definite || morph.Number || morph.Gender || morph.Person || pos === 'NOUN' || pos === 'ADJ')) {
    out.push(POS_WORD[pos]);
  }

  if (pos === 'PRON' || pos === 'DET') {
    const pw = personWords(morph);
    if (pw && !morph.Case) { out.push(pw); return out.join(', '); }
  }
  if (cs) out.push(cs);
  if (def) out.push(def);
  const num = words(NUMBER, morph.Number);
  if (num) out.push(num);
  const gen = words(GENDER, morph.Gender, GENDER_ORDER);
  if (gen) out.push(gen);
  if (morph.Person && pos !== 'VERB') { const pw = words(PERSON, morph.Person); if (pw) out.push(pw); }
  if (morph.Degree === 'Cmp') out.push('elative (comparative)');
  if (morph.Pausal === 'Yes') out.push('pausal form, without its ending');
  return out.join(', ');
}
