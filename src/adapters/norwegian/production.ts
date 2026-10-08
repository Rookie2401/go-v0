/**
 * Rule checks on a learner's own Bokmål (GoTell). MACHINE-DRAFTED, pending native review; marked NOT dependable in the adapter's
 * `support`. An empty result means nothing was found, never "correct". Every check fires only on its own unambiguous shape, uses
 * the lexicon for the facts it needs and says nothing when a fact is missing. A suggestion (exact offsets in `sentence`) is offered
 * only where the fix is certain.
 *
 * Checks (category):
 *   1. a Nynorsk-only form in Bokmål writing: ikkje, eg, kva, ho, dei, mykje, frå, heim … (dialect: a note, never called wrong
 *      if Nynorsk is meant), with the Bokmål member of the concept family as the replacement;
 *   2. a Riksmål or Dano-Norwegian spelling (efter, nu, sprog, mig, hvad …) (register), with today's spelling;
 *   3. a possessive in front of a definite noun: min bilen (definiteness): min bil, or bilen min;
 *   4. an adjective whose neuter -t does not fit its noun: et stor hus, en stort bil, Huset er stor (agreement);
 *   5. ikke after the verb in a subordinate clause: at han kommer ikke (word-order);
 *   6. og where the infinitive marker å is needed: Jeg liker og lese; å where og is needed (syntax).
 */
import type { AnalysisCandidate, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { matchCase } from '../shared';
import { nynorskOnlyForms } from './families';
import { lexiconFor } from './lexicon';
import { NN_FUNCTION_FORMS } from './lexicon-function-nn';

const nb = lexiconFor('nb');
const nn = lexiconFor('nn');

const split = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const hasM = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => split(c?.morph[k]).includes(v);
const top = (a: AnalyzedToken | undefined): AnalysisCandidate | undefined => a?.candidates[0];
const quoted = (s: string): string => `"${s}"`;

/** Inflected Nynorsk function words and the Bokmål word to write. */
const INFLECTED: Record<string, string> = {
  honom: 'ham', dykk: 'dere', dykkar: 'deres', deira: 'deres', hennar: 'hennes', eit: 'et', ein: 'en', desse: 'disse', nokre: 'noen', inkje: 'intet',
  heile: 'hele', kvart: 'hvert', kvar: 'hver', frå: 'fra', utan: 'uten', hjå: 'hos', sidan: 'siden', medan: 'mens', no: 'nå', då: 'da', kven: 'hvem', kva: 'hva',
  kvifor: 'hvorfor', korleis: 'hvordan', ikkje: 'ikke', eg: 'jeg', ho: 'hun', dei: 'de', noko: 'noe', nokon: 'noen', mykje: 'mye', berre: 'bare', heim: 'hjem',
  heime: 'hjemme', saman: 'sammen', enno: 'ennå', endå: 'enda', framleis: 'fremdeles', allereie: 'allerede', heilt: 'helt', òg: 'også', fleire: 'flere', meir: 'mer',
  sjølv: 'selv', viss: 'hvis', vere: 'være', vera: 'være', gjere: 'gjøre', kome: 'komme', sjå: 'se', seie: 'si', annan: 'annen', framfor: 'foran',
  innan: 'innen', utanfor: 'utenfor', plutseleg: 'plutselig', sjeldan: 'sjelden', difor: 'derfor', anten: 'enten', endå_: 'enda',
};

/** Nynorsk forms that are not Bokmål, found from the concept-family table and the Nynorsk closed classes. */
function buildNynorskOnly(): Map<string, { replacement?: string; sure: number }> {
  const map = new Map<string, { replacement?: string; sure: number }>();
  for (const [form, v] of nynorskOnlyForms()) map.set(form, { replacement: v.nb, sure: form.length <= 2 ? 0.55 : 0.7 });
  for (const w of NN_FUNCTION_FORMS) {
    if (!['PRON', 'DET', 'ADV', 'ADP', 'CONJ', 'SCONJ', 'AUX', 'INTJ', 'PART'].includes(w.pos)) continue;
    const f = w.form.normalize('NFC').toLocaleLowerCase('nb');
    if (nb.has(f) || map.has(f)) continue;
    map.set(f, { replacement: INFLECTED[f], sure: f.length <= 2 ? 0.55 : 0.65 });
  }
  for (const [f, rep] of Object.entries(INFLECTED)) if (!nb.has(f) && !map.has(f) && !f.endsWith('_')) map.set(f, { replacement: rep, sure: 0.6 });
  return map;
}
let NN_ONLY: Map<string, { replacement?: string; sure: number }> | undefined;

/**
 * Names are exempt from every check: a token with a name reading, or written with a capital letter anywhere but at the start of the
 * sentence (a name the word list does not hold), is never a Nynorsk form or an older spelling.
 */
function isName(tokens: RawToken[], analyses: AnalyzedToken[], i: number): boolean {
  if (!tokens[i].isWord || !/^\p{Lu}/u.test(tokens[i].surface)) return false;
  const firstWord = tokens.findIndex((t) => t.isWord);
  // a name the word list holds is a name; a guess at the start of the sentence is only a capitalised word (Eg, Kva)
  if (analyses[i].candidates.some((c) => c.pos === 'PROPN' && !(i === firstWord && c.unconfirmed))) return true;
  return i !== firstWord;
}

function swap(t: RawToken, replacement: string): ErrorCandidate['suggestion'] {
  return { start: t.start, end: t.end, replacement: matchCase(t.surface, replacement) };
}

function dialect(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  NN_ONLY ??= buildNynorskOnly();
  const out: ErrorCandidate[] = [];
  tokens.forEach((t, i) => {
    if (!t.isWord || isName(tokens, analyses, i)) return;
    const f = t.normalized;
    if (nb.has(f)) return;
    const hit = NN_ONLY!.get(f);
    if (hit) {
      out.push({
        category: 'dialect', tokenIndexes: [i], confidence: hit.sure, affectsMeaning: false,
        message: hit.replacement
          ? `"${t.surface}" is a Nynorsk form. Bokmål writes "${hit.replacement}". Nothing is wrong if you mean to write Nynorsk.`
          : `"${t.surface}" is a Nynorsk form, not Bokmål. Nothing is wrong if you mean to write Nynorsk.`,
        suggestion: hit.replacement ? swap(t, hit.replacement) : undefined,
      });
      return;
    }
    // a Nynorsk lexicon word that Bokmål does not hold (a noun or verb): flagged without a replacement
    if (t.surface.length >= 5 && nn.has(f) && !analyses[i].candidates.some((c) => !c.unconfirmed && c.orthography === undefined && c.origin === 'hand')) {
      const lemma = nn.lookup(f)[0].lemma;
      out.push({
        category: 'dialect', tokenIndexes: [i], confidence: 0.5, affectsMeaning: false,
        message: `"${t.surface}" looks like a Nynorsk form (${quoted(lemma)}), not Bokmål. Nothing is wrong if you mean to write Nynorsk.`,
      });
    }
  });
  return out;
}

function register(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  tokens.forEach((t, i) => {
    const c = top(analyses[i]);
    if (isName(tokens, analyses, i)) return;
    if (!c?.orthography || !c.orthography.period.startsWith('nb-')) return;
    const o = c.orthography;
    const dano = o.period === 'nb-pre1907';
    const capital = /^\p{Lu}/u.test(t.surface) && o.modern === t.normalized;
    const label = dano ? 'Dano-Norwegian (before 1907)' : o.period === 'nb-1907' ? 'the spelling of 1907–1917' : 'Riksmål';
    out.push({
      category: 'register', tokenIndexes: [i], confidence: Math.round(Math.min(0.85, o.confidence) * 100) / 100, affectsMeaning: false,
      message: capital
        ? `A common noun is written with a capital letter here, as in Danish and early Norwegian print. Today's Bokmål writes "${o.modern}". Nothing is wrong if you are imitating older writing.`
        : `"${t.surface}" is ${label} spelling (Riksmål is still written by some writers today, but it is not the official Bokmål norm). Today's Bokmål writes "${o.modern}".`,
      suggestion: { start: t.start, end: t.end, replacement: capital ? o.modern : matchCase(t.surface, o.modern) },
    });
  });
  return out;
}

function possessiveBeforeDefinite(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const p = top(analyses[i]);
    const n = top(analyses[i + 1]);
    if (!tokens[i].isWord || !tokens[i + 1].isWord || p?.pos !== 'DET' || !hasM(p, 'Poss', 'Yes')) continue;
    if (!n || n.pos !== 'NOUN' || !hasM(n, 'Definite', 'Def') || n.unconfirmed || n.morph.Definite !== 'Def') continue;
    // a possessive in front of a definite noun inside a longer phrase (Min Gud, vår Herre) is not this
    const lemma = n.lemma as string;
    const entry = nb.noun(lemma);
    if (!entry) continue;
    const plural = hasM(n, 'Number', 'Plur');
    const indefinite = plural ? entry.plural[0] : entry.lemma;
    if (!indefinite) continue;
    out.push({
      category: 'definiteness', tokenIndexes: [i, i + 1], confidence: 0.8, affectsMeaning: false,
      message: `After the possessive the noun is indefinite: ${quoted(`${tokens[i].surface} ${indefinite}`)}. Or put the possessive after the definite noun: ${quoted(`${tokens[i + 1].surface} ${tokens[i].surface}`)}.`,
      suggestion: swap(tokens[i + 1], indefinite),
    });
  }
  return out;
}

function adjectiveAgreement(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const adjOf = (c: AnalysisCandidate | undefined) => (c?.pos === 'ADJ' && c.lemma ? nb.adjective(c.lemma) : undefined);
  // article + adjective + noun
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (![i, i + 1, i + 2].every((k) => tokens[k].isWord)) continue;
    const art = tokens[i].normalized;
    const a = top(analyses[i + 1]);
    const n = top(analyses[i + 2]);
    const adj = adjOf(a);
    if (!adj || !n || n.pos !== 'NOUN' || n.unconfirmed || !hasM(n, 'Number', 'Sing') || hasM(n, 'Definite', 'Def')) continue;
    const gender = n.morph.Gender;
    const form = tokens[i + 1].normalized;
    const neuterForm = adj.neuter[0];
    if (art === 'et' && gender === 'Neut' && form === adj.lemma && neuterForm && neuterForm !== adj.lemma && !adj.invariable) {
      out.push({
        category: 'agreement', tokenIndexes: [i, i + 1, i + 2], confidence: 0.8, affectsMeaning: false,
        message: `"${tokens[i + 2].surface}" is a neuter (et) noun, so the adjective takes -t: ${quoted(`${tokens[i].surface} ${neuterForm} ${tokens[i + 2].surface}`)}.`,
        suggestion: swap(tokens[i + 1], neuterForm),
      });
    } else if ((art === 'en' || art === 'ei') && (gender === 'Masc' || gender === 'Fem' || gender === 'Fem,Masc') && neuterForm && neuterForm !== adj.lemma && adj.neuter.includes(form) && !adj.plural.includes(form)) {
      out.push({
        category: 'agreement', tokenIndexes: [i, i + 1, i + 2], confidence: 0.75, affectsMeaning: false,
        message: `"${tokens[i + 2].surface}" is not a neuter noun, so the adjective has no -t: ${quoted(`${tokens[i].surface} ${adj.lemma} ${tokens[i + 2].surface}`)}.`,
        suggestion: swap(tokens[i + 1], adj.lemma),
      });
    }
  }
  // predicate: Huset er stor
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (![i, i + 1, i + 2].every((k) => tokens[k].isWord)) continue;
    const n = top(analyses[i]);
    const cop = top(analyses[i + 1]);
    const adj = adjOf(top(analyses[i + 2]));
    if (!n || n.pos !== 'NOUN' || n.unconfirmed || !hasM(n, 'Definite', 'Def') || !hasM(n, 'Number', 'Sing') || !cop || cop.pos !== 'AUX' || cop.lemma !== 'være' || !adj || adj.invariable) continue;
    const form = tokens[i + 2].normalized;
    const neut = adj.neuter[0];
    if (!neut || neut === adj.lemma) continue;
    if (n.morph.Gender === 'Neut' && form === adj.lemma) {
      out.push({ category: 'agreement', tokenIndexes: [i, i + 1, i + 2], confidence: 0.7, affectsMeaning: false, message: `"${tokens[i].surface}" is a neuter noun, so the adjective after ${quoted(tokens[i + 1].surface)} takes -t: ${quoted(neut)}.`, suggestion: swap(tokens[i + 2], neut) });
    } else if ((n.morph.Gender === 'Masc' || n.morph.Gender === 'Fem') && form === neut) {
      out.push({ category: 'agreement', tokenIndexes: [i, i + 1, i + 2], confidence: 0.7, affectsMeaning: false, message: `"${tokens[i].surface}" is not a neuter noun, so the adjective after ${quoted(tokens[i + 1].surface)} has no -t: ${quoted(adj.lemma)}.`, suggestion: swap(tokens[i + 2], adj.lemma) });
    }
  }
  return out;
}

const SUBORD = new Set(['at', 'fordi', 'hvis', 'dersom', 'mens', 'siden', 'ettersom', 'idet']);

function ikkeAfterVerb(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (let i = 0; i + 3 < tokens.length; i++) {
    if (![i, i + 1, i + 2, i + 3].every((k) => tokens[k].isWord)) continue;
    if (!SUBORD.has(tokens[i].normalized) || top(analyses[i])?.pos !== 'SCONJ') continue;
    const subj = top(analyses[i + 1]);
    const verb = top(analyses[i + 2]);
    if (!subj || subj.pos !== 'PRON' || !hasM(subj, 'Case', 'Nom') || subj.morph.Case !== 'Nom') continue;
    if (!verb || !(verb.pos === 'VERB' || verb.pos === 'AUX') || !hasM(verb, 'VerbForm', 'Fin') || hasM(verb, 'VerbForm', 'Inf')) continue;
    if (tokens[i + 3].normalized !== 'ikke') continue;
    out.push({
      category: 'word-order', tokenIndexes: [i + 2, i + 3], confidence: 0.75, affectsMeaning: false,
      message: `In a subordinate clause ikke comes before the verb: ${quoted(`${tokens[i].surface} ${tokens[i + 1].surface} ikke ${tokens[i + 2].surface}`)}.`,
      suggestion: { start: tokens[i + 2].start, end: tokens[i + 3].end, replacement: `${tokens[i + 3].surface} ${tokens[i + 2].surface}` },
    });
  }
  return out;
}

function aaOg(tokens: RawToken[], analyses: AnalyzedToken[]): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (let i = 1; i + 1 < tokens.length; i++) {
    if (!tokens[i].isWord || !tokens[i + 1].isWord) continue;
    const t = tokens[i].normalized;
    const prev = top(analyses[i - 1]);
    const next = top(analyses[i + 1]);
    if (t === 'og') {
      const verbInf = (c: AnalysisCandidate): boolean => c.pos === 'VERB' && hasM(c, 'VerbForm', 'Inf') && !hasM(c, 'VerbForm', 'Fin') && !c.unconfirmed;
      // after an adjective (viktig og hvile) a word that can be an infinitive is enough; elsewhere every reading must be a verb
      const nextInf = !!next && (prev?.pos === 'ADJ' ? analyses[i + 1].candidates.some(verbInf) : verbInf(next) && analyses[i + 1].candidates.every((c) => c.pos === 'VERB'));
      const prevOk = !!prev && tokens[i - 1].isWord && ((prev.pos === 'ADJ' && !hasM(prev, 'Degree', 'Cmp')) || (prev.pos === 'VERB' && hasM(prev, 'VerbForm', 'Fin') && !hasM(prev, 'VerbForm', 'Inf')) || prev.pos === 'ADP' || (prev.pos === 'NOUN' && hasM(prev, 'Definite', 'Def')));
      if (nextInf && prevOk && !(prev?.pos === 'VERB' && ['gå', 'sitte', 'ligge', 'stå', 'komme', 'drive'].includes(prev.lemma ?? '') && false)) {
        out.push({
          category: 'syntax', tokenIndexes: [i, i + 1], confidence: 0.6, affectsMeaning: false,
          message: `Before an infinitive the marker is "å" (to), not "og" (and): ${quoted(`å ${tokens[i + 1].surface}`)}. They sound alike, which is why they are mixed up.`,
          suggestion: { start: tokens[i].start, end: tokens[i].end, replacement: matchCase(tokens[i].surface, 'å') },
        });
      }
    }
    if (t === 'å') {
      const prevFinite = !!prev && prev.pos === 'VERB' && hasM(prev, 'VerbForm', 'Fin') && !hasM(prev, 'VerbForm', 'Inf');
      const nextFin = !!next && next.pos === 'VERB' && hasM(next, 'VerbForm', 'Fin') && !hasM(next, 'VerbForm', 'Inf') && !hasM(next, 'Mood', 'Imp') && (prevFinite || analyses[i + 1].candidates.every((c) => c.pos === 'VERB' && hasM(c, 'VerbForm', 'Fin')));
      if (nextFin) {
        out.push({
          category: 'syntax', tokenIndexes: [i, i + 1], confidence: 0.55, affectsMeaning: false,
          message: `"å" goes only before an infinitive. To join two verbs that are both conjugated, use "og" (and): ${quoted(`og ${tokens[i + 1].surface}`)}.`,
          suggestion: { start: tokens[i].start, end: tokens[i].end, replacement: 'og' },
        });
      }
    }
  }
  return out;
}

export function checkNorwegianProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string): ErrorCandidate[] {
  const all = ([...dialect(tokens, analyses), ...register(tokens, analyses), ...possessiveBeforeDefinite(tokens, analyses), ...adjectiveAgreement(tokens, analyses), ...ikkeAfterVerb(tokens, analyses), ...aaOg(tokens, analyses)]).filter((e) => !e.tokenIndexes.some((k) => isName(tokens, analyses, k)));
  const kept = new Map<string, ErrorCandidate>();
  const rest: ErrorCandidate[] = [];
  for (const e of all) {
    if (!e.suggestion) { rest.push(e); continue; }
    const key = `${e.suggestion.start}:${e.suggestion.end}:${e.suggestion.replacement}`;
    const before = kept.get(key);
    if (!before || e.confidence > before.confidence) kept.set(key, e);
  }
  return [...kept.values(), ...rest].sort((a, b) => Math.min(...a.tokenIndexes) - Math.min(...b.tokenIndexes) || b.confidence - a.confidence);
}
