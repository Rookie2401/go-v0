/**
 * Rule checks on a learner's own Latin (GoTell). MACHINE-DRAFTED, no Latinist has checked them; marked NOT dependable in the adapter's
 * `support` ('limited'). An empty result means nothing was found, never "correct". Every check fires only on its own unambiguous shape,
 * reads the analyser's readings for the facts it needs (every reading, not only the first) and says nothing when a fact is missing or
 * when any reading would make the sentence right. A suggestion (exact offsets in `sentence`) is offered only where the fix is certain.
 * Measured against the Vulgate and the Ritchie and Caesar texts of the ladder (test/course/latin-production.test.ts): a check that fires on
 * native prose is a false alarm, and the test holds that count at zero.
 *
 * Checks (category):
 *   1. a detached enclitic: "populus que" (spelling): -que, -ne and -ve are written joined to their word, "populusque";
 *   2. "a" / "e" before a vowel or h: "a amico", "e urbe" (spelling): before a vowel the prepositions are "ab" and "ex";
 *   3. a preposition followed by a word in a case it never takes: "ad urbe", "sine aquam" (case): every reading of the next word is a
 *      noun, adjective or pronoun form, none of them is in the preposition's case, and none is a genitive (a genitive often stands
 *      before the governed noun: "propter eius magnitudinem", "ad solis occasum"). Only prepositions that are rarely adverbs are
 *      checked (post, ante, contra, prope … are often adverbs: "paulo post"), and never cum, which in prose is mostly the conjunction
 *      ("cum haec audiret");
 *   4. ego or tu directly before a verb of another person or number: "ego amat", "tu sum" (agreement); only where the pronoun begins its
 *      clause (not "ego et tu sumus") and every reading of the verb is finite and disagrees. nos and vos are as often objects ("ne nos
 *      inducas") and are not checked;
 *   5. a first- or second-person form of possum, volo, nolo, malo, debeo, soleo or incipio straight before a finite verb of the same
 *      person and number: "possum venio", "volo video" (syntax): these take an infinitive, "possum venire". Third-person forms are not
 *      checked: native prose ends clauses with them ("quid fieri vellet docuit", "ubi vult spirat").
 */
import type { AnalysisCandidate, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';

const split = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u');
const quoted = (s: string): string => `“${s}”`;

/** Prepositions that take one case only (the folded spelling). in, sub, super and subter take both and are never checked. */
const ACC_ONLY = new Set(['ad', 'apud', 'erga', 'inter', 'ob', 'per', 'trans']);
const ABL_ONLY = new Set(['a', 'ab', 'abs', 'de', 'e', 'ex', 'prae', 'pro', 'sine']);
/** Words that take an infinitive (their lemma). */
const TAKES_INFINITIVE = new Set(['possum', 'uolo', 'nolo', 'malo', 'debeo', 'soleo', 'incipio']);
const PERSONAL: Record<string, { person: string; number: string }> = {
  ego: { person: '1', number: 'Sing' }, tu: { person: '2', number: 'Sing' },
};
const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'PRON', 'DET', 'NUM']);
const CLAUSE_JOINERS = new Set(['et', 'ac', 'atque', 'aut', 'uel', 'nec', 'neque', 'sed', 'quam']);

/** The next word after token i, with nothing but spaces between (no punctuation); undefined otherwise. */
function nextWord(tokens: RawToken[], i: number): number | undefined {
  for (let j = i + 1; j < tokens.length; j++) {
    if (tokens[j].isWord) return j;
    if (tokens[j].surface.trim()) return undefined; // punctuation between: not the same phrase
  }
  return undefined;
}
/** The word before token i, with nothing but spaces between; undefined when punctuation or the sentence start is there. */
function prevWord(tokens: RawToken[], i: number): number | undefined {
  for (let j = i - 1; j >= 0; j--) {
    if (tokens[j].isWord) return j;
    if (tokens[j].surface.trim()) return undefined;
  }
  return undefined;
}
const readings = (a: AnalyzedToken | undefined): AnalysisCandidate[] => (a?.candidates ?? []).filter((c) => !!c.lemma);
const isName = (tokens: RawToken[], analyses: AnalyzedToken[], i: number): boolean =>
  readings(analyses[i]).some((c) => c.pos === 'PROPN') || (i > 0 && /^\p{Lu}/u.test(tokens[i].surface) && prevWord(tokens, i) !== undefined);

export function checkLatinProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.isWord) continue;
    const f = fold(t.surface);

    // 1. a detached enclitic
    if (f === 'que' || f === 've') {
      const p = prevWord(tokens, i);
      if (p !== undefined) {
        const host = tokens[p];
        out.push({
          category: 'spelling', tokenIndexes: [p, i], confidence: f === 'que' ? 0.9 : 0.6, affectsMeaning: false,
          message: `${quoted(`-${t.surface}`)} is written joined to its word: ${quoted(host.surface + t.surface)}.`,
          suggestion: { start: host.start, end: t.end, replacement: host.surface + t.surface },
        });
      }
      continue;
    }

    // 2. "a" / "e" before a vowel or h
    if ((f === 'a' || f === 'e') && readings(analyses[i]).some((c) => c.pos === 'ADP')) {
      const n = nextWord(tokens, i);
      // a consonantal i (Iesus, Ierusalem, iam) is a consonant; only a, e, o, u, y, and h count, and i before a consonant
      const next = n !== undefined ? fold(tokens[n].surface) : '';
      if (n !== undefined && /^(?:[aeouy]|h|i(?![aeiou]))/u.test(next) && !/^u[aeiou]/u.test(next)) {
        const replacement = (f === 'a' ? 'ab' : 'ex');
        const fixed = /^\p{Lu}/u.test(t.surface) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
        out.push({
          category: 'spelling', tokenIndexes: [i, n], confidence: 0.75, affectsMeaning: false,
          message: `Before a vowel or h, ${quoted(t.surface)} is written ${quoted(fixed)}: ${quoted(`${fixed} ${tokens[n].surface}`)}.`,
          suggestion: { start: t.start, end: t.end, replacement: fixed },
        });
        continue;
      }
    }

    // 3. a preposition and a case it never takes
    const takes = ACC_ONLY.has(f) ? 'Acc' : ABL_ONLY.has(f) ? 'Abl' : undefined;
    if (takes && readings(analyses[i]).some((c) => c.pos === 'ADP')) {
      const n = nextWord(tokens, i);
      if (n !== undefined && !isName(tokens, analyses, n)) {
        const rs = readings(analyses[n]);
        const nominal = rs.length > 0 && rs.every((c) => NOMINAL.has(c.pos ?? '') && split(c.morph.Case).length > 0);
        const fits = rs.some((c) => split(c.morph.Case).includes(takes) || split(c.morph.Case).includes('Gen'));
        if (nominal && !fits && rs.every((c) => !c.unconfirmed)) {
          const caseName = takes === 'Acc' ? 'accusative' : 'ablative';
          out.push({
            category: 'case', tokenIndexes: [i, n], confidence: 0.7, affectsMeaning: true,
            message: `${quoted(t.surface)} takes the ${caseName}; ${quoted(tokens[n].surface)} is not an ${caseName} form.`,
          });
        }
      }
    }

    // 4. a personal pronoun and a verb of another person or number
    const pron = PERSONAL[f];
    if (pron && readings(analyses[i]).some((c) => c.pos === 'PRON' && split(c.morph.Case).includes('Nom'))) {
      const p = prevWord(tokens, i);
      const beginsClause = p === undefined || !CLAUSE_JOINERS.has(fold(tokens[p].surface));
      const n = nextWord(tokens, i);
      if (beginsClause && n !== undefined) {
        const rs = readings(analyses[n]);
        const finite = rs.length > 0 && rs.every((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin' && !!c.morph.Person);
        const agrees = rs.some((c) => split(c.morph.Person).includes(pron.person) && split(c.morph.Number).includes(pron.number));
        if (finite && !agrees && rs.every((c) => !c.unconfirmed)) {
          const who = `${pron.person === '1' ? 'first' : 'second'} person ${pron.number === 'Sing' ? 'singular' : 'plural'}`;
          out.push({
            category: 'agreement', tokenIndexes: [i, n], confidence: 0.7, affectsMeaning: true,
            message: `With ${quoted(t.surface)} the verb is ${who}; ${quoted(tokens[n].surface)} is not.`,
          });
        }
      }
    }

    // 5. a first- or second-person form of a verb that takes an infinitive, then a finite verb of the same person and number
    const head = readings(analyses[i])[0];
    if (head && (head.pos === 'VERB' || head.pos === 'AUX') && TAKES_INFINITIVE.has(fold(head.lemma ?? '')) && head.morph.VerbForm === 'Fin' && ['1', '2'].includes(head.morph.Person ?? '')) {
      const n = nextWord(tokens, i);
      if (n !== undefined) {
        const rs = readings(analyses[n]);
        const finiteOnly = rs.length > 0 && rs.every((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin');
        const same = rs.some((c) => split(c.morph.Person).includes(head.morph.Person!) && split(c.morph.Number).some((x) => split(head.morph.Number).includes(x)));
        const sameLemma = rs.some((c) => TAKES_INFINITIVE.has(fold(c.lemma ?? '')));
        if (finiteOnly && same && !sameLemma && rs.every((c) => !c.unconfirmed)) {
          out.push({
            category: 'syntax', tokenIndexes: [i, n], confidence: 0.65, affectsMeaning: false,
            message: `A form of ${quoted(head.lemma!)} takes an infinitive: ${quoted(tokens[n].surface)} should be the infinitive of its verb.`,
          });
        }
      }
    }
  }
  void sentence;
  return out;
}
