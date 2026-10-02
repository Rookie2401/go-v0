import { describe, expect, it } from 'vitest';
import type { SqReading } from '../../src/adapters/albanian/types';
import { adjudicate, fromUniparser, verdictFrom, wiktVerdict, type Verdicts } from '../../src/bench/sq/agreement';
import { sameCitation } from '../../src/bench/sq/aliases';
import { toUniparserAnalyses, uniparserVerdict } from '../../src/bench/sq/uniparser';
import { buildWiktIndex, hasConsistentTable, kaikkiEntryReadings, kaikkiTagsToMorph, type KaikkiEntry } from '../../src/bench/sq/wiktionary';

// Synthetic entries in the shape of the kaikki.org extract: no research file is needed to run these tests.
const reading = (lemma: string, pos: string, morph: Record<string, string>): SqReading =>
  ({ lemma, pos, morph, gloss: '', confidence: 0.85, lemmaKnown: true, rule: 'test', origin: 'rule' }) as SqReading;

const cell = (form: string, ...tags: string[]) => ({ form, tags });
const TABLE = [cell('no-table-tags', 'table-tags'), cell('sq-conj', 'inflection-template')];

const HIP: KaikkiEntry = {
  word: 'hip', pos: 'verb', senses: [{ glosses: ['to climb'] }],
  forms: [
    cell('hipa', 'aorist'), cell('hipur', 'participle'), ...TABLE,
    cell('hipur', 'participle'), cell('duke hipur', 'gerund'),
    cell('hip', 'first-person', 'indicative', 'present', 'singular'),
    cell('hipni', 'indicative', 'plural', 'present', 'second-person'),
    cell('hipa', 'aorist', 'first-person', 'indicative', 'singular'),
    cell('hipi', 'aorist', 'indicative', 'singular', 'third-person'),
    cell('kam hipur', 'first-person', 'indicative', 'perfect', 'singular'),
    cell('të hipë', 'present', 'singular', 'subjunctive', 'third-person'),
    cell('të kem hipur', 'first-person', 'perfect', 'singular', 'subjunctive'),
    cell('hypi', 'alternative', 'Gheg'),
  ],
};
// the head line says përfundova / përfunduar, the table (wrong template) përfundoja / përfundojur
const PERFUNDOJ: KaikkiEntry = {
  word: 'përfundoj', pos: 'verb', senses: [{ glosses: ['to finish'] }],
  forms: [
    cell('përfundova', 'aorist'), cell('përfunduar', 'participle'), ...TABLE,
    cell('përfundojur', 'participle'),
    cell('përfundoj', 'first-person', 'indicative', 'present', 'singular'),
    cell('përfundoj', 'indicative', 'present', 'second-person', 'singular'),
    cell('përfundoja', 'aorist', 'first-person', 'indicative', 'singular'),
  ],
};
const GJELLE: KaikkiEntry = {
  word: 'gjellë', pos: 'noun', senses: [{ glosses: ['dish'] }],
  forms: [
    cell('gjellë', 'plural'), cell('gjella', 'definite'), ...TABLE,
    cell('gjellë', 'indefinite', 'nominative', 'singular'), cell('gjella', 'definite', 'nominative', 'singular'),
    cell('gjellë', 'indefinite', 'nominative', 'plural'), cell('gjellët', 'definite', 'nominative', 'plural'),
    cell('gjelle', 'dative', 'indefinite', 'singular'),
  ],
};
const DHA: KaikkiEntry = { word: 'dha', pos: 'verb', senses: [{ tags: ['aorist', 'form-of', 'indicative', 'singular', 'third-person'], form_of: [{ word: 'jap' }], glosses: ['third-person singular aorist of jap'] }] };
const MIRE: KaikkiEntry = { word: 'mirë', pos: 'adj', senses: [{ glosses: ['good'] }], forms: [cell('i mírë', 'canonical'), cell('të mira', 'feminine', 'plural')] };
const DAL: KaikkiEntry = { word: 'dal', pos: 'verb', senses: [{ glosses: ['to go out'] }], forms: [cell('dola', 'aorist'), cell('dalë', 'participle')] };

const index = buildWiktIndex([HIP, PERFUNDOJ, GJELLE, DHA, MIRE, DAL].map((e) => JSON.stringify(e)).concat(['', 'not json']));

describe('Wiktionary entries as statements about forms', () => {
  it('maps the tags it knows and ignores the rest; a dialect or variant form is not read', () => {
    expect(kaikkiTagsToMorph(['aorist', 'indicative', 'singular', 'third-person'])).toEqual({ Tense: 'Past', Mood: 'Ind', Number: 'Sing', Person: '3' });
    expect(kaikkiTagsToMorph(['dative', 'definite', 'singular'])).toEqual({ Case: 'Gen,Dat', Definite: 'Def', Number: 'Sing' });
    expect(kaikkiTagsToMorph(['alternative', 'Gheg'])).toBeUndefined();
    expect(kaikkiTagsToMorph(['error-unrecognized-form'])).toBeUndefined();
    expect(kaikkiTagsToMorph(['uncountable'])).toEqual({});
  });

  it('reads single written words: a phrase is not a form, "të hipë" and "të mira" are', () => {
    const forms = kaikkiEntryReadings(HIP).map(([f]) => f);
    expect(forms).toContain('hipi');
    expect(forms).toContain('hipë'); // the present subjunctive without its particle
    expect(forms).not.toContain('kam hipur');
    expect(forms).not.toContain('kem hipur');
    expect(forms).not.toContain('hypi'); // Gheg
    expect(index.forms.get('hipë')).toEqual([{ lemma: 'hip', pos: 'VERB', morph: { Tense: 'Pres', Number: 'Sing', Mood: 'Sub', Person: '3' }, from: 'table', tabled: true }]);
    expect(index.forms.get('mira')?.[0]).toMatchObject({ lemma: 'mirë', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Plur' } });
  });

  it('a form-of entry points at its lemma and is not itself a lemma', () => {
    expect(index.forms.get('dha')).toEqual([{ lemma: 'jap', pos: 'VERB', morph: { Tense: 'Past', Mood: 'Ind', Number: 'Sing', Person: '3' }, from: 'form-of', tabled: false }]);
  });

  it('a table that contradicts its own head line is not a full table', () => {
    expect(hasConsistentTable(HIP, 'VERB')).toBe(true);
    expect(hasConsistentTable(GJELLE, 'NOUN')).toBe(true);
    expect(hasConsistentTable(PERFUNDOJ, 'VERB')).toBe(false);
    expect(hasConsistentTable(DAL, 'VERB')).toBe(false); // no table at all
    expect(index.tables.has('hip')).toBe(true);
    expect(index.tables.has('përfundoj')).toBe(false);
  });
});

describe('what Wiktionary says about a reading', () => {
  it('agrees when a statement about the form fits', () => {
    expect(wiktVerdict('hip', 'hipi', reading('hip', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' }), index).verdict).toBe('agree');
    expect(wiktVerdict('jap', 'dha', reading('jap', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' }), index).verdict).toBe('agree');
    expect(wiktVerdict('gjellë', 'gjelle', reading('gjellë', 'NOUN', { Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Ind' }), index).verdict).toBe('agree');
  });

  it('says otherwise only when a full table has another form in the reading\'s cell', () => {
    const plural = wiktVerdict('gjellë', 'gjella', reading('gjellë', 'NOUN', { Case: 'Nom,Acc', Number: 'Plur', Definite: 'Ind', Gender: 'Fem' }), index);
    expect(plural).toEqual({ verdict: 'differ', filledBy: ['gjellë'] });
    // the table has no ablative plural cell: nothing is said
    expect(wiktVerdict('gjellë', 'gjellash', reading('gjellë', 'NOUN', { Case: 'Abl', Number: 'Plur', Definite: 'Ind' }), index).verdict).toBe('silent');
    // a non-active reading has no cell in an active table
    expect(wiktVerdict('hip', 'hipet', reading('hip', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Mid' }), index).verdict).toBe('silent');
    // a participle cell does not answer for a finite reading
    expect(wiktVerdict('hip', 'hipte', reading('hip', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Imp', Mood: 'Ind' }), index).verdict).toBe('silent');
  });

  it('a head line without a table, or a table that contradicts its head line, cannot say otherwise', () => {
    // "dalë" is given as the participle; that the subjunctive is also "dalë" is not denied by an entry with no table
    expect(wiktVerdict('dal', 'dalë', reading('dal', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Sub', VerbForm: 'Fin' }), index).verdict).toBe('silent');
    expect(wiktVerdict('përfundoj', 'përfundon', reading('përfundoj', 'VERB', { Person: '2,3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' }), index).verdict).toBe('silent');
    // its cells still confirm
    expect(wiktVerdict('përfundoj', 'përfundoj', reading('përfundoj', 'VERB', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind,Sub' }), index).verdict).toBe('agree');
  });

  it('a form found only under other headwords is "other", an unknown form "silent"', () => {
    expect(wiktVerdict('hipi', 'hipi', reading('hipi', 'NOUN', { Number: 'Sing' }), index).verdict).toBe('other');
    expect(wiktVerdict('pastor', 'pastori', reading('pastor', 'NOUN', { Case: 'Nom' }), index).verdict).toBe('silent');
  });
});

describe('treebank statements', () => {
  it('agree, differ, other, silent', () => {
    const r = reading('jap', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' });
    expect(verdictFrom('jap', r, [{ lemma: 'jap', pos: 'VERB', morph: { Person: '3', Tense: 'Past' } }])).toBe('agree');
    expect(verdictFrom('jap', r, [{ lemma: 'jap', pos: 'VERB', morph: { Person: '2' } }])).toBe('differ');
    expect(verdictFrom('jap', r, [{ lemma: 'dhe', pos: 'CONJ', morph: {} }])).toBe('other');
    expect(verdictFrom('jap', r, [])).toBe('silent');
    expect(sameCitation('te', 'tek')).toBe(true);
    expect(verdictFrom('te', reading('te', 'ADP', {}), [{ lemma: 'tek', pos: 'ADP', morph: {} }])).toBe('agree');
  });
});

describe('the analyzer\'s verdict and its naming conventions', () => {
  const up = (...rows: Array<[string, string]>) => toUniparserAnalyses(rows.map(([lemma, gramm]) => ({ lemma, gramm })));
  it('same lemma and compatible features agree; other features, another lemma, an unknown form do not', () => {
    const libri = reading('libër', 'NOUN', { Case: 'Nom', Number: 'Sing', Definite: 'Def', Gender: 'Masc' });
    expect(uniparserVerdict('libri', libri, up(['libër', 'NOUN,m,inanim,sg,nom,def'])).verdict).toBe('agree');
    expect(uniparserVerdict('libri', libri, up(['libër', 'NOUN,m,inanim,pl,nom,def'])).verdict).toBe('features-differ');
    expect(uniparserVerdict('libri', libri, up(['libri', 'NOUN,f,sg,nom,indef'])).verdict).toBe('other-lemma');
    expect(uniparserVerdict('libri', libri, []).verdict).toBe('unknown-form');
    expect(uniparserVerdict('libri', libri, up(['libër', 'NOUN,m,sg,nom,def,nonst'])).verdict).toBe('nonstandard');
  });
  it('a non-active-only verb, a citation alias, a short pronoun and a name are matched by convention', () => {
    const mid = { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Mid' };
    expect(uniparserVerdict('lodhem', reading('lodhem', 'VERB', mid), up(['lodh', 'V,med,alb,1,sg,pres,ind,pass'])).verdict).toBe('agree');
    expect(uniparserVerdict('ankohem', reading('ankohem', 'VERB', mid), up(['ankoj', 'V,vt,1,sg,pres,ind,pass'])).verdict).toBe('agree');
    expect(uniparserVerdict('quhem', reading('quhem', 'VERB', mid), up(['quaj', 'V,vt,1,sg,pres,ind,pass'])).verdict).toBe('agree');
    expect(uniparserVerdict('na', reading('ne', 'PRON', { Case: 'Acc,Dat', Number: 'Plur', Person: '1' }), up(['na', 'CLIT_PRO,dat_1pl'])).verdict).toBe('agree');
    expect(uniparserVerdict('ana', reading('Ana', 'PROPN', { Case: 'Nom' }), up(['anë', 'NOUN,f,sg,nom,def'])).verdict).toBe('name-unknown');
    expect(uniparserVerdict('hapni', reading('hap', 'VERB', { Person: '2', Number: 'Plur', Mood: 'Imp' }), up(['hap', 'V,vt,2,pl,pres,ind,act'])).verdict).toBe('agree');
  });
  it('is put in the four words every source uses', () => {
    expect(fromUniparser('agree')).toBe('agree');
    expect(fromUniparser('pos-differs')).toBe('agree');
    expect(fromUniparser('features-differ')).toBe('differ');
    expect(fromUniparser('nonstandard')).toBe('differ');
    expect(fromUniparser('other-lemma')).toBe('other');
    expect(fromUniparser('unknown-form')).toBe('silent');
    expect(fromUniparser('name-unknown')).toBe('silent');
  });
});

describe('the outcome', () => {
  const v = (uniparser: string, wiktionary: string, tsa = 'silent', staf = 'silent') => ({ uniparser, wiktionary, 'ud-tsa': tsa, 'ud-staf': staf }) as Verdicts;
  it('unanimous: someone agrees and nobody says otherwise', () => {
    expect(adjudicate('NOUN', v('agree', 'silent')).status).toBe('unanimous');
    expect(adjudicate('NOUN', v('silent', 'agree')).status).toBe('unanimous');
    expect(adjudicate('NOUN', v('agree', 'other')).status).toBe('unanimous'); // Wiktionary has the form only as another word: silence
    expect(adjudicate('NOUN', v('silent', 'silent', 'agree')).status).toBe('unanimous');
    expect(adjudicate('NOUN', v('agree', 'agree', 'differ', 'other')).status).toBe('unanimous'); // a treebank never says otherwise
  });
  it('disputed: one says otherwise and fewer than two others agree', () => {
    expect(adjudicate('VERB', v('differ', 'agree'))).toEqual({ status: 'disputed', support: ['wiktionary'], dissent: ['uniparser'] });
    expect(adjudicate('VERB', v('agree', 'differ')).status).toBe('disputed');
    expect(adjudicate('VERB', v('other', 'silent')).status).toBe('disputed');
    expect(adjudicate('VERB', v('differ', 'differ', 'agree', 'agree')).status).toBe('majority');
  });
  it('majority: one says otherwise, two others agree', () => {
    expect(adjudicate('VERB', v('differ', 'agree', 'silent', 'agree')).status).toBe('majority');
    expect(adjudicate('VERB', v('agree', 'differ', 'agree')).status).toBe('majority');
  });
  it('single-source: nobody else knows the reading; a name nobody lists is not penalised', () => {
    expect(adjudicate('NOUN', v('silent', 'silent')).status).toBe('single-source');
    expect(adjudicate('NOUN', v('silent', 'other')).status).toBe('single-source');
    expect(adjudicate('PROPN', v('silent', 'silent')).status).toBe('name-unlisted');
  });
});
