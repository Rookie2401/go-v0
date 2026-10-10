// @vitest-environment node
/**
 * Norwegian Bokmål (experimental pack) through the reader's parser and the analyser's own tokenizer and sentence splitter. Every
 * assertion is what adapter-nb@2 really does; where it does not do what a learner would need, the test is an `it.fails` named
 * "LIMIT: ..." with a comment saying what is missing, so the limit is counted and cannot be forgotten.
 */
import { describe, expect, it } from 'vitest';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { cardOf, wordsOf } from './helpers';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);
const feats = (c: ReturnType<typeof cardOf>): Record<string, string> => Object.fromEntries(c.features.map((f) => [f.key, f.value]));

describe('Bokmål: the definite ending is read off the end of the noun', () => {
  it('huset is hus, neuter, singular, definite; the card says so in plain words', () => {
    const c = cardOf('Han kjøpte «huset» i fjor.', 'nb');
    expect(c).toMatchObject({ languageId: 'nb', lemma: 'hus', pos: 'NOUN', gloss: 'house', morphology: 'neuter, singular, definite', provenance: 'lexicon', unconfirmed: false });
    expect(feats(c)).toEqual({ Gender: 'Neut', Number: 'Sing', Definite: 'Def' });
    expect(c.itemIds).toEqual(['lemma:nb:hus:NOUN']);
  });

  it('a plural definite is read as plural: bilene and barna; the indefinite plural of a neuter is the singular form, so hus stays a union', () => {
    expect(feats(cardOf('«Bilene» står ute.', 'nb'))).toEqual({ Number: 'Plur', Definite: 'Def' });
    expect(feats(cardOf('«Barna» spiller i hagen.', 'nb'))).toEqual({ Number: 'Plur', Definite: 'Def' });
    expect(feats(cardOf('Hun har et «hus».', 'nb'))).toMatchObject({ Gender: 'Neut', Number: 'Plur,Sing', Definite: 'Ind' });
  });

  it('a masculine noun: hagen is masculine, singular, definite', () => {
    const c = cardOf('Barna spiller i «hagen».', 'nb');
    expect(c).toMatchObject({ lemma: 'hage', morphology: 'masculine, singular, definite' });
  });
});

describe('Bokmål: gender, and the two feminine paradigms', () => {
  it('a feminine noun written the -a way is feminine: jenta, jakka', () => {
    expect(feats(cardOf('«Jenta» har et stort hus.', 'nb'))).toMatchObject({ Gender: 'Fem', Definite: 'Def' });
    expect(cardOf('Du kan ta på deg «jakka».', 'nb')).toMatchObject({ lemma: 'jakke', morphology: 'feminine, singular, definite' });
  });

  it('both feminine paradigms are valid in Bokmål, so boken is shown as feminine OR masculine, never one of them (a stated rule, not a guess)', () => {
    const c = cardOf('Jeg leser «boken» hver dag.', 'nb');
    expect(c.morphology).toBe('feminine or masculine, singular, definite');
    expect(feats(c).Gender).toBe('Fem,Masc');
    expect(nbAdapter.support.limitations.join(' ')).toMatch(/Both feminine paradigms \(ei bok, boka and en bok, boken\)/);
  });

  it('the articles carry their gender: et is neuter, ei is feminine; en is feminine or masculine and keeps a competing reading', () => {
    expect(feats(cardOf('Hun har «et» hus.', 'nb'))).toMatchObject({ Gender: 'Neut', Definite: 'Ind' });
    expect(feats(cardOf('Hun har «ei» bok.', 'nb'))).toMatchObject({ Gender: 'Fem', Definite: 'Ind' });
    const en = cardOf('Hun har «en» bok.', 'nb');
    expect(feats(en).Gender).toBe('Fem,Masc');
    expect(en.alternatives.length).toBeGreaterThan(0);
  });

  it('the adjective takes -t before a neuter noun: stort hus, rødt eple (the card reads the neuter form)', () => {
    expect(feats(cardOf('Jenta har et «stort» hus.', 'nb'))).toMatchObject({ Gender: 'Neut', Number: 'Sing' });
    expect(cardOf('Jenta har et «stort» hus.', 'nb')).toMatchObject({ lemma: 'stor', pos: 'ADJ' });
  });

  // LIMIT: an article in front of a noun does not narrow the noun's gender. After "ei" the card for bok still says
  // "feminine or masculine" although ei can only go with a feminine noun, because the sentence layer does not pass the
  // article's gender to the noun.
  it.fails('LIMIT: ei bok: the noun after ei is narrowed to feminine', () => {
    expect(feats(cardOf('Hun har ei «bok».', 'nb')).Gender).toBe('Fem');
  });
});

describe('Bokmål: compounds, particle verbs and constructions', () => {
  it('a compound the word list does not hold is split into known words, marked UNCONFIRMED, given no gloss and not credited as a lemma', () => {
    expect(wordsOf(nbAdapter, 'Hun fikk en sykehusregning.')).toContain('sykehusregning');
    const c = cardOf('Hun fikk en «sykehusregning».', 'nb');
    expect(c).toMatchObject({ lemma: 'sykehusregning', pos: 'NOUN', unconfirmed: true, confidence: 0.55, provenance: 'rule' });
    expect(c.gloss).toBeUndefined();
    expect(c.syntaxNotes).toEqual(['sykehus: first part', 'regning: head: decides the gender and the kind of thing']);
    expect(c.notes.join(' ')).toMatch(/Not in the word list/);
    expect(c.itemIds).toEqual(['form:nb:sykehusregning']);
  });

  it('står opp is ONE verb: both pieces carry the unit lemma, and the card says it is part of a unit', () => {
    const c = cardOf('Hun «står» opp klokka sju.', 'nb');
    expect(c).toMatchObject({ lemma: 'stå opp', pos: 'VERB', gloss: 'get up' });
    expect(ids(c)).toContain('particle-verb');
    expect(c.syntaxNotes).toContain('Part of the unit “stå opp” (head).');
    expect(c.itemIds).toEqual(['lemma:nb:stå opp:VERB']);
    expect(cardOf('Hun står «opp» klokka sju.', 'nb').lemma).toBe('stå opp');
  });

  it('the particle may be separated from the verb: står ikke opp is still stå opp', () => {
    expect(cardOf('Hun «står» ikke opp.', 'nb')).toMatchObject({ lemma: 'stå opp' });
  });

  it('har + a participle is the perfect: kjøpt carries the perfect-har construction and is a participle', () => {
    const c = cardOf('Han har ikke «kjøpt» bilen ennå.', 'nb');
    expect(c).toMatchObject({ lemma: 'kjøpe', morphology: 'perfect participle' });
    expect(ids(c)).toContain('perfect-har');
    expect(feats(c)).toMatchObject({ VerbForm: 'Part', Tense: 'Past' });
  });

  it('har as the auxiliary before a participle is AUX; har as a main verb keeps its competing reading', () => {
    expect(cardOf('Han «har» ikke kjøpt bilen ennå.', 'nb')).toMatchObject({ lemma: 'ha', pos: 'AUX' });
    const main = cardOf('Jenta «har» et stort hus.', 'nb');
    expect(main).toMatchObject({ lemma: 'ha', pos: 'VERB' });
    expect(main.alternatives.length).toBeGreaterThan(0);
  });

  it('a modal takes the bare infinitive, and å marks the infinitive after other verbs', () => {
    const spise = cardOf('De skal «spise» middag.', 'nb');
    expect(ids(spise)).toContain('modal-bare-infinitive');
    expect(spise.morphology).toBe('infinitive');
    const lese = cardOf('Jeg liker å «lese».', 'nb');
    expect(ids(lese)).toContain('infinitive-marker-aa');
    expect(cardOf('Jeg liker «å» lese.', 'nb')).toMatchObject({ lemma: 'å', pos: 'PART' });
  });

  it('a verb form that is two things at once is described as both: gjør is present tense OR imperative, kom is past OR imperative (the description no longer says only "imperative")', () => {
    expect(cardOf('Hva «gjør» du?', 'nb').morphology).toBe('present tense or imperative');
    expect(cardOf('Han sa at han ikke «kom».', 'nb').morphology).toBe('past tense or imperative');
    expect(feats(cardOf('Hva «gjør» du?', 'nb')).Mood).toBe('Imp,Ind');
  });

  // LIMIT: after a modal the verb can only be an infinitive, but for a verb whose infinitive and imperative are the same form
  // (gå) the sentence layer does not apply the modal: "Vi må gå nå" gives "imperative or infinitive" (VerbForm Fin,Inf, Mood Imp)
  // where the infinitive alone is right. For other verbs (spise, reise) the modal construction does resolve it.
  it.fails('LIMIT: Vi må gå: after the modal må, gå is read as the infinitive only', () => {
    const c = cardOf('Vi må «gå» nå.', 'nb');
    expect(c.morphology).toBe('infinitive');
    expect(feats(c).VerbForm).toBe('Inf');
  });
});

describe('Bokmål: tokenization and sentences', () => {
  it('æ, ø and å are letters of their own: they stay inside their words, and are words on their own', () => {
    expect(wordsOf(nbAdapter, 'Bøkene ligger på bordet, og æ ø å.')).toEqual(['Bøkene', 'ligger', 'på', 'bordet', 'og', 'æ', 'ø', 'å']);
    expect(wordsOf(nbAdapter, 'Hunden og katten sover.')).toEqual(['Hunden', 'og', 'katten', 'sover']);
  });

  it('a sentence ends at a full stop, but a listed abbreviation (f.eks.) does not end it', () => {
    expect(nbAdapter.segmentSentences('Jeg bor i Oslo. Hun bor i Bergen.').map((s) => s.text)).toEqual(['Jeg bor i Oslo.', 'Hun bor i Bergen.']);
    expect(nbAdapter.segmentSentences('Vi kjøpte f.eks. brød og melk. Så gikk vi hjem.').map((s) => s.text)).toEqual(['Vi kjøpte f.eks. brød og melk.', 'Så gikk vi hjem.']);
  });

  // LIMIT: the sentence splitter is "limited" by the adapter's own statement: it does not end a sentence before a lower-case word or a
  // listed abbreviation, but an unlisted abbreviation followed by a capital letter (kap. Tre) is cut in two.
  it.fails('LIMIT: an abbreviation the list does not hold, followed by a capital letter, does not end the sentence (kap. is not listed)', () => {
    expect(nbAdapter.segmentSentences('Se kap. Tre i boka. Det er bra.').map((s) => s.text)).toEqual(['Se kap. Tre i boka.', 'Det er bra.']);
  });
});

describe('Bokmål and Nynorsk on the same sentence', () => {
  const NB = 'Jeg leser boken hver dag.';
  const NN = 'Eg les boka kvar dag.';

  it('the Bokmål pack reads its own sentence completely: every word has a reading the word list holds, and every id is nb', () => {
    for (const x of nbAdapter.analyze(nbAdapter.tokenize(NB)).filter((a) => a.token.isWord)) {
      expect(x.candidates[0], x.token.surface).toBeDefined();
      expect(x.candidates[0].unconfirmed, x.token.surface).not.toBe(true);
    }
    const c = cardOf('Jeg leser «boken» hver dag.', 'nb');
    for (const id of c.itemIds) expect(id).toMatch(/^(lemma|form):nb:/);
    expect(JSON.stringify(c)).not.toMatch(/:nn:|pack:nn/);
  });

  it('the Nynorsk sentence is not Bokmål: the Bokmål pack leaves words unread (kvar) or reads them as a name guess (Eg) instead of pretending', () => {
    const an = nbAdapter.analyze(nbAdapter.tokenize(NN)).filter((a) => a.token.isWord);
    const by = Object.fromEntries(an.map((a) => [a.token.surface, a.candidates[0]]));
    expect(by.kvar).toBeUndefined();
    expect(by.Eg).toMatchObject({ pos: 'PROPN', unconfirmed: true });
    expect(by.Eg.confidence).toBeLessThan(0.5);
    // the card for the unread word says so
    expect(cardOf('Eg les boka «kvar» dag.', 'nb')).toMatchObject({ confidence: 0, provenance: 'none', itemIds: ['form:nb:kvar'] });
  });

  it('and the Nynorsk pack does the same the other way: jeg, leser, boken, hver are not in its list', () => {
    const an = nnAdapter.analyze(nnAdapter.tokenize(NB)).filter((a) => a.token.isWord);
    const by = Object.fromEntries(an.map((a) => [a.token.surface, a.candidates[0]]));
    expect(by.leser).toBeUndefined();
    expect(by.boken).toBeUndefined();
    expect(by.hver).toBeUndefined();
    expect(by.Jeg).toMatchObject({ pos: 'PROPN', unconfirmed: true });
  });

  it('what the two standards share is not merged: boka is Nynorsk bok (feminine, exactly), boken is Bokmål bok (feminine or masculine); the item ids differ by language', () => {
    const nn = cardOf('Eg les «boka» kvar dag.', 'nn');
    const nb = cardOf('Jeg leser «boken» hver dag.', 'nb');
    expect(feats(nn).Gender).toBe('Fem');
    expect(feats(nb).Gender).toBe('Fem,Masc');
    expect(nn.itemIds).toEqual(['lemma:nn:bok:NOUN']);
    expect(nb.itemIds).toEqual(['lemma:nb:bok:NOUN']);
    expect(nn.itemIds.filter((i) => nb.itemIds.includes(i))).toEqual([]);
  });

  it('the word families relate jeg and eg, bok and bok: information, never credit', () => {
    const f = nbAdapter.family!('jeg', 'PRON')!;
    expect(f.members).toEqual([{ lang: 'nb', lemma: 'jeg', pos: 'PRON' }, { lang: 'nn', lemma: 'eg', pos: 'PRON' }]);
    expect(nnAdapter.family!('eg', 'PRON')!.id).toBe(f.id);
    expect(nbAdapter.family!('bok', 'NOUN')!.members.map((m) => m.lang)).toEqual(['nb', 'nn']);
  });

  // LIMIT: the Bokmål pack reads a Nynorsk "les" as the Bokmål verb "le" (to laugh) in the s-passive, at confidence 0.88: two languages
  // share the spelling and the pack has no way to know which one the page is in. Only the language resolver (detection, or the
  // page's declared nn) keeps a Nynorsk page out of the Bokmål pack.
  it.fails('LIMIT: a Nynorsk text read with the Bokmål pack does not give a confident wrong reading (les as le, passive)', () => {
    expect(cardOf('Eg «les» boka kvar dag.', 'nb').lemma).not.toBe('le');
  });
});

describe('Bokmål: pronunciation and the dictionary', () => {
  it('the card gives a rule-based East Norwegian respelling, labelled as a draft, and says speech is not "Bokmål"', () => {
    const c = cardOf('Jeg leser «boken» hver dag.', 'nb');
    expect(c.pronunciation.join(' ')).toMatch(/variant: east/);
    expect(c.pronunciation.join(' ')).toMatch(/machine-draft \(rule-based respelling, not checked by a native speaker\)/);
    expect(c.pronunciation.join(' ')).toMatch(/there is no official spoken standard, and speech is not "Bokmål"/);
  });

  it('the card carries the experimental limit and no Nynorsk pack id', () => {
    const c = cardOf('Jeg leser «boken» hver dag.', 'nb');
    expect(c.limits.join(' ')).toMatch(/Norwegian \(Bokmål\) pack is experimental: lemmatisation is seed-only/);
    expect(c.limits.join(' ')).toMatch(/Nynorsk words are never credited to it/);
    expect(c.packId).toBe(`pack:nb:${nbAdapter.version}`);
  });
});
