/**
 * Albanian paradigm generation (Linguistic Engine V2, Stage 3): what `sqAdapter.paradigm()` produces, that it is made of the
 * same forms and features as the analysis (round trip over the whole word list), and the highlight of the selected form
 * (`cellOf` for a narrowed reading, `sqCellsFor` for a union reading). Expected forms are written out by hand from the
 * declension tables, not produced by the rules under test. Machine-drafted word list; no native review.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, cellsWithForm, featureKey } from '../../src/core/paradigm';
import type { GeneratedParadigm } from '../../src/core/paradigm';
import { sqAdapter } from '../../src/adapters/sq';
import { sqCellsFor, sqParadigm } from '../../src/adapters/albanian/paradigm';
import { SQ_LEXEMES, analyzeSqForm } from '../../src/adapters/albanian/morphology';
import { sqNormalize } from '../../src/adapters/albanian/orthography';

/** Tokenize + analyze one sentence with the Albanian adapter alone. */
function run(text: string) {
  const tokens = sqAdapter.tokenize(text);
  return { tokens, analyses: sqAdapter.analyze(tokens) };
}
const best = (r: ReturnType<typeof run>, surface: string) => r.analyses[r.tokens.findIndex((t) => t.surface === surface)].candidates[0];

const para = (lemma: string, pos: 'NOUN' | 'ADJ' | 'VERB' | 'PRON' | 'PROPN'): GeneratedParadigm => {
  const p = sqParadigm(lemma, pos);
  if (!p) throw new Error(`no paradigm for ${lemma}`);
  return p;
};
const form = (p: GeneratedParadigm, f: Record<string, string>): string[] => p.cells.filter((c) => featureKey(c.features) === featureKey(f)).map((c) => c.form);

describe('the adapter exposes generation', () => {
  it('has paradigm and featuresFromTableTags', () => {
    expect(typeof sqAdapter.paradigm).toBe('function');
    expect(typeof sqAdapter.featuresFromTableTags).toBe('function');
    expect(sqAdapter.paradigm!('libër', 'NOUN')?.kind).toBe('noun-declension');
  });
});

describe('noun: the full declension of libër', () => {
  const p = para('libër', 'NOUN');
  const N = (Case: string, Number: string, Definite: string) => form(p, { Case, Number, Definite, Gender: 'Masc' });

  it('has every cell of the table (16 = 4 cases × 2 × 2)', () => {
    expect(p.cells).toHaveLength(16);
    expect(p.template).toBe('masculine, definite in -i / -u (libri, shoku)');
  });
  it('indefinite and definite, singular', () => {
    expect(N('Nom', 'Sing', 'Ind')).toEqual(['libër']);
    expect(N('Acc', 'Sing', 'Ind')).toEqual(['libër']);
    expect(N('Gen,Dat', 'Sing', 'Ind')).toEqual(['libri']);
    expect(N('Abl', 'Sing', 'Ind')).toEqual(['libri']);
    expect(N('Nom', 'Sing', 'Def')).toEqual(['libri']);
    expect(N('Acc', 'Sing', 'Def')).toEqual(['librin']);
    expect(N('Gen,Dat', 'Sing', 'Def')).toEqual(['librit']);
    expect(N('Abl', 'Sing', 'Def')).toEqual(['librit']);
  });
  it('plural: the indefinite ablative has its own form, and a union reading does not overwrite it', () => {
    expect(N('Nom', 'Plur', 'Ind')).toEqual(['libra']);
    expect(N('Nom', 'Plur', 'Def')).toEqual(['librat']);
    expect(N('Acc', 'Plur', 'Def')).toEqual(['librat']);
    expect(N('Gen,Dat', 'Plur', 'Ind')).toEqual(['librave']);
    expect(N('Gen,Dat', 'Plur', 'Def')).toEqual(['librave']);
    expect(N('Abl', 'Plur', 'Ind')).toEqual(['librash']);
    expect(N('Abl', 'Plur', 'Def')).toEqual(['librave']);
  });
  it('has a layout with plain-word labels and a note on the genitive article', () => {
    expect(p.layout?.columns.key).toBe('Definite');
    expect(p.layout?.rows.key).toBe('Case');
    expect(p.layout?.rows.values.map((v) => v[1])).toEqual(['nominative', 'accusative', 'genitive / dative', 'ablative']);
    expect(p.layout?.sections).toEqual(['Number']);
    expect(p.notes.join(' ')).toContain('i librit, e librit, të librit, së librit');
  });
  it('feminine, -ia and -ja nouns follow their own rules', () => {
    const v = para('vajzë', 'NOUN');
    expect(form(v, { Case: 'Acc', Number: 'Sing', Definite: 'Def', Gender: 'Fem' })).toEqual(['vajzën']);
    expect(form(v, { Case: 'Gen,Dat', Number: 'Sing', Definite: 'Ind', Gender: 'Fem' })).toEqual(['vajze']);
    const s = para('shtëpi', 'NOUN');
    expect(form(s, { Case: 'Acc', Number: 'Sing', Definite: 'Def', Gender: 'Fem' })).toEqual(['shtëpinë']);
    expect(form(s, { Case: 'Gen,Dat', Number: 'Plur', Definite: 'Def', Gender: 'Fem' })).toEqual(['shtëpive']);
  });
  it('a name is already definite', () => {
    const n = sqParadigm('Beni', 'PROPN');
    if (n) expect(n.cells.every((c) => c.features.Definite === 'Def')).toBe(true);
  });
});

describe('the example sentence: Fëmijët lexojnë librin.', () => {
  const r = run('Fëmijët lexojnë librin.');
  const librin = best(r, 'librin');
  const p = para('libër', 'NOUN');
  const full = { ...p, languageId: 'sq', lemma: 'libër', pos: 'NOUN' as const, notes: p.notes, sources: [], status: 'generated' as const, cells: p.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) };

  it('librin is libër: masculine, singular, definite, accusative', () => {
    expect(librin.lemma).toBe('libër');
    expect(librin.morph).toMatchObject({ Gender: 'Masc', Number: 'Sing', Definite: 'Def', Case: 'Acc' });
  });
  it('cellOf finds the highlighted cell from the analysis features', () => {
    const cell = cellOf(full, librin.morph as Record<string, string>);
    expect(cell?.form).toBe('librin');
  });
  it('a union reading finds every cell it could be (sqCellsFor), and the form narrows it', () => {
    // libri alone: definite nominative, or indefinite genitive-dative-ablative
    const readings = analyzeSqForm('libri').filter((x) => x.lemma === 'libër');
    expect(readings.length).toBeGreaterThan(1);
    const keys = readings.flatMap((x) => sqCellsFor(full, x.morph, 'libri').map((c) => featureKey(c.features)));
    expect(keys).toContain(featureKey({ Case: 'Nom', Number: 'Sing', Definite: 'Def', Gender: 'Masc' }));
    expect(keys).toContain(featureKey({ Case: 'Gen,Dat', Number: 'Sing', Definite: 'Ind', Gender: 'Masc' }));
    expect(keys).toContain(featureKey({ Case: 'Abl', Number: 'Sing', Definite: 'Ind', Gender: 'Masc' }));
    expect(cellsWithForm(full, 'librin')).toHaveLength(1);
  });
  it('the whole sentence: the verb has a paradigm whose 3rd plural present is lexojnë', () => {
    const lex = best(r, 'lexojnë');
    const v = para(lex.lemma ?? '', 'VERB');
    expect(form(v, { Person: '3', Number: 'Plur', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' })).toEqual(['lexojnë']);
  });
});

describe('adjective', () => {
  it('shows the linking article in the form, Gender × Number', () => {
    const p = para('mirë', 'ADJ');
    expect(p.kind).toBe('adjective-declension');
    expect(form(p, { Gender: 'Masc', Number: 'Sing' })).toEqual(['i mirë']);
    expect(form(p, { Gender: 'Fem', Number: 'Sing' })).toEqual(['e mirë']);
    expect(form(p, { Gender: 'Masc', Number: 'Plur' })).toEqual(['të mirë']);
    expect(form(p, { Gender: 'Fem', Number: 'Plur' })).toEqual(['të mira']);
    expect(p.notes.join(' ')).toContain('linking article');
  });
  it('is found by its cited form with the article too, and an adjective without an article is said so', () => {
    expect(sqParadigm('i mirë', 'ADJ')?.cells).toHaveLength(4);
    const unart = SQ_LEXEMES.find((l) => l.pos === 'ADJ' && !l.articulated);
    expect(unart).toBeDefined();
    const p = para(unart!.lemma, 'ADJ');
    expect(p.notes.join(' ')).toContain('not written with a linking article');
    expect(p.cells.every((c) => !/^(i|e|të|së) /.test(c.form))).toBe(true);
  });
});

describe('verb', () => {
  const p = para('punoj', 'VERB');
  const V = (f: Record<string, string>) => form(p, { VerbForm: 'Fin', Voice: 'Act', ...f });
  it('present, subjunctive, imperfect, aorist of a verb in -oj', () => {
    expect(['1', '2', '3'].flatMap((n) => V({ Person: n, Number: 'Sing', Tense: 'Pres', Mood: 'Ind' }))).toEqual(['punoj', 'punon', 'punon']);
    expect(V({ Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Sub' })).toEqual(['punosh']);
    expect(V({ Person: '3', Number: 'Sing', Tense: 'Imp', Mood: 'Ind' })).toEqual(['punonte']);
    expect(V({ Person: '1', Number: 'Sing', Tense: 'Past', Mood: 'Ind' })).toEqual(['punova']);
    expect(V({ Person: '3', Number: 'Plur', Tense: 'Past', Mood: 'Ind' })).toEqual(['punuan']);
    expect(V({ Person: '2', Number: 'Sing', Mood: 'Imp' })).toEqual(['puno']);
  });
  it('the participle and the gerund are single cells; the compound tenses are constructions, not cells', () => {
    expect(form(p, { VerbForm: 'Part' })).toEqual(['punuar']);
    expect(form(p, { VerbForm: 'Ger' })).toEqual(['duke punuar']);
    expect(p.cells.some((c) => /^(kam|ke|ka|do) /.test(c.form))).toBe(false);
    expect(p.constructions).toEqual(expect.arrayContaining(['future', 'perfect', 'pluperfect']));
    expect(p.notes.join(' ')).toContain('do të punoj');
    expect(p.layout?.sections).toEqual(['Voice', 'Mood', 'Tense']);
    expect(p.layout?.rows.key).toBe('Person');
    expect(p.layout?.columns.key).toBe('Number');
  });
  it('an irregular verb comes from its listed forms; the optative and admirative where listed', () => {
    const j = para('jam', 'VERB');
    expect(form(j, { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' })).toEqual(['është']);
    expect(form(j, { Person: '1', Number: 'Sing', Mood: 'Opt', Voice: 'Act', VerbForm: 'Fin' })).toEqual(['qofsha']);
    expect(j.template).toBe('irregular verb (every form listed by hand)');
  });
  it('a verb that exists only in the non-active has a non-active gerund with u', () => {
    const l = SQ_LEXEMES.find((x) => x.lemma === 'lutem' && x.pos === 'VERB');
    expect(l?.nonActive).toBe('only');
    expect(form(para('lutem', 'VERB'), { VerbForm: 'Ger' })).toEqual(['duke u lutur']);
  });
  it('the non-active voice is generated where the word list has it', () => {
    const l = SQ_LEXEMES.find((x) => x.pos === 'VERB' && x.nonActive === true && x.cls !== 'irr');
    expect(l).toBeDefined();
    expect(para(l!.lemma, 'VERB').cells.some((c) => c.features.Voice === 'Mid')).toBe(true);
  });
});

describe('pronoun', () => {
  const p = para('ai', 'PRON');
  it('has full and short forms by case, number and gender', () => {
    expect(p.kind).toBe('pronoun-paradigm');
    expect(form(p, { Person: '3', Number: 'Sing', Gender: 'Masc', Case: 'Nom', PronType: 'Prs' })).toEqual(['ai']);
    expect(form(p, { Person: '3', Number: 'Sing', Gender: 'Fem', Case: 'Nom', PronType: 'Prs' })).toEqual(['ajo']);
    expect(form(p, { Person: '3', Number: 'Sing', Case: 'Acc', PronType: 'Prs', Clitic: 'Yes' })).toEqual(['e']);
    expect(form(para('unë', 'PRON'), { Person: '1', Number: 'Sing', Case: 'Abl', PronType: 'Prs' })).toEqual(['meje']);
  });
});

describe('a lemma the word list does not know', () => {
  it('a noun, an adjective, a pronoun or another part of speech: undefined (no guessing from a lemma)', () => {
    expect(sqParadigm('zzxyqq', 'NOUN')).toBeUndefined();
    expect(sqParadigm('zzxyqq', 'ADJ')).toBeUndefined();
    expect(sqParadigm('zzxyqq', 'PRON')).toBeUndefined();
    expect(sqParadigm('mirë', 'ADV')).toBeUndefined();
    expect(sqParadigm('kompjuterizim', 'NOUN')).toBeUndefined();
  });
  it('a verb that does not end in -oj: undefined', () => {
    expect(sqParadigm('zzxyqq', 'VERB')).toBeUndefined();
    expect(sqParadigm('flym', 'VERB')).toBeUndefined();
  });
  it('a verb in -oj gets a guessed paradigm that says so, with no template', () => {
    const l = 'xyzqtoj';
    expect(SQ_LEXEMES.some((x) => x.lemma === l)).toBe(false);
    const p = sqParadigm(l, 'VERB');
    expect(p).toBeDefined();
    expect(p!.template).toBeUndefined();
    expect(p!.notes.join(' ')).toContain('Guessed from the ending');
    expect(form(p!, { Person: '1', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' })).toEqual(['xyzqtova']);
    expect(form(p!, { VerbForm: 'Part' })).toEqual(['xyzqtuar']);
    expect(p!.cells.some((c) => c.features.Mood === 'Opt' || c.features.Mood === 'Adm' || c.features.Voice === 'Mid')).toBe(false);
  });
});

describe('round trip over the whole word list: every generated form is read back to the cell it came from', () => {
  const bare = (f: string): string => f.replace(/^(?:i|e|të|së) /u, '');
  it('every noun, adjective and verb cell: the analysis of its form has a reading whose features find that cell', () => {
    const failures: string[] = [];
    let cells = 0;
    let lexemes = 0;
    const seen = new Set<string>();
    for (const lx of SQ_LEXEMES) {
      if (lx.pos !== 'NOUN' && lx.pos !== 'PROPN' && lx.pos !== 'ADJ' && lx.pos !== 'VERB') continue;
      const key = `${lx.lemma}|${lx.pos}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = sqParadigm(lx.lemma, lx.pos);
      if (!p) { failures.push(`${key}: no paradigm`); continue; }
      lexemes++;
      const full = { kind: p.kind, cells: p.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) };
      for (const c of full.cells) {
        if (c.features.VerbForm === 'Ger') continue; // two words
        cells++;
        const surface = p.kind === 'adjective-declension' ? bare(c.form) : c.form;
        const readings = analyzeSqForm(sqNormalize(surface)).filter((r) => r.lemma === lx.lemma && !r.relation && (r.pos === lx.pos || (lx.pos === 'VERB' && r.pos === 'AUX') || (r.pos === 'NOUN' && lx.pos === 'PROPN') || (r.pos === 'PROPN' && lx.pos === 'NOUN')));
        const hit = readings.some((r) => sqCellsFor(full, r.morph, surface).some((x) => featureKey(x.features) === featureKey(c.features)));
        if (!hit) failures.push(`${key} ${featureKey(c.features)} "${c.form}"`);
      }
    }
    expect(lexemes).toBeGreaterThan(900);
    expect(cells).toBeGreaterThan(8000);
    expect(failures.slice(0, 20)).toEqual([]);
  });

});
