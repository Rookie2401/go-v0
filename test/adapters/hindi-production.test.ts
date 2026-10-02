/**
 * Hindi writing checks (package H4). The sentences are analysed by hand in a compact notation (see `S`): each word is
 * `surface=lemma.POS.features`, alternative readings follow after `|`, `@0.5` sets a confidence, `%form` a variantOf note,
 * `unc` among the features marks a reading the word list does not vouch for. A correct sentence must give nothing.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, RawToken } from '../../src/core';
import { checkHindiProduction } from '../../src/adapters/hindi/production';

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

const check = (line: string) => { const s = S(line); return { ...s, errs: checkHindiProduction(s.tokens, s.analyses, s.text) }; };
/** The sentence after applying every suggestion (right to left). */
const applied = (line: string) => {
  const r = check(line);
  let t = r.text;
  const sugs = r.errs.flatMap((e) => (e.suggestion ? [e.suggestion] : [])).sort((a, b) => b.start - a.start);
  for (const s of sugs) t = t.slice(0, s.start) + s.replacement + t.slice(s.end);
  return t;
};

const BE1 = 'हूँ=होना.A.fin,pres,p1,sg';

/** Correct sentences: the checker must say nothing. */
const CORRECT: Array<[string, string]> = [
  ['habitual with है', 'वह=वह.P.p3,sg रोज़=रोज़.ADV पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।'],
  ['habitual with हूँ', `मैं=मैं.P.p1,sg जाता=जाना.V.part,ipf,m,sg ${BE1} ।`],
  ['we, plural', 'हम=हम.P.p1,pl जाते=जाना.V.part,ipf,m,pl हैं=होना.A.fin,pres,p1,pl ।'],
  ['तुम with हो', 'तुम=तुम.P.p2,pl,fam पढ़ते=पढ़ना.V.part,ipf,m,pl हो=होना.A.fin,pres,p2,pl ।'],
  ['आप with हैं', 'आप=आप.P.p2,pl,form जाते=जाना.V.part,ipf,m,pl हैं=होना.A.fin,pres,p2,pl ।'],
  ['they', 'वे=वह.P.p3,pl आए=आना.V.part,pf,m,pl हैं=होना.A.fin,pres,p3,pl ।'],
  ['the plural of respect with a singular pronoun', 'वह=वह.P.p3,sg आए=आना.V.part,pf,m,pl हैं=होना.A.fin,pres,p3,pl ।'],
  ['feminine subject', 'लड़की=लड़की.N.f,sg गई=जाना.V.part,pf,f,sg ।'],
  ['plural subject with progressive', 'लड़के=लड़का.N.m,pl खेल=खेलना.V.stem रहे=रहना.V.part,prog,m,pl हैं=होना.A.fin,pres,p3,pl ।'],
  ['masculine subject with progressive', 'लड़का=लड़का.N.m,sg खेल=खेलना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।'],
  ['plural subject, locative', 'किताबें=किताब.N.f,pl मेज़=मेज़.N.f,sg पर=पर.ADP हैं=होना.A.fin,pres,p3,pl ।'],
  ['adjective and noun agree (feminine)', 'अच्छी=अच्छा.J.f,sg लड़की=लड़की.N.f,sg आई=आना.V.part,pf,f,sg ।'],
  ['adjective and noun agree (masculine)', 'बड़ा=बड़ा.J.m,sg घर=घर.N.m,sg दिखा=दिखना.V.part,pf,m,sg ।'],
  ['an adjective that does not change', 'सुंदर=सुंदर.J लड़की=लड़की.N.f,sg आई=आना.V.part,pf,f,sg ।'],
  ['adjective before an oblique noun, in -े', 'बड़े=बड़ा.J.m,sg,obl लड़के=लड़का.N.m,sg,obl को=को.ADP इनाम=इनाम.N.m,sg मिला=मिलना.V.part,pf,m,sg ।'],
  ['genitive + feminine', 'राम=राम.PROPN की=का.ADP.f किताब=किताब.N.f,sg मेज़ पर है ।'],
  ['genitive + masculine', 'लड़के=लड़का.N.m,sg,obl का=का.ADP.m घर=घर.N.m,sg बड़ा=बड़ा.J.m,sg है=होना.A.fin,pres,p3,sg ।'],
  ['genitive + masculine plural', 'लड़के=लड़का.N.m,sg,obl के=का.ADP.m दोस्त=दोस्त.N.m,pl आए=आना.V.part,pf,m,pl ।'],
  ['possessive + feminine', 'मेरी=मेरा.D.poss,f बहन=बहन.N.f,sg आई=आना.V.part,pf,f,sg ।'],
  ['की that is the verb "did"', 'उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=करना.V.part,pf,f,sg@0.9|=का.ADP.f@0.4 ।'],
  ['oblique noun before को', 'लड़के=लड़का.N.m,sg,obl को=को.ADP किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।'],
  ['oblique plural before से', 'लड़कियों=लड़की.N.f,pl,obl से=से.ADP पूछो=पूछना.V.fin,cmd,p2,fam ।'],
  ['an invariant noun in -ा', 'पिता=पिता.N.m,sg को=को.ADP बुलाओ=बुलाना.V.fin,cmd,p2,fam ।'],
  ['a noun the word list does not vouch for', 'सिनेमा=सिनेमा.N.m,sg,unc में=में.ADP फ़िल्म=फ़िल्म.N.f,sg है=होना.A.fin,pres,p3,sg ।'],
  ['an unchanged noun that is both direct and oblique', 'सिनेमा=सिनेमा.N.m,sg,dirobl में=में.ADP फ़िल्म=फ़िल्म.N.f,sg है=होना.A.fin,pres,p3,sg ।'],
  ['ergative with perfective', 'उसने=वह.P.erg,p3,sg रोटी=रोटी.N.f,sg खाई=खाना.V.part,pf,f,sg ।'],
  ['ने as a separate word with perfective', 'राम=राम.PROPN ने=ने.ADP किताब=किताब.N.f,sg पढ़ी=पढ़ना.V.part,pf,f,sg ।'],
  ['ने with a complement clause', 'उसने=वह.P.erg,p3,sg कहा=कहना.V.part,pf,m,sg कि=कि.SCONJ वह=वह.P.p3,sg जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।'],
  ['ने with a noun + light verb in the infinitive', 'उसने=वह.P.erg,p3,sg कहना=कहना.V.inf शुरू=शुरू.J किया=करना.V.part,pf,m,sg ।'],
  ['must, with को', 'मुझे=मैं.P.dat,p1,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।'],
  ['should, with को', 'तुम्हें=तुम.P.dat,p2,pl पढ़ना=पढ़ना.V.inf चाहिए=चाहना.V.fin ।'],
  ['hungry, with को', 'मुझे=मैं.P.dat,p1,sg भूख=भूख.N.f,sg लगी=लगना.V.part,pf,f,sg है=होना.A.fin,pres,p3,sg ।'],
  ['wanting takes a subject in the direct case', 'मैं=मैं.P.p1,sg जाना=जाना.V.inf चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।'],
  ['the infinitive before लगना', 'वह=वह.P.p3,sg रोने=रोना.V.inf,obl लगा=लगना.V.part,pf,m,sg ।'],
  ['the stem before सकना', 'मैं=मैं.P.p1,sg पढ़=पढ़ना.V.stem सकता=सकना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।'],
  ['marks as the word list writes them', 'मैं=मैं.P.p1,sg नहीं=नहीं.ADV जानता=जानना.V.part,ipf,m,sg ।'],
  ['correct nukta', 'ज़रूरत=ज़रूरत.N.f,sg%ज़रूरत है=होना.A.fin,pres,p3,sg ।'],
  ['an accepted variant is not an error', 'हिन्दी=हिंदी.N.f,sg%हिंदी अच्छी=अच्छा.J.f,sg है=होना.A.fin,pres,p3,sg ।'],
  ['ga/gii variants are not errors', 'वह=वह.P.p3,sg गयी=जाना.V.part,pf,f,sg%गई ।'],
  ['words the word list does not know', 'वह मकान में रहता है ।'],
  ['a pronoun with a fused postposition is already right', 'उसे=वह.P.dat,p3,sg मुझसे=मैं.P.obl,p1,sg कहो=कहना.V.fin,cmd,p2,fam ।'],
  ['two bare nouns: the subject is not guessed', 'लड़का=लड़का.N.m,sg किताब=किताब.N.f,sg पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।'],
  ['empty', ''],
  ['punctuation only', '। ?'],
];

describe('Hindi writing checks: correct sentences give nothing', () => {
  it.each(CORRECT)('%s', (_n, line) => { expect(check(line).errs).toEqual([]); });
});

/** [name, sentence, category, token indexes, sentence after applying the suggestion (undefined: no suggestion)] */
type Case = [string, string, string, number[], string | undefined];
const WRONG: Case[] = [
  ['adjective of the wrong gender', 'अच्छा=अच्छा.J.m,sg लड़की=लड़की.N.f,sg आई=आना.V.part,pf,f,sg ।', 'agreement', [0, 1], 'अच्छी लड़की आई।'],
  ['adjective of the wrong gender, other way', 'छोटी=छोटा.J.f,sg बेटा=बेटा.N.m,sg आया=आना.V.part,pf,m,sg ।', 'agreement', [0, 1], 'छोटा बेटा आया।'],
  ['adjective in -ा before an oblique noun', 'बड़ा=बड़ा.J.m,sg लड़के=लड़का.N.m,sg,obl को=को.ADP इनाम=इनाम.N.m,sg मिला=मिलना.V.part,pf,m,sg ।', 'agreement', [0, 1], 'बड़े लड़के को इनाम मिला।'],
  ['का with a feminine noun', 'राम=राम.PROPN का=का.ADP.m किताब=किताब.N.f,sg ।', 'agreement', [1, 2], 'राम की किताब।'],
  ['के with a feminine noun', 'राम=राम.PROPN के=का.ADP.m बहन=बहन.N.f,sg आई=आना.V.part,pf,f,sg ।', 'agreement', [1, 2], 'राम की बहन आई।'],
  ['की with a masculine plural', 'राम=राम.PROPN की=का.ADP.f दोस्त=दोस्त.N.m,pl,dir आए=आना.V.part,pf,m,pl ।', 'agreement', [1, 2], 'राम के दोस्त आए।'],
  ['की with a masculine whose case is not settled: no suggestion', 'लड़की=लड़की.N.f,sg की=का.ADP.f घर=घर.N.m,sg बड़ा=बड़ा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'agreement', [1, 2], undefined],
  ['possessive of the wrong gender', 'मेरा=मेरा.D.poss,m बहन=बहन.N.f,sg आई=आना.V.part,pf,f,sg ।', 'agreement', [0, 1], 'मेरी बहन आई।'],
  ['direct noun before को', 'लड़का=लड़का.N.m,sg,dir को=को.ADP किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।', 'case', [0, 1], 'लड़के को किताब दी।'],
  ['direct noun before में', 'कमरा=कमरा.N.m,sg,dir में=में.ADP कोई=कोई.P नहीं=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'case', [0, 1], 'कमरे में कोई नहीं है।'],
  ['pronoun before को', 'मैं=मैं.P.p1,sg को=को.ADP पानी=पानी.N.m,sg चाहिए=चाहना.V.fin ।', 'case', [0, 1], 'मुझे पानी चाहिए।'],
  ['pronoun before से', 'वह=वह.P.p3,sg से=से.ADP कहो=कहना.V.fin,cmd,p2,fam ।', 'case', [0, 1], 'उससे कहो।'],
  ['pronoun before में', 'यह=यह.P.p3,sg में=में.ADP क्या=क्या.P.int है=होना.A.fin,pres,p3,sg ?', 'case', [0, 1], 'इसमें क्या है?'],
  ['ने written apart from मैं', 'मैं=मैं.P.p1,sg ने=ने.ADP खाया=खाना.V.part,pf,m,sg ।', 'case', [0, 1], 'मैंने खाया।'],
  ['feminine plural before a postposition', 'किताबें=किताब.N.f,pl,dir में=में.ADP चित्र=चित्र.N.m,pl हैं=होना.A.fin,pres,p3,pl ।', 'case', [0, 1], 'किताबों में चित्र हैं।'],
  ['ने with a habitual verb', 'उसने=वह.P.erg,p3,sg रोज़=रोज़.ADV पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'postposition', [0, 2], undefined],
  ['ने with a future verb', 'राम=राम.PROPN ने=ने.ADP कल=कल.ADV जाएगा=जाना.V.fin,fut,p3,sg,m ।', 'postposition', [1, 3], undefined],
  ['ने with "must": the person takes को', 'उसने=वह.P.erg,p3,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।', 'postposition', [0, 1, 2], 'उसे जाना है।'],
  ['मैं with है', 'मैं=मैं.P.p1,sg जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 2], 'मैं जाता हूँ।'],
  ['वे with है', 'वे=वह.P.p3,pl आते=आना.V.part,ipf,m,pl है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 2], 'वे आते हैं।'],
  ['हम with है', 'हम=हम.P.p1,pl ठीक=ठीक.J है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 2], 'हम ठीक हैं।'],
  ['तुम with है', 'तुम=तुम.P.p2,pl,fam ठीक=ठीक.J है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 2], 'तुम ठीक हो।'],
  ['मैं with थे', 'मैं=मैं.P.p1,sg घर=घर.N.m,sg में=में.ADP थे=होना.A.fin,past,p3,pl,m ।', 'agreement', [0, 3], 'मैं घर में था।'],
  ['हम with था', 'हम=हम.P.p1,pl घर=घर.N.m,sg में=में.ADP था=होना.A.fin,past,p3,sg,m ।', 'agreement', [0, 3], 'हम घर में थे।'],
  ['feminine subject, masculine participle', 'लड़की=लड़की.N.f,sg जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 1], 'लड़की जाती है।'],
  ['masculine subject, feminine participle', 'लड़का=लड़का.N.m,sg आई=आना.V.part,pf,f,sg ।', 'agreement', [0, 1], 'लड़का आया।'],
  ['plural subject, singular participle', 'बच्चे=बच्चा.N.m,pl सोता=सोना.V.part,ipf,m,sg हैं=होना.A.fin,pres,p3,pl ।', 'agreement', [0, 1], 'बच्चे सोते हैं।'],
  ['plural subject, है', 'लड़के=लड़का.N.m,pl खेलते=खेलना.V.part,ipf,m,pl है=होना.A.fin,pres,p3,sg ।', 'agreement', [0, 2], 'लड़के खेलते हैं।'],
  ['feminine plural subject, past aux', 'लड़कियाँ=लड़की.N.f,pl घर=घर.N.m,sg में=में.ADP था=होना.A.fin,past,p3,sg,m ।', 'agreement', [0, 3], 'लड़कियाँ घर में थीं।'],
  ['must without को (pronoun)', 'मैं=मैं.P.p1,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।', 'case', [0, 1], 'मुझे जाना है।'],
  ['must without को (तुम)', 'तुम=तुम.P.p2,pl पढ़ना=पढ़ना.V.inf चाहिए=चाहना.V.fin ।', 'case', [0, 1], 'तुम्हें पढ़ना चाहिए।'],
  ['must without को (noun)', 'लड़का=लड़का.N.m,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।', 'case', [0, 1], 'लड़के को जाना है।'],
  ['hungry without को', 'मैं=मैं.P.p1,sg भूख=भूख.N.f,sg लगी=लगना.V.part,pf,f,sg है=होना.A.fin,pres,p3,sg ।', 'case', [0, 2], 'मुझे भूख लगी है।'],
  ['needing without को', 'हम=हम.P.p1,pl पानी=पानी.N.m,sg चाहिए=चाहना.V.fin ।', 'case', [0, 2], 'हमें पानी चाहिए।'],
  ['knowing without को', 'मैं=मैं.P.p1,sg पता=पता.N.m,sg नहीं=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'case', [0, 3], 'मुझे पता नहीं है।'],
  ['a nukta under a letter that cannot take one', 'म़कान=मकान.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'spelling', [0], 'मकान है।'],
  ['chandrabindu over a vowel sign', 'नहीँ=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'spelling', [0], 'नहीं है।'],
  ['chandrabindu in हैँ', 'वे=वह.P.p3,pl आते=आना.V.part,ipf,m,pl हैँ ।', 'spelling', [2], 'वे आते हैं।'],
  ['a nukta missing in a word the list knows', 'जरूरत=ज़रूरत.N.f,sg%ज़रूरत है=होना.A.fin,pres,p3,sg ।', 'spelling', [0], 'ज़रूरत है।'],
  ['a chandrabindu / anusvara swap in a word the list knows', 'आंख=आँख.N.f,sg%आँख खुली=खुलना.V.part,pf,f,sg ।', 'spelling', [0], 'आँख खुली।'],
  ['the direct infinitive before लगना', 'वह=वह.P.p3,sg रोना=रोना.V.inf लगा=लगना.V.part,pf,m,sg ।', 'morphology', [1, 2], 'वह रोने लगा।'],
  ['the oblique infinitive before चाहना', 'मैं=मैं.P.p1,sg जाने=जाना.V.inf,obl चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'morphology', [1, 2], 'मैं जाना चाहता हूँ।'],
  ['the infinitive before सकना', 'मैं=मैं.P.p1,sg जाना=जाना.V.inf सकता=सकना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'morphology', [1, 2], 'मैं जा सकता हूँ।'],
  ['the oblique infinitive before सकना', 'वह=वह.P.p3,sg आने=आना.V.inf,obl सकता=सकना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'morphology', [1, 2], 'वह आ सकता है।'],
  ['the stem before चाहना', 'मैं=मैं.P.p1,sg जा=जाना.V.stem चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'morphology', [1, 2], 'मैं जाना चाहता हूँ।'],
];

describe('Hindi writing checks: findings', () => {
  it.each(WRONG)('%s', (_n, line, category, idx, fixed) => {
    const r = check(line);
    const hit = r.errs.find((e) => e.category === category && JSON.stringify(e.tokenIndexes) === JSON.stringify(idx));
    expect(hit, JSON.stringify(r.errs.map((e) => [e.category, e.tokenIndexes, e.message]))).toBeDefined();
    expect(hit!.message.length).toBeGreaterThan(15);
    expect(hit!.message.length).toBeLessThan(260);
    expect(hit!.confidence).toBeGreaterThan(0.3);
    expect(hit!.confidence).toBeLessThanOrEqual(0.95);
    expect(hit!.affectsMeaning).toBe(false);
    if (fixed === undefined) expect(hit!.suggestion).toBeUndefined();
    else {
      expect(hit!.suggestion).toBeDefined();
      expect(applied(line)).toBe(fixed);
    }
  });
});

describe('Hindi writing checks: shape and honesty', () => {
  it('has at least thirty correct sentences and thirty wrong ones', () => {
    expect(CORRECT.length).toBeGreaterThanOrEqual(30);
    expect(WRONG.length).toBeGreaterThanOrEqual(30);
  });

  it('a suggestion spans the words it replaces and nothing else', () => {
    const r = check('मैं=मैं.P.p1,sg को=को.ADP पानी=पानी.N.m,sg चाहिए=चाहना.V.fin ।');
    const e = r.errs.find((x) => x.category === 'case')!;
    expect(r.text.slice(e.suggestion!.start, e.suggestion!.end)).toBe('मैं को');
  });

  it('no suggestion for an irregular verb it cannot rebuild', () => {
    const e = check('लड़की=लड़की.N.f,sg उड़ता=उड़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।').errs.find((x) => x.category === 'agreement');
    expect(e).toBeDefined();
    expect(e!.suggestion?.replacement).toBe('उड़ती');
    const odd = check('लड़की=लड़की.N.f,sg गया=छूना.V.part,pf,m,sg ।').errs.find((x) => x.category === 'agreement');
    expect(odd).toBeDefined();
    expect(odd!.suggestion).toBeUndefined();
  });

  it('a guess is not a ground for correcting: unconfirmed readings give nothing', () => {
    expect(check('अच्छा=अच्छा.J.m,sg,unc लड़की=लड़की.N.f,sg,unc आई=आना.V.part,pf,f,sg ।').errs).toEqual([]);
    expect(check('मैं=मैं.P.p1,sg,unc जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg,unc ।').errs).toEqual([]);
    expect(check('लड़का=लड़का.N.m,sg,dir,unc को=को.ADP किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।').errs).toEqual([]);
  });

  it('an ambiguous word is not corrected: a noun that may be masculine or feminine', () => {
    expect(check('अच्छा=अच्छा.J.m,sg वाला=वाला.N.m,sg|=वाला.N.f,sg आई=आना.V.part,pf,f,sg ।').errs).toEqual([]);
  });

  it('a reading marked down by a neighbour rule does not count', () => {
    expect(check('उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=का.ADP.m@0.4|=करना.V.part,pf,f,sg@0.9 ।').errs).toEqual([]);
  });

  it('findings come in sentence order, each with sorted token indexes', () => {
    const r = check('अच्छा=अच्छा.J.m,sg लड़की=लड़की.N.f,sg राम=राम.PROPN का=का.ADP.m बहन=बहन.N.f,sg आई=आना.V.part,pf,f,sg ।');
    expect(r.errs.length).toBeGreaterThanOrEqual(2);
    for (const e of r.errs) expect([...e.tokenIndexes].sort((a, b) => a - b)).toEqual(e.tokenIndexes);
    for (let k = 1; k < r.errs.length; k++) expect(r.errs[k].tokenIndexes[0]).toBeGreaterThanOrEqual(r.errs[k - 1].tokenIndexes[0]);
  });

  it('every category used is one the contract knows', () => {
    const known = new Set(['spelling', 'morphology', 'conjugation', 'agreement', 'case', 'syntax', 'word-order', 'lexical-choice', 'missing-function-word', 'collocation', 'ambiguity', 'clarity', 'register', 'meaning-change', 'segmentation', 'particle', 'classifier', 'postposition', 'definiteness']);
    for (const [, line] of WRONG) for (const e of check(line).errs) expect(known.has(e.category)).toBe(true);
  });

  it('is deterministic and linear on a long sentence', () => {
    const line = 'लड़का=लड़का.N.m,sg खेल=खेलना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ,';
    const long = Array.from({ length: 800 }, () => line).join(' ') + ' ।';
    const t0 = Date.now();
    const a = check(long);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(a.errs).toEqual([]);
    expect(check(line).errs).toEqual(check(line).errs);
  });
});

describe('Hindi writing checks: readings as the morphology engine gives them (a form shared by two cases or numbers is two readings)', () => {
  const LADKI = 'लड़की=लड़की.N.f,sg,dir|=लड़की.N.f,sg,obl';
  const JATI = 'जाती=जाना.V.part,ipf,f,sg|=जाना.V.part,ipf,f,pl';
  const HAI = 'है=होना.A.fin,pres,p23,sg';
  const HAIN = 'हैं=होना.A.fin,pres,p123,pl';
  it.each([
    ['feminine singular subject with ती and है', `${LADKI} ${JATI} ${HAI} ।`],
    ['feminine plural subject with ती and हैं', `लड़कियाँ=लड़की.N.f,pl,dir ${JATI} ${HAIN} ।`],
    ['तुम has no Number of its own', 'तुम=तुम.P.p2,fam,prs ठीक=ठीक.J हो=होना.A.fin,pres,p2,fam ।'],
    ['आप has no Number of its own', `आप=आप.P.p2,form,prs ठीक=ठीक.J ${HAIN} ।`],
    ['वह with है', `वह=वह.P.p3,sg,dir,prs ठीक=ठीक.J ${HAI} ।`],
    ['a masculine noun shared by direct and oblique, before a postposition', 'घर=घर.N.m,sg,dir|=घर.N.m,sg,obl|=घर.N.m,pl,dir में=में.ADP कोई=कोई.P है=होना.A.fin,pres,p23,sg ।'],
    ['an invariant noun in -ा', 'पिता=पिता.N.m,sg,dir|=पिता.N.m,sg,obl|=पिता.N.m,pl,dir को=को.ADP बुलाओ=बुलाना.V.fin,cmd,p2,fam ।'],
    ['a masculine subject with a participle that is also an oblique plural', 'लड़का=लड़का.N.m,sg,dir जाते=जाना.V.part,ipf,m,pl|=जाना.V.part,ipf,m,sg,obl हैं=होना.A.fin,pres,p123,pl ।'],
    ['adjective readings of अच्छे with a masculine noun in -े', 'अच्छे=अच्छा.J.m,sg,obl|=अच्छा.J.m,pl,dir लड़के=लड़का.N.m,sg,obl|=लड़का.N.m,pl,dir आए=आना.V.part,pf,m,pl ।'],
  ])('silent: %s', (_n, line) => { expect(check(line).errs).toEqual([]); });

  it('a feminine subject, a masculine participle: one finding with the right form', () => {
    const r = check(`${LADKI} जाता=जाना.V.part,ipf,m,sg ${HAI} ।`);
    expect(r.errs.map((e) => [e.category, e.suggestion?.replacement])).toEqual([['agreement', 'जाती']]);
  });
  it('मैं with है, when the pronoun is tagged Prs', () => {
    const r = check(`मैं=मैं.P.p1,sg,dir,prs जाता=जाना.V.part,ipf,m,sg ${HAI} ।`);
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['हूँ']);
  });
  it('तुम with है asks for हो', () => {
    const r = check(`तुम=तुम.P.p2,fam,prs ठीक=ठीक.J ${HAI} ।`);
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['हो']);
  });
  it('आप with है asks for हैं', () => {
    const r = check(`आप=आप.P.p2,form,prs ठीक=ठीक.J ${HAI} ।`);
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['हैं']);
  });
  it('an adjective whose readings are all masculine, before a feminine noun', () => {
    const r = check(`अच्छे=अच्छा.J.m,sg,obl|=अच्छा.J.m,pl,dir|=अच्छा.J.m,pl,obl ${LADKI} आई=आना.V.part,pf,f,sg ।`);
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['अच्छी']);
  });
  it('a possessive whose readings are several (उसके) is judged by the noun that follows', () => {
    const r = check('उसके=उसका.D.poss,gen,m,sg|=उसका.D.poss,gen,m,pl बहन=बहन.N.f,sg,dir|=बहन.N.f,sg,obl आई=आना.V.part,pf,f,sg ।');
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['उसकी']);
  });
  it('चाहिए as its own lemma still asks for the person with को', () => {
    const r = check('हम=हम.P.p1,pl,dir,prs पानी=पानी.N.m,sg चाहिए=चाहिए.A ।');
    expect(r.errs.map((e) => e.suggestion?.replacement)).toEqual(['हमें']);
  });
  it('a merged "Fin,Stem" form of होना is not mistaken for a verb in agreement', () => {
    expect(check('तुम=तुम.P.p2,fam,prs ख़ुश=ख़ुश.J हो=होना.A.finstem,impsub,pres,p2 ।').errs).toEqual([]);
  });
});
