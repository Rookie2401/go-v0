/**
 * Hindi neighbour rules for homographs (package H4). The sentences are analysed by hand in a compact notation (see `S`):
 * each word is `surface=lemma.POS.features`, alternative readings follow after `|` (`=lemma.POS.features`), `@0.5` sets a
 * confidence. The context-free analysis (`base`) is what `disambiguateHindi` receives for every token of the sentence.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, RawToken } from '../../src/core';
import { disambiguateHindi } from '../../src/adapters/hindi/disambiguate';

// ── compact hand-analysis notation ──
const POS: Record<string, PartOfSpeech> = { N: 'NOUN', V: 'VERB', A: 'AUX', J: 'ADJ', P: 'PRON', D: 'DET', ADP: 'ADP', ADV: 'ADV', PART: 'PART', CONJ: 'CONJ', SCONJ: 'SCONJ', NUM: 'NUM', PROPN: 'PROPN', INTJ: 'INTJ' };
const FEAT: Record<string, [string, string]> = {
  m: ['Gender', 'Masc'], f: ['Gender', 'Fem'], sg: ['Number', 'Sing'], pl: ['Number', 'Plur'],
  dir: ['Case', 'Dir'], dirobl: ['Case', 'Dir,Obl'], obl: ['Case', 'Obl'], voc: ['Case', 'Voc'], erg: ['Case', 'Erg'], dat: ['Case', 'Dat'], gen: ['Case', 'Gen'],
  stem: ['VerbForm', 'Stem'], inf: ['VerbForm', 'Inf'], part: ['VerbForm', 'Part'], conv: ['VerbForm', 'Conv'], fin: ['VerbForm', 'Fin'],
  ipf: ['Aspect', 'Imp'], pf: ['Aspect', 'Perf'], prog: ['Aspect', 'Prog'],
  pres: ['Tense', 'Pres'], past: ['Tense', 'Past'], fut: ['Tense', 'Fut'],
  sub: ['Mood', 'Sub'], cmd: ['Mood', 'Imp'], ind: ['Mood', 'Ind'],
  p1: ['Person', '1'], p2: ['Person', '2'], p3: ['Person', '3'],
  infm: ['Polite', 'Infm'], fam: ['Polite', 'Fam'], form: ['Polite', 'Form'],
  poss: ['Poss', 'Yes'], prs: ['PronType', 'Prs'], p23: ['Person', '2,3'], p123: ['Person', '1,2,3'], finstem: ['VerbForm', 'Fin,Stem'], impsub: ['Mood', 'Imp,Sub'], plsg: ['Number', 'Plur,Sing'], cau: ['Voice', 'Cau'], rel: ['PronType', 'Rel'], dem: ['PronType', 'Dem'], int: ['PronType', 'Int'],
};
const PUNCT = /^[,।॥?!.;:"'()\-–—…]+$/u;

function S(line: string): { tokens: RawToken[]; analyses: AnalyzedToken[]; text: string } {
  const tokens: RawToken[] = [];
  const analyses: AnalyzedToken[] = [];
  let text = '';
  for (const item of line.split(/\s+/).filter(Boolean)) {
    const isP = PUNCT.test(item);
    const surface = isP ? item : item.split('=')[0].split('|')[0];
    const noSpaceBefore = isP && /^[,।॥?!.;:)]/u.test(item);
    if (text && !noSpaceBefore && !(tokens.length && /^[(\-–]$/u.test(tokens[tokens.length - 1].surface))) text += ' ';
    const start = text.length;
    text += surface;
    const token: RawToken = { surface, start, end: text.length, isWord: !isP, normalized: surface.normalize('NFC') };
    tokens.push(token);
    const candidates: AnalysisCandidate[] = [];
    if (!isP && item.includes('=')) {
      item.split('|').forEach((part, k) => {
        const [body, gloss] = part.split('~');
        const [main0, conf] = body.split('@');
        const [main, variant] = main0.split('%');
        const rest = main.slice(main.indexOf('=') + 1);
        const [lemma, pos, feats] = rest.split('.');
        const morph: Record<string, string> = {};
        let unconfirmed = false;
        for (const f of (feats ?? '').split(',').filter(Boolean)) {
          if (f === 'unc') { unconfirmed = true; continue; }
          const m = FEAT[f];
          if (m) morph[m[0]] = m[1]; else if (f.includes(':')) { const [a, b] = f.split(':'); morph[a] = b; } else throw new Error(`unknown feature ${f}`);
        }
        const p = POS[pos];
        if (!p) throw new Error(`unknown POS ${pos} in ${item}`);
        candidates.push({ lemma: lemma.normalize('NFC'), pos: p, morph, confidence: conf ? Number(conf) : k === 0 ? 0.9 : 0.6, ...(gloss ? { gloss } : {}), ...(variant ? { notes: { variantOf: variant } } : {}), ...(unconfirmed ? { unconfirmed: true } : {}) });
      });
    }
    analyses.push({ token, candidates, analyzer: 'test' });
  }
  return { tokens, analyses, text };
}

/** Give candidate 0 of word i the parts of a fused word (उसने = उस + ने). */
function fuse(an: AnalyzedToken[], i: number, ...parts: Array<[string, string, PartOfSpeech]>): void {
  let at = 0;
  an[i].candidates[0].parts = parts.map(([text, lemma, pos]) => { const p = { text, start: at, end: at + text.length, lemma, pos, kind: 'clitic' as const }; at += text.length; return p; });
}

void fuse;

/** Run the rule at the (first) word whose surface is `at`; return what it gives and the base it was given. */
function at(line: string, surface: string, nth = 0) {
  const s = S(line);
  const base = s.analyses.map((a) => a.candidates);
  let seen = 0;
  const i = s.tokens.findIndex((t) => t.surface === surface && seen++ === nth);
  if (i < 0) throw new Error(`no ${surface} in ${line}`);
  return { i, base, out: disambiguateHindi(i, s.tokens, base), cands: base[i] };
}
const keyOf = (c: AnalysisCandidate) => `${c.lemma}|${c.pos}`;

/** The reading that comes first, plus the invariants every decision keeps. */
function decided(line: string, surface: string, nth = 0) {
  const r = at(line, surface, nth);
  expect(r.out).not.toBe(r.cands);
  // nothing added, nothing removed
  expect(r.out.map(keyOf).sort()).toEqual(r.cands.map(keyOf).sort());
  expect(r.out).toHaveLength(r.cands.length);
  // the chosen reading keeps its own confidence and says who decided; the others are marked down to 0.4 at most
  const first = r.out[0];
  const original = r.cands.find((c) => keyOf(c) === keyOf(first) && JSON.stringify(c.morph) === JSON.stringify(first.morph))!;
  expect(first.confidence).toBe(original.confidence);
  expect(typeof first.notes?.context).toBe('string');
  for (const c of r.out.slice(1)) expect(c.confidence).toBeLessThanOrEqual(0.4);
  return r.out;
}
const undecided = (line: string, surface: string, nth = 0) => {
  const r = at(line, surface, nth);
  expect(r.out).toBe(r.cands);
};

describe('की: of, or did', () => {
  const GEN = 'की=का.ADP.f|=करना.V.part,pf,f,sg';
  it.each([
    ['between two nouns', `यह=यह.P.p3,sg राम=राम.PROPN ${GEN} किताब=किताब.N.f,sg है=होना.A.fin,pres,p3,sg ।`],
    ['ने earlier but a noun follows: still of', `उसने=वह.P.erg,p3,sg राम=राम.PROPN ${GEN} किताब=किताब.N.f,sg पढ़ी=पढ़ना.V.part,pf,f,sg ।`],
    ['a compound postposition follows', `वह=वह.P.p3,sg शेर=शेर.N.m,sg ${GEN} तरह=तरह.N.f,sg दहाड़ा=दहाड़ना.V.part,pf,m,sg ।`],
    ['before an adjective and its noun', `वह=वह.P.p3,sg राम=राम.PROPN ${GEN} छोटी=छोटा.J.f,sg बहन=बहन.N.f,sg है=होना.A.fin,pres,p3,sg ।`],
    ['a noun before it, no ने, then है', `यह=यह.P.p3,sg किताब=किताब.N.f,sg राम=राम.PROPN ${GEN} है=होना.A.fin,pres,p3,sg ।`],
  ])('of: %s', (_n, line) => { expect(decided(line, 'की')[0].lemma).toBe('का'); });

  it.each([
    ['after ने and its doer, ending the clause', `उसने=वह.P.erg,p3,sg मेरी=मेरा.D.poss,f मदद=मदद.N.f,sg ${GEN} ।`],
    ['ने, then है', `उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg ${GEN} है=होना.A.fin,pres,p3,sg ।`],
    ['नहीं before it, nothing after', `उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg नहीं=नहीं.ADV ${GEN} ।`],
    ['the passive: की गई', `उसकी=वह.P.gen,p3,sg मदद=मदद.N.f,sg ${GEN} गई=जाना.V.part,pf,f,sg ।`],
    ['an adverb before it, then था', `वह=वह.P.p3,sg कोशिश=कोशिश.N.f,sg बहुत=बहुत.ADV ${GEN} थी=होना.A.fin,past,p3,sg,f ।`],
  ])('did: %s', (_n, line) => { expect(decided(line, 'की')[0].lemma).toBe('करना'); });

  it('the context note names the neighbour', () => {
    expect(String(decided(`यह=यह.P.p3,sg राम=राम.PROPN ${GEN} किताब=किताब.N.f,sg है=होना.A.fin,pres,p3,sg ।`, 'की')[0].notes?.context)).toMatch(/noun/u);
  });

  it('one reading only: the same array comes back', () => { undecided('राम=राम.PROPN की=का.ADP.f किताब=किताब.N.f,sg ।', 'की'); });
  it('nothing decides (a verb with no ने and no noun before): unchanged', () => { undecided(`वह=वह.P.p3,sg ${GEN} बहुत=बहुत.ADV अच्छी=अच्छा.J.f,sg ।`, 'की'); });

  it('is idempotent: running it again on its own output changes nothing', () => {
    const r = at(`उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg ${GEN} ।`, 'की');
    const again = disambiguateHindi(r.i, S(`उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg ${GEN} ।`).tokens, r.base.map((b, k) => (k === r.i ? r.out : b)));
    expect(again).toBe(r.out);
  });
});

describe('के before a compound postposition, and after a bare stem', () => {
  const KE = 'के=का.ADP.m|=करना.V.conv';
  it.each(['लिए', 'साथ', 'बाद', 'पास', 'बारे', 'बिना', 'सामने'])('के %s is the genitive', (head) => {
    const out = decided(`वह=वह.P.p3,sg घर=घर.N.m,sg ${KE} ${head}=${head}.N.m,sg आया=आना.V.part,pf,m,sg ।`, 'के');
    expect(out[0].lemma).toBe('का');
  });
  it('after a bare verb stem: "having done"', () => {
    const out = decided(`वह=वह.P.p3,sg खा=खाना.V.stem ${KE} सो=सोना.V.stem गया=जाना.V.part,pf,m,sg ।`, 'के');
    expect(out[0].lemma).toBe('करना');
  });
  it('after a noun and before a noun nothing is decided here', () => { undecided(`यह=यह.P.p3,sg राम=राम.PROPN ${KE} दोस्त=दोस्त.N.m,pl हैं=होना.A.fin,pres,p3,pl ।`, 'के'); });
});

describe('पर: on, or but', () => {
  const PAR = 'पर=पर.ADP|=पर.CONJ';
  it('after a noun: the postposition', () => { expect(decided(`किताब=किताब.N.f,sg मेज़=मेज़.N.f,sg ${PAR} है=होना.A.fin,pres,p3,sg ।`, 'पर')[0].pos).toBe('ADP'); });
  it('after a pronoun: the postposition', () => { expect(decided(`वह=वह.P.p3,sg मुझ=मैं.P.obl,p1,sg ${PAR} हँसा=हँसना.V.part,pf,m,sg ।`, 'पर')[0].pos).toBe('ADP'); });
  it('after a comma: "but"', () => { expect(decided(`मैं=मैं.P.p1,sg ठीक=ठीक.J हूँ=होना.A.fin,pres,p1,sg , ${PAR} वह=वह.P.p3,sg बीमार=बीमार.J है=होना.A.fin,pres,p3,sg ।`, 'पर')[0].pos).toBe('CONJ'); });
  it('at the start of the sentence: "but"', () => { expect(decided(`${PAR} मैं=मैं.P.p1,sg नहीं=नहीं.ADV गया=जाना.V.part,pf,m,sg ।`, 'पर')[0].pos).toBe('CONJ'); });
  it('after a finished verb, before a new subject: "but"', () => { expect(decided(`वह=वह.P.p3,sg आया=आना.V.part,pf,m,sg ${PAR} मैं=मैं.P.p1,sg नहीं=नहीं.ADV गया=जाना.V.part,pf,m,sg ।`, 'पर')[0].pos).toBe('CONJ'); });
  it('after an adverb, nothing decides: unchanged', () => { undecided(`वह=वह.P.p3,sg यहाँ=यहाँ.ADV ${PAR} ।`, 'पर'); });
});

describe('a noun that is also a verb form', () => {
  const KHANA = 'खाना=खाना.N.m,sg|=खाना.V.inf';
  const SONA = 'सोना=सोना.N.m,sg|=सोना.V.inf';
  it('after a possessive: food', () => { expect(decided(`मेरा=मेरा.D.poss,m ${KHANA} तैयार=तैयार.J है=होना.A.fin,pres,p3,sg ।`, 'खाना')[0].pos).toBe('NOUN'); });
  it('after an adjective: food', () => { expect(decided(`अच्छा=अच्छा.J.m,sg ${KHANA} बना=बनना.V.part,pf,m,sg ।`, 'खाना')[0].pos).toBe('NOUN'); });
  it('before a conjugated verb: the noun is its object', () => { expect(decided(`मैं=मैं.P.p1,sg ${KHANA} खाता=खाना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।`, 'खाना')[0].pos).toBe('NOUN'); });
  it('gold, bought', () => { expect(decided(`उसने=वह.P.erg,p3,sg ${SONA} खरीदा=खरीदना.V.part,pf,m,sg ।`, 'सोना')[0].pos).toBe('NOUN'); });
  it('before a postposition: a noun', () => { expect(decided(`${KHANA} में=में.ADP नमक=नमक.N.m,sg है=होना.A.fin,pres,p3,sg ।`, 'खाना')[0].pos).toBe('NOUN'); });
  it('before चाहता: the infinitive', () => { expect(decided(`वह=वह.P.p3,sg ${SONA} चाहता=चाहना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।`, 'सोना')[0].pos).toBe('VERB'); });
  it('before पड़ा: the infinitive', () => { expect(decided(`उसे=वह.P.dat,p3,sg ${SONA} पड़ा=पड़ना.V.part,pf,m,sg ।`, 'सोना')[0].pos).toBe('VERB'); });
  it('after its object, ending the clause: the infinitive', () => { expect(decided(`रोटी=रोटी.N.f,sg ${KHANA} ।`, 'खाना')[0].pos).toBe('VERB'); });
  it('खाना है: nothing decides, the readings stay as they were', () => { undecided(`${KHANA} है=होना.A.fin,pres,p3,sg ।`, 'खाना'); });
  it('खाना चाहिए (should eat / needs food): left open', () => { undecided(`उसे=वह.P.dat,p3,sg ${KHANA} चाहिए=चाहना.V.fin ।`, 'खाना'); });
  it('a participle before a noun is an adjective', () => {
    const out = decided('टूटा=टूटना.V.part,pf,m,sg|=टूटा.J.m,sg खिलौना=खिलौना.N.m,sg पड़ा=पड़ना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'टूटा');
    expect(out[0].pos).toBe('ADJ');
  });
  it('a participle after a determiner is an adjective', () => {
    expect(decided('यह=यह.D टूटा=टूटना.V.part,pf,m,sg|=टूटा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'टूटा')[0].pos).toBe('ADJ');
  });
});

describe('और: and, or more', () => {
  const AUR = 'और=और.CONJ|=और.ADV';
  it('between two nouns: and', () => { expect(decided(`रोटी=रोटी.N.f,sg ${AUR} पानी=पानी.N.m,sg दो=देना.V.fin,cmd,p2,fam ।`, 'और')[0].pos).toBe('CONJ'); });
  it('between two verbs: and', () => { expect(decided(`वह=वह.P.p3,sg खाता=खाना.V.part,ipf,m,sg ${AUR} पीता=पीना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।`, 'और')[0].pos).toBe('CONJ'); });
  it('between two pronouns: and', () => { expect(decided(`मैं=मैं.P.p1,sg ${AUR} तुम=तुम.P.p2,pl जाएँगे=जाना.V.fin,fut,p1,pl,m ।`, 'और')[0].pos).toBe('CONJ'); });
  it('starting a sentence: and', () => { expect(decided(`${AUR} फिर=फिर.ADV उसने=वह.P.erg,p3,sg कहा=कहना.V.part,pf,m,sg ।`, 'और')[0].pos).toBe('CONJ'); });
  it('after a word with को, before a noun: more', () => { expect(decided(`मुझे=मैं.P.dat,p1,sg ${AUR} पानी=पानी.N.m,sg चाहिए=चाहना.V.fin ।`, 'और')[0].pos).toBe('ADV'); });
  it('after a postposition, before a noun: more', () => { expect(decided(`उसके=वह.P.gen,p3,sg से=से.ADP ${AUR} समय=समय.N.m,sg लगा=लगना.V.part,pf,m,sg ।`, 'और')[0].pos).toBe('ADV'); });
});

describe('particles, कल, आप, आम', () => {
  it('तो is a particle (the other reading is kept, marked down)', () => {
    const out = decided('मैं=मैं.P.p1,sg तो=तो.CONJ@0.9|=तो.PART@0.6 गया=जाना.V.part,pf,m,sg ।', 'तो');
    expect(out[0].pos).toBe('PART');
    expect(out[0].confidence).toBe(0.6);
    expect(out[1].confidence).toBe(0.4);
  });
  it('भी and ही are particles', () => {
    expect(decided('मैं=मैं.P.p1,sg भी=भी.ADV@0.9|=भी.PART@0.6 गया=जाना.V.part,pf,m,sg ।', 'भी')[0].pos).toBe('PART');
    expect(decided('मैं=मैं.P.p1,sg ही=ही.ADV@0.9|=ही.PART@0.6 गया=जाना.V.part,pf,m,sg ।', 'ही')[0].pos).toBe('PART');
  });
  it('a particle that is already first and alone is left as it was', () => { undecided('मैं=मैं.P.p1,sg भी=भी.PART गया=जाना.V.part,pf,m,sg ।', 'भी'); });
  it('कल stays one word: yesterday and tomorrow are not split', () => { undecided('कल=कल.ADV|=कल.N.m,sg मैं=मैं.P.p1,sg गया=जाना.V.part,pf,m,sg ।', 'कल'); });
  it('आप after अपने is "self"', () => {
    const out = decided('वह=वह.P.p3,sg अपने=अपना.D.poss,m आप=आप.P.p2,form|=आप.P.p3,sg,m ही=ही.PART सीखा=सीखना.V.part,pf,m,sg ।', 'आप');
    expect(out[0].morph.Person).toBe('3');
  });
  it('आप elsewhere is "you"', () => {
    const out = decided('आप=आप.P.p2,form|=आप.P.p3,sg,m कैसे=कैसा.J.m,pl हैं=होना.A.fin,pres,p2,pl ?', 'आप');
    expect(out[0].morph.Person).toBe('2');
  });
  it('आम before a noun is "common"', () => { expect(decided('आम=आम.N.m,sg~mango|=आम.J~common लोग=लोग.N.m,pl आए=आना.V.part,pf,m,pl ।', 'आम')[0].pos).toBe('ADJ'); });
  it('आम after a determiner is the fruit', () => { expect(decided('यह=यह.D आम=आम.N.m,sg~mango|=आम.J~common मीठा=मीठा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'आम')[0].pos).toBe('NOUN'); });
  it('आम after एक with nothing after: the fruit', () => { expect(decided('मुझे=मैं.P.dat,p1,sg एक=एक.NUM आम=आम.N.m,sg~mango|=आम.J~common ।', 'आम')[0].pos).toBe('NOUN'); });
});

describe('a noun\'s direct plural or oblique singular (लड़के)', () => {
  const LADKE = 'लड़के=लड़का.N.m,pl,dir|=लड़का.N.m,sg,obl';
  it('a postposition follows: the oblique singular', () => {
    const out = decided(`${LADKE} को=को.ADP किताब=किताब.N.f,sg दो=देना.V.fin,cmd,p2,fam ।`, 'लड़के');
    expect(out[0].morph.Case).toBe('Obl');
    expect(out[0].morph.Number).toBe('Sing');
  });
  it('a plural verb follows: the direct plural', () => {
    const out = decided(`${LADKE} खेल=खेल.N.m,sg रहे=रहना.V.part,prog,m,pl हैं=होना.A.fin,pres,p3,pl ।`, 'लड़के');
    expect(out[0].morph.Number).toBe('Plur');
  });
  it('after ये: the direct plural', () => { expect(decided(`ये=ये.D ${LADKE} अच्छे=अच्छा.J.m,pl हैं=होना.A.fin,pres,p3,pl ।`, 'लड़के')[0].morph.Number).toBe('Plur'); });
  it('after a number: the direct plural', () => { expect(decided(`दो=दो.NUM ${LADKE} आए=आना.V.part,pf,m,pl ।`, 'लड़के')[0].morph.Number).toBe('Plur'); });
  it('after इस: the oblique singular', () => { expect(decided(`इस=इस.D ${LADKE} के=का.ADP.m पास=पास.N.m,sg ।`, 'लड़के')[0].morph.Case).toBe('Obl'); });
  it('an adjective in -े looks past the noun to the postposition', () => {
    const out = decided('अच्छे=अच्छा.J.m,pl,dir|=अच्छा.J.m,sg,obl लड़के=लड़का.N.m,pl,dir|=लड़का.N.m,sg,obl को=को.ADP इनाम=इनाम.N.m,sg मिला=मिलना.V.part,pf,m,sg ।', 'अच्छे');
    expect(out[0].morph.Case).toBe('Obl');
  });
  it('no postposition governs it: the direct plural comes first', () => { expect(decided(`${LADKE} ।`, 'लड़के')[0].morph.Number).toBe('Plur'); });
});

describe('a bare stem, or the familiar command', () => {
  const KAR = 'कर=करना.V.stem|=करना.V.fin,cmd,p2,infm';
  it('before a vector verb: the stem', () => { expect(decided(`उसने=वह.P.erg,p3,sg ${KAR} दिया=देना.V.part,pf,m,sg ।`, 'कर')[0].morph.VerbForm).toBe('Stem'); });
  it('before रहा: the stem', () => { expect(decided(`वह=वह.P.p3,sg ${KAR} रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।`, 'कर')[0].morph.VerbForm).toBe('Stem'); });
  it('before सकता: the stem', () => { expect(decided(`वह=वह.P.p3,sg ${KAR} सकता=सकना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।`, 'कर')[0].morph.VerbForm).toBe('Stem'); });
  it('a particle between does not hide the vector', () => { expect(decided(`मैं=मैं.P.p1,sg ${KAR} नहीं=नहीं.ADV पाया=पाना.V.part,pf,m,sg ।`, 'कर')[0].morph.VerbForm).toBe('Stem'); });
  it('ending the sentence: the familiar command', () => { expect(decided(`तू=तू.P.p2,infm जल्दी=जल्दी.ADV ${KAR} ।`, 'कर')[0].morph.Mood).toBe('Imp'); });
  it('followed by a noun: nothing decides', () => { undecided(`तू=तू.P.p2,infm ${KAR} काम=काम.N.m,sg ।`, 'कर'); });
});

describe('the rules are quiet where they have nothing to say', () => {
  it('a token with one reading comes back as the same array', () => { undecided('राम=राम.PROPN घर=घर.N.m,sg गया=जाना.V.part,pf,m,sg ।', 'घर'); });
  it('a token with no reading comes back as the same array', () => {
    const s = S('वह घर जाता है ।');
    const base = s.analyses.map((a) => a.candidates);
    expect(disambiguateHindi(1, s.tokens, base)).toBe(base[1]);
  });
  it('punctuation comes back as it was', () => {
    const s = S('वह=वह.P.p3,sg गया=जाना.V.part,pf,m,sg ।');
    const base = s.analyses.map((a) => a.candidates);
    expect(disambiguateHindi(2, s.tokens, base)).toBe(base[2]);
  });
  it('two readings with nothing that tells them apart stay in their order', () => { undecided('सा=सा.PART|=सा.ADV ।', 'सा'); });
  it('the input is never modified', () => {
    const s = S('उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=का.ADP.f|=करना.V.part,pf,f,sg ।');
    const base = s.analyses.map((a) => a.candidates);
    const snapshot = JSON.stringify(base);
    disambiguateHindi(3, s.tokens, base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('a reading whose features are lists is annotated, never split', () => {
  const MERGED = 'लड़के=लड़का.N.m,plsg,dirobl';
  it('before a postposition: the note says oblique singular, the reading is untouched', () => {
    const r = at(`${MERGED} को=को.ADP किताब=किताब.N.f,sg दो=देना.V.fin,cmd,p2,fam ।`, 'लड़के');
    expect(r.out).toHaveLength(1);
    expect(r.out[0].morph).toEqual(r.cands[0].morph);
    expect(String(r.out[0].notes?.context)).toMatch(/oblique singular/u);
  });
  it('before a plural verb: the note says direct plural', () => {
    const r = at(`${MERGED} खेल=खेलना.V.stem रहे=रहना.V.part,prog,m,pl हैं=होना.A.fin,pres,p123,pl ।`, 'लड़के');
    expect(String(r.out[0].notes?.context)).toMatch(/direct plural/u);
  });
  it('nothing decides: the same array', () => { undecided(`${MERGED} ।`, 'लड़के'); });
  it('running it again on its own output changes nothing', () => {
    const s = S(`${MERGED} को=को.ADP किताब=किताब.N.f,sg दो=देना.V.fin,cmd,p2,fam ।`);
    const base = s.analyses.map((a) => a.candidates);
    const once = disambiguateHindi(0, s.tokens, base);
    const twice = disambiguateHindi(0, s.tokens, base.map((b, k) => (k === 0 ? once : b)));
    expect(twice).toBe(once);
  });
});
