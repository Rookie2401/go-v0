/**
 * Latin constructions as PatternCandidates, with what each says in plain words, and the fixed phrases (Vulgate and liturgical
 * formulas). The detectors read the readings `analyze` gave; each is a rule about neighbouring forms, not a parse, and every
 * candidate carries a confidence below 1 (a rule that matched is a likely reading, not a proof).
 *
 *   ablative absolute          an ablative noun / pronoun + an ablative participle that belongs to no other word of the sentence
 *   accusative + infinitive    indirect statement after a verb of saying, thinking, knowing, perceiving; object + infinitive after iubeo, volo ...
 *   cum clause                 cum + subjunctive (circumstance, cause, concession) or + indicative (time)
 *   ut / ne clause             ut + subjunctive: purpose or result; ne + subjunctive: negative purpose; ut + indicative: "as, when"
 *   gerund and gerundive       ad + gerund(ive) of purpose; the passive periphrastic gerundive + sum; the plain gerundive
 *   perfect passive            participle + sum
 *   deponent verb              passive form, active meaning
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, PhraseCandidate, RawToken } from '../../core';
import { matchPhraseRules } from '../shared';
import type { PhraseRule } from '../shared';
import { lookupKey } from './orthography';

interface Info { title: string; explanation: string }

export const LATIN_CONSTRUCTION_INFO: Readonly<Record<string, Info>> = {
  'ablative-absolute': {
    title: 'Ablative absolute',
    explanation: 'A noun (or pronoun) and a participle, both in the ablative, stand together as a little clause that is grammatically separate from the rest of the sentence: "his dictis" (these things having been said), "Deo duce" (God leading). It says when, why or under what circumstances the main action happens. Translate it as a clause: "when / after / since / although ...".',
  },
  'accusative-infinitive-statement': {
    title: 'Accusative + infinitive (indirect statement)',
    explanation: 'After a verb of saying, thinking, knowing or perceiving, Latin puts the subject of the reported statement in the ACCUSATIVE and its verb in the INFINITIVE, with no word for "that": "dixit eum venire" = he said that he was coming (literally: he said him to come). The accusative is the subject of the infinitive, not the object of the first verb.',
  },
  'accusative-infinitive-command': {
    title: 'Object + infinitive (command, permission, wish)',
    explanation: 'After verbs such as iubeo (order), volo (want), patior and sino (allow), prohibeo (forbid), the accusative names the person who is to act and the infinitive the action: "iussit eos venire" = he ordered them to come. The accusative is both the object of the first verb and the subject of the infinitive.',
  },
  'cum-subjunctive': {
    title: 'cum + subjunctive',
    explanation: 'cum ("when, since, although") with a verb in the subjunctive gives the circumstances of the main action: "cum esset in Galilaea" (when he was in Galilee), a cause ("since") or a concession ("although"). The subjunctive after cum is part of the construction; it does not make the verb unreal.',
  },
  'cum-indicative': {
    title: 'cum + indicative',
    explanation: 'cum with a verb in the indicative is a plain statement of time: "cum venit" (when he comes / came; whenever he comes). Compare cum with the subjunctive, which gives the circumstances or the reason.',
  },
  'ut-purpose-result': {
    title: 'ut + subjunctive (purpose or result)',
    explanation: 'ut with a subjunctive verb introduces a purpose clause ("in order that, so that": venit ut videat) or, after ita, sic, tam, tantus, adeo, a result clause ("so ... that": tam magnus est ut ... ). Purpose looks forward from the main verb; result tells what followed.',
  },
  'ut-result': {
    title: 'ut + subjunctive after ita / tam / tantus (result)',
    explanation: 'A word such as ita, sic, tam, tantus, adeo ("so, such") earlier in the sentence and ut with the subjunctive make a result clause: "tantus erat clamor ut non audirent" (the noise was so great that they did not hear).',
  },
  'ne-purpose': {
    title: 'ne + subjunctive (negative purpose or prohibition)',
    explanation: 'ne with the subjunctive means "in order that ... not, lest" (venit ne videatur) or, with a verb of fearing, "that" (timeo ne veniat = I fear he may come); with the present subjunctive in a main clause it is a prohibition (ne timeas = do not fear).',
  },
  'ut-indicative': {
    title: 'ut + indicative',
    explanation: 'ut with a verb in the indicative means "as" or "when": "ut dixit" (as he said), "ut vidit" (when he saw).',
  },
  'gerundive-purpose': {
    title: 'ad + gerund / gerundive (purpose)',
    explanation: 'ad with a gerund or gerundive in the accusative expresses purpose: "ad videndum" (to see, in order to see), "ad aedificandam civitatem" (for building the city; the gerundive agrees with its noun).',
  },
  'passive-periphrastic': {
    title: 'Passive periphrastic (gerundive + sum)',
    explanation: 'The gerundive with a form of sum expresses obligation or necessity: "liber legendus est" (the book must be read). The person who has to do it is in the dative: "mihi legendus est" (I must read it).',
  },
  gerundive: {
    title: 'Gerundive',
    explanation: 'A verbal adjective in -ndus, -a, -um that agrees with a noun and means "to be ...ed" or "needing to be ...ed" (legendus: to be read). Its neighbour the gerund is the matching verbal NOUN (legendi, legendo, legendum: of / by / for reading), which has no nominative.',
  },
  gerund: {
    title: 'Gerund',
    explanation: 'A verbal noun in -ndi (of), -ndo (to / by) or -ndum (after a preposition): "ars bene vivendi" (the art of living well), "ad discendum" (for learning). It fills the missing cases of the infinitive and has no nominative.',
  },
  'perfect-passive': {
    title: 'Perfect passive (participle + sum)',
    explanation: 'The perfect passive is built from two words: the perfect passive participle, which agrees with the subject in gender, number and case, and a form of sum. "amatus est" = he was loved / has been loved; the tense of the passive verb is the tense of sum (est: perfect; erat: pluperfect; erit: future perfect).',
  },
  'future-periphrastic': {
    title: 'Active periphrastic (participle in -urus + sum)',
    explanation: 'The future participle in -urus, -a, -um with a form of sum means "about to ... / going to ...": "venturus est" (he is about to come). The participle agrees with the subject.',
  },
  deponent: {
    title: 'Deponent verb',
    explanation: 'A deponent verb has passive forms but an active meaning: "sequitur" means he follows (not he is followed), "locutus est" means he spoke. Its dictionary entry lists only passive-looking forms. Its present participle and its gerund are active in form too.',
  },
};

const pickBest = (a: AnalyzedToken | undefined, pred: (c: AnalysisCandidate) => boolean): AnalysisCandidate | undefined => {
  const cs = a?.candidates ?? [];
  if (!cs.length) return undefined;
  const top = cs[0].confidence;
  return cs.find((c) => c.confidence >= top - 0.3 && pred(c));
};

const has = (c: AnalysisCandidate, k: string, v: string): boolean => (c.morph[k] ?? '').split(',').includes(v);
const only = (c: AnalysisCandidate, k: string, v: string): boolean => c.morph[k] === v;
const isFin = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && has(c, 'VerbForm', 'Fin');
const isInf = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && has(c, 'VerbForm', 'Inf');
const isNominal = (c: AnalysisCandidate): boolean => c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'PRON';

const SAYING = new Set(['dico', 'aio', 'inquam', 'puto', 'video', 'audio', 'scio', 'credo', 'spero', 'nuntio', 'respondeo', 'cognosco', 'intellego', 'sentio', 'existimo', 'arbitror', 'nescio', 'confiteor', 'testor', 'promitto', 'iuro', 'nego', 'affirmo', 'cogito', 'reor', 'ostendo', 'doceo', 'invenio', 'memini', 'sciens', 'dixisse', 'videre', 'perspicio', 'animadverto', 'narro', 'renuntio', 'annuntio', 'loquor', 'scribo', 'lego', 'cognoscere', 'ignoro', 'suspicor']);
const COMMANDING = new Set(['iubeo', 'volo', 'nolo', 'malo', 'patior', 'sino', 'prohibeo', 'cogo', 'cupio', 'veto', 'permitto', 'hortor', 'impero', 'oportet', 'decet', 'licet']);

function nearestBefore(analyses: AnalyzedToken[], tokens: RawToken[], from: number, limit: number, pred: (c: AnalysisCandidate) => boolean): number {
  let seen = 0;
  for (let j = from - 1; j >= 0 && seen < limit; j--) {
    if (!tokens[j].isWord) {
      if (/^[.;:!?]$/.test(tokens[j].surface)) return -1;
      continue;
    }
    seen++;
    if (pickBest(analyses[j], pred)) return j;
  }
  return -1;
}

function nearestAfter(analyses: AnalyzedToken[], tokens: RawToken[], from: number, limit: number, pred: (c: AnalysisCandidate) => boolean): number {
  let seen = 0;
  for (let j = from + 1; j < tokens.length && seen < limit; j++) {
    if (!tokens[j].isWord) {
      if (/^[.;:!?]$/.test(tokens[j].surface)) return -1;
      continue;
    }
    seen++;
    if (pickBest(analyses[j], pred)) return j;
  }
  return -1;
}

function pattern(key: string, tokenIndexes: number[], confidence: number, extra?: string): PatternCandidate {
  const info = LATIN_CONSTRUCTION_INFO[key];
  return { key, title: info.title, explanation: extra ? `${info.explanation} ${extra}` : info.explanation, tokenIndexes: [...new Set(tokenIndexes)].sort((a, b) => a - b), confidence };
}

/** Is the word at `i` the object of a preposition that governs the ablative (so not the noun of an ablative absolute)? */
function governedByPreposition(analyses: AnalyzedToken[], tokens: RawToken[], i: number): boolean {
  for (let j = i - 1, seen = 0; j >= 0 && seen < 3; j--) {
    if (!tokens[j].isWord) { if (/^[.;:!?,]$/.test(tokens[j].surface)) return false; continue; }
    seen++;
    const c = analyses[j]?.candidates[0];
    if (c?.pos === 'ADP') return true;
    if (!c || !(c.pos === 'ADJ' || c.pos === 'DET' || c.pos === 'PRON')) return false;
  }
  return false;
}

export function detectLatinConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const n = tokens.length;
  const ablNoun = (c: AnalysisCandidate): boolean => isNominal(c) && only(c, 'Case', 'Abl') || (isNominal(c) && has(c, 'Case', 'Abl'));
  const ablPart = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && has(c, 'VerbForm', 'Part') && has(c, 'Case', 'Abl');

  for (let i = 0; i < n; i++) {
    if (!tokens[i].isWord) continue;
    const a = analyses[i];

    // ── ablative absolute
    const part = pickBest(a, ablPart);
    if (part && !governedByPreposition(analyses, tokens, i)) {
      const before = nearestBefore(analyses, tokens, i, 3, ablNoun);
      const after = before < 0 ? nearestAfter(analyses, tokens, i, 3, ablNoun) : -1;
      const j = before >= 0 ? before : after;
      if (j >= 0 && !governedByPreposition(analyses, tokens, j)) {
        const noun = pickBest(analyses[j], ablNoun);
        const agree = !noun || !part.morph.Number || !noun.morph.Number || part.morph.Number.split(',').some((x) => (noun.morph.Number ?? '').split(',').includes(x));
        if (agree) {
          const tense = part.morph.Tense === 'Perf' ? 'having been' : part.morph.Tense === 'Pres' ? 'while' : 'about to be';
          out.push(pattern('ablative-absolute', [j, i], Math.abs(i - j) === 1 ? 0.7 : 0.55, `Here: "${tokens[j].surface} ${tokens[i].surface}" (${tokens[j].surface} ${tense} ${tokens[i].surface}).`));
        }
      }
    }

    // ── accusative + infinitive
    const inf = pickBest(a, isInf);
    if (inf) {
      const acc = nearestBefore(analyses, tokens, i, 4, (c) => isNominal(c) && has(c, 'Case', 'Acc'));
      const verbAt = acc >= 0 ? nearestBefore(analyses, tokens, acc, 4, (c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.lemma !== undefined && (SAYING.has(c.lemma) || COMMANDING.has(c.lemma))) : -1;
      if (acc >= 0 && verbAt >= 0) {
        const vc = pickBest(analyses[verbAt], (c) => c.lemma !== undefined && (SAYING.has(c.lemma) || COMMANDING.has(c.lemma)));
        const command = !!vc && COMMANDING.has(vc.lemma as string);
        out.push(pattern(command ? 'accusative-infinitive-command' : 'accusative-infinitive-statement', [verbAt, acc, i], acc === i - 1 ? 0.65 : 0.55, `Here: ${tokens[verbAt].surface} ... ${tokens[acc].surface} ${tokens[i].surface}.`));
      }
    }

    // ── cum / ut / ne clauses
    const cum = pickBest(a, (c) => c.pos === 'SCONJ' && c.lemma === 'cum');
    if (cum) {
      const v = nearestAfter(analyses, tokens, i, 10, isFin);
      if (v >= 0) {
        const vc = pickBest(analyses[v], isFin) as AnalysisCandidate;
        const sub = has(vc, 'Mood', 'Sub');
        const ind = has(vc, 'Mood', 'Ind');
        if (sub && !ind) out.push(pattern('cum-subjunctive', [i, v], 0.65));
        else if (ind && !sub) out.push(pattern('cum-indicative', [i, v], 0.6));
        else if (sub && ind) out.push(pattern('cum-subjunctive', [i, v], 0.4, 'The verb form could be indicative or subjunctive here; the sentence does not decide.'));
      }
    }
    const ut = pickBest(a, (c) => c.pos === 'SCONJ' && c.lemma === 'ut');
    if (ut) {
      const v = nearestAfter(analyses, tokens, i, 10, isFin);
      if (v >= 0) {
        const vc = pickBest(analyses[v], isFin) as AnalysisCandidate;
        if (has(vc, 'Mood', 'Sub')) {
          const resultWord = nearestBefore(analyses, tokens, i, 8, (c) => ['ita', 'sic', 'tam', 'tantus', 'adeo', 'talis', 'tot', 'tantum', 'usque'].includes(c.lemma ?? ''));
          out.push(pattern(resultWord >= 0 ? 'ut-result' : 'ut-purpose-result', resultWord >= 0 ? [resultWord, i, v] : [i, v], resultWord >= 0 ? 0.65 : 0.6));
        } else if (has(vc, 'Mood', 'Ind')) {
          out.push(pattern('ut-indicative', [i, v], 0.5));
        }
      }
    }
    const ne = pickBest(a, (c) => c.pos === 'SCONJ' && c.lemma === 'ne');
    if (ne) {
      const v = nearestAfter(analyses, tokens, i, 8, (c) => isFin(c) && has(c, 'Mood', 'Sub'));
      if (v >= 0) out.push(pattern('ne-purpose', [i, v], 0.6));
    }

    // ── gerund / gerundive
    const gdv = pickBest(a, (c) => (c.pos === 'VERB' || c.pos === 'AUX') && (has(c, 'VerbForm', 'Gdv') || has(c, 'VerbForm', 'Ger')));
    if (gdv) {
      const prepAt = nearestBefore(analyses, tokens, i, 3, (c) => c.pos === 'ADP' && c.lemma === 'ad');
      const sumAt = nearestAfter(analyses, tokens, i, 2, (c) => c.lemma === 'sum' && isFin(c));
      const sumBefore = nearestBefore(analyses, tokens, i, 2, (c) => c.lemma === 'sum' && isFin(c));
      if (has(gdv, 'VerbForm', 'Gdv') && !has(gdv, 'VerbForm', 'Ger') && (sumAt >= 0 || sumBefore >= 0)) out.push(pattern('passive-periphrastic', [i, sumAt >= 0 ? sumAt : sumBefore], 0.65));
      else if (prepAt >= 0 && has(gdv, 'Case', 'Acc')) out.push(pattern('gerundive-purpose', [prepAt, i], 0.65));
      else if (has(gdv, 'VerbForm', 'Gdv') && !has(gdv, 'VerbForm', 'Ger')) out.push(pattern('gerundive', [i], 0.6));
      else if (has(gdv, 'VerbForm', 'Ger') && !has(gdv, 'VerbForm', 'Gdv')) out.push(pattern('gerund', [i], 0.6));
      else out.push(pattern('gerund', [i], 0.45, 'This form could be the gerund (a verbal noun) or the gerundive (a verbal adjective agreeing with a neuter noun); the sentence does not decide.'));
    }

    // ── perfect passive and the -urus periphrastic: participle + sum
    const pp = pickBest(a, (c) => (c.pos === 'VERB' || c.pos === 'AUX') && has(c, 'VerbForm', 'Part') && has(c, 'Case', 'Nom') && (has(c, 'Tense', 'Perf') || has(c, 'Tense', 'Fut')));
    if (pp) {
      const sumAt = nearestAfter(analyses, tokens, i, 2, (c) => c.lemma === 'sum' && isFin(c));
      const sumBefore = sumAt < 0 ? nearestBefore(analyses, tokens, i, 2, (c) => c.lemma === 'sum' && isFin(c)) : -1;
      const s = sumAt >= 0 ? sumAt : sumBefore;
      if (s >= 0 && pp.lemma !== 'sum') out.push(pattern(has(pp, 'Tense', 'Fut') ? 'future-periphrastic' : 'perfect-passive', [i, s], 0.65));
    }

    // ── deponent
    const dep = pickBest(a, (c) => c.morph.Deponent === 'Yes' && (isFin(c) || isInf(c) || has(c, 'VerbForm', 'Part')));
    if (dep) out.push(pattern('deponent', [i], 0.7, `Here: ${tokens[i].surface} (from ${dep.lemma}).`));
  }

  const seen = new Set<string>();
  return out
    .filter((p) => { const k = `${p.key}|${p.tokenIndexes.join(',')}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => Math.min(...x.tokenIndexes) - Math.min(...y.tokenIndexes) || x.key.localeCompare(y.key));
}

// ───────────────────────────── fixed phrases ─────────────────────────────

const rule = (display: string, gloss: string, pattern: string[], kind: PhraseCandidate['kind'] = 'formula'): PhraseRule => ({ pattern, display, gloss, kind, variants: [pattern] });
export const LATIN_PHRASE_RULES: PhraseRule[] = [
  rule('in principio', 'in the beginning', ['in', 'principium']),
  rule('per omnia saecula saeculorum', 'for ever and ever (liturgical)', ['per', 'omnis', 'saeculum', 'saeculum']),
  rule('in saecula saeculorum', 'for ever and ever', ['in', 'saeculum', 'saeculum']),
  rule('Deo gratias', 'thanks be to God', ['deus', 'gratia']),
  rule('Pater noster', 'Our Father', ['pater', 'noster']),
  rule('Dominus vobiscum', 'the Lord be with you', ['dominus', 'vobiscum']),
  rule('et cum spiritu tuo', 'and with your spirit', ['et', 'cum', 'spiritus', 'tuus']),
  rule('ecce homo', 'behold the man', ['ecce', 'homo']),
  rule('amen amen dico vobis', 'truly, truly I say to you', ['amen', 'amen', 'dico', 'vos']),
  rule('et factum est', 'and it came to pass', ['et', 'facio', 'sum']),
  rule('Agnus Dei', 'Lamb of God', ['agnus', 'deus']),
  rule('in nomine Patris', 'in the name of the Father', ['in', 'nomen', 'pater']),
  rule('Spiritus Sanctus', 'the Holy Spirit', ['spiritus', 'sanctus']),
  rule('Filius Dei', 'Son of God', ['filius', 'deus']),
  rule('Filius hominis', 'Son of Man', ['filius', 'homo']),
  rule('regnum caelorum', 'the kingdom of heaven', ['regnum', 'caelum']),
  rule('dixit Dominus', 'the Lord said', ['dico', 'dominus']),
  rule('respondit Iesus', 'Jesus answered', ['respondeo', 'iesus']),
  rule('usque ad', 'as far as, until', ['usque', 'ad']),
  rule('propter hoc', 'because of this', ['propter', 'hic']),
  rule('ab initio', 'from the beginning', ['ab', 'initium']),
  rule('in aeternum', 'for ever', ['in', 'aeternus']),
  rule('verbum Domini', 'the word of the Lord', ['verbum', 'dominus']),
  rule('ita ut', 'so that, in such a way that', ['ita', 'ut'], 'construction'),
  rule('ut non', 'so that ... not (result)', ['ut', 'non'], 'construction'),
];

export function detectLatinPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  return matchPhraseRules(tokens, analyses, LATIN_PHRASE_RULES, lookupKey);
}
