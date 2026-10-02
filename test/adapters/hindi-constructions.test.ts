/**
 * Hindi constructions (package H4): the inventory, the detectors, and the verb group. The sentences are analysed by hand in
 * a compact notation (see `S`): each word is `surface=lemma.POS.features`, alternative readings follow after `|`
 * (`=lemma.POS.features`), `@0.5` sets a confidence, `~gloss` a gloss, a word without `=` is unanalysed.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, RawToken } from '../../src/core';
import { detectHindiConstructions, hindiVerbGroup, HINDI_CONSTRUCTIONS } from '../../src/adapters/hindi/constructions';

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


const run = (line: string, fused?: (an: AnalyzedToken[]) => void) => {
  const s = S(line);
  fused?.(s.analyses);
  return { ...s, pats: detectHindiConstructions(s.tokens, s.analyses) };
};
const of = (pats: ReturnType<typeof detectHindiConstructions>, key: string) => pats.filter((p) => p.key === key);

describe('Hindi construction inventory', () => {
  const REQUIRED = [
    'adjective-noun-agreement', 'genitive-agreement', 'oblique-before-postposition', 'plural-forms', 'postposition-after-noun',
    'habitual-present', 'habitual-past', 'progressive', 'perfective-past', 'ergative-ne', 'ne-with-ko-object', 'present-perfect', 'pluperfect',
    'future', 'subjunctive', 'command', 'polite-request', 'negative-command', 'infinitive-as-noun', 'oblique-infinitive', 'obligation',
    'ability-sakna', 'managing-paana', 'wanting-chahna', 'ko-experiencer', 'ko-definite-object', 'passive', 'causative',
    'conjunctive-participle', 'relative-correlative', 'jab-tab', 'jahaan-vahaan', 'jaisa-vaisa', 'jitna-utna', 'complement-ki',
    'conditional', 'contrary-to-fact', 'comparison-se', 'superlative-sabse', 'vaala', 'reduplication', 'emphatic-particles',
    'question-kya', 'existence-possession', 'compound-verb', 'auxiliary-chain',
  ];

  it('has every construction the brief names, under stable kebab-case keys', () => {
    for (const k of REQUIRED) expect(HINDI_CONSTRUCTIONS[k], k).toBeDefined();
    for (const k of Object.keys(HINDI_CONSTRUCTIONS)) expect(k).toMatch(/^[a-z]+(-[a-z]+)*$/u);
    expect(Object.keys(HINDI_CONSTRUCTIONS).length).toBeGreaterThanOrEqual(46);
  });

  it('each entry has a title, a family and a plain explanation with a Hindi example', () => {
    for (const [k, v] of Object.entries(HINDI_CONSTRUCTIONS)) {
      expect(v.title.length, k).toBeGreaterThan(3);
      expect(v.family.length, k).toBeGreaterThan(2);
      expect(v.explanation.length, k).toBeGreaterThan(40);
      expect(v.explanation.length, k).toBeLessThan(420);
      expect(/[ऀ-ॿ]/u.test(v.explanation), `${k} has a Hindi example`).toBe(true);
      expect(v.explanation, k).toBe(v.explanation.normalize('NFC'));
    }
  });

  it('titles are distinct', () => {
    const titles = Object.values(HINDI_CONSTRUCTIONS).map((v) => v.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

/** [name, sentence, key, expected token indexes] — the construction must be found on exactly these tokens. */
type Case = [string, string, string, number[]];
const POSITIVE: Case[] = [
  ['adjective + noun, masculine', 'अच्छा=अच्छा.J.m,sg लड़का=लड़का.N.m,sg आया=आना.V.part,pf,m,sg ।', 'adjective-noun-agreement', [0, 1]],
  ['adjective + noun, feminine', 'छोटी=छोटा.J.f,sg लड़की=लड़की.N.f,sg हँसी=हँसना.V.part,pf,f,sg ।', 'adjective-noun-agreement', [0, 1]],
  ['adjective + noun, plural', 'बड़े=बड़ा.J.m,pl घर=घर.N.m,pl हैं=होना.A.fin,pres,p3,pl ।', 'adjective-noun-agreement', [0, 1]],
  ['का + masculine noun', 'लड़के=लड़का.N.m,sg,obl का=का.ADP घर=घर.N.m,sg बड़ा=बड़ा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'genitive-agreement', [1, 2]],
  ['की + feminine noun', 'लड़के=लड़का.N.m,sg,obl की=का.ADP.f किताब=किताब.N.f,sg मेज़=मेज़.N.f,sg पर=पर.ADP है=होना.A.fin,pres,p3,sg ।', 'genitive-agreement', [1, 2]],
  ['के + plural noun', 'लड़के=लड़का.N.m,sg,obl के=का.ADP दोस्त=दोस्त.N.m,pl आए=आना.V.part,pf,m,pl ।', 'genitive-agreement', [1, 2]],
  ['possessive pronoun agrees', 'मेरी=मेरा.D.poss,f बहन=बहन.N.f,sg आई=आना.V.part,pf,f,sg ।', 'genitive-agreement', [0, 1]],
  ['की + adjective + noun', 'राम=राम.PROPN की=का.ADP.f छोटी=छोटा.J.f,sg बहन=बहन.N.f,sg ।', 'genitive-agreement', [1, 3]],
  ['oblique singular', 'लड़के=लड़का.N.m,sg,obl को=को.ADP किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।', 'oblique-before-postposition', [0, 1]],
  ['oblique plural', 'लड़कों=लड़का.N.m,pl,obl में=में.ADP से=से.ADP कोई=कोई.P नहीं=नहीं.ADV आया=आना.V.part,pf,m,sg ।', 'oblique-before-postposition', [0, 1]],
  ['plural feminine', 'मेज़=मेज़.N.f,sg पर=पर.ADP किताबें=किताब.N.f,pl हैं=होना.A.fin,pres,p3,pl ।', 'plural-forms', [2]],
  ['plural masculine in -े', 'लड़के=लड़का.N.m,pl खेल=खेल.N.m,sg रहे=रहना.V.part,prog,m,pl हैं=होना.A.fin,pres,p3,pl ।', 'plural-forms', [0]],
  ['postposition after a noun', 'किताब=किताब.N.f,sg घर=घर.N.m,sg में=में.ADP है=होना.A.fin,pres,p3,sg ।', 'postposition-after-noun', [1, 2]],
  ['habitual present', 'वह=वह.P.p3,sg रोज़=रोज़.ADV पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'habitual-present', [2, 3]],
  ['habitual present, feminine plural', 'वे=वह.P.p3,pl पढ़ती=पढ़ना.V.part,ipf,f,pl हैं=होना.A.fin,pres,p3,pl ।', 'habitual-present', [1, 2]],
  ['habitual present with नहीं between', 'वह=वह.P.p3,sg पढ़ता=पढ़ना.V.part,ipf,m,sg नहीं=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'habitual-present', [1, 3]],
  ['habitual past', 'मैं=मैं.P.p1,sg रोज़=रोज़.ADV जाता=जाना.V.part,ipf,m,sg था=होना.A.fin,past,p1,sg,m ।', 'habitual-past', [2, 3]],
  ['habitual past, feminine', 'वह=वह.P.p3,sg गाती=गाना.V.part,ipf,f,sg थी=होना.A.fin,past,p3,sg,f ।', 'habitual-past', [1, 2]],
  ['progressive present', 'वह=वह.P.p3,sg खा=खाना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 'progressive', [1, 2, 3]],
  ['progressive past', 'वह=वह.P.p3,sg सो=सोना.V.stem रही=रहना.V.part,prog,f,sg थी=होना.A.fin,past,p3,sg,f ।', 'progressive', [1, 2, 3]],
  ['perfective past', 'वह=वह.P.p3,sg घर=घर.N.m,sg गया=जाना.V.part,pf,m,sg ।', 'perfective-past', [2]],
  ['ergative ने with a fused pronoun', 'उसने=वह.P.erg,p3,sg रोटी=रोटी.N.f,sg खाई=खाना.V.part,pf,f,sg ।', 'ergative-ne', [0, 2]],
  ['ergative ने as a separate word', 'राम=राम.PROPN ने=ने.ADP किताब=किताब.N.f,sg पढ़ी=पढ़ना.V.part,pf,f,sg ।', 'ergative-ne', [1, 3]],
  ['ने with को on the object', 'उसने=वह.P.erg,p3,sg लड़की=लड़की.N.f,sg को=को.ADP देखा=देखना.V.part,pf,m,sg ।', 'ne-with-ko-object', [0, 1, 2, 3]],
  ['present perfect', 'मैं=मैं.P.p1,sg पहुँच=पहुँचना.V.stem गया=जाना.V.part,pf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'present-perfect', [1, 2, 3]],
  ['present perfect, simple', 'उसने=वह.P.erg,p3,sg खाया=खाना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'present-perfect', [1, 2]],
  ['past perfect with चुका', 'वह=वह.P.p3,sg जा=जाना.V.stem चुका=चुकना.V.part,pf,m,sg था=होना.A.fin,past,p3,sg,m ।', 'pluperfect', [1, 2, 3]],
  ['past perfect, simple', 'उसने=वह.P.erg,p3,sg कहा=कहना.V.part,pf,m,sg था=होना.A.fin,past,p3,sg,m ।', 'pluperfect', [1, 2]],
  ['future, first person', 'मैं=मैं.P.p1,sg कल=कल.ADV जाऊँगा=जाना.V.fin,fut,p1,sg,m ।', 'future', [2]],
  ['future, feminine', 'वह=वह.P.p3,sg आएगी=आना.V.fin,fut,p3,sg,f ।', 'future', [1]],
  ['subjunctive after शायद', 'शायद=शायद.ADV वह=वह.P.p3,sg आए=आना.V.fin,sub,p3,sg ।', 'subjunctive', [2]],
  ['subjunctive after ताकि', 'ताकि=ताकि.SCONJ हम=हम.P.p1,pl समझें=समझना.V.fin,sub,p1,pl ।', 'subjunctive', [2]],
  ['familiar command', 'तुम=तुम.P.p2,pl खाओ=खाना.V.fin,cmd,p2,fam ।', 'command', [1]],
  ['polite request', 'आप=आप.P.p2,form बैठिए=बैठना.V.fin,cmd,p2,form ।', 'polite-request', [1]],
  ['polite request with कृपया', 'कृपया=कृपया.ADV बैठो=बैठना.V.fin,cmd,p2,fam ।', 'polite-request', [1]],
  ['negative command', 'मत=मत.PART जाओ=जाना.V.fin,cmd,p2,fam ।', 'negative-command', [0, 1]],
  ['negative command, polite', 'आप=आप.P.p2,form मत=मत.PART रोइए=रोना.V.fin,cmd,p2,form ।', 'negative-command', [1, 2]],
  ['infinitive as a noun', 'तैरना=तैरना.V.inf अच्छा=अच्छा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'infinitive-as-noun', [0]],
  ['oblique infinitive before के लिए', 'जाने=जाना.V.inf,obl के=का.ADP लिए=लिए.ADP पैसे=पैसा.N.m,pl चाहिए=चाहना.V.fin ।', 'oblique-infinitive', [0, 1]],
  ['oblique infinitive with लगना', 'वह=वह.P.p3,sg रोने=रोना.V.inf,obl लगा=लगना.V.part,pf,m,sg ।', 'oblique-infinitive', [1, 2]],
  ['oblique infinitive with देना', 'जाने=जाना.V.inf,obl दो=देना.V.fin,cmd,p2,fam ।', 'oblique-infinitive', [0, 1]],
  ['obligation with है', 'मुझे=मैं.P.dat,p1,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।', 'obligation', [0, 1, 2]],
  ['obligation with चाहिए', 'तुम्हें=तुम.P.dat,p2,pl पढ़ना=पढ़ना.V.inf चाहिए=चाहना.V.fin ।', 'obligation', [0, 1, 2]],
  ['obligation with पड़ा', 'उसे=वह.P.dat,p3,sg रुकना=रुकना.V.inf पड़ा=पड़ना.V.part,pf,m,sg ।', 'obligation', [0, 1, 2]],
  ['ability', 'मैं=मैं.P.p1,sg पढ़=पढ़ना.V.stem सकता=सकना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'ability-sakna', [1, 2]],
  ['ability, negated and feminine', 'वह=वह.P.p3,sg नहीं=नहीं.ADV आ=आना.V.stem सकी=सकना.V.part,pf,f,sg ।', 'ability-sakna', [2, 3]],
  ['managing to', 'मैं=मैं.P.p1,sg समझ=समझना.V.stem नहीं=नहीं.ADV पाया=पाना.V.part,pf,m,sg ।', 'managing-paana', [1, 3]],
  ['wanting', 'मैं=मैं.P.p1,sg जाना=जाना.V.inf चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'wanting-chahna', [1, 2]],
  ['को with a feeling', 'मुझे=मैं.P.dat,p1,sg भूख=भूख.N.f,sg लगी=लगना.V.part,pf,f,sg है=होना.A.fin,pres,p3,sg ।', 'ko-experiencer', [0, 1, 2]],
  ['को with knowing', 'मुझे=मैं.P.dat,p1,sg पता=पता.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'ko-experiencer', [0, 1, 2]],
  ['को with needing', 'उसे=वह.P.dat,p3,sg पानी=पानी.N.m,sg चाहिए=चाहना.V.fin ।', 'ko-experiencer', [0, 2]],
  ['को on a definite object after ने', 'मैंने=मैं.P.erg,p1,sg लड़के=लड़का.N.m,sg,obl को=को.ADP देखा=देखना.V.part,pf,m,sg ।', 'ko-definite-object', [1, 2, 3]],
  ['को on a definite object, fused pronoun', 'मैं=मैं.P.p1,sg उसे=वह.P.dat,p3,sg देखता=देखना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'ko-definite-object', [1, 2]],
  ['passive, habitual', 'यह=यह.P.p3,sg बात=बात.N.f,sg कही=कहना.V.part,pf,f,sg जाती=जाना.V.part,ipf,f,sg है=होना.A.fin,pres,p3,sg ।', 'passive', [2, 3, 4]],
  ['passive, past', 'दरवाज़ा=दरवाज़ा.N.m,sg खोला=खोलना.V.part,pf,m,sg गया=जाना.V.part,pf,m,sg ।', 'passive', [1, 2]],
  ['causative', 'माँ=माँ.N.f,sg बच्चे=बच्चा.N.m,sg,obl को=को.ADP खिलाती=खिलाना.V.part,ipf,f,sg,cau है=होना.A.fin,pres,p3,sg ।', 'causative', [3]],
  ['having done, one word', 'खाकर=खाना.V.conv वह=वह.P.p3,sg सो=सोना.V.stem गया=जाना.V.part,pf,m,sg ।', 'conjunctive-participle', [0]],
  ['having done, stem + कर', 'खा=खाना.V.stem कर=करना.V.conv वह=वह.P.p3,sg सो=सोना.V.stem गया=जाना.V.part,pf,m,sg ।', 'conjunctive-participle', [0, 1]],
  ['having done, करके', 'ऐसा=ऐसा.J.m,sg करके=करना.V.conv उसने=वह.P.erg,p3,sg क्या=क्या.P.int पाया=पाना.V.part,pf,m,sg ?', 'conjunctive-participle', [1]],
  ['जो … वह', 'जो=जो.P.rel मेहनत=मेहनत.N.f,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg वह=वह.P.p3,sg सफल=सफल.J होता=होना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'relative-correlative', [0, 4]],
  ['जब … तब', 'जब=जब.SCONJ मैं=मैं.P.p1,sg आया=आना.V.part,pf,m,sg तब=तब.ADV वह=वह.P.p3,sg सो=सोना.V.stem रहा=रहना.V.part,prog,m,sg था=होना.A.fin,past,p3,sg,m ।', 'jab-tab', [0, 3]],
  ['जहाँ … वहाँ', 'जहाँ=जहाँ.ADV प्रेम=प्रेम.N.m,sg है=होना.A.fin,pres,p3,sg वहाँ=वहाँ.ADV परमेश्वर=परमेश्वर.PROPN है=होना.A.fin,pres,p3,sg ।', 'jahaan-vahaan', [0, 3]],
  ['जैसा … वैसा', 'जैसा=जैसा.J.m,sg बोओगे=बोना.V.fin,fut,p2,pl वैसा=वैसा.J.m,sg काटोगे=काटना.V.fin,fut,p2,pl ।', 'jaisa-vaisa', [0, 2]],
  ['जितना … उतना', 'जितना=जितना.J.m,sg पढ़ोगे=पढ़ना.V.fin,fut,p2,pl उतना=उतना.J.m,sg सीखोगे=सीखना.V.fin,fut,p2,pl ।', 'jitna-utna', [0, 2]],
  ['कि after a verb of saying', 'उसने=वह.P.erg,p3,sg कहा=कहना.V.part,pf,m,sg कि=कि.SCONJ वह=वह.P.p3,sg आएगा=आना.V.fin,fut,p3,sg,m ।', 'complement-ki', [1, 2]],
  ['कि after जानना', 'मैं=मैं.P.p1,sg जानता=जानना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg कि=कि.SCONJ वह=वह.P.p3,sg अच्छा=अच्छा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'complement-ki', [2, 3]],
  ['अगर … तो', 'अगर=अगर.SCONJ बारिश=बारिश.N.f,sg होगी=होना.V.fin,fut,p3,sg,f तो=तो.PART हम=हम.P.p1,pl नहीं=नहीं.ADV जाएँगे=जाना.V.fin,fut,p1,pl,m ।', 'conditional', [0, 3]],
  ['यदि alone', 'यदि=यदि.SCONJ तुम=तुम.P.p2,pl चाहो=चाहना.V.fin,sub,p2,fam मैं=मैं.P.p1,sg आऊँगा=आना.V.fin,fut,p1,sg,m ।', 'conditional', [0]],
  ['contrary to fact', 'अगर=अगर.SCONJ मैं=मैं.P.p1,sg जानता=जानना.V.part,ipf,m,sg तो=तो.PART बताता=बताना.V.part,ipf,m,sg ।', 'contrary-to-fact', [0, 2, 4]],
  ['comparison with से', 'राम=राम.PROPN से=से.ADP बड़ा=बड़ा.J.m,sg कौन=कौन.P.int है=होना.A.fin,pres,p3,sg ?', 'comparison-se', [0, 1, 2]],
  ['comparison with ज़्यादा', 'वह=वह.P.p3,sg तुम=तुम.P.obl,p2,pl से=से.ADP ज़्यादा=ज़्यादा.ADV जानता=जानना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'comparison-se', [1, 2, 3]],
  ['सबसे', 'यह=यह.P.p3,sg सबसे=सबसे.ADV अच्छा=अच्छा.J.m,sg घर=घर.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'superlative-sabse', [1, 2]],
  ['वाला after an infinitive', 'खाने=खाना.V.inf,obl वाला=वाला.J.m,sg आया=आना.V.part,pf,m,sg ।', 'vaala', [0, 1]],
  ['वाला after a noun', 'दूध=दूध.N.m,sg वाला=वाला.N.m,sg आया=आना.V.part,pf,m,sg ।', 'vaala', [0, 1]],
  ['repeated word with hyphen token', 'वह=वह.P.p3,sg धीरे=धीरे.ADV - धीरे=धीरे.ADV चला=चलना.V.part,pf,m,sg ।', 'reduplication', [1, 2, 3]],
  ['repeated word, one token', 'वह=वह.P.p3,sg धीरे-धीरे=धीरे.ADV चला=चलना.V.part,pf,m,sg ।', 'reduplication', [1]],
  ['repeated adjective', 'छोटी-छोटी=छोटा.J.f,pl बातें=बात.N.f,pl ।', 'reduplication', [0]],
  ['emphatic ही', 'मैं=मैं.P.p1,sg ही=ही.PART गया=जाना.V.part,pf,m,sg ।', 'emphatic-particles', [0, 1]],
  ['emphatic भी', 'मैं=मैं.P.p1,sg भी=भी.PART गया=जाना.V.part,pf,m,sg ।', 'emphatic-particles', [0, 1]],
  ['emphatic तो', 'मैं=मैं.P.p1,sg तो=तो.PART गया=जाना.V.part,pf,m,sg ।', 'emphatic-particles', [0, 1]],
  ['question with क्या', 'क्या=क्या.P.int तुम=तुम.P.p2,pl आओगे=आना.V.fin,fut,p2,pl ?', 'question-kya', [0]],
  ['having, with पास', 'मेरे=मेरा.D.poss,m पास=पास.N.m,sg किताब=किताब.N.f,sg है=होना.A.fin,pres,p3,sg ।', 'existence-possession', [0, 1, 3]],
  ['having, with का', 'उसका=उसका.D.poss,m एक=एक.NUM भाई=भाई.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'existence-possession', [0, 2, 3]],
  ['compound verb', 'उसने=वह.P.erg,p3,sg कह=कहना.V.stem दिया=देना.V.part,pf,m,sg ।', 'compound-verb', [1, 2]],
  ['compound verb with हो गया', 'काम=काम.N.m,sg खत्म=खत्म.J हो=होना.V.stem गया=जाना.V.part,pf,m,sg ।', 'compound-verb', [2, 3]],
  ['auxiliary chain: stem + रहा + था', 'वह=वह.P.p3,sg कर=करना.V.stem रहा=रहना.V.part,prog,m,sg था=होना.A.fin,past,p3,sg,m ।', 'auxiliary-chain', [1, 2, 3]],
  ['auxiliary chain: compound + है', 'उसने=वह.P.erg,p3,sg कह=कहना.V.stem दिया=देना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'auxiliary-chain', [1, 2, 3]],
];

describe('Hindi construction detectors: positive cases', () => {
  it.each(POSITIVE)('%s', (_name, line, key, idx) => {
    const { pats } = run(line);
    const found = of(pats, key);
    expect(found.length, `${key} in ${line}`).toBeGreaterThanOrEqual(1);
    expect(found.some((p) => JSON.stringify(p.tokenIndexes) === JSON.stringify(idx)), `${key}: ${JSON.stringify(found.map((p) => p.tokenIndexes))} vs ${idx}`).toBe(true);
    for (const p of found) {
      expect(p.title).toBe(HINDI_CONSTRUCTIONS[key].title);
      expect(p.explanation).toBe(HINDI_CONSTRUCTIONS[key].explanation);
      expect(p.confidence).toBeGreaterThan(0.25);
      expect(p.confidence).toBeLessThanOrEqual(0.95);
    }
  });
});

/** [name, sentence, key that must NOT be found] — near misses and words not analysed. */
const NEGATIVE: Array<[string, string, string]> = [
  ['adjective with no gender feature', 'सुंदर=सुंदर.J लड़की=लड़की.N.f,sg आई=आना.V.part,pf,f,sg ।', 'adjective-noun-agreement'],
  ['adjective and noun disagree (a mistake, not the construction)', 'अच्छा=अच्छा.J.m,sg लड़की=लड़की.N.f,sg आई=आना.V.part,pf,f,sg ।', 'adjective-noun-agreement'],
  ['adjective not next to a noun', 'अच्छा=अच्छा.J.m,sg ।', 'adjective-noun-agreement'],
  ['का with a noun it does not agree with', 'यह=यह.P.p3,sg राम=राम.PROPN का=का.ADP बहन=बहन.N.f,sg ।', 'genitive-agreement'],
  ['की that can only be the verb "did"', 'उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=करना.V.part,pf,f,sg ।', 'genitive-agreement'],
  ['direct form before को (a mistake)', 'लड़का=लड़का.N.m,sg,dir को=को.ADP किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।', 'oblique-before-postposition'],
  ['oblique with no visible change', 'घर=घर.N.m,sg,obl में=में.ADP हूँ=होना.A.fin,pres,p1,sg ।', 'oblique-before-postposition'],
  ['masculine plural that does not change', 'घर=घर.N.m,pl बड़े=बड़ा.J.m,pl हैं=होना.A.fin,pres,p3,pl ।', 'plural-forms'],
  ['singular noun', 'लड़का=लड़का.N.m,sg आया=आना.V.part,pf,m,sg ।', 'plural-forms'],
  ['habitual with past helper is not the present habitual', 'मैं=मैं.P.p1,sg जाता=जाना.V.part,ipf,m,sg था=होना.A.fin,past,p1,sg,m ।', 'habitual-present'],
  ['progressive is not the habitual', 'वह=वह.P.p3,sg पढ़=पढ़ना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 'habitual-present'],
  ['रहता is "keeps on", not the progressive', 'वह=वह.P.p3,sg पढ़ता=पढ़ना.V.part,ipf,m,sg रहता=रहना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'progressive'],
  ['रहा as "stayed" is not the progressive', 'वह=वह.P.p3,sg घर=घर.N.m,sg में=में.ADP रहा=रहना.V.part,pf,m,sg ।', 'progressive'],
  ['with है the perfective is a present perfect', 'वह=वह.P.p3,sg गया=जाना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'perfective-past'],
  ['no ने in the clause', 'वह=वह.P.p3,sg गया=जाना.V.part,pf,m,sg ।', 'ergative-ne'],
  ['ने is in another clause than the verb', 'उसने=वह.P.erg,p3,sg , मैं=मैं.P.p1,sg गया=जाना.V.part,pf,m,sg ।', 'ergative-ne'],
  ['no को on the object', 'उसने=वह.P.erg,p3,sg रोटी=रोटी.N.f,sg खाई=खाना.V.part,pf,f,sg ।', 'ne-with-ko-object'],
  ['गया था is a past perfect, not a present perfect', 'वह=वह.P.p3,sg गया=जाना.V.part,pf,m,sg था=होना.A.fin,past,p3,sg,m ।', 'present-perfect'],
  ['habitual is not a future', 'वह=वह.P.p3,sg जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'future'],
  ['an indicative is not a subjunctive', 'वह=वह.P.p3,sg आता=आना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'subjunctive'],
  ['a statement is not a command', 'तुम=तुम.P.p2,pl खाते=खाना.V.part,ipf,m,pl हो=होना.A.fin,pres,p2,pl ।', 'command'],
  ['नहीं is not मत', 'नहीं=नहीं.ADV जाओ=जाना.V.fin,cmd,p2,fam ।', 'negative-command'],
  ['an infinitive with है is an obligation, not a noun', 'मुझे=मैं.P.dat,p1,sg जाना=जाना.V.inf है=होना.A.fin,pres,p3,sg ।', 'infinitive-as-noun'],
  ['a direct infinitive is not the oblique one', 'जाना=जाना.V.inf चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'oblique-infinitive'],
  ['wanting is not an obligation', 'मैं=मैं.P.p1,sg जाना=जाना.V.inf चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'obligation'],
  ['ability needs सकना', 'मैं=मैं.P.p1,sg पढ़ता=पढ़ना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'ability-sakna'],
  ['पाना after an oblique infinitive is not "managing to"', 'वह=वह.P.p3,sg जाने=जाना.V.inf,obl पाया=पाना.V.part,pf,m,sg ।', 'managing-paana'],
  ['चाहिए without a person is not "wanting"', 'मुझे=मैं.P.dat,p1,sg जाना=जाना.V.inf चाहिए=चाहना.V.fin ।', 'wanting-chahna'],
  ['a subject in the direct case has no को', 'मैं=मैं.P.p1,sg भूखा=भूखा.J.m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'ko-experiencer'],
  ['giving takes a person with को that is not a definite object', 'मुझे=मैं.P.dat,p1,sg पानी=पानी.N.m,sg दो=देना.V.fin,cmd,p2,fam ।', 'ko-definite-object'],
  ['no को', 'मैंने=मैं.P.erg,p1,sg फल=फल.N.m,sg खाया=खाना.V.part,pf,m,sg ।', 'ko-definite-object'],
  ['गया alone is not a passive', 'वह=वह.P.p3,sg गया=जाना.V.part,pf,m,sg ।', 'passive'],
  ['ordinary verb is not a causative', 'माँ=माँ.N.f,sg खाती=खाना.V.part,ipf,f,sg है=होना.A.fin,pres,p3,sg ।', 'causative'],
  ['stem before रहा is not "having done"', 'वह=वह.P.p3,sg खा=खाना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 'conjunctive-participle'],
  ['के after a noun is the genitive, not "having done"', 'घर=घर.N.m,sg के=का.ADP.m पास=पास.N.m,sg ।', 'conjunctive-participle'],
  ['जो not read as a relative (a question word)', 'जो=जो.P.int मेहनत=मेहनत.N.f,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'relative-correlative'],
  ['जो not analysed: nothing to depend on', 'जो मेहनत=मेहनत.N.f,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'relative-correlative'],
  ['जहाँ alone is a place word, not the pair', 'जहाँ=जहाँ.ADV जाओ=जाना.V.fin,cmd,p2,fam ।', 'jahaan-vahaan'],
  ['जैसा alone', 'जैसा=जैसा.J.m,sg है=होना.A.fin,pres,p3,sg ।', 'jaisa-vaisa'],
  ['जितना alone', 'जितना=जितना.J.m,sg चाहिए=चाहना.V.fin ।', 'jitna-utna'],
  ['की is not कि', 'राम=राम.PROPN की=का.ADP.f किताब=किताब.N.f,sg ।', 'complement-ki'],
  ['no condition word', 'बारिश=बारिश.N.f,sg होगी=होना.V.fin,fut,p3,sg,f तो=तो.PART हम=हम.P.p1,pl नहीं=नहीं.ADV जाएँगे=जाना.V.fin,fut,p1,pl,m ।', 'conditional'],
  ['a condition with the future is not contrary to fact', 'अगर=अगर.SCONJ बारिश=बारिश.N.f,sg होगी=होना.V.fin,fut,p3,sg,f तो=तो.PART हम=हम.P.p1,pl नहीं=नहीं.ADV जाएँगे=जाना.V.fin,fut,p1,pl,m ।', 'contrary-to-fact'],
  ['से "from" before an adverb of place', 'वह=वह.P.p3,sg घर=घर.N.m,sg से=से.ADP बाहर=बाहर.ADV गया=जाना.V.part,pf,m,sg ।', 'comparison-se'],
  ['सबसे without an adjective after it', 'सबसे=सबसे.ADV वह=वह.P.p3,sg आया=आना.V.part,pf,m,sg ।', 'superlative-sabse'],
  ['वाला with nothing before it', 'वाला=वाला.J.m,sg आया=आना.V.part,pf,m,sg ।', 'vaala'],
  ['two function words repeated', 'वह=वह.P.p3,sg है=होना.A.fin,pres,p3,sg है=होना.A.fin,pres,p3,sg ।', 'reduplication'],
  ['two unanalysed equal words', 'वह धीरे धीरे चला=चलना.V.part,pf,m,sg ।', 'reduplication'],
  ['तो after a comma answers a condition', 'अगर=अगर.SCONJ वह=वह.P.p3,sg आए=आना.V.fin,sub,p3,sg , तो=तो.PART मैं=मैं.P.p1,sg जाऊँगा=जाना.V.fin,fut,p1,sg,m ।', 'emphatic-particles'],
  ['क्या not at the start', 'तुम=तुम.P.p2,pl क्या=क्या.P.int खाओगे=खाना.V.fin,fut,p2,pl ?', 'question-kya'],
  ['"this is my house" is not possession', 'यह=यह.P.p3,sg मेरा=मेरा.D.poss,m घर=घर.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'existence-possession'],
  ['noun before the vector is not a compound verb', 'उसने=वह.P.erg,p3,sg किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।', 'compound-verb'],
  ['two verbs make no chain of three', 'वह=वह.P.p3,sg कहता=कहना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'auxiliary-chain'],
  ['words with no analysis at all', 'वह मकान में रहता है ।', 'habitual-present'],
];

describe('Hindi construction detectors: near misses stay silent', () => {
  it.each(NEGATIVE)('%s', (_name, line, key) => {
    expect(of(run(line).pats, key)).toEqual([]);
  });
});

describe('Hindi construction detectors: ambiguity, confidence, shape', () => {
  it('a negated habitual with no helper is found at a lower confidence', () => {
    const { pats } = run('मैं=मैं.P.p1,sg नहीं=नहीं.ADV जानता=जानना.V.part,ipf,m,sg ।');
    const full = of(run('मैं=मैं.P.p1,sg जानता=जानना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।').pats, 'habitual-present')[0];
    const bare = of(pats, 'habitual-present')[0];
    expect(bare).toBeDefined();
    expect(bare.confidence).toBeLessThan(full.confidence);
  });

  it('an unresolved subjunctive / command form is found at a lower confidence than one after ताकि', () => {
    const sure = of(run('ताकि=ताकि.SCONJ हम=हम.P.p1,pl करें=करना.V.fin,sub,p1,pl ।').pats, 'subjunctive')[0];
    const amb = of(run('हम=हम.P.p1,pl करें=करना.V.fin,sub,p1,pl|=करना.V.fin,cmd,p2,form ।').pats, 'subjunctive')[0];
    expect(amb).toBeDefined();
    expect(amb.confidence).toBeLessThan(sure.confidence);
  });

  it('a noun that is also an infinitive (खाना) is read both ways, the verb reading with less trust', () => {
    const noun = of(run('मुझे=मैं.P.dat,p1,sg खाना=खाना.N.m,sg@0.7|=खाना.V.inf@0.7 पसंद=पसंद.N.f,sg है=होना.A.fin,pres,p3,sg ।').pats, 'infinitive-as-noun');
    const verb = of(run('खाना=खाना.V.inf अच्छा=अच्छा.J.m,sg है=होना.A.fin,pres,p3,sg ।').pats, 'infinitive-as-noun');
    expect(noun[0].confidence).toBeLessThan(verb[0].confidence);
  });

  it('a reading marked down by a neighbour rule does not make the construction', () => {
    const { pats } = run('यह=यह.P.p3,sg राम=राम.PROPN की=का.ADP.f@0.9|=करना.V.part,pf,f,sg@0.4 बात=बात.N.f,sg है=होना.A.fin,pres,p3,sg ।');
    expect(of(pats, 'perfective-past')).toEqual([]);
    expect(of(pats, 'genitive-agreement')).toHaveLength(1);
  });

  it('a fused pronoun with a postposition part is a postposition after a noun', () => {
    const { pats } = run('वह=वह.P.p3,sg मुझसे=मैं.P.obl,p1,sg बड़ा=बड़ा.J.m,sg है=होना.A.fin,pres,p3,sg ।', (an) => fuse(an, 1, ['मुझ', 'मैं', 'PRON'], ['से', 'से', 'ADP']));
    expect(of(pats, 'postposition-after-noun').some((p) => p.tokenIndexes.join() === '1')).toBe(true);
    expect(of(pats, 'comparison-se').some((p) => p.tokenIndexes.join() === '1,2')).toBe(true);
  });

  it('every hit has known key, sorted unique token indexes inside the sentence, and no key+tokens appears twice', () => {
    for (const [, line] of POSITIVE) {
      const { pats, tokens } = run(line);
      const seen = new Set<string>();
      for (const p of pats) {
        expect(HINDI_CONSTRUCTIONS[p.key], p.key).toBeDefined();
        expect(p.tokenIndexes.length).toBeGreaterThan(0);
        expect(p.tokenIndexes.every((i) => i >= 0 && i < tokens.length)).toBe(true);
        expect([...p.tokenIndexes].sort((a, b) => a - b)).toEqual(p.tokenIndexes);
        expect(new Set(p.tokenIndexes).size).toBe(p.tokenIndexes.length);
        const k = `${p.key}|${p.tokenIndexes.join(',')}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });

  it('is silent on empty input, punctuation and wholly unanalysed sentences', () => {
    expect(run('').pats).toEqual([]);
    expect(run('।').pats).toEqual([]);
    expect(run('वह स्कूल जाता है ।').pats.filter((p) => p.key !== 'emphatic-particles')).toEqual([]);
  });

  it('is deterministic and linear on a long sentence', () => {
    const line = 'वह=वह.P.p3,sg रोज़=रोज़.ADV पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।';
    expect(run(line).pats).toEqual(run(line).pats);
    const long = Array.from({ length: 800 }, () => 'अच्छा=अच्छा.J.m,sg लड़का=लड़का.N.m,sg पढ़ता=पढ़ना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg').join(' ') + ' ।';
    const t0 = Date.now();
    const { pats } = run(long);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(of(pats, 'habitual-present')).toHaveLength(800);
  });
});

describe('hindiVerbGroup', () => {
  const group = (line: string, i: number) => { const s = S(line); return hindiVerbGroup(s.tokens, s.analyses, i); };

  it('कह दी थी: main, vector, auxiliary and a summary in plain words', () => {
    const line = 'उसने=वह.P.erg,p3,sg बात=बात.N.f,sg कह=कहना.V.stem~to_say दी=देना.V.part,pf,f,sg थी=होना.A.fin,past,p3,sg,f ।';
    for (const i of [2, 3, 4]) {
      const g = group(line, i)!;
      expect(g.tokenIndexes).toEqual([2, 3, 4]);
      expect(g.main).toBe('कहना');
      expect(g.vector).toBe('देना');
      expect(g.auxiliaries).toEqual(['होना']);
      expect(g.summary).toContain('कहना');
      expect(g.summary).toContain('देना');
      expect(g.summary).toContain('feminine');
      expect(g.summary).toContain('perfective');
      expect(g.summary).toContain('थी');
      expect(g.summary).toMatch(/had done/u);
      expect(g.summary).toContain('someone else');
    }
  });

  it('a particle inside the group belongs to it', () => {
    const line = 'उसने=वह.P.erg,p3,sg कह=कहना.V.stem ही=ही.PART दिया=देना.V.part,pf,m,sg ।';
    expect(group(line, 2)!.tokenIndexes).toEqual([1, 2, 3]);
  });

  it('कर रहा है: progressive with two auxiliaries', () => {
    const g = group('वह=वह.P.p3,sg काम=काम.N.m,sg कर=करना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 3)!;
    expect(g.main).toBe('करना');
    expect(g.vector).toBeUndefined();
    expect(g.auxiliaries).toEqual(['रहना', 'होना']);
    expect(g.summary).toMatch(/progressive/u);
    expect(g.summary).toMatch(/middle of doing/u);
  });

  it('जाना पड़ा: obligation', () => {
    const g = group('उसे=वह.P.dat,p3,sg जाना=जाना.V.inf पड़ा=पड़ना.V.part,pf,m,sg ।', 1)!;
    expect(g.tokenIndexes).toEqual([1, 2]);
    expect(g.summary).toMatch(/obligation/u);
  });

  it('खाया जाता है: passive', () => {
    const g = group('रोटी=रोटी.N.f,sg खाई=खाना.V.part,pf,f,sg जाती=जाना.V.part,ipf,f,sg है=होना.A.fin,pres,p3,sg ।', 2)!;
    expect(g.summary).toMatch(/passive/u);
    expect(g.tokenIndexes).toEqual([1, 2, 3]);
  });

  it('a single finite verb is a group of its own', () => {
    const g = group('वह=वह.P.p3,sg आएगी=आना.V.fin,fut,p3,sg,f ।', 1)!;
    expect(g.main).toBe('आना');
    expect(g.auxiliaries).toEqual([]);
    expect(g.summary).toMatch(/future/u);
  });

  it('undefined for a noun, a pronoun, punctuation and out-of-range indexes', () => {
    const line = 'वह=वह.P.p3,sg घर=घर.N.m,sg जाएगी=जाना.V.fin,fut,p3,sg,f ।';
    expect(group(line, 0)).toBeUndefined();
    expect(group(line, 1)).toBeUndefined();
    expect(group(line, 3)).toBeUndefined();
    expect(group(line, 9)).toBeUndefined();
  });

  it('the two verbs of one sentence are two groups', () => {
    const line = 'वह=वह.P.p3,sg खाकर=खाना.V.conv सो=सोना.V.stem गया=जाना.V.part,pf,m,sg ।';
    expect(group(line, 1)!.tokenIndexes).toEqual([1]);
    expect(group(line, 2)!.tokenIndexes).toEqual([2, 3]);
  });
});

describe('Hindi construction detectors: readings as the morphology engine gives them', () => {
  it('adjective + noun when each form is two or three readings', () => {
    const { pats } = run('अच्छे=अच्छा.J.m,sg,obl|=अच्छा.J.m,pl,dir लड़के=लड़का.N.m,sg,obl|=लड़का.N.m,pl,dir आए=आना.V.part,pf,m,pl ।');
    expect(of(pats, 'adjective-noun-agreement').map((p) => p.tokenIndexes)).toEqual([[0, 1]]);
  });
  it('genitive agreement with a noun that is two readings', () => {
    const { pats } = run('राम=राम.PROPN की=का.ADP.f,sg|=का.ADP.f,pl बहनें=बहन.N.f,pl,dir आईं=आना.V.part,pf,f,pl ।');
    expect(of(pats, 'genitive-agreement').map((p) => p.tokenIndexes)).toEqual([[1, 2]]);
  });
  it('compound verb when the stem is a merged "Fin,Stem" reading', () => {
    const { pats } = run('काम=काम.N.m,sg खत्म=खत्म.J हो=होना.A.finstem,impsub,pres,p2 गया=जाना.A.part,pf,m,sg ।');
    expect(of(pats, 'compound-verb').map((p) => p.tokenIndexes)).toEqual([[2, 3]]);
  });
  it('habitual present with two participle readings (Fem Sing / Fem Plur) and a merged copula', () => {
    const { pats } = run('वह=वह.P.p3,sg जाती=जाना.V.part,ipf,f,sg|=जाना.V.part,ipf,f,pl है=होना.A.fin,pres,p23,sg ।');
    expect(of(pats, 'habitual-present').map((p) => p.tokenIndexes)).toEqual([[1, 2]]);
  });
  it('चाहिए as its own lemma: obligation and ko-experiencer', () => {
    const { pats } = run('मुझे=मैं.P.dat,p1,sg जाना=जाना.V.inf चाहिए=चाहिए.A ।');
    expect(of(pats, 'obligation').map((p) => p.tokenIndexes)).toEqual([[0, 1, 2]]);
    const need = run('उसे=वह.P.dat,p3,sg पानी=पानी.N.m,sg चाहिए=चाहिए.A ।').pats;
    expect(of(need, 'ko-experiencer').map((p) => p.tokenIndexes)).toEqual([[0, 2]]);
  });
  it('the plural of a feminine noun next to a noun with an unmarked oblique reading', () => {
    const { pats } = run('किताबें=किताब.N.f,pl,dir मेज़=मेज़.N.f,sg,dir|=मेज़.N.f,sg,obl पर=पर.ADP हैं=होना.A.fin,pres,p123,pl ।');
    expect(of(pats, 'plural-forms').map((p) => p.tokenIndexes)).toEqual([[0]]);
  });
});
