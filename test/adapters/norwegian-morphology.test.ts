/**
 * Morphology, tokenizer and sentence splitter of the Norwegian analyzer. The expectations are MACHINE-DRAFTED, pending native review:
 * written by the model that built the analyzer from its own knowledge of Norwegian and recon B1-B4 (docs/norway/recon/linguistics-policy.md),
 * not checked by a native speaker or against Norsk ordbank.
 */
import { describe, expect, it } from 'vitest';
import { adapter, run } from './helpers';
import { lexiconFor } from '../../src/adapters/norwegian/lexicon';

const nb = adapter('nb');
const nn = adapter('nn');

/** Every candidate of a one-word text. */
const read = (lang: 'nb' | 'nn', form: string) => {
  const ad = adapter(lang);
  const toks = ad.tokenize(form);
  return ad.analyze(toks)[0].candidates;
};
const lemmas = (lang: 'nb' | 'nn', form: string): string[] => read(lang, form).map((c) => `${c.lemma}/${c.pos}`);
const has = (lang: 'nb' | 'nn', form: string, lemma: string, pos: string, morph: Record<string, string> = {}): boolean =>
  read(lang, form).some((c) => c.lemma === lemma && c.pos === pos && Object.entries(morph).every(([k, v]) => (c.morph[k] ?? '').split(',').includes(v)));

describe('nouns (Bokmål)', () => {
  it('a feminine noun has both valid paradigms: ei bok / boka and en bok / boken', () => {
    expect(has('nb', 'boka', 'bok', 'NOUN', { Gender: 'Fem', Definite: 'Def', Number: 'Sing' })).toBe(true);
    expect(has('nb', 'boken', 'bok', 'NOUN', { Definite: 'Def', Number: 'Sing' })).toBe(true);
    expect(read('nb', 'boken')[0].morph.Gender).toBe('Fem,Masc');
    expect(read('nb', 'boka')[0].morph.Gender).toBe('Fem');
    expect(has('nb', 'jenta', 'jente', 'NOUN')).toBe(true);
    expect(has('nb', 'jenten', 'jente', 'NOUN')).toBe(true);
  });

  it('masculine, neuter, -e stems and the neuter plural in -a or -ene', () => {
    expect(has('nb', 'bilene', 'bil', 'NOUN', { Number: 'Plur', Definite: 'Def' })).toBe(true);
    expect(has('nb', 'huset', 'hus', 'NOUN', { Gender: 'Neut', Definite: 'Def' })).toBe(true);
    expect(has('nb', 'husene', 'hus', 'NOUN', { Number: 'Plur', Definite: 'Def' })).toBe(true);
    expect(has('nb', 'husa', 'hus', 'NOUN', { Number: 'Plur', Definite: 'Def' })).toBe(true);
    expect(has('nb', 'hagen', 'hage', 'NOUN', { Gender: 'Masc' })).toBe(true);
    expect(has('nb', 'eplet', 'eple', 'NOUN', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'epler', 'eple', 'NOUN', { Number: 'Plur' })).toBe(true);
    expect(has('nb', 'rommet', 'rom', 'NOUN')).toBe(true);
  });

  it('the irregular plural table (recon B1)', () => {
    const table: Array<[string, string]> = [
      ['menn', 'mann'], ['mennene', 'mann'], ['bøker', 'bok'], ['bøkene', 'bok'], ['hender', 'hånd'], ['hendene', 'hånd'], ['føtter', 'fot'], ['fedre', 'far'],
      ['mødre', 'mor'], ['brødre', 'bror'], ['døtre', 'datter'], ['tenner', 'tann'], ['netter', 'natt'], ['bønder', 'bonde'], ['øyne', 'øye'],
      ['ører', 'øre'], ['trær', 'tre'], ['barna', 'barn'], ['barnene', 'barn'], ['nøklene', 'nøkkel'], ['fingrene', 'finger'],
    ];
    for (const [form, lemma] of table) expect(has('nb', form, lemma, 'NOUN'), `${form} -> ${lemma}`).toBe(true);
  });

  it('syncope in the plural and agent nouns in -er', () => {
    expect(has('nb', 'nøkler', 'nøkkel', 'NOUN', { Number: 'Plur' })).toBe(true);
    expect(has('nb', 'fingre', 'finger', 'NOUN', { Number: 'Plur' })).toBe(true);
    expect(has('nb', 'lærere', 'lærer', 'NOUN', { Number: 'Plur' })).toBe(true);
    expect(has('nb', 'lærerne', 'lærer', 'NOUN', { Definite: 'Def', Number: 'Plur' })).toBe(true);
  });

  it('mass nouns have no plural', () => {
    expect(lexiconFor('nb').noun('melk')?.massNoun).toBe(true);
    expect(lexiconFor('nb').noun('snø')?.massNoun).toBe(true);
    expect(has('nb', 'melker', 'melk', 'NOUN')).toBe(false);
    expect(has('nb', 'snøer', 'snø', 'NOUN')).toBe(false);
  });

  it("the genitive -s is a clitic part of the word (Olas bil, bilens farge) and the apostrophe is a separate token (Hans' bok)", () => {
    const r = run('nb', "Olas bil og bilens farge, Hans' bok.");
    const ola = r.analyses[0].candidates[0];
    expect(ola.lemma).toBe('Ola');
    expect(ola.morph.Case).toBe('Gen');
    expect(ola.parts?.map((p) => [p.text, p.kind])).toEqual([['Ola', 'stem'], ['s', 'clitic']]);
    const bilens = r.analyses.find((a) => a.token.surface === 'bilens')!.candidates[0];
    expect(bilens.lemma).toBe('bil');
    expect(bilens.morph.Case).toBe('Gen');
    const hans = r.tokens.findIndex((t) => t.surface === 'Hans');
    expect(r.tokens[hans + 1].surface).toBe("'");
    expect(r.tokens[hans + 1].isWord).toBe(false);
    expect(r.analyses[hans].candidates[0].lemma).toBe('Hans');
    expect(r.analyses[hans].candidates[0].morph.Case).toBe('Gen');
  });
});

describe('verbs', () => {
  it('weak class 1 has -et and -a in both the past and the participle, both valid', () => {
    for (const f of ['kastet', 'kasta']) {
      expect(has('nb', f, 'kaste', 'VERB', { Tense: 'Past' }), f).toBe(true);
      expect(has('nb', f, 'kaste', 'VERB', { VerbForm: 'Part' }), f).toBe(true);
    }
    expect(has('nb', 'kaster', 'kaste', 'VERB', { Tense: 'Pres' })).toBe(true);
    expect(has('nb', 'kast', 'kaste', 'VERB', { Mood: 'Imp' })).toBe(true);
  });

  it('weak classes 2, 3 and 4', () => {
    expect(has('nb', 'kjøpte', 'kjøpe', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nb', 'kjøpt', 'kjøpe', 'VERB', { VerbForm: 'Part' })).toBe(true);
    expect(has('nb', 'levde', 'leve', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nb', 'levd', 'leve', 'VERB', { VerbForm: 'Part' })).toBe(true);
    expect(has('nb', 'bodde', 'bo', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nb', 'bodd', 'bo', 'VERB', { VerbForm: 'Part' })).toBe(true);
    expect(has('nb', 'bor', 'bo', 'VERB', { Tense: 'Pres' })).toBe(true);
    expect(has('nb', 'trodde', 'tro', 'VERB')).toBe(true);
    expect(has('nb', 'nådde', 'nå', 'VERB')).toBe(true);
  });

  it('the strong and irregular table (recon B4)', () => {
    const table: Array<[string, string]> = [
      ['gjorde', 'gjøre'], ['gjort', 'gjøre'], ['gikk', 'gå'], ['gått', 'gå'], ['så', 'se'], ['sett', 'se'], ['sa', 'si'], ['sagt', 'si'], ['tok', 'ta'], ['tatt', 'ta'],
      ['ga', 'gi'], ['gav', 'gi'], ['gitt', 'gi'], ['fikk', 'få'], ['fått', 'få'], ['fant', 'finne'], ['funnet', 'finne'], ['visste', 'vite'], ['vet', 'vite'],
      ['sto', 'stå'], ['stod', 'stå'], ['satt', 'sitte'], ['lå', 'ligge'], ['la', 'legge'], ['lagt', 'legge'], ['skrev', 'skrive'], ['skrevet', 'skrive'],
      ['leste', 'lese'], ['drakk', 'drikke'], ['drukket', 'drikke'], ['dro', 'dra'], ['dratt', 'dra'], ['kom', 'komme'], ['kommet', 'komme'], ['gråt', 'gråte'],
      ['sprang', 'springe'], ['sang', 'synge'], ['stjal', 'stjele'], ['stjålet', 'stjele'], ['forsto', 'forstå'], ['hjalp', 'hjelpe'], ['hjulpet', 'hjelpe'],
      ['vant', 'vinne'], ['døde', 'dø'], ['dødd', 'dø'], ['fløy', 'fly'], ['ba', 'be'], ['bedt', 'be'], ['bar', 'bære'], ['båret', 'bære'], ['red', 'ri'], ['ridd', 'ri'],
    ];
    for (const [form, lemma] of table) expect(has('nb', form, lemma, 'VERB'), `${form} -> ${lemma}`).toBe(true);
  });

  it('modals, være, ha, bli are AUX with their forms', () => {
    const table: Array<[string, string]> = [['kan', 'kunne'], ['kunne', 'kunne'], ['kunnet', 'kunne'], ['skal', 'skulle'], ['vil', 'ville'], ['må', 'måtte'], ['bør', 'burde'], ['er', 'være'], ['var', 'være'], ['vært', 'være'], ['har', 'ha'], ['hadde', 'ha'], ['hatt', 'ha'], ['blir', 'bli'], ['ble', 'bli'], ['blei', 'bli'], ['blitt', 'bli']];
    for (const [f, l] of table) expect(has('nb', f, l, 'AUX'), `${f} -> ${l}`).toBe(true);
  });

  it('the s-passive, deponents as their own lemmas, and the imperative -e rule', () => {
    expect(has('nb', 'leses', 'lese', 'VERB', { Voice: 'Pass' })).toBe(true);
    expect(has('nb', 'synes', 'synes', 'VERB')).toBe(true);
    expect(has('nb', 'syntes', 'synes', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nb', 'finnes', 'finnes', 'VERB')).toBe(true);
    expect(has('nb', 'trives', 'trives', 'VERB')).toBe(true);
    expect(has('nb', 'åpne', 'åpne', 'VERB', { Mood: 'Imp' })).toBe(true); // the e stays after consonant + n
    expect(has('nb', 'les', 'lese', 'VERB', { Mood: 'Imp' })).toBe(true);
    expect(has('nb', 'kom', 'komme', 'VERB', { Mood: 'Imp' })).toBe(true);
  });

  it('table cells the recon marks (?) are flagged unverified in the data and on the reading', () => {
    const nnLex = lexiconFor('nn');
    for (const l of ['kome', 'ta', 'gje', 'late', 'setje', 'sove', 'ete', 'dra', 'bryte', 'byrje', 'hjelpe', 'symje', 'fly', 'ri']) expect(nnLex.verb(l)?.unverified, l).toBe(true);
    expect(read('nn', 'kjem')[0].notes?.unverified).toBe('true');
    expect(read('nb', 'gjorde')[0].notes?.unverified).toBeUndefined();
  });
});

describe('Nynorsk', () => {
  it('a-verbs and e-verbs, both infinitives, the -st passive, strong present as the bare stem', () => {
    expect(has('nn', 'kastar', 'kaste', 'VERB', { Tense: 'Pres' })).toBe(true);
    expect(has('nn', 'kasta', 'kaste', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nn', 'kasta', 'kaste', 'VERB', { VerbForm: 'Inf' })).toBe(true);
    expect(has('nn', 'kjøper', 'kjøpe', 'VERB', { Tense: 'Pres' })).toBe(true);
    expect(has('nn', 'kjøpte', 'kjøpe', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nn', 'synge', 'syngje', 'VERB', { VerbForm: 'Inf' })).toBe(true);
    expect(has('nn', 'tenke', 'tenkje', 'VERB', { VerbForm: 'Inf' })).toBe(true);
    expect(has('nn', 'kastast', 'kaste', 'VERB', { Voice: 'Pass' })).toBe(true);
    expect(has('nn', 'skriv', 'skrive', 'VERB', { Tense: 'Pres' })).toBe(true);
    expect(has('nn', 'skreiv', 'skrive', 'VERB', { Tense: 'Past' })).toBe(true);
    expect(has('nn', 'gjekk', 'gå', 'VERB')).toBe(true);
  });

  it('nouns: three genders, -ar / -ane, only the -a feminine', () => {
    expect(has('nn', 'bilar', 'bil', 'NOUN', { Number: 'Plur' })).toBe(true);
    expect(has('nn', 'bilane', 'bil', 'NOUN', { Number: 'Plur', Definite: 'Def' })).toBe(true);
    expect(has('nn', 'boka', 'bok', 'NOUN', { Gender: 'Fem' })).toBe(true);
    expect(has('nn', 'boken', 'bok', 'NOUN')).toBe(false);
    expect(has('nn', 'husa', 'hus', 'NOUN', { Number: 'Plur', Definite: 'Def' })).toBe(true);
    expect(has('nn', 'born', 'barn', 'NOUN', { Number: 'Plur' })).toBe(true);
  });

  it('closed classes (recon B10)', () => {
    const table: Array<[string, string]> = [['eg', 'eg'], ['meg', 'eg'], ['ho', 'ho'], ['honom', 'han'], ['dei', 'dei'], ['ikkje', 'ikkje'], ['kva', 'kva'], ['kven', 'kven'], ['kvifor', 'kvifor'], ['korleis', 'korleis'], ['noko', 'noko'], ['nokon', 'nokon'], ['mykje', 'mykje'], ['berre', 'berre'], ['frå', 'frå']];
    for (const [f, l] of table) expect(lemmas('nn', f).some((x) => x.startsWith(`${l}/`)), `${f} -> ${l}`).toBe(true);
    expect(lemmas('nn', 'jeg')).toEqual([]);
    expect(lemmas('nb', 'eg')).toEqual([]);
  });
});

describe('adjectives and comparison', () => {
  it('neuter -t, plural and definite -e', () => {
    expect(has('nb', 'stort', 'stor', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'store', 'stor', 'ADJ', { Number: 'Plur' })).toBe(true);
    expect(has('nb', 'store', 'stor', 'ADJ', { Definite: 'Def' })).toBe(true);
    expect(has('nb', 'gammelt', 'gammel', 'ADJ', { Gender: 'Neut' })).toBe(true);
  });

  it('exceptions: -ig, -sk, -t, vowel, -nn and the doubled forms', () => {
    expect(has('nb', 'norsk', 'norsk', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'svart', 'svart', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'nytt', 'ny', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'blått', 'blå', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'grønt', 'grønn', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'godt', 'god', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'tomt', 'tom', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'pent', 'pen', 'ADJ', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'bra', 'bra', 'ADJ')).toBe(true);
    expect(has('nb', 'viktigt', 'viktig', 'ADJ')).toBe(false); // -ig takes no -t
  });

  it('syncope before -e: gamle, vakre, åpne, sultne', () => {
    for (const [f, l] of [['gamle', 'gammel'], ['vakre', 'vakker'], ['åpne', 'åpen'], ['sultne', 'sulten']]) expect(has('nb', f, l, 'ADJ'), f).toBe(true);
  });

  it('liten / lita / lite / små / lille', () => {
    for (const f of ['liten', 'lita', 'lite', 'små', 'lille']) expect(has('nb', f, 'liten', 'ADJ'), f).toBe(true);
    expect(has('nb', 'lita', 'liten', 'ADJ', { Gender: 'Fem' })).toBe(true);
    expect(has('nb', 'lite', 'liten', 'ADJ', { Gender: 'Neut' })).toBe(true);
  });

  it('comparison, with the irregulars and mer / mest', () => {
    const table: Array<[string, string, string]> = [['nyere', 'ny', 'Cmp'], ['nyest', 'ny', 'Sup'], ['større', 'stor', 'Cmp'], ['størst', 'stor', 'Sup'], ['største', 'stor', 'Sup'], ['lengre', 'lang', 'Cmp'], ['lengst', 'lang', 'Sup'],
      ['yngre', 'ung', 'Cmp'], ['eldre', 'gammel', 'Cmp'], ['eldst', 'gammel', 'Sup'], ['bedre', 'god', 'Cmp'], ['best', 'god', 'Sup'], ['verre', 'dårlig', 'Cmp'], ['verst', 'dårlig', 'Sup'],
      ['vakrere', 'vakker', 'Cmp'], ['viktigst', 'viktig', 'Sup']];
    for (const [f, l, d] of table) expect(has('nb', f, l, 'ADJ', { Degree: d }), `${f} -> ${l}`).toBe(true);
    expect(lemmas('nb', 'mer').some((x) => x.startsWith('mer/'))).toBe(true);
    expect(lexiconFor('nb').adjective('interessant')?.periphrastic).toBe(true);
    expect(has('nb', 'interessantere', 'interessant', 'ADJ')).toBe(false);
  });
});

describe('pronouns, possessives, determiners', () => {
  it('personal pronouns share the lemma of the subject form', () => {
    const table: Array<[string, string]> = [['meg', 'jeg'], ['deg', 'du'], ['ham', 'han'], ['henne', 'hun'], ['oss', 'vi'], ['dem', 'de']];
    for (const [f, l] of table) expect(has('nb', f, l, 'PRON'), f).toBe(true);
  });

  it('possessives agree with the thing owned, and the reflexive sin is its own lemma', () => {
    expect(has('nb', 'mi', 'min', 'DET', { Gender: 'Fem' })).toBe(true);
    expect(has('nb', 'mitt', 'min', 'DET', { Gender: 'Neut' })).toBe(true);
    expect(has('nb', 'mine', 'min', 'DET', { Number: 'Plur' })).toBe(true);
    for (const f of ['sin', 'si', 'sitt', 'sine']) expect(has('nb', f, 'sin', 'DET', { Reflex: 'Yes' }), f).toBe(true);
    expect(has('nb', 'hans', 'hans', 'DET')).toBe(true);
  });

  it('en / ei / et are one article lemma; den / det / de depend on the next word', () => {
    for (const f of ['en', 'ei', 'et']) expect(has('nb', f, 'en', 'DET'), f).toBe(true);
    expect(run('nb', 'Det store huset').analyses[0].candidates[0]).toMatchObject({ lemma: 'det', pos: 'DET' });
    expect(run('nb', 'Det regner').analyses[0].candidates[0]).toMatchObject({ lemma: 'det', pos: 'PRON' });
    expect(run('nb', 'De store husene').analyses[0].candidates[0].pos).toBe('DET');
    expect(run('nb', 'De bor her').analyses[0].candidates[0].pos).toBe('PRON');
  });
});

describe('tokenizer, sentence splitter, normalization', () => {
  it('offsets always slice the input', () => {
    const text = "USA-president Trump kom, bl.a. i dag, og «sjø- og landtransport» kostet 3,5 mill. kr. Hans' bok: 1 000.";
    const toks = nb.tokenize(text);
    for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
    for (let i = 1; i < toks.length; i++) expect(toks[i].start).toBeGreaterThanOrEqual(toks[i - 1].end);
  });

  it('hyphenated compounds, suspended hyphens, abbreviations and numbers', () => {
    const w = (t: string) => nb.tokenize(t).filter((x) => x.isWord).map((x) => x.surface);
    expect(w('USA-president')).toEqual(['USA-president']);
    expect(w('en 3-årig gutt')).toEqual(['en', '3-årig', 'gutt']);
    expect(w('sjø- og landtransport')).toEqual(['sjø-', 'og', 'landtransport']);
    expect(w('bl.a. og f.eks. osv.')).toEqual(['bl.a.', 'og', 'f.eks.', 'osv.']);
    const nums = nb.tokenize('3,5 og 1 000 og 12.30');
    expect(nums.filter((t) => t.isWord).map((t) => t.surface)).toEqual(['og', 'og']);
  });

  it('keeps æ ø å in the normalized form (NFC, lower case) and in search normalization', () => {
    expect(nb.normalize('ÆØÅ')).toBe('æøå');
    expect(nb.normalize('Å')).toBe('å'); // decomposed å becomes NFC
    expect(nb.searchNormalize('  Blåbær ')).toBe('blåbær');
    expect(nb.tokenize('Øl')[0].normalized).toBe('øl');
  });

  it('does not break a sentence after an abbreviation or an ordinal', () => {
    const s = nb.segmentSentences('Vi møtes den 3. mai kl. 10. Han kom bl.a. fra Oslo. Vi spiste. Hva nå?');
    expect(s.map((x) => x.text)).toEqual(['Vi møtes den 3. mai kl. 10.', 'Han kom bl.a. fra Oslo.', 'Vi spiste.', 'Hva nå?']);
  });

  it('is deterministic and pure', () => {
    const a = run('nb', 'Jeg står opp klokka sju.');
    const b = run('nb', 'Jeg står opp klokka sju.');
    expect(JSON.stringify(a.analyses)).toBe(JSON.stringify(b.analyses));
    expect(nb.version).toMatch(/^\d+$/);
    expect(a.analyses[0].analyzer).toBe('adapter-nb@1');
    expect(run('nn', 'Eg står opp.').analyses[0].analyzer).toBe('adapter-nn@1');
    expect(nn.lang).toBe('nn');
  });
});
