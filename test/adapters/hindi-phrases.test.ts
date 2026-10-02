/**
 * Hindi multiword units (package H4): compound verbs, complex predicates, compound postpositions, fixed expressions.
 * The sentences are analysed by hand in a compact notation (see `S`): each word is `surface=lemma.POS.features`, alternative
 * readings follow after `|` (`=lemma.POS.features`), `@0.5` sets a confidence, `~gloss` a gloss, a word without `=` is
 * unanalysed, and punctuation stands alone.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, RawToken } from '../../src/core';
import { detectHindiPhrases, HINDI_VECTOR_VERBS } from '../../src/adapters/hindi/phrases';
import { HINDI_COMPLEX_PREDICATES, HINDI_COMPOUND_POSTPOSITIONS, HINDI_FIXED_EXPRESSIONS } from '../../src/adapters/hindi/phrase-data';

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

const run = (line: string) => { const s = S(line); return { ...s, ph: detectHindiPhrases(s.tokens, s.analyses) }; };
const find = (ph: ReturnType<typeof detectHindiPhrases>, pattern: string[]) => ph.filter((p) => p.pattern.join(' ').normalize('NFC') === pattern.join(' ').normalize('NFC'));

describe('Hindi compound verbs', () => {
  const cases: Array<[string, string, string[], number[], string]> = [
    ['उसने=वह.P.erg,p3,sg सब=सब.P कुछ=कुछ.P कह=कहना.V.stem~to_say दिया=देना.V.part,pf,m,sg ।', 'say + give', ['कहना', 'देना'], [3, 4], 'कह देना'],
    ['मैंने=मैं.P.erg,p1,sg खाना=खाना.N.m,sg|=खाना.V.inf खा=खाना.V.stem लिया=लेना.V.part,pf,m,sg ।', 'eat + take', ['खाना', 'लेना'], [2, 3], 'खा लेना'],
    ['वह=वह.P.p3,sg घर=घर.N.m,sg चला=चलना.V.part,pf,m,sg गया=जाना.V.part,pf,m,sg ।', 'chala gaya', ['चलना', 'जाना'], [2, 3], 'चल जाना'],
    ['वह=वह.P.p3,sg बोल=बोलना.V.stem उठा=उठना.V.part,pf,m,sg ।', 'boil uthaa', ['बोलना', 'उठना'], [1, 2], 'बोल उठना'],
    ['हम=हम.P.p1,pl बैठ=बैठना.V.stem गए=जाना.V.part,pf,m,pl ।', 'baith gaye', ['बैठना', 'जाना'], [1, 2], 'बैठ जाना'],
    ['वह=वह.P.p3,sg गिर=गिरना.V.stem पड़ा=पड़ना.V.part,pf,m,sg ।', 'gir pada', ['गिरना', 'पड़ना'], [1, 2], 'गिर पड़ना'],
    ['उसने=वह.P.erg,p3,sg पत्र=पत्र.N.m,sg लिख=लिखना.V.stem डाला=डालना.V.part,pf,m,sg ।', 'likh dala', ['लिखना', 'डालना'], [2, 3], 'लिख डालना'],
    ['वह=वह.P.p3,sg आज=आज.ADV सो=सोना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 'so raha', [], [], ''],
    ['वह=वह.P.p3,sg कर=करना.V.stem चुका=चुकना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'kar chuka', ['करना', 'चुकना'], [1, 2], 'कर चुकना'],
    ['उसने=वह.P.erg,p3,sg कह=कहना.V.stem ही=ही.PART दिया=देना.V.part,pf,m,sg ।', 'kah hi diya', ['कहना', 'देना'], [1, 2, 3], 'कह देना'],
    ['मैं=मैं.P.p1,sg कर=करना.V.stem नहीं=नहीं.ADV पाया=पाना.V.part,pf,m,sg ।', 'nahin paya', ['करना', 'पाना'], [1, 2, 3], 'कर पाना'],
    ['वह=वह.P.p3,sg खो=खोना.V.stem गया=जाना.V.part,pf,m,sg ।', 'kho gaya', ['खोना', 'जाना'], [1, 2], 'खो जाना'],
    ['तुम=तुम.P.p2,pl सुन=सुनना.V.stem लो=लेना.V.fin,cmd,p2,pl ।', 'sun lo', ['सुनना', 'लेना'], [1, 2], 'सुन लेना'],
    ['वह=वह.P.p3,sg हँस=हँसना.V.stem पड़ी=पड़ना.V.part,pf,f,sg ।', 'hans padi', ['हँसना', 'पड़ना'], [1, 2], 'हँस पड़ना'],
    ['उसने=वह.P.erg,p3,sg दरवाज़ा=दरवाज़ा.N.m,sg खोल=खोलना.V.stem रखा=रखना.V.part,pf,m,sg ।', 'khol rakha', ['खोलना', 'रखना'], [2, 3], 'खोल रखना'],
    ['वह=वह.P.p3,sg घर=घर.N.m,sg से=से.ADP निकल=निकलना.V.stem पड़ा=पड़ना.V.part,pf,m,sg ।', 'nikal pada', ['निकलना', 'पड़ना'], [3, 4], 'निकल पड़ना'],
    ['उसने=वह.P.erg,p3,sg उसे=वह.P.dat,p3,sg मार=मारना.V.stem डाला=डालना.V.part,pf,m,sg ।', 'maar dala', ['मारना', 'डालना'], [2, 3], 'मार डालना'],
    ['उसने=वह.P.erg,p3,sg कर=करना.V.conv दिया=देना.V.part,pf,m,sg ।', 'the conjunctive without कर is the stem (कर दिया)', ['करना', 'देना'], [1, 2], 'कर देना'],
    ['काम=काम.N.m,sg खत्म=खत्म.J हो=होना.A.finstem,impsub,pres,p2 गया=जाना.A.part,pf,m,sg ।', 'a merged Fin,Stem reading of हो (हो गया)', ['होना', 'जाना'], [2, 3], 'हो जाना'],
    ['वह=वह.P.p3,sg आ=आना.V.stem जाता=जाना.V.part,ipf,m,sg है=होना.A.fin,pres,p23,sg ।', 'a vector in its habitual form (आ जाता है)', ['आना', 'जाना'], [1, 2], 'आ जाना'],
    ['वह=वह.P.p3,sg लौट=लौटना.V.stem आया=आना.V.part,pf,m,sg ।', 'laut aaya', ['लौटना', 'आना'], [1, 2], 'लौट आना'],
  ];
  for (const [line, name, pattern, idx, display] of cases) {
    it(`${name}`, () => {
      const { ph } = run(line);
      const hits = pattern.length ? find(ph, pattern) : ph.filter((p) => p.kind === 'construction');
      if (!pattern.length) { expect(hits).toEqual([]); return; }
      expect(hits).toHaveLength(1);
      expect(hits[0].kind).toBe('construction');
      expect(hits[0].tokenIndexes).toEqual(idx);
      expect(hits[0].display).toBe(display);
      expect(hits[0].gloss).toContain(HINDI_VECTOR_VERBS[pattern[1]]);
    });
  }

  it('the main verb\'s gloss, when a reading carries one, opens the phrase gloss', () => {
    const { ph } = run('उसने=वह.P.erg,p3,sg कह=कहना.V.stem~to_say दिया=देना.V.part,pf,m,sg ।');
    expect(find(ph, ['कहना', 'देना'])[0].gloss).toMatch(/^to_say/u);
  });

  it('works for a main verb nobody listed: the analyses identify it', () => {
    const { ph } = run('उसने=वह.P.erg,p3,sg चख=चखना.V.stem लिया=लेना.V.part,pf,m,sg ।');
    expect(find(ph, ['चखना', 'लेना'])).toHaveLength(1);
  });

  it('the auxiliary after the pair is not part of it', () => {
    const { ph } = run('उसने=वह.P.erg,p3,sg कह=कहना.V.stem दिया=देना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।');
    expect(find(ph, ['कहना', 'देना'])[0].tokenIndexes).toEqual([1, 2]);
  });

  it('a stem that is also a command still pairs when a vector follows (ambiguity)', () => {
    const { ph } = run('तुम=तुम.P.p2,pl दे=देना.V.fin,cmd,p2,fam@0.9|=देना.V.stem@0.7 दो=देना.V.fin,cmd,p2,fam ।');
    expect(find(ph, ['देना', 'देना'])).toHaveLength(1);
  });

  const negatives: Array<[string, string]> = [
    ['मैं=मैं.P.p1,sg पढ़=पढ़ना.V.stem सकता=सकना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'सकना is ability'],
    ['वह=वह.P.p3,sg रोने=रोना.V.inf,obl लगा=लगना.V.part,pf,m,sg ।', 'oblique infinitive + लगना is a construction'],
    ['वह=वह.P.p3,sg पढ़=पढ़ना.V.stem रहा=रहना.V.part,prog,m,sg है=होना.A.fin,pres,p3,sg ।', 'रहना is the progressive'],
    ['मैं=मैं.P.p1,sg जाना=जाना.V.inf चाहता=चाहना.V.part,ipf,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'चाहना after an infinitive'],
    ['उसने=वह.P.erg,p3,sg किताब=किताब.N.f,sg दी=देना.V.part,pf,f,sg ।', 'noun then vector is not a compound'],
  ];
  for (const [line, why] of negatives) {
    it(`silent: ${why}`, () => { expect(run(line).ph.filter((p) => p.kind === 'construction')).toEqual([]); });
  }

  it('silent when the main word is not analysed (nothing to depend on)', () => {
    expect(run('उसने=वह.P.erg,p3,sg कह दिया=देना.V.part,pf,m,sg ।').ph.filter((p) => p.kind === 'construction')).toEqual([]);
  });

  it('पाना after an infinitive is not a compound verb', () => {
    const { ph } = run('वह=वह.P.p3,sg जाने=जाना.V.inf,obl पाया=पाना.V.part,pf,m,sg ।');
    expect(ph.filter((p) => p.kind === 'construction')).toEqual([]);
  });

  it('the vector table has the thirteen second verbs with plain-word meanings', () => {
    for (const v of ['देना', 'लेना', 'जाना', 'आना', 'डालना', 'पड़ना', 'उठना', 'बैठना', 'रखना', 'निकलना', 'मारना', 'चुकना', 'पाना']) {
      expect(HINDI_VECTOR_VERBS[v]).toBeTruthy();
    }
    expect(HINDI_VECTOR_VERBS['देना']).toContain('someone else');
    expect(HINDI_VECTOR_VERBS['चुकना']).toContain('already');
  });
});

describe('Hindi complex predicates', () => {
  const cases: Array<[string, string, string[], number[]]> = [
    ['वह=वह.P.p3,sg मुझे=मैं.P.dat,p1,sg याद=याद.N.f,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'याद करना', ['याद', 'करना'], [2, 3]],
    ['मुझे=मैं.P.dat,p1,sg उसकी=वह.P.gen,p3,sg याद=याद.N.f,sg आई=आना.V.part,pf,f,sg ।', 'याद आना', ['याद', 'आना'], [2, 3]],
    ['उसने=वह.P.erg,p3,sg मेरी=मेरा.D.poss,f मदद=मदद.N.f,sg की=का.ADP.f@0.4|=करना.V.part,pf,f,sg@0.9 ।', 'मदद की', ['मदद', 'करना'], [2, 3]],
    ['मुझे=मैं.P.dat,p1,sg भूख=भूख.N.f,sg लगी=लगना.V.part,pf,f,sg है=होना.A.fin,pres,p3,sg ।', 'भूख लगना', ['भूख', 'लगना'], [1, 2]],
    ['आपको=आप.P.dat,p2,form पता=पता.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'पता होना', ['पता', 'होना'], [1, 2]],
    ['मैंने=मैं.P.erg,p1,sg उसे=वह.P.dat,p3,sg धन्यवाद=धन्यवाद.N.m,sg दिया=देना.V.part,pf,m,sg ।', 'धन्यवाद देना', ['धन्यवाद', 'देना'], [2, 3]],
    ['मुझे=मैं.P.dat,p1,sg याद=याद.N.f,sg भी=भी.PART नहीं=नहीं.ADV आया=आना.V.part,pf,m,sg ।', 'याद भी नहीं आया', ['याद', 'आना'], [1, 4]],
    ['वह=वह.P.p3,sg उसकी=वह.P.gen,p3,sg मदद=मदद.N.f,sg ही=ही.PART कर=करना.V.stem सकता=सकना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'मदद ही कर', ['मदद', 'करना'], [2, 4]],
    ['उससे=वह.P.obl,p3,sg बात=बात.N.f,sg करो=करना.V.fin,cmd,p2,fam ।', 'बात करो', ['बात', 'करना'], [1, 2]],
    ['बात=बात.N.f,sg उससे=वह.P.obl,p3,sg करो=करना.V.fin,cmd,p2,fam ।', 'बात उससे करो (a pronoun between)', ['बात', 'करना'], [0, 2]],
    ['प्रभु=प्रभु.N.m,sg से=से.ADP प्रार्थना=प्रार्थना.N.f,sg करो=करना.V.fin,cmd,p2,fam ।', 'प्रार्थना करो', ['प्रार्थना', 'करना'], [2, 3]],
    ['उसने=वह.P.erg,p3,sg मुझे=मैं.P.dat,p1,sg क्षमा=क्षमा.N.f,sg कर=करना.V.stem दिया=देना.V.part,pf,m,sg ।', 'क्षमा कर दिया', ['क्षमा', 'करना'], [2, 3]],
    ['वह=वह.P.p3,sg सुबह=सुबह.N.f,sg काम=काम.N.m,sg शुरू=शुरू.J करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'शुरू करता है', ['शुरू', 'करना'], [3, 4]],
    ['खेल=खेल.N.m,sg शुरू=शुरू.J हुआ=होना.V.part,pf,m,sg ।', 'शुरू होना', ['शुरू', 'होना'], [1, 2]],
    ['मुझे=मैं.P.dat,p1,sg यह=यह.P.p3,sg पसंद=पसंद.N.f,sg आया=आना.V.part,pf,m,sg ।', 'पसंद आना', ['पसंद', 'आना'], [2, 3]],
    ['तुम=तुम.P.p2,pl तैयार=तैयार.J हो=होना.A.fin,pres,p2,fam ।', 'तैयार हो', ['तैयार', 'होना'], [1, 2]],
    ['मुझे=मैं.P.dat,p1,sg उसका=उसका.D.poss,m नाम=नाम.N.m,sg याद=याद.N.f,sg नहीं=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'याद नहीं है', ['याद', 'होना'], [3, 5]],
    ['मैंने=मैं.P.erg,p1,sg फैसला=फ़ैसला.N.m,sg कर=करना.V.stem लिया=लेना.V.part,pf,m,sg ।', 'फ़ैसला (written without nukta)', ['फ़ैसला', 'करना'], [1, 2]],
    ['उसने=वह.P.erg,p3,sg पश्चाताप=पश्चाताप.N.m,sg किया=करना.V.part,pf,m,sg ।', 'पश्चाताप किया', ['पश्चाताप', 'करना'], [1, 2]],
    ['प्रभु=प्रभु.N.m,sg ने=ने.ADP हमें=हम.P.dat,p1,pl आशीष=आशीष.N.f,sg दी=देना.V.part,pf,f,sg ।', 'आशीष दी', ['आशीष', 'देना'], [3, 4]],
    ['उसने=वह.P.erg,p3,sg गवाही=गवाही.N.f,sg दी=देना.V.part,pf,f,sg ।', 'गवाही दी', ['गवाही', 'देना'], [1, 2]],
    ['मुझे=मैं.P.dat,p1,sg वह=वह.P.p3,sg दिखाई=दिखाई.N.f,sg दिया=देना.V.part,pf,m,sg ।', 'दिखाई दिया', ['दिखाई', 'देना'], [2, 3]],
    ['ज़रूरत=ज़रूरत.N.f,sg पड़ी=पड़ना.V.part,pf,f,sg तो=तो.PART बताना=बताना.V.inf ।', 'ज़रूरत पड़ी', ['ज़रूरत', 'पड़ना'], [0, 1]],
    ['बच्चे=बच्चा.N.m,pl को=को.ADP नींद=नींद.N.f,sg आ=आना.V.stem रही=रहना.V.part,prog,f,sg है=होना.A.fin,pres,p3,sg ।', 'नींद आ रही है', ['नींद', 'आना'], [2, 3]],
  ];
  for (const [line, name, pattern, idx] of cases) {
    it(name, () => {
      const hits = find(run(line).ph, pattern);
      expect(hits).toHaveLength(1);
      expect(hits[0].kind).toBe('collocation');
      expect(hits[0].tokenIndexes).toEqual(idx);
      expect(hits[0].gloss).toBeTruthy();
      expect(hits[0].display).toBe(pattern.join(' '));
    });
  }

  it('याद कर लिया gives both units: the predicate and the compound verb', () => {
    const { ph } = run('उसने=वह.P.erg,p3,sg सब=सब.P याद=याद.N.f,sg कर=करना.V.stem लिया=लेना.V.part,pf,m,sg ।');
    expect(find(ph, ['याद', 'करना'])[0].tokenIndexes).toEqual([2, 3]);
    expect(find(ph, ['करना', 'लेना'])[0].tokenIndexes).toEqual([3, 4]);
  });

  it('each predicate has its own gloss: याद आना is not याद करना', () => {
    const a = find(run('वह=वह.P.p3,sg याद=याद.N.f,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।').ph, ['याद', 'करना'])[0];
    const b = find(run('मुझे=मैं.P.dat,p1,sg याद=याद.N.f,sg आई=आना.V.part,pf,f,sg ।').ph, ['याद', 'आना'])[0];
    expect(a.gloss).not.toBe(b.gloss);
  });

  it('genitive की before a noun is not the verb "did": no predicate when the verb reading is marked down', () => {
    const { ph } = run('यह=यह.P.p3,sg मेरी=मेरा.D.poss,f याद=याद.N.f,sg की=का.ADP.f@0.9|=करना.V.part,pf,f,sg@0.4 किताब=किताब.N.f,sg है=होना.A.fin,pres,p3,sg ।');
    expect(find(ph, ['याद', 'करना'])).toEqual([]);
  });

  it('an unresolved की (both readings equal) still fires, with a lower confidence than a resolved one', () => {
    const amb = find(run('उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=का.ADP.f@0.9|=करना.V.part,pf,f,sg@0.9 ।').ph, ['मदद', 'करना'])[0];
    const sure = find(run('उसने=वह.P.erg,p3,sg मदद=मदद.N.f,sg की=करना.V.part,pf,f,sg@0.9|=का.ADP.f@0.4 ।').ph, ['मदद', 'करना'])[0];
    expect(amb.confidence).toBeLessThan(sure.confidence);
  });

  it('silent: a comma between noun and verb', () => {
    expect(find(run('याद=याद.N.f,sg ,  करता=करना.V.part,ipf,m,sg ।').ph, ['याद', 'करना'])).toEqual([]);
  });

  it('silent: a full clause between noun and verb', () => {
    expect(find(run('याद=याद.N.f,sg है=होना.A.fin,pres,p3,sg पर=पर.CONJ मैंने=मैं.P.erg,p1,sg काम=काम.N.m,sg किया=करना.V.part,pf,m,sg ।').ph, ['याद', 'करना'])).toEqual([]);
  });

  it('silent: noun not followed by the light verb', () => {
    expect(find(run('उसकी=वह.P.gen,p3,sg याद=याद.N.f,sg अच्छी=अच्छा.J.f,sg है=होना.A.fin,pres,p3,sg ।').ph, ['याद', 'करना'])).toEqual([]);
  });

  it('the table has at least 200 complex predicates, each with a gloss, and the ones the brief names', () => {
    expect(HINDI_COMPLEX_PREDICATES.length).toBeGreaterThanOrEqual(200);
    for (const p of HINDI_COMPLEX_PREDICATES) { expect(p.gloss.length).toBeGreaterThan(2); expect(p.noun).toBe(p.noun.normalize('NFC')); }
    const have = (n: string, v: string) => HINDI_COMPLEX_PREDICATES.some((p) => p.noun.normalize('NFC') === n.normalize('NFC') && p.verb === v);
    for (const [n, v] of [['याद', 'करना'], ['याद', 'आना'], ['याद', 'रखना'], ['याद', 'होना'], ['कोशिश', 'करना'], ['शुरू', 'करना'], ['शुरू', 'होना'], ['खत्म', 'करना'], ['खत्म', 'होना'], ['पसंद', 'होना'], ['पसंद', 'करना'], ['पसंद', 'आना'], ['मदद', 'करना'], ['इंतज़ार', 'करना'], ['बात', 'करना'], ['काम', 'करना'], ['प्यार', 'करना'], ['विश्वास', 'करना'], ['प्रार्थना', 'करना'], ['क्षमा', 'करना'], ['माफ़', 'करना'], ['धन्यवाद', 'देना'], ['ध्यान', 'देना'], ['ध्यान', 'रखना'], ['फ़ैसला', 'करना'], ['इस्तेमाल', 'करना'], ['तैयार', 'होना'], ['पता', 'होना'], ['पता', 'चलना'], ['मालूम', 'होना'], ['दिखाई', 'देना'], ['सुनाई', 'देना'], ['नज़र', 'आना'], ['भूख', 'लगना'], ['प्यास', 'लगना'], ['डर', 'लगना'], ['अच्छा', 'लगना'], ['देर', 'होना'], ['शादी', 'करना'], ['पश्चाताप', 'करना'], ['स्वीकार', 'करना'], ['आशीष', 'देना'], ['गवाही', 'देना']]) {
      expect(have(n, v), `${n} ${v}`).toBe(true);
    }
  });
});

describe('Hindi compound postpositions', () => {
  const cases: Array<[string, string, string[], number[]]> = [
    ['यह=यह.P.p3,sg तुम्हारे=तुम्हारा.D.poss,m लिए=लिए.ADP है=होना.A.fin,pres,p3,sg ।', 'तुम्हारे लिए', ['का', 'लिए'], [1, 2]],
    ['वह=वह.P.p3,sg घर=घर.N.m,sg के=का.ADP.m बाहर=बाहर.ADV बैठा=बैठना.V.part,pf,m,sg है=होना.A.fin,pres,p3,sg ।', 'घर के बाहर', ['का', 'बाहर'], [2, 3]],
    ['वह=वह.P.p3,sg शेर=शेर.N.m,sg की=का.ADP.f तरह=तरह.N.f,sg दहाड़ा=दहाड़ना.V.part,pf,m,sg ।', 'शेर की तरह', ['का', 'तरह'], [2, 3]],
    ['मैं=मैं.P.p1,sg उसके=उसका.D.poss,m बारे=बारे.N.m,pl में=में.ADP सोच=सोचना.V.stem रहा=रहना.V.part,prog,m,sg हूँ=होना.A.fin,pres,p1,sg ।', 'उसके बारे में', ['का', 'बारे', 'में'], [1, 2, 3]],
    ['खाने=खाना.V.inf,obl से=से.ADP पहले=पहले.ADV हाथ=हाथ.N.m,sg धोओ=धोना.V.fin,cmd,p2,fam ।', 'से पहले', ['से', 'पहले'], [1, 2]],
    ['स्कूल=स्कूल.N.m,sg के=का.ADP.m बाद=बाद.N.m,sg वह=वह.P.p3,sg घर=घर.N.m,sg गया=जाना.V.part,pf,m,sg ।', 'के बाद', ['का', 'बाद'], [1, 2]],
    ['वह=वह.P.p3,sg मेरे=मेरा.D.poss,m साथ=साथ.N.m,sg आया=आना.V.part,pf,m,sg ।', 'मेरे साथ', ['का', 'साथ'], [1, 2]],
    ['किताब=किताब.N.f,sg मेज़=मेज़.N.f,sg के=का.ADP.f ऊपर=ऊपर.ADV है=होना.A.fin,pres,p3,sg ।', 'के ऊपर', ['का', 'ऊपर'], [2, 3]],
    ['वे=वह.P.p3,pl पहाड़=पहाड़.N.m,sg की=का.ADP.f ओर=ओर.N.f,sg गए=जाना.V.part,pf,m,pl ।', 'की ओर', ['का', 'ओर'], [2, 3]],
    ['बारिश=बारिश.N.f,sg के=का.ADP.m कारण=कारण.N.m,sg हम=हम.P.p1,pl नहीं=नहीं.ADV गए=जाना.V.part,pf,m,pl ।', 'के कारण', ['का', 'कारण'], [1, 2]],
    ['वह=वह.P.p3,sg आपके=आपका.D.poss,m बिना=बिना.ADP नहीं=नहीं.ADV जाएगा=जाना.V.fin,fut,p3,sg ।', 'आपके बिना', ['का', 'बिना'], [1, 2]],
    ['गाँव=गाँव.N.m,sg के=का.ADP.m बीच=बीच.N.m,sg में=में.ADP एक=एक.NUM कुआँ=कुआँ.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'के बीच', ['का', 'बीच'], [1, 2]],
    ['वह=वह.P.p3,sg उसके=उसका.D.poss,m साथ-साथ=साथ-साथ.ADV चला=चलना.V.part,pf,m,sg ।', 'साथ-साथ as one token', ['का', 'साथ-साथ'], [1, 2]],
    ['वह=वह.P.p3,sg उसके=उसका.D.poss,m साथ=साथ.N.m,sg - साथ=साथ.N.m,sg चला=चलना.V.part,pf,m,sg ।', 'साथ - साथ as three tokens (the hyphen is not part of the unit)', ['का', 'साथ-साथ'], [1, 2, 4]],
    ['राम=राम.PROPN के=का.ADP.m पास=पास.N.m,sg एक=एक.NUM किताब=किताब.N.f,sg है=होना.A.fin,pres,p3,sg ।', 'राम के पास', ['का', 'पास'], [1, 2]],
    ['उसने=वह.P.erg,p3,sg मेरे=मेरा.D.poss,m सामने=सामने.ADV खाना=खाना.N.m,sg खाया=खाना.V.part,pf,m,sg ।', 'मेरे सामने', ['का', 'सामने'], [1, 2]],
    ['सब=सब.P लोग=लोग.N.m,pl उसके=उसका.D.poss,m ख़िलाफ़=ख़िलाफ़.N.m,sg थे=होना.A.fin,past,p3,pl ।', 'उसके ख़िलाफ़', ['का', 'ख़िलाफ़'], [2, 3]],
    ['उसके=उसका.D.poss,m बावजूद=बावजूद.N.m,sg वह=वह.P.p3,sg आया=आना.V.part,pf,m,sg ।', 'के बावजूद', ['का', 'बावजूद'], [0, 1]],
    ['वह=वह.P.p3,sg सुबह=सुबह.N.f,sg से=से.ADP लेकर=लेना.V.conv शाम=शाम.N.f,sg तक=तक.ADP काम=काम.N.m,sg करता=करना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'से लेकर', ['से', 'लेकर'], [2, 3]],
    ['मेरे=मेरा.D.poss,m पास=पास.N.m,sg पैसे=पैसा.N.m,pl नहीं=नहीं.ADV हैं=होना.A.fin,pres,p3,pl ।', 'मेरे पास (possessive pronoun)', ['का', 'पास'], [0, 1]],
  ];
  for (const [line, name, pattern, idx] of cases) {
    it(name, () => {
      const hits = find(run(line).ph, pattern);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].tokenIndexes).toEqual(idx);
      expect(hits[0].kind).toBe('frame');
      expect(hits[0].gloss).toBeTruthy();
    });
  }

  it('the genitive may be written के, की, का or be part of a possessive pronoun, and the pattern is the same', () => {
    const a = find(run('घर=घर.N.m,sg के=का.ADP.m लिए=लिए.ADP ।').ph, ['का', 'लिए'])[0];
    const b = find(run('माँ=माँ.N.f,sg की=का.ADP.f लिये=लिए.ADP ।').ph, ['का', 'लिए'])[0];
    const c = find(run('उसके=उसका.D.poss,m लिए=लिए.ADP ।').ph, ['का', 'लिए'])[0];
    expect(a.pattern).toEqual(b.pattern);
    expect(c.pattern).toEqual(a.pattern);
    expect(b.display).toBe('के लिए');
  });

  it('silent: के without a following postposition word', () => {
    expect(run('यह=यह.P.p3,sg राम=राम.PROPN के=का.ADP.m घोड़े=घोड़ा.N.m,pl हैं=होना.A.fin,pres,p3,pl ।').ph.filter((p) => p.kind === 'frame')).toEqual([]);
  });

  it('silent: लिए as the verb "took" after a noun is not के लिए', () => {
    expect(run('उन्होंने=वह.P.erg,p3,pl पैसे=पैसा.N.m,pl लिए=लेना.V.part,pf,m,pl ।').ph.filter((p) => p.kind === 'frame')).toEqual([]);
  });

  it('the table has the compound postpositions the brief names', () => {
    expect(HINDI_COMPOUND_POSTPOSITIONS.length).toBeGreaterThanOrEqual(30);
    const shown = HINDI_COMPOUND_POSTPOSITIONS.map((u) => u.display);
    for (const d of ['के लिए', 'के साथ', 'के पास', 'के बाद', 'से पहले', 'के ऊपर', 'के नीचे', 'के अंदर', 'के बाहर', 'के सामने', 'के पीछे', 'के बीच', 'के बिना', 'के द्वारा', 'की ओर', 'की तरफ़', 'की तरह', 'के बारे में', 'के कारण', 'की वजह से', 'के बजाय', 'के अलावा', 'के अनुसार', 'की जगह', 'के साथ-साथ']) expect(shown).toContain(d);
  });
});

describe('Hindi fixed expressions', () => {
  const cases: Array<[string, string, string[], number[], string]> = [
    ['आप=आप.P.p2,form कैसे=कैसा.J.m,pl हैं=होना.A.fin,pres,p2,pl ?', 'आप कैसे हैं', ['आप', 'कैसे', 'हैं'], [0, 1, 2], 'formula'],
    ['कोई=कोई.P बात=बात.N.f,sg नहीं=नहीं.ADV ।', 'कोई बात नहीं', ['कोई', 'बात', 'नहीं'], [0, 1, 2], 'formula'],
    ['ठीक=ठीक.J है=होना.A.fin,pres,p3,sg ।', 'ठीक है', ['ठीक', 'है'], [0, 1], 'formula'],
    ['यह=यह.P.p3,sg अच्छा=अच्छा.J.m,sg है=होना.A.fin,pres,p3,sg ना=ना.PART ?', 'है ना', ['है', 'ना'], [2, 3], 'idiom'],
    ['हो=होना.V.stem सकता=सकना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg कि=कि.SCONJ वह=वह.P.p3,sg आए=आना.V.fin,sub,p3,sg ।', 'हो सकता है', ['हो', 'सकता', 'है'], [0, 1, 2], 'idiom'],
    ['ऐसा=ऐसा.J.m,sg नहीं=नहीं.ADV है=होना.A.fin,pres,p3,sg ।', 'ऐसा नहीं है', ['ऐसा', 'नहीं', 'है'], [0, 1, 2], 'idiom'],
    ['पता=पता.N.m,sg नहीं=नहीं.ADV ।', 'पता नहीं', ['पता', 'नहीं'], [0, 1], 'idiom'],
    ['क्या=क्या.P.int हाल=हाल.N.m,sg है=होना.A.fin,pres,p3,sg ?', 'क्या हाल है', ['क्या', 'हाल', 'है'], [0, 1, 2], 'formula'],
    ['शुभ=शुभ.J रात्रि=रात्रि.N.f,sg ।', 'शुभ रात्रि', ['शुभ', 'रात्रि'], [0, 1], 'formula'],
    ['पवित्र=पवित्र.J आत्मा=आत्मा.N.f,sg हमारे=हमारा.D.poss,m साथ=साथ.N.m,sg है=होना.A.fin,pres,p3,sg ।', 'पवित्र आत्मा', ['पवित्र', 'आत्मा'], [0, 1], 'formula'],
    ['अनन्त=अनन्त.J जीवन=जीवन.N.m,sg पाओ=पाना.V.fin,cmd,p2,fam ।', 'अनन्त जीवन', ['अनन्त', 'जीवन'], [0, 1], 'formula'],
    ['हे प्रभु=प्रभु.N.m,voc हमें=हम.P.dat,p1,pl क्षमा=क्षमा.N.f,sg कर=करना.V.stem ।', 'हे प्रभु', ['हे', 'प्रभु'], [0, 1], 'formula'],
    ['वह=वह.P.p3,sg कम=कम.J से=से.ADP कम=कम.J दो=दो.NUM बार=बार.N.m,sg आया=आना.V.part,pf,m,sg ।', 'कम से कम', ['कम', 'से', 'कम'], [1, 2, 3], 'idiom'],
    ['मुझे=मैं.P.dat,p1,sg सब=सब.P कुछ=कुछ.P याद=याद.N.f,sg है=होना.A.fin,pres,p3,sg ।', 'सब कुछ', ['सब', 'कुछ'], [1, 2], 'idiom'],
    ['वह=वह.P.p3,sg हर=हर.D रोज़=रोज़.N.m,sg आता=आना.V.part,ipf,m,sg है=होना.A.fin,pres,p3,sg ।', 'हर रोज़', ['हर', 'रोज़'], [1, 2], 'idiom'],
    ['वह=वह.P.p3,sg बार=बार.N.m,sg - बार=बार.N.m,sg पूछता=पूछना.V.part,ipf,m,sg रहा=रहना.V.part,pf,m,sg ।', 'बार-बार (hyphen as its own token, not in the unit)', ['बार-बार'], [1, 3], 'idiom'],
  ];
  for (const [line, name, pattern, idx, kind] of cases) {
    it(name, () => {
      const hits = find(run(line).ph, pattern);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].tokenIndexes).toEqual(idx);
      expect(hits[0].kind).toBe(kind);
      expect(hits[0].gloss).toBeTruthy();
    });
  }

  it('the fixed list has greetings, thanks and Scripture-like phrases, none of them a single word', () => {
    expect(HINDI_FIXED_EXPRESSIONS.length).toBeGreaterThanOrEqual(60);
    for (const u of HINDI_FIXED_EXPRESSIONS) expect(u.words.split(/[ -]/u).length, u.words).toBeGreaterThanOrEqual(2);
  });

  it('silent: ठीक alone', () => {
    expect(run('यह=यह.P.p3,sg ठीक=ठीक.J नहीं=नहीं.ADV ।').ph.filter((p) => p.pattern.join(' ') === 'ठीक है')).toEqual([]);
  });
});

describe('Hindi phrase detection as a whole', () => {
  it('no two units share a pattern and token set', () => {
    const { ph } = run('उसने=वह.P.erg,p3,sg मेरे=मेरा.D.poss,m लिए=लिए.ADP मदद=मदद.N.f,sg कर=करना.V.stem दी=देना.V.part,pf,f,sg ।');
    const keys = ph.map((p) => `${p.pattern.join('_')}|${p.tokenIndexes.join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ph.length).toBeGreaterThanOrEqual(2);
  });

  it('every unit points at real tokens, ascending, with a confidence in (0, 1]', () => {
    const { ph, tokens } = run('उसने=वह.P.erg,p3,sg सब=सब.P कुछ=कुछ.P याद=याद.N.f,sg कर=करना.V.stem लिया=लेना.V.part,pf,m,sg ।');
    expect(ph.length).toBeGreaterThanOrEqual(3);
    for (const p of ph) {
      expect(p.tokenIndexes.every((i) => i >= 0 && i < tokens.length)).toBe(true);
      expect([...p.tokenIndexes].sort((a, b) => a - b)).toEqual(p.tokenIndexes);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('empty and punctuation-only sentences give nothing', () => {
    expect(run('').ph).toEqual([]);
    expect(run('।').ph).toEqual([]);
  });

  it('is stable: the same input gives the same output', () => {
    const line = 'उसने=वह.P.erg,p3,sg मेरी=मेरा.D.poss,f मदद=मदद.N.f,sg कर=करना.V.stem दी=देना.V.part,pf,f,sg ।';
    expect(run(line).ph).toEqual(run(line).ph);
  });

  it('a long sentence is handled in linear time (no blow-up)', () => {
    const word = 'बच्चे=बच्चा.N.m,pl';
    const line = Array.from({ length: 2000 }, () => word).join(' ') + ' ।';
    const t0 = Date.now();
    run(line);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
