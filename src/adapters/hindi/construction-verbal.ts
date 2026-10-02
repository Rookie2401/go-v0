/**
 * Construction detectors about the verb: tenses and aspects, ने, commands, the subjunctive, the infinitive in its uses,
 * obligation, ability, wanting, the passive, causatives, having done, को with the one who feels, compound verbs and chains
 * of helpers. They read the verb groups of verb-group.ts, so each fires only where the words of the group are analysed.
 * Machine-drafted from general knowledge of Hindi grammar, not checked by a native speaker.
 */
import type { PatternCandidate } from '../../core';
import { hit, isPostposition, trust, type Ctx } from './construction-ctx';
import { hasF, isChahiye, type C, type VerbGroup } from './verb-group';

const tenseOf = (g: VerbGroup): 'Pres' | 'Past' | 'Fut' | 'Sub' | undefined => {
  const a = g.tenseAux;
  if (!a) return undefined;
  if (a.kind === 'fut') return 'Fut';
  if (a.kind === 'past') return 'Past';
  if (a.kind === 'sub') return 'Sub';
  return 'Pres';
};

const SUBJUNCTIVE_TRIGGERS = new Set(['ताकि', 'कि', 'शायद', 'काश', 'चाहे', 'कहीं', 'चाहिए', 'अगर', 'यदि', 'क्या', 'जब तक']);

/** Tokens of an element list. */
const idx = (g: VerbGroup, ...extra: number[]): number[] => [...g.elems.map((e) => e.i), ...extra];

function tenseAndAspect(c: Ctx, g: VerbGroup): PatternCandidate[] {
  const f = g.flags;
  const out: PatternCandidate[] = [];
  const t = trust(...g.elems.map((e) => e.c)) * (g.confidence < 1 ? g.confidence : 1);
  const t0 = tenseOf(g);
  if (f.progressive) {
    out.push(hit('progressive', t * (g.tenseAux ? 1 : 0.9), idx(g)));
    return out;
  }
  if (f.ability || f.managing || f.passive || f.obligation || f.wanting || f.beginning || f.letting || f.continuative) return out;
  const core = g.core;
  if (core.kind === 'pf') {
    if (g.elems.length === 1 && g.main.lemma === 'होना' && !g.tenseAux) return out;
    if (t0 === 'Pres') out.push(hit('present-perfect', t, idx(g)));
    else if (t0 === 'Past') out.push(hit('pluperfect', t, idx(g)));
    else out.push(hit('perfective-past', t * 0.95, idx(g)));
  } else if (core.kind === 'ipf') {
    if (t0 === 'Pres') out.push(hit('habitual-present', t, idx(g)));
    else if (t0 === 'Past') out.push(hit('habitual-past', t, idx(g)));
    else if (!g.tenseAux) {
      const p = c.before(g.start);
      if (p >= 0 && ['नहीं', 'न'].includes(c.n(p))) out.push(hit('habitual-present', t * 0.7, [p, ...idx(g)]));
    }
  } else if (core.kind === 'fut' || (t0 === 'Fut' && g.elems.length > 1)) {
    out.push(hit('future', core.kind === 'fut' ? t : t * 0.75, idx(g)));
  } else if (core.kind === 'sub' && g.elems.length === 1 && g.main.lemma !== 'होना') {
    const before = c.tokens.slice(0, g.start).some((tk) => tk.isWord && SUBJUNCTIVE_TRIGGERS.has(tk.normalized));
    const alsoImp = c.cands(g.main.i).some((r) => hasF(r, 'Mood', 'Imp'));
    out.push(hit('subjunctive', t * (before ? 0.95 : alsoImp ? 0.6 : 0.7), idx(g)));
  } else if (core.kind === 'imp') {
    const mat = c.before(g.start);
    if (mat >= 0 && c.n(mat) == 'मत') {
      out.push(hit('negative-command', t, [mat, ...idx(g)]));
    } else if (hasF(core.c, 'Polite', 'Form') || /^(कृपया|ज़रा)$/u.test(c.n(c.before(g.start)))) {
      out.push(hit('polite-request', t, idx(g)));
    } else out.push(hit('command', t, idx(g)));
  }
  if (core.kind === 'stem' && g.elems.length === 1 && c.after(g.end) < 0 && !out.some((o) => o.key === 'negative-command')) {
    // a bare stem ending the clause, with तू before it: the command to तू
    let tu = false;
    const [from] = c.clause(g.start);
    for (let k = from; k < g.start; k++) if (c.isWord(k) && c.find(k, (r) => r.pos === 'PRON' && hasF(r, 'Polite', 'Infm'))) tu = true;
    if (tu) out.push(hit('command', t * 0.8, idx(g)));
  }
  if ((core.kind === 'sub' || core.kind === 'stem') && g.elems.length === 1) {
    const mat = c.before(g.start);
    if (mat >= 0 && c.n(mat) === 'मत' && !out.some((o) => o.key === 'negative-command')) out.push(hit('negative-command', t * 0.9, [mat, ...idx(g)]));
  }
  return out;
}

/** The person who must or feels: a word with a dative reading, or a noun / pronoun followed by को, before the group in its clause. */
function dativeBefore(c: Ctx, g: VerbGroup): number[] {
  const [from] = c.clause(g.start);
  for (let i = g.start - 1; i >= from; i--) {
    if (!c.isWord(i)) continue;
    if (c.find(i, (r) => hasF(r, 'Case', 'Dat'))) return [i];
    if (c.n(i) === 'को' && c.before(i) >= 0 && c.pos(c.before(i), 'NOUN', 'PROPN', 'PRON')) return [c.before(i), i];
  }
  return [];
}

const FEELINGS = new Set(['भूख', 'प्यास', 'डर', 'ठंड', 'सर्दी', 'गर्मी', 'नींद', 'शर्म', 'दर्द', 'पता', 'मालूम', 'याद', 'पसंद', 'ज़रूरत', 'ख़ुशी', 'गुस्सा', 'बुखार', 'चोट', 'ख़बर', 'विश्वास', 'यक़ीन', 'शक', 'चिंता', 'दुख', 'मज़ा', 'अच्छा', 'बुरा', 'ग़ुस्सा', 'तरस', 'दया', 'चक्कर', 'हँसी', 'रोना', 'समझ', 'ख़याल', 'ख़्याल', 'आशा', 'उम्मीद', 'इच्छा', 'शौक़', 'आदत', 'थकान'].map((s) => s.normalize('NFC').replace(/़/gu, '')));
/** Verbs of giving and telling: the को word is the person receiving, not a definite object. */
const INDIRECT = new Set(['देना', 'बताना', 'कहना', 'सुनाना', 'दिखाना', 'भेजना', 'पूछना', 'सिखाना', 'पढ़ाना', 'चाहना', 'मिलना', 'लगना', 'आना', 'होना']);
/** Whether a verb takes ने, as the word list says it on the reading (`notes.ergative`: 'yes' / 'no'); undefined when the reading does not say. */
function transitivity(c: C): 'tr' | 'intr' | undefined {
  const v = c.notes?.ergative ?? c.notes?.erg ?? c.notes?.transitive;
  const x = Array.isArray(v) ? v[0] : v;
  if (x === undefined) return undefined;
  const t = String(x).toLowerCase();
  return ['yes', 'true', 'erg', 'transitive'].includes(t) ? 'tr' : ['no', 'false', 'noerg', 'intransitive'].includes(t) ? 'intr' : undefined;
}
const FEELING_VERBS = new Set(['लगना', 'आना', 'होना', 'मिलना', 'पड़ना']);
const strip = (s: string): string => s.normalize('NFC').replace(/़/gu, '');

export function verbalConstructions(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const koUsed = new Set<number>();
  for (const g of c.groups) {
    const f = g.flags;
    const t = trust(...g.elems.map((e) => e.c)) * (g.confidence < 1 ? g.confidence : 1);
    out.push(...tenseAndAspect(c, g));

    if (f.compound) {
      const v = g.vector!;
      out.push(hit('compound-verb', t, [g.main.i, ...g.particles.filter((p) => p < v.i), v.i]));
    }
    if (g.elems.length >= 3) out.push(hit('auxiliary-chain', t, idx(g)));
    if (f.ability) {
      const s = g.elems.find((e, k) => k > 0 && e.lemma === 'सकना');
      out.push(hit('ability-sakna', t, [g.main.i, s!.i]));
    }
    if (f.managing) out.push(hit('managing-paana', t, [g.main.i, g.vector!.i]));
    if (f.wanting) out.push(hit('wanting-chahna', t, [g.main.i, g.elems[1].i]));
    if (f.passive) {
      // perfective participle of a TRANSITIVE verb + जाना, with no ने-agent: the passive. An intransitive one is a compound (चला गया).
      const tr = transitivity(g.main.c);
      const [from] = c.clause(g.start);
      let agent = false;
      for (let k = from; k < g.start; k++) if (c.isWord(k) && (c.n(k) === 'ने' || c.find(k, (r) => hasF(r, 'Case', 'Erg')))) agent = true;
      if (tr !== 'intr' && !agent && g.main.lemma !== 'चलना') out.push(hit('passive', t * (tr === 'tr' ? 1 : 0.6), idx(g)));
    }
    if (f.obligation) {
      const dat = dativeBefore(c, g);
      const withBe = g.elems[1]?.lemma === 'होना';
      out.push(hit('obligation', t * (dat.length || !withBe ? 1 : 0.75), [...dat, ...idx(g)]));
      dat.forEach((d) => koUsed.add(d));
    }
    if (f.beginning || f.letting) out.push(hit('oblique-infinitive', t, [g.main.i, g.elems[1].i]));
    if (g.elems.length === 1 && g.main.kind === 'inf') out.push(hit('infinitive-as-noun', t * 0.9, [g.main.i]));
    if (g.elems.length === 1 && g.main.kind === 'infobl') {
      const j = c.after(g.main.i);
      if (j >= 0 && (isPostposition(c, j) || /^वाल/u.test(c.n(j)))) out.push(hit('oblique-infinitive', t, [g.main.i, j]));
    }
  }

  // having done: a conjunctive in one word, or a bare stem followed by कर / के
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i)) continue;
    const conv = c.find(i, (r) => hasF(r, 'VerbForm', 'Conv'));
    if (conv && c.n(i).length >= 3 && /(कर|के|करके)$/u.test(c.n(i))) { out.push(hit('conjunctive-participle', trust(conv), [i])); continue; }
    const stem = c.find(i, (r) => hasF(r, 'VerbForm', 'Stem'));
    const j = c.after(i);
    if (stem && j >= 0 && c.n(j) === 'कर') out.push(hit('conjunctive-participle', trust(stem) * 0.95, [i, j]));
    else if (stem && j >= 0 && c.n(j) === 'के' && c.find(j, (r) => hasF(r, 'VerbForm', 'Conv'))) out.push(hit('conjunctive-participle', trust(stem) * 0.85, [i, j]));
  }

  // causative verbs
  for (let i = 0; i < c.tokens.length; i++) {
    const cau = c.find(i, (r) => hasF(r, 'Voice', 'Cau') && (r.pos === 'VERB' || r.pos === 'AUX') && r === c.cands(i)[0]);
    if (cau) out.push(hit('causative', trust(cau), [i]));
  }

  // को with the one who feels or has: a dative, then a feeling noun with लगना / आना / होना, or चाहिए
  for (const g of c.groups) {
    const dat = dativeBefore(c, g);
    if (dat.length === 0 || dat.every((d) => koUsed.has(d))) continue;
    const [from] = c.clause(g.start);
    const noun = (() => {
      // the feeling noun stands right before the verb group (an adverb or a particle may stand between): भूख लगी है, बहुत डर लगता है, पसंद नहीं है
      for (let i = g.start - 1; i >= from; i--) {
        if (!c.isWord(i)) continue;
        if (['नहीं', 'न', 'बहुत', 'ही', 'भी', 'तो', 'अब', 'ज़्यादा', 'कुछ'].includes(c.n(i))) continue;
        return FEELINGS.has(strip(c.n(i))) || c.find(i, (r) => r.lemma !== undefined && FEELINGS.has(strip(r.lemma))) ? i : -1;
      }
      return -1;
    })();
    const wantsNoun = g.elems.length === 1 && isChahiye(g.main);
    // "the person knows how to" (मुझे तैरना आता है, उसे हिंदी आती है) and "it came to the person" (उसे गुस्सा आया): आना with something between the person and the verb
    const between = (() => { for (let i = g.start - 1; i > dat[dat.length - 1]; i--) if (c.isWord(i) && (c.pos(i, 'NOUN') || c.find(i, (r) => hasF(r, 'VerbForm', 'Inf')))) return i; return -1; })();
    const knowing = noun < 0 && between >= 0 && g.main.lemma === 'आना' && (g.core.kind === 'ipf' || g.core.kind === 'pf' || g.core.kind === 'fut');
    const feeling = (noun >= 0 && g.elems.some((e) => FEELING_VERBS.has(e.lemma))) || knowing;
    if (feeling || wantsNoun) {
      out.push(hit('ko-experiencer', trust(g.main.c) * (feeling ? 0.95 : 0.85), [...dat, ...(noun >= 0 ? [noun] : knowing ? [between] : []), g.main.i]));
      dat.forEach((d) => koUsed.add(d));
    }
  }

  // ने, and को on a definite object
  for (const g of c.groups) {
    if (g.core.kind !== 'pf' || g.flags.passive) continue;
    const [from] = c.clause(g.start);
    let ne = -1;
    for (let i = g.start - 1; i >= from; i--) {
      if (!c.isWord(i)) continue;
      if (c.find(i, (r) => hasF(r, 'Case', 'Erg')) || (c.n(i) === 'ने' && c.pos(i, 'ADP'))) { ne = i; break; }
    }
    if (ne < 0) continue;
    const t = trust(...g.elems.map((e) => e.c));
    out.push(hit('ergative-ne', t, [ne, g.main.i]));
    const obj = (() => {
      for (let i = g.start - 1; i > ne; i--) {
        if (c.isWord(i) && c.n(i) === 'को' && c.before(i) > ne && c.pos(c.before(i), 'NOUN', 'PROPN', 'PRON')) return [c.before(i), i];
        if (c.isWord(i) && c.find(i, (r) => hasF(r, 'Case', 'Dat') && r.pos === 'PRON')) return [i];
      }
      return [];
    })();
    if (obj.length && !(INDIRECT.has(g.main.lemma) || (g.vector && INDIRECT.has(g.vector.lemma)))) {
      out.push(hit('ne-with-ko-object', t * 0.85, [ne, ...obj, g.main.i]));
      if (!obj.some((o) => koUsed.has(o))) { out.push(hit('ko-definite-object', t * 0.85, [...obj, g.main.i])); obj.forEach((o) => koUsed.add(o)); }
    }
  }
  // को on a definite object without ने: a subject in the direct case (or a command) and a verb that is not one of giving or telling
  for (const g of c.groups) {
    const dat = dativeBefore(c, g);
    if (dat.length === 0 || dat.some((d) => koUsed.has(d)) || g.flags.obligation || g.flags.passive) continue;
    if (INDIRECT.has(g.main.lemma) || (g.vector && INDIRECT.has(g.vector.lemma))) continue;
    const [from] = c.clause(g.start);
    let subject = false;
    for (let i = from; i < dat[0]; i++) if (c.isWord(i) && c.find(i, (r) => (r.pos === 'PRON' || r.pos === 'NOUN' || r.pos === 'PROPN') && !hasF(r, 'Case', 'Obl') && !hasF(r, 'Case', 'Dat') && !hasF(r, 'Case', 'Erg'))) subject = true;
    if ((subject && ['ipf', 'fut', 'sub', 'prog', 'pf', 'pres', 'past'].includes(g.core.kind)) || g.core.kind === 'imp') {
      out.push(hit('ko-definite-object', trust(g.main.c) * 0.6, [...dat, g.main.i]));
      dat.forEach((d) => koUsed.add(d));
    }
  }
  // one को is the experiencer's or the definite object's, never both
  const experiencer = out.filter((p) => p.key === 'ko-experiencer');
  return out.filter((p) => p.key !== 'ko-definite-object' || !experiencer.some((e) => e.tokenIndexes.some((t) => p.tokenIndexes.includes(t) && (c.n(t) === 'को' || c.find(t, (r) => hasF(r, 'Case', 'Dat'))))));
}
