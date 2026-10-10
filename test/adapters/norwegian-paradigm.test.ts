/**
 * Norwegian paradigm generation (Bokmål and Nynorsk): the generated tables of paradigm.ts, the kaikki tag mapper of
 * table-tags.ts, and the merge with an (absent) dictionary half. The expectations are MACHINE-DRAFTED like the engine's
 * own tables: they pin what the engine generates, not what a native speaker has confirmed.
 */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { cellOf, featureKey, mergeParadigm, paradigmSummary } from '../../src/core/paradigm';
import { lexiconFor } from '../../src/adapters/norwegian/lexicon';
import { norwegianCellFeatures, norwegianParadigm } from '../../src/adapters/norwegian/paradigm';
import { noTableTagsDetail, norwegianFeaturesFromTableTags } from '../../src/adapters/norwegian/table-tags';
import { adapter } from './helpers';

const lc = (s: string): string => s.normalize('NFC').toLocaleLowerCase('nb');
const forms = (p: ReturnType<typeof norwegianParadigm>, features: Record<string, string>): string[] => (p?.cells ?? []).filter((c) => featureKey(c.features) === featureKey(features)).map((c) => c.form);

describe('wiring', () => {
  it('both adapters expose paradigm() and featuresFromTableTags()', () => {
    for (const lang of ['nb', 'nn'] as const) {
      const ad = adapter(lang);
      expect(typeof ad.paradigm).toBe('function');
      expect(typeof ad.featuresFromTableTags).toBe('function');
      expect(ad.paradigm?.('bok', 'NOUN')?.kind).toBe('noun-declension');
    }
  });
  it('a lemma the engine does not know, and a part of speech that does not inflect, give undefined', () => {
    expect(norwegianParadigm('nb', 'xyzzy', 'NOUN')).toBeUndefined();
    expect(norwegianParadigm('nb', 'xyzzy', 'VERB')).toBeUndefined();
    expect(norwegianParadigm('nb', 'xyzzy', 'ADJ')).toBeUndefined();
    expect(norwegianParadigm('nb', 'og', 'CONJ')).toBeUndefined();
    expect(norwegianParadigm('nb', 'Norge', 'PROPN')).toBeUndefined();
  });
});

describe('nouns', () => {
  it('Bokmål ei/en bok: both definite singulars are cells with the same features, the lemma and plurals are shared', () => {
    const p = norwegianParadigm('nb', 'bok', 'NOUN')!;
    expect(p.kind).toBe('noun-declension');
    expect(forms(p, { Definite: 'Ind', Number: 'Sing' })).toEqual(['bok']);
    expect(forms(p, { Definite: 'Def', Number: 'Sing' })).toEqual(['boka', 'boken']);
    expect(forms(p, { Definite: 'Ind', Number: 'Plur' })).toEqual(['bøker']);
    expect(forms(p, { Definite: 'Def', Number: 'Plur' })).toEqual(['bøkene']);
    expect(p.template).toMatch(/^Bokmål feminine noun/);
    expect(p.notes.join(' ')).toMatch(/feminine \(ei bok\)/);
    // the merge keeps the second definite singular as an alternative of the first
    const merged = mergeParadigm({ languageId: 'nb', lemma: 'bok', pos: 'NOUN', kind: p.kind, notes: p.notes, sources: [] }, p.cells, []);
    const def = cellOf(merged, { Definite: 'Def', Number: 'Sing' })!;
    expect(def.form).toBe('boka');
    expect(def.alternatives).toEqual(['boken']);
  });

  it('Nynorsk bok has only boka; a Nynorsk masculine takes -ar; gender is a note, not a feature', () => {
    const p = norwegianParadigm('nn', 'bok', 'NOUN')!;
    expect(forms(p, { Definite: 'Def', Number: 'Sing' })).toEqual(['boka']);
    expect(p.template).toMatch(/^Nynorsk feminine noun/);
    const lex = lexiconFor('nn');
    const masc = lex.nouns.find((n) => n.gender === 'm' && !n.massNoun && !n.pluralOnly && n.plural.every((x) => /ar$/.test(x)))!;
    const pm = norwegianParadigm('nn', masc.lemma, 'NOUN')!;
    expect(forms(pm, { Definite: 'Ind', Number: 'Plur' })).toEqual(masc.plural);
    expect(pm.cells.every((c) => !('Gender' in c.features))).toBe(true);
    expect(pm.notes.join(' ')).toMatch(/Gender: masculine/);
  });

  it('zero plural, mass and plural-only nouns', () => {
    const hus = norwegianParadigm('nb', 'hus', 'NOUN')!;
    expect(forms(hus, { Definite: 'Ind', Number: 'Plur' })).toEqual(['hus']);
    expect(forms(hus, { Definite: 'Def', Number: 'Plur' })).toEqual(['husene', 'husa']);
    const lex = lexiconFor('nb');
    const mass = lex.nouns.find((n) => n.massNoun && !n.pluralOnly)!;
    expect(norwegianParadigm('nb', mass.lemma, 'NOUN')!.cells.some((c) => c.features.Number === 'Plur')).toBe(false);
    const pl = lex.nouns.find((n) => n.pluralOnly)!;
    expect(norwegianParadigm('nb', pl.lemma, 'NOUN')!.cells.some((c) => c.features.Number === 'Sing')).toBe(false);
  });

  it('an unknown compound whose head the list knows is GUESSED and says so; a listed word is never guessed', () => {
    const p = norwegianParadigm('nb', 'kjøkkenbord', 'NOUN')!;
    expect(p).toBeDefined();
    expect(forms(p, { Definite: 'Def', Number: 'Sing' })).toEqual(['kjøkkenbordet']);
    expect(p.notes.join(' ')).toMatch(/Guessed/);
    expect(p.template).toMatch(/guessed compound/);
  });
});

describe('verbs', () => {
  it('a regular Bokmål class-1 verb: both -et and -a, the -s passive, and the periphrases as constructions', () => {
    const p = norwegianParadigm('nb', 'kaste', 'VERB')!;
    expect(p.kind).toBe('verb-conjugation');
    expect(forms(p, { VerbForm: 'Inf' })).toEqual(['kaste']);
    expect(forms(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' })).toEqual(['kaster']);
    expect(forms(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' })).toEqual(['kastet', 'kasta']);
    expect(forms(p, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['kastet', 'kasta']);
    expect(forms(p, { VerbForm: 'Fin', Mood: 'Imp' })).toEqual(['kast']);
    expect(forms(p, { Voice: 'Pass' })).toEqual(['kastes']);
    expect(p.constructions).toEqual(['perfect-har', 'modal-bare-infinitive', 'bli-passive']);
    expect(p.cells.every((c) => c.features.Tense !== 'Fut')).toBe(true);
  });

  it('Nynorsk a-verb: both infinitives, -ar present, -ast passive', () => {
    const p = norwegianParadigm('nn', 'kaste', 'VERB')!;
    expect(forms(p, { VerbForm: 'Inf' })).toEqual(['kaste', 'kasta']);
    expect(forms(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' })).toEqual(['kastar']);
    expect(forms(p, { Voice: 'Pass' })).toEqual(['kastast']);
    expect(p.layout?.labels?.Voice?.Pass).toMatch(/-st/);
  });

  it('an irregular (strong) verb takes its parts from the list: gå / gikk / gått and gå / gjekk / gått', () => {
    const nb = norwegianParadigm('nb', 'gå', 'VERB')!;
    expect(forms(nb, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' })).toEqual(['gikk']);
    expect(forms(nb, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['gått']);
    expect(nb.template).toMatch(/strong or irregular/);
    expect(nb.notes.join(' ')).toMatch(/Strong or irregular/);
    const nn = norwegianParadigm('nn', 'gå', 'VERB')!;
    expect(forms(nn, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' })).toEqual(['gjekk']);
  });

  it('a deponent -s verb has no separate passive; an auxiliary comes from the word list', () => {
    const synes = norwegianParadigm('nb', 'synes', 'VERB')!;
    expect(forms(synes, { Voice: 'Pass' })).toEqual([]);
    expect(forms(synes, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' })).toEqual(['syntes']);
    const vaere = norwegianParadigm('nb', 'være', 'AUX')!;
    expect(forms(vaere, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' })).toEqual(['er']);
    expect(forms(vaere, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' })).toEqual(['var']);
    expect(forms(vaere, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['vært']);
    expect(norwegianParadigm('nb', 'være', 'VERB')?.cells.length).toBe(vaere.cells.length);
    const vere = norwegianParadigm('nn', 'vere', 'AUX')!;
    expect(forms(vere, { VerbForm: 'Inf' })).toEqual(['vere', 'vera']);
  });
});

describe('adjectives, pronouns and determiners', () => {
  it('a regular adjective: common form, neuter, definite singular, plural, comparison', () => {
    const p = norwegianParadigm('nb', 'stor', 'ADJ')!;
    expect(p.kind).toBe('adjective-declension');
    expect(forms(p, { Degree: 'Pos', Definite: 'Ind', Gender: 'Fem,Masc', Number: 'Sing' })).toEqual(['stor']);
    expect(forms(p, { Degree: 'Pos', Definite: 'Ind', Gender: 'Neut', Number: 'Sing' })).toEqual(['stort']);
    expect(forms(p, { Degree: 'Pos', Definite: 'Def', Number: 'Sing' })).toEqual(['store']);
    expect(forms(p, { Degree: 'Pos', Number: 'Plur' })).toEqual(['store']);
    expect(forms(p, { Degree: 'Cmp' })).toEqual(['større']);
    expect(forms(p, { Degree: 'Sup', Definite: 'Ind' })).toEqual(['størst']);
    expect(forms(p, { Degree: 'Sup', Definite: 'Def' })).toEqual(['største']);
  });

  it('liten has its own feminine, and says the engine cannot split its definite singular from its plural', () => {
    const p = norwegianParadigm('nb', 'liten', 'ADJ')!;
    expect(forms(p, { Degree: 'Pos', Definite: 'Ind', Gender: 'Fem', Number: 'Sing' })).toEqual(['lita']);
    expect(p.notes.join(' ')).toMatch(/one list/);
  });

  it('a periphrastic adjective has no comparison cells; an invariable one repeats its form', () => {
    const lex = lexiconFor('nb');
    const per = lex.adjectives.find((a) => a.periphrastic)!;
    expect(norwegianParadigm('nb', per.lemma, 'ADJ')!.cells.some((c) => c.features.Degree === 'Cmp')).toBe(false);
    const inv = lex.adjectives.find((a) => a.invariable)!;
    expect(new Set(norwegianParadigm('nb', inv.lemma, 'ADJ')!.cells.filter((c) => c.features.Degree === 'Pos').map((c) => c.form))).toEqual(new Set([inv.lemma]));
  });

  it('personal pronouns and possessives from the word list', () => {
    const han = norwegianParadigm('nb', 'han', 'PRON')!;
    expect(han.kind).toBe('pronoun-paradigm');
    expect(forms(han, { Person: '3', Gender: 'Masc', Number: 'Sing', Case: 'Nom' })).toEqual(['han']);
    expect(forms(han, { Person: '3', Gender: 'Masc', Number: 'Sing', Case: 'Acc' })).toEqual(['ham']);
    const min = norwegianParadigm('nb', 'min', 'DET')!;
    expect(min.kind).toBe('determiner-paradigm');
    expect(forms(min, { Person: '1', Number: 'Sing', Gender: 'Neut' })).toEqual(['mitt']);
    expect(forms(min, { Person: '1', Number: 'Plur' })).toEqual(['mine']);
    expect(norwegianParadigm('nb', 'hans', 'DET')).toBeUndefined(); // one form: nothing to tabulate
  });
});

describe('round trip: every observed form of the engine\'s word list finds its cell', () => {
  for (const std of ['nb', 'nn'] as const) {
    it(`${std}: form -> analyze -> the cell with those features has that form`, () => {
      const lex = lexiconFor(std);
      const ad = adapter(std);
      const analyse = (form: string) => ad.analyze(ad.tokenize(form))[0]?.candidates ?? [];
      const entries: Array<[string, PartOfSpeech]> = [];
      for (const n of lex.nouns) entries.push([n.lemma, 'NOUN']);
      for (const v of lex.verbs) if (!v.lemma.endsWith('-')) entries.push([v.lemma, 'VERB']); // nei- is a placeholder row of the nb list
      for (const a of lex.adjectives) entries.push([a.lemma, 'ADJ']);
      for (const pos of ['AUX', 'PRON', 'DET'] as const) for (const l of new Set(lex.words.filter((w) => w.pos === pos).map((w) => w.lemma))) entries.push([l, pos]);
      const failures: string[] = [];
      let checked = 0;
      let exact = 0;
      for (const [lemma, pos] of entries) {
        const p = norwegianParadigm(std, lemma, pos);
        if (!p) continue; // a one-form pronoun or determiner
        for (const form of lex.formsOf(lemma, pos)) {
          const cands = analyse(form).filter((c) => c.lemma === lemma && c.pos === pos);
          if (!cands.length) continue; // the analysis chose another lemma for a variant spelling
          checked++;
          let found = false;
          for (const c of cands) {
            const bundles = norwegianCellFeatures(pos, c.morph);
            if (bundles.some((f) => p.cells.some((x) => featureKey(x.features) === featureKey(f) && lc(x.form) === form))) found = true;
            if (bundles.length === 1 && !/,/.test(Object.values(c.morph).join(''))) exact++;
          }
          if (!found) failures.push(`${lemma}/${pos} ${form} ${JSON.stringify(cands.map((c) => c.morph))}`);
        }
      }
      expect(failures.slice(0, 20)).toEqual([]);
      expect(checked).toBeGreaterThan(std === 'nb' ? 5000 : 1800);
      expect(exact).toBeGreaterThan(0);
    });

    it(`${std}: every cell of every generated paradigm is a form the engine analyses back to the same lemma`, () => {
      const lex = lexiconFor(std);
      const ad = adapter(std);
      const bad: string[] = [];
      for (const [lemma, pos] of [...lex.nouns.map((n) => [n.lemma, 'NOUN'] as const), ...lex.verbs.filter((v) => !v.lemma.endsWith('-')).map((v) => [v.lemma, 'VERB'] as const), ...lex.adjectives.map((a) => [a.lemma, 'ADJ'] as const)]) {
        const p = norwegianParadigm(std, lemma, pos)!;
        for (const c of p.cells) {
          const cands = ad.analyze(ad.tokenize(c.form))[0].candidates;
          if (!cands.some((x) => x.lemma === lemma && x.pos === pos)) bad.push(`${lemma}/${pos}: ${c.form}`);
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });
  }

  it('every noun, verb and adjective of the word lists has a generated paradigm', () => {
    for (const std of ['nb', 'nn'] as const) {
      const lex = lexiconFor(std);
      expect(lex.nouns.every((n) => norwegianParadigm(std, n.lemma, 'NOUN') !== undefined)).toBe(true);
      expect(lex.verbs.every((v) => norwegianParadigm(std, v.lemma, 'VERB') !== undefined)).toBe(true);
      expect(lex.adjectives.every((a) => norwegianParadigm(std, a.lemma, 'ADJ') !== undefined)).toBe(true);
    }
  });
});

describe('kaikki tag mapper (hand-written rows)', () => {
  const f = (tags: string[], pos: PartOfSpeech) => norwegianFeaturesFromTableTags(tags, pos);
  it('nouns: definite x number; gender and genitive are not cell features', () => {
    expect(f(['indefinite', 'singular'], 'NOUN')).toEqual({ Definite: 'Ind', Number: 'Sing' });
    expect(f(['definite', 'singular'], 'NOUN')).toEqual({ Definite: 'Def', Number: 'Sing' });
    expect(f(['indefinite', 'plural'], 'NOUN')).toEqual({ Definite: 'Ind', Number: 'Plur' });
    expect(f(['definite', 'plural'], 'NOUN')).toEqual({ Definite: 'Def', Number: 'Plur' });
    expect(f(['feminine', 'definite', 'singular'], 'NOUN')).toEqual({ Definite: 'Def', Number: 'Sing' });
    expect(f(['genitive', 'definite', 'singular'], 'NOUN')).toBeUndefined();
    expect(f(['table-tags'], 'NOUN')).toBeUndefined();
    expect(f(['canonical'], 'NOUN')).toBeUndefined();
  });
  it('verbs: infinitive, present, past, participles, imperative, passive', () => {
    expect(f(['infinitive'], 'VERB')).toEqual({ VerbForm: 'Inf' });
    expect(f(['present'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' });
    expect(f(['past'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' });
    expect(f(['preterite'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' });
    expect(f(['participle', 'past'], 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(f(['perfect', 'participle'], 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(f(['supine'], 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(f(['participle', 'present'], 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Pres' });
    expect(f(['imperative'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Imp' });
    expect(f(['passive', 'infinitive'], 'VERB')).toEqual({ Voice: 'Pass' });
    expect(f(['passive'], 'AUX')).toEqual({ Voice: 'Pass' });
    // an adjectival participle is not a verb cell
    expect(f(['participle', 'past', 'definite', 'singular'], 'VERB')).toBeUndefined();
    expect(noTableTagsDetail(['participle', 'past', 'plural'], 'VERB').skipped).toBe('not-modelled');
  });
  it('adjectives: gender, definite singular, plural, degrees', () => {
    expect(f(['indefinite', 'masculine', 'singular'], 'ADJ')).toEqual({ Degree: 'Pos', Definite: 'Ind', Gender: 'Masc', Number: 'Sing' });
    expect(f(['indefinite', 'masculine', 'feminine', 'singular'], 'ADJ')).toEqual({ Degree: 'Pos', Definite: 'Ind', Gender: 'Fem,Masc', Number: 'Sing' });
    expect(f(['indefinite', 'neuter', 'singular'], 'ADJ')).toEqual({ Degree: 'Pos', Definite: 'Ind', Gender: 'Neut', Number: 'Sing' });
    expect(f(['definite', 'singular'], 'ADJ')).toEqual({ Degree: 'Pos', Definite: 'Def', Number: 'Sing' });
    expect(f(['plural'], 'ADJ')).toEqual({ Degree: 'Pos', Number: 'Plur' });
    expect(f(['comparative'], 'ADJ')).toEqual({ Degree: 'Cmp' });
    expect(f(['superlative', 'indefinite'], 'ADJ')).toEqual({ Degree: 'Sup', Definite: 'Ind' });
    expect(f(['superlative', 'definite'], 'ADJ')).toEqual({ Degree: 'Sup', Definite: 'Def' });
  });
  it('pronouns and determiners, unknown tags reported, other parts of speech not placed', () => {
    expect(f(['first-person', 'singular', 'nominative'], 'PRON')).toEqual({ Person: '1', Number: 'Sing', Case: 'Nom' });
    expect(f(['third-person', 'masculine', 'singular', 'objective'], 'PRON')).toEqual({ Person: '3', Gender: 'Masc', Number: 'Sing', Case: 'Acc' });
    expect(f(['neuter', 'singular'], 'DET')).toEqual({ Gender: 'Neut', Number: 'Sing' });
    expect(noTableTagsDetail(['definite', 'singular', 'zzz-new-tag'], 'NOUN').unknown).toEqual(['zzz-new-tag']);
    expect(f(['singular'], 'ADV')).toBeUndefined();
    expect(f(['error-unrecognized-form', 'singular'], 'NOUN')).toBeUndefined();
  });
  it('a mapped dictionary row lands on the generated cell: the merge verifies it', () => {
    const p = norwegianParadigm('nb', 'stor', 'ADJ')!;
    const dict = [
      { tags: ['indefinite', 'neuter', 'singular'], form: 'stort' },
      { tags: ['comparative'], form: 'større' },
      { tags: ['superlative', 'indefinite'], form: 'størst' },
      { tags: ['plural'], form: 'storere' }, // a deliberately wrong dictionary row
    ].map((r) => ({ features: norwegianFeaturesFromTableTags(r.tags, 'ADJ')!, form: r.form }));
    const merged = mergeParadigm({ languageId: 'nb', lemma: 'stor', pos: 'ADJ', kind: p.kind, notes: p.notes, sources: [] }, p.cells, dict);
    expect(cellOf(merged, { Degree: 'Pos', Definite: 'Ind', Gender: 'Neut', Number: 'Sing' })?.status).toBe('verified');
    expect(cellOf(merged, { Degree: 'Cmp' })?.status).toBe('verified');
    expect(cellOf(merged, { Degree: 'Pos', Number: 'Plur' })?.status).toBe('conflicted');
    expect(cellOf(merged, { Degree: 'Sup', Definite: 'Def' })?.status).toBe('generated');
    expect(merged.status).toBe('conflicted');
  });
});

describe('merge with an empty dictionary half', () => {
  it('every cell is generated, no dictionary source, and the paradigm says why', () => {
    for (const [std, lemma, pos] of [['nb', 'bok', 'NOUN'], ['nb', 'gå', 'VERB'], ['nn', 'kaste', 'VERB'], ['nb', 'stor', 'ADJ'], ['nb', 'min', 'DET']] as const) {
      const g = norwegianParadigm(std, lemma, pos)!;
      const merged = mergeParadigm({ languageId: std, lemma, pos, kind: g.kind, notes: g.notes, sources: [{ id: `adapter-${std}`, label: 'adapter' }] }, g.cells, []);
      expect(merged.cells.length).toBeGreaterThan(0);
      expect(merged.cells.every((c) => c.status === 'generated' && c.sources.length === 1 && c.sources[0] === 'generated')).toBe(true);
      expect(merged.status).toBe('generated');
      const summary = paradigmSummary(merged);
      expect(summary.verified + summary.supported + summary.conflicted).toBe(0);
      expect(merged.notes.join(' ')).toMatch(/No Norwegian dictionary table has been imported yet/);
    }
  });
});
