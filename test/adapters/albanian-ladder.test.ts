/**
 * The Albanian ladder plan's word-list additions (data/ladder/sq/PLAN-A1-2-A2.md section 6.1: 271 words) and the reading
 * rules that went with them (adapter-sq@8): every listed form of every addition reads as its lemma; the cast names are
 * names; a capital inside the sentence is an unconfirmed name; Roman numerals are numbers; abbreviations are read; para is
 * money before nothing and "before" before a noun phrase; the aorist of a verb that exists only in the non-active reads.
 * The words are the planner's, checked against Wiktionary where it has them; no native speaker has looked at any of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SQ_LADDER_LEXEMES } from '../../src/adapters/albanian/lexicon-ladder';
import { SQ_LEXEMES, sqIndexProblems } from '../../src/adapters/albanian/morphology';
import { adapter, best, run } from './helpers';

const sq = adapter('sq');

/** First reading of the word `surface` (the nth one) in `text`: lemma, part of speech, unconfirmed. */
const first = (text: string, surface: string, nth = 0) => {
  const c = best(run('sq', text), surface, nth);
  return { lemma: c?.lemma, pos: c?.pos, unconfirmed: c?.unconfirmed === true, context: String(c?.notes?.context ?? ''), gloss: c?.gloss };
};

describe('the ladder plan additions: the word list', () => {
  it('has all 271 words of section 6.1 (262 here, the 9 closed-class words in function-*.ts) and every one builds its forms', () => {
    expect(SQ_LADDER_LEXEMES.length).toBe(262);
    expect(sqIndexProblems()).toEqual([]);
    const seen = new Set<string>();
    for (const l of SQ_LADDER_LEXEMES) {
      const key = `${l.lemma}|${l.pos}`;
      expect(seen.has(key), `${key} is listed twice`).toBe(false);
      seen.add(key);
      expect(SQ_LEXEMES).toContain(l);
      expect(l.gloss.length, l.lemma).toBeGreaterThan(1);
    }
  });

  it('reads every listed form of every word of the plan as the planned lemma', () => {
    const file = path.resolve('data/ladder/sq/PLAN-A1-2-A2.md');
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const from = lines.findIndex((l) => l.startsWith('### 6.1'));
    const to = lines.findIndex((l) => l.startsWith('### 6.2'));
    expect(from).toBeGreaterThan(0);
    let rows = 0;
    const failures: string[] = [];
    for (const line of lines.slice(from, to)) {
      if (!line.startsWith('|') || line.startsWith('| word') || line.startsWith('|---')) continue;
      const c = line.split('|').slice(1, -1).map((s) => s.trim());
      const [word, pos, , forms] = c;
      rows++;
      const bare = word.replace(/^i /, '');
      const listed = new Set([bare, ...(pos === 'NOUN' || pos === 'VERB' ? forms.split(',').map((s) => s.trim()).filter((s) => s && s !== '—') : [])]);
      for (const form of listed) {
        const text = pos === 'VERB' ? `Unë e kam ${form} sot.` : `Ai tha ${form} sot.`;
        const r = run('sq', text);
        const at = r.tokens.findIndex((t) => t.isWord && t.normalized === sq.normalize(form));
        const lemma = r.analyses[at]?.candidates[0]?.lemma;
        if (lemma !== word) failures.push(`${word}: "${form}" reads as ${lemma}`);
      }
    }
    expect(rows).toBe(271);
    // the plan's own forms that the word list replaces with Wiktionary's (para: paraja, not paratë as the definite singular;
    // pjek: poqa; ngas: ngava; thërras: thërrita) are all kept as variants, so none of them fails
    expect(failures).toEqual([]);
  });

  it('gives the forms of the main classes', () => {
    expect(first('Ai kishte një karrige.', 'karrige')).toMatchObject({ lemma: 'karrige', pos: 'NOUN' });
    expect(first('Ulem në karrigen.', 'karrigen')).toMatchObject({ lemma: 'karrige' });
    expect(first('Dy peshq të mëdhenj.', 'peshq')).toMatchObject({ lemma: 'peshk' });
    expect(first('Peshqit janë këtu.', 'Peshqit')).toMatchObject({ lemma: 'peshk' });
    expect(first('Kam shumë palltot e reja.', 'palltot')).toMatchObject({ lemma: 'pallto' });
    expect(first('Ata shkuan në teatro.', 'teatro')).toMatchObject({ lemma: 'teatër' });
    expect(first('Ajo ka kombëtare.', 'kombëtare')).toMatchObject({ lemma: 'kombëtar', pos: 'ADJ' });
    expect(first('Një gjë e dëmshme.', 'dëmshme')).toMatchObject({ lemma: 'i dëmshëm', pos: 'ADJ' });
    expect(first('Ai është i aftë.', 'aftë')).toMatchObject({ lemma: 'i aftë', pos: 'ADJ' });
    expect(first('Ai zbriti nga autobusi.', 'zbriti')).toMatchObject({ lemma: 'zbres', pos: 'VERB' });
    expect(first('Ai nuk eci sot.', 'eci')).toMatchObject({ lemma: 'ec' });
    expect(first('Buka piqet në furrë.', 'piqet')).toMatchObject({ lemma: 'pjek' });
    expect(first('Unë ndihem mirë.', 'ndihem')).toMatchObject({ lemma: 'ndjej' });
    expect(first('Qyteti shtrihet në jug.', 'shtrihet')).toMatchObject({ lemma: 'shtrij' });
    expect(first('Ai e kaloi verën aty.', 'kaloi')).toMatchObject({ lemma: 'kaloj' });
    expect(first('Ai erdhi deri në Tiranë.', 'deri')).toMatchObject({ lemma: 'deri', pos: 'ADP' });
    expect(first('Mirëpo ai nuk erdhi.', 'Mirëpo')).toMatchObject({ lemma: 'mirëpo' });
  });
});

describe('the cast names', () => {
  it('Drita, Mira and Luan are names where a capital stands inside the sentence or opens a clause before a verb', () => {
    expect(first('Ai flet me Drita.', 'Drita')).toMatchObject({ lemma: 'Drita', pos: 'PROPN' });
    expect(first('Ai flet me Mira e Luan.', 'Mira')).toMatchObject({ lemma: 'Mira', pos: 'PROPN' });
    expect(first('Ai flet me Mira e Luan.', 'Luan')).toMatchObject({ lemma: 'Luan', pos: 'PROPN' });
    expect(first('Drita ka bukë.', 'Drita')).toMatchObject({ lemma: 'Drita', pos: 'PROPN' });
    expect(first('Mira është këtu.', 'Mira')).toMatchObject({ lemma: 'Mira', pos: 'PROPN' });
    expect(first('Luan lexon një libër.', 'Luan')).toMatchObject({ lemma: 'Luan', pos: 'PROPN' });
    expect(first('Mira, eja këtu.', 'Mira')).toMatchObject({ lemma: 'Mira', pos: 'PROPN' });
    // the common words stay what they are in lower case and where the neighbours do not say otherwise
    expect(first('Drita e diellit është e bukur.', 'Drita')).toMatchObject({ lemma: 'dritë', pos: 'NOUN' });
    expect(first('Dritën e kam në dhomë.', 'Dritën')).toMatchObject({ lemma: 'dritë' });
    expect(first('Ai ka një dritë të madhe.', 'dritë')).toMatchObject({ lemma: 'dritë', pos: 'NOUN' });
    expect(first('Ata luan futboll.', 'luan')).toMatchObject({ lemma: 'luaj', pos: 'VERB' });
    expect(first('Ajo është e mira.', 'mira').lemma).toBe('i mirë');
  });
});

describe('names, numerals and abbreviations in the sentence', () => {
  it('reads a word outside the list with a capital inside the sentence as an unconfirmed name, with no gloss', () => {
    const v = first('Ai shkoi në Vjosë me Pogradecin.', 'Vjosë');
    expect(v).toMatchObject({ lemma: 'Vjosë', pos: 'PROPN', unconfirmed: true });
    expect(v.gloss).toBeUndefined();
    const c = best(run('sq', 'Ai shkoi në Vjosë.'), 'Vjosë');
    expect(c.confidence).toBeLessThanOrEqual(0.5);
    expect(c.notes?.lemmaStatus).toBe('inferred by the rules');
    // the word list's own names stay confident, and a clause-opening capital says nothing about an unlisted word
    expect(best(run('sq', 'Ai shkoi në Tiranë.'), 'Tiranë').unconfirmed).toBeUndefined();
    expect(run('sq', 'Vjosa është lumë.').analyses[0].candidates.every((c) => c.pos !== 'PROPN' || c.notes?.context === undefined)).toBe(true);
    // a name keeps its place after a preposition whatever the case it asks for
    expect(first('Ai flet me Vjosën.', 'Vjosën')).toMatchObject({ pos: 'PROPN' });
    // a small letter is never a name
    expect(first('Ai shkoi në vjosë.', 'vjosë').pos).not.toBe('PROPN');
  });

  it('reads capital letters in the shape of a Roman numeral as a number, with its value', () => {
    const c = best(run('sq', 'Në shek. XIV ai erdhi.'), 'XIV');
    expect(c).toMatchObject({ lemma: 'XIV', pos: 'NUM', gloss: 'Roman numeral 14' });
    expect(c.confidence).toBeLessThanOrEqual(0.7);
    expect(best(run('sq', 'Kapitulli II është i gjatë.'), 'II')).toMatchObject({ pos: 'NUM', gloss: 'Roman numeral 2' });
    expect(best(run('sq', 'Viti MCMXC ishte i gjatë.'), 'MCMXC').gloss).toBe('Roman numeral 1990');
    // not canonical, or a small letter, or a word of the list
    expect(best(run('sq', 'Ai pa IIII kuaj.'), 'IIII')?.pos).not.toBe('NUM');
    expect(best(run('sq', 'Ai pa xiv kuaj.'), 'xiv')?.pos).not.toBe('NUM');
    expect(best(run('sq', 'Ai tha MI sot.'), 'MI')?.pos).not.toBe('NUM');
  });

  it('reads the abbreviations of running text as known tokens (part of speech X, role abbreviation)', () => {
    for (const [text, surface, gloss] of [
      ['Ai ka 5 km.', 'km', /kilometre/], ['Në shek. XIV.', 'shek', /century/], ['Libra, fletore etj. janë këtu.', 'etj', /and so on/],
      ['Në vitin 300 p.e.s. ai vdiq.', 'p.e.s', /before our era/], ['Është 12 kg.', 'kg', /kilogram/], ['Ai ka p.sh. dy libra.', 'p.sh', /for example/],
    ] as const) {
      const c = best(run('sq', text), surface);
      expect(c, text).toMatchObject({ pos: 'X', role: 'abbreviation' });
      expect(c.gloss, text).toMatch(gloss);
    }
    // m is the abbreviation of metër after a figure only
    expect(best(run('sq', 'Është 3 m i gjatë.'), 'm')).toMatchObject({ lemma: 'm', pos: 'X', role: 'abbreviation' });
    expect(run('sq', 'Ai tha m sot.').analyses.find((a) => a.token.surface === 'm')?.candidates.some((c) => c.pos === 'X')).toBe(false);
  });
});

describe('para, dhemb and the aorist of the non-active verbs', () => {
  it('para is money with no noun phrase after it, "before" with one; the ordinal needs its article', () => {
    expect(first('Nuk kam para.', 'para')).toMatchObject({ lemma: 'para', pos: 'NOUN' });
    expect(first('Ai ka para për të blerë bukë.', 'para')).toMatchObject({ lemma: 'para', pos: 'NOUN' });
    expect(first('Ai ka shumë para dhe shumë libra.', 'para')).toMatchObject({ lemma: 'para', pos: 'NOUN' });
    expect(first('Paratë janë në çantë.', 'Paratë')).toMatchObject({ lemma: 'para', pos: 'NOUN' });
    expect(first('Para shkollës ka një autobus.', 'Para')).toMatchObject({ lemma: 'para', pos: 'ADP' });
    expect(first('Ai erdhi para se të hanim.', 'para')).toMatchObject({ pos: 'ADP' });
    expect(first('Ajo është e para.', 'para')).toMatchObject({ lemma: 'i parë', pos: 'ADJ' });
  });

  it('dhemb is the verb (more dhemb koka), not the tooth dhëmb', () => {
    expect(first('Më dhemb koka.', 'dhemb')).toMatchObject({ lemma: 'dhemb', pos: 'VERB' });
    expect(first('Më dhemb dhëmbi.', 'dhëmbi')).toMatchObject({ lemma: 'dhëmb', pos: 'NOUN' });
  });

  it('reads the aorist of the verbs that exist only in the non-active, with and without u', () => {
    for (const [text, surface, lemma] of [
      ['Ai mbeti në shtëpi.', 'mbeti', 'mbetem'], ['Ajo lindi në Tiranë.', 'lindi', 'lindem'], ['Ndodhi dje.', 'Ndodhi', 'ndodhem'],
      ['U nisëm herët.', 'nisëm', 'nisem'], ['Unë u ula.', 'ula', 'ulem'], ['Ata u ulën.', 'ulën', 'ulem'], ['Linda në Durrës.', 'Linda', 'lindem'],
      ['Ne u ndodhëm aty.', 'ndodhëm', 'ndodhem'], ['Ai u ul.', 'ul', 'ulem'], ['Ata mbetën aty.', 'mbetën', 'mbetem'], ['Unë mbeta aty.', 'mbeta', 'mbetem'],
    ] as const) {
      const c = best(run('sq', text), surface);
      expect(c, text).toMatchObject({ lemma, pos: 'VERB' });
      expect(c.morph.Tense, text).toBe('Past');
      expect(c.morph.Voice, text).toBe('Mid');
    }
    // the present of a non-active verb is not an aorist, and the active-looking 3sg is generated only where the list states it
    expect(best(run('sq', 'Ai nuk nisi.'), 'nisi')?.lemma).not.toBe('nisem');
  });

  it('says in its version that the analyses changed', () => {
    expect(sq.version).toBe('9');
  });
});
