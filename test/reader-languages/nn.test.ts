// @vitest-environment node
/**
 * Norwegian Nynorsk (experimental pack) through the reader's parser and the analyser's own tokenizer and sentence splitter. Every
 * assertion is what adapter-nn@2 really does; where it does not do what a learner would need, the test is an `it.fails` named
 * "LIMIT: ..." with a comment saying what is missing, so the limit is counted and cannot be forgotten. The Bokmål/Nynorsk
 * comparison on a shared sentence is in nb.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { nnAdapter } from '../../src/adapters/nn';
import { cardOf, wordsOf } from './helpers';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);
const feats = (c: ReturnType<typeof cardOf>): Record<string, string> => Object.fromEntries(c.features.map((f) => [f.key, f.value]));

describe('Nynorsk: the definite ending is read off the end of the noun', () => {
  it('boka is bok, feminine, singular, definite: the -a ending pins the gender exactly (Nynorsk keeps three genders)', () => {
    const c = cardOf('Eg les «boka» kvar dag.', 'nn');
    expect(c).toMatchObject({ languageId: 'nn', lemma: 'bok', pos: 'NOUN', gloss: 'book', morphology: 'feminine, singular, definite', provenance: 'lexicon', unconfirmed: false });
    expect(feats(c)).toEqual({ Gender: 'Fem', Number: 'Sing', Definite: 'Def' });
    expect(c.itemIds).toEqual(['lemma:nn:bok:NOUN']);
  });

  it('hagen is masculine definite, eplet neuter definite, borna the plural of barn: born is not a Bokmål word', () => {
    expect(cardOf('Borna spelar i «hagen».', 'nn')).toMatchObject({ lemma: 'hage', morphology: 'masculine, singular, definite' });
    expect(cardOf('«Eplet» er raudt.', 'nn')).toMatchObject({ lemma: 'eple', morphology: 'neuter, singular, definite' });
    const born = cardOf('«Borna» spelar i hagen.', 'nn');
    expect(born).toMatchObject({ lemma: 'barn', pos: 'NOUN' });
    expect(feats(born)).toEqual({ Number: 'Plur', Definite: 'Def' });
  });

  it('gutane is the plural definite of gut', () => {
    const c = cardOf('«Gutane» kjem heim i dag.', 'nn');
    expect(c).toMatchObject({ lemma: 'gut', pos: 'NOUN' });
    expect(feats(c)).toEqual({ Number: 'Plur', Definite: 'Def' });
  });
});

describe('Nynorsk: three genders and their articles', () => {
  it('ei goes with a feminine noun and the noun after it is feminine too (unlike Bokmål, which shows feminine or masculine)', () => {
    expect(feats(cardOf('Ho har «ei» bok.', 'nn'))).toMatchObject({ Gender: 'Fem', Definite: 'Ind' });
    expect(feats(cardOf('Ho har ei «bok».', 'nn')).Gender).toBe('Fem');
    expect(feats(cardOf('Ein «gut» kjem heim.', 'nn')).Gender).toBe('Masc');
    expect(feats(cardOf('«Eit» hus står der.', 'nn')).Gender).toBe('Neut');
  });

  it('eit is the neuter article but keeps a competing reading, and the adjective takes -t: stort, raudt', () => {
    const eit = cardOf('Jenta har «eit» stort hus.', 'nn');
    expect(eit).toMatchObject({ lemma: 'ein', pos: 'DET' });
    expect(feats(eit)).toMatchObject({ Gender: 'Neut', Definite: 'Ind' });
    expect(eit.alternatives.length).toBeGreaterThan(0);
    expect(cardOf('Eplet er «raudt».', 'nn')).toMatchObject({ lemma: 'raud', pos: 'ADJ' });
    expect(feats(cardOf('Eplet er «raudt».', 'nn'))).toMatchObject({ Gender: 'Neut', Number: 'Sing' });
  });

  it('eg, ikkje and kvar are Nynorsk words; their item ids are nn, never nb', () => {
    expect(cardOf('«Eg» les boka kvar dag.', 'nn')).toMatchObject({ lemma: 'eg', pos: 'PRON', itemIds: ['lemma:nn:eg:PRON'] });
    expect(cardOf('Han har «ikkje» kjøpt bilen enno.', 'nn')).toMatchObject({ lemma: 'ikkje', pos: 'ADV', itemIds: ['lemma:nn:ikkje:ADV'] });
  });
});

describe('Nynorsk: verbs, particle verbs and constructions', () => {
  it('a verb form that is two things at once is described as both: les is present tense OR imperative (the description no longer says only "imperative")', () => {
    const c = cardOf('Eg «les» boka kvar dag.', 'nn');
    expect(c).toMatchObject({ lemma: 'lese', pos: 'VERB', morphology: 'present tense or imperative' });
    expect(feats(c).Mood).toBe('Imp,Ind');
  });

  it('the -a and -e forms of a weak verb are both accepted: kaste is the infinitive, kasta is the past tense OR the participle, and the card says so', () => {
    expect(cardOf('Eg skal «kaste» ballen.', 'nn')).toMatchObject({ lemma: 'kaste', morphology: 'infinitive' });
    const kasta = cardOf('Han «kasta» ballen.', 'nn');
    expect(kasta).toMatchObject({ lemma: 'kaste', morphology: 'past tense or perfect participle' });
    expect(feats(kasta).VerbForm).toBe('Fin,Inf,Part');
  });

  it('an infinitive that is also the participle is described as both: har lese', () => {
    const c = cardOf('Eg har «lese» boka.', 'nn');
    expect(c.morphology).toBe('infinitive or perfect participle');
    expect(ids(c)).toContain('perfect-har');
  });

  it('står opp is ONE verb: both pieces carry the unit lemma, and the card says it is part of a unit', () => {
    const c = cardOf('Ho «står» opp klokka sju.', 'nn');
    expect(c).toMatchObject({ lemma: 'stå opp', pos: 'VERB', gloss: 'get up' });
    expect(ids(c)).toContain('particle-verb');
    expect(c.syntaxNotes).toContain('Part of the unit “stå opp” (head).');
    expect(c.itemIds).toEqual(['lemma:nn:stå opp:VERB']);
    expect(cardOf('Ho står «opp» klokka sju.', 'nn').lemma).toBe('stå opp');
  });

  it('har + a participle is the perfect, and a modal takes the bare infinitive', () => {
    const k = cardOf('Han har ikkje «kjøpt» bilen enno.', 'nn');
    expect(k).toMatchObject({ lemma: 'kjøpe', morphology: 'perfect participle' });
    expect(ids(k)).toContain('perfect-har');
    expect(ids(cardOf('Vi skal «reise» til Bergen i morgon.', 'nn'))).toContain('modal-bare-infinitive');
    expect(cardOf('Han «har» ikkje kjøpt bilen enno.', 'nn')).toMatchObject({ lemma: 'ha', pos: 'AUX' });
  });

  it('vere is the infinitive of the verb that Bokmål writes være; the lemma is its own, with a different id from nb', () => {
    const c = cardOf('Eg har ikkje «vore» heime.', 'nn');
    expect(c).toMatchObject({ lemma: 'vere', pos: 'AUX', itemIds: ['lemma:nn:vere:AUX'] });
  });
});

describe('Nynorsk: the smaller word list says what it does not know', () => {
  // LIMIT: kaffen is a common word the Nynorsk word list does not hold, so the card gives no reading at all (no lemma, no
  // guess). The Bokmål list is larger; the Nynorsk list is read, not written, in the course it comes from. A word the list lacks
  // must be added by hand.
  it.fails('LIMIT: a common noun (kaffen) has a reading', () => {
    expect(cardOf('Eg likar ikkje «kaffen».', 'nn').lemma).toBe('kaffe');
  });

  it('and the card for an unknown word says so, gives no reading and credits nothing but a form id', () => {
    const c = cardOf('Eg likar ikkje «kaffen».', 'nn');
    expect(c).toMatchObject({ confidence: 0, provenance: 'none', itemIds: ['form:nn:kaffen'] });
    expect(c.lemma).toBeUndefined();
    expect(c.notes.join(' ')).toMatch(/Not an entry of the Norwegian \(Nynorsk\) word list, and the rules found no reading: the word is unknown to this pack/);
  });

  // LIMIT: a compound is split only into words the list knows, and the Nynorsk list lacks sjuke- (sjukehus is not in it), so
  // sjukehusrekning gets no reading, where the same compound in Bokmål (sykehusregning) is split into known parts and marked
  // unconfirmed.
  it.fails('LIMIT: a compound of everyday words (sjukehusrekning) is split into known parts and marked unconfirmed', () => {
    const c = cardOf('Ho fekk ei «sjukehusrekning».', 'nn');
    expect(c.unconfirmed).toBe(true);
    expect(c.syntaxNotes.join(' ')).toMatch(/first part/);
  });

  // Not a failing limit but a stated one: the Nynorsk adapter checks no production (productionChecks: none), and its pack does not
  // offer a checker, so nothing written in Nynorsk is marked, not even a Bokmål form in Nynorsk text.
  it('the adapter checks no writing, and says so', () => {
    expect(nnAdapter.support.productionChecks).toBe('none');
    const s = 'Eg har ikke bilen.';
    expect(nnAdapter.checkProduction(nnAdapter.tokenize(s), nnAdapter.analyze(nnAdapter.tokenize(s)), s)).toEqual([]);
  });
});

describe('Nynorsk: tokenization and sentences', () => {
  it('æ, ø and å stay inside their words and are words on their own', () => {
    expect(wordsOf(nnAdapter, 'Bøkene ligg på bordet, og æ ø å.')).toEqual(['Bøkene', 'ligg', 'på', 'bordet', 'og', 'æ', 'ø', 'å']);
  });

  it('a sentence ends at a full stop, but a listed Nynorsk abbreviation (t.d.) does not end it', () => {
    expect(nnAdapter.segmentSentences('Eg les boka. Ho les bladet.').map((s) => s.text)).toEqual(['Eg les boka.', 'Ho les bladet.']);
    expect(nnAdapter.segmentSentences('Vi kjøpte t.d. brød og mjølk. Så gjekk vi heim.').map((s) => s.text)).toEqual(['Vi kjøpte t.d. brød og mjølk.', 'Så gjekk vi heim.']);
  });

  // LIMIT: as in Bokmål, an unlisted abbreviation followed by a capital letter (kap. Tre) is cut in two.
  it.fails('LIMIT: an abbreviation the list does not hold, followed by a capital letter, does not end the sentence (kap. is not listed)', () => {
    expect(nnAdapter.segmentSentences('Se kap. Tre i boka. Det er bra.').map((s) => s.text)).toEqual(['Se kap. Tre i boka.', 'Det er bra.']);
  });
});

describe('Nynorsk: the card is honest about itself', () => {
  it('carries the experimental limit, the Nynorsk pack id and no Bokmål id', () => {
    const c = cardOf('Eg les «boka» kvar dag.', 'nn');
    expect(c.limits.join(' ')).toMatch(/Norwegian \(Nynorsk\) pack is experimental: lemmatisation is seed-only \(a machine-drafted word list, smaller than the Bokmål one\)/);
    expect(c.limits.join(' ')).toMatch(/Bokmål words are never credited to it/);
    expect(c.packId).toBe(`pack:nn:${nnAdapter.version}`);
    expect(JSON.stringify(c)).not.toMatch(/:nb:|pack:nb/);
  });

  it('gives a rule-based East Norwegian respelling labelled as a draft: the Nynorsk adapter shares the Bokmål pronunciation rules and says there is no spoken standard', () => {
    const c = cardOf('Eg les «boka» kvar dag.', 'nn');
    expect(c.pronunciation.join(' ')).toMatch(/machine-draft \(rule-based respelling, not checked by a native speaker\)/);
    expect(c.pronunciation.join(' ')).toMatch(/there is no official spoken standard/);
  });
});
