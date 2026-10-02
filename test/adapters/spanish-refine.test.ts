/**
 * Package E1: what the importer needs from the Spanish adapter once a dictionary can decide a word.
 *  - `unconfirmed` marks a reading whose lemma only the rules infer, and only that one;
 *  - `refine` orders readings by context again after the importer put a dictionary's readings on some tokens: for the
 *    adapter's own tokens it equals `analyze`, a dictionary token is ordered by its neighbours and is a neighbour
 *    in its turn, and it never adds, removes or rewrites a reading.
 * The dictionary tokens are built by hand here (the importer is not involved).
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { loadBundledCorpus } from '../../src/ingest';

const es = createAdapterRegistry().get('es');
const refine = es.refine!;
const OWN = `adapter-es@${es.version}`;
const DICT = 'dict:kaikki-es@test';

const analyzeText = (text: string) => { const tokens = es.tokenize(text); return { tokens, analyzed: es.analyze(tokens) }; };

/** A dictionary reading the way the importer builds it: morph from the dictionary's tags, origin 'dictionary'. */
function dictReading(lemma: string, pos: AnalysisCandidate['pos'], tags: string[], confidence = 0.45): AnalysisCandidate {
  return { lemma, pos, morph: es.morphFromTags!(tags), confidence, origin: 'dictionary', sourceId: DICT, gloss: `${lemma} (dictionary)` };
}

/** The sentence analysed by the adapter, with the readings of the named words replaced by a dictionary's (in the order given). */
function withDictionary(text: string, replaced: Record<string, AnalysisCandidate[]>): { tokens: RawToken[]; analyzed: AnalyzedToken[] } {
  const { tokens, analyzed } = analyzeText(text);
  const out = analyzed.map((a, i) => (replaced[tokens[i].surface] ? { token: tokens[i], candidates: replaced[tokens[i].surface].map((c) => ({ ...c })), analyzer: DICT } : a));
  return { tokens, analyzed: out };
}

const both = new Set([OWN, DICT]);
const order = (a: AnalyzedToken) => a.candidates.map((c) => `${c.lemma}/${c.pos}`);
const at = (tokens: RawToken[], surface: string) => tokens.findIndex((t) => t.surface === surface);
const multiset = (a: AnalyzedToken) => a.candidates.map((c) => `${c.lemma}|${c.pos}`).sort();

const NOUN = (lemma: string) => dictReading(lemma, 'NOUN', ['feminine', 'singular']);
const VERB3S = (lemma: string) => dictReading(lemma, 'VERB', ['third-person', 'singular', 'present', 'indicative']);

describe('unconfirmed: only a reading whose lemma the rules infer', () => {
  it('an inferred lemma is flagged, and says so in its notes', () => {
    const { analyzed } = analyzeText('trabucaban');
    const cands = analyzed[0].candidates;
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      expect(c.unconfirmed).toBe(true);
      expect(c.notes?.lemmaStatus).toBe('inferred by the rules');
      expect(c.origin).toBe('rule');
    }
  });

  it('a word-list reading and a rule reading of a word-list lemma are not flagged', () => {
    const hand = analyzeText('casa').analyzed[0].candidates;
    expect(hand.some((c) => c.origin === 'hand')).toBe(true);
    for (const c of hand) expect('unconfirmed' in c).toBe(false);
    const rule = analyzeText('hablamos').analyzed[0].candidates;
    expect(rule.length).toBeGreaterThan(0);
    for (const c of rule) {
      expect(c.notes?.lemmaStatus).toBe('in the word list');
      expect('unconfirmed' in c).toBe(false);
    }
  });

  it('the flag survives the per-form cache and a repeated analysis', () => {
    const first = analyzeText('trabucaban').analyzed[0].candidates;
    first[0].unconfirmed = false; // a caller changing its copy must not reach the cache
    const again = analyzeText('trabucaban').analyzed[0].candidates;
    expect(again.every((c) => c.unconfirmed === true)).toBe(true);
  });

  it('clitic and older-spelling readings (built from the word list) are not flagged; a guess beside them is', () => {
    for (const w of ['entenderlo', 'perdonarnos']) {
      for (const c of analyzeText(w).analyzed[0].candidates) expect(c.unconfirmed, `${w} ${c.lemma}`).toBeUndefined();
    }
    for (const w of ['fazer', 'dixo']) {
      const cands = analyzeText(w).analyzed[0].candidates;
      expect(cands.some((c) => c.varieties?.includes('es-hist'))).toBe(true);
      for (const c of cands) expect(c.unconfirmed === true, `${w} ${c.lemma}`).toBe(c.notes?.lemmaStatus === 'inferred by the rules');
    }
  });
});

describe('refine: the adapter\'s own tokens', () => {
  it('equals analyze on every sentence of the bundled Spanish documents, and the flag matches the notes', () => {
    let sentences = 0;
    for (const doc of loadBundledCorpus().filter((d) => d.lang === 'es')) {
      for (const sec of doc.sections) for (const par of sec.paragraphs) {
        if (!('sentences' in par)) continue;
        for (const s of par.sentences) {
          const tokens = es.tokenize(s.text);
          const analyzed = es.analyze(tokens);
          expect(refine(tokens, analyzed, new Set([OWN])), s.text).toEqual(analyzed);
          sentences++;
          for (const a of analyzed) for (const c of a.candidates) {
            const inferred = c.notes?.lemmaStatus === 'inferred by the rules';
            expect(c.unconfirmed === true, `${a.token.surface} ${c.lemma}`).toBe(inferred);
          }
        }
      }
    }
    expect(sentences).toBeGreaterThan(100);
  });

  it('does not depend on a confidence an earlier pass lowered', () => {
    const texts = ['La abuela llena la jarra.', 'No sé dónde está.', 'Yo cocino y ella cocina también.', 'Mi hermano se casa mañana.', '—Buenas tardes, señor.'];
    for (const text of texts) {
      const { tokens, analyzed } = analyzeText(text);
      const lowered = analyzed.map((a) => ({ ...a, candidates: a.candidates.map((c) => ({ ...c, confidence: 0.1 })) }));
      expect(refine(tokens, lowered, new Set([OWN])), text).toEqual(refine(tokens, analyzed, new Set([OWN])));
      expect(refine(tokens, lowered, new Set([OWN])), text).toEqual(analyzed);
    }
    // the same beside a dictionary token
    const { tokens, analyzed } = withDictionary('Mi abuelita cuenta la historia.', { abuelita: [NOUN('abuelita')] });
    const lowered = analyzed.map((a) => (a.analyzer === OWN ? { ...a, candidates: a.candidates.map((c) => ({ ...c, confidence: 0.1 })) } : a));
    expect(refine(tokens, lowered, both)).toEqual(refine(tokens, analyzed, both));
  });
});

describe('refine: dictionary tokens', () => {
  it('a token whose analyzer is not in the set is returned untouched, even when it is ambiguous', () => {
    const { tokens, analyzed } = withDictionary('Veo la sierra.', { sierra: [VERB3S('serrar'), NOUN('sierra')] });
    const out = refine(tokens, analyzed, new Set([OWN]));
    const i = at(tokens, 'sierra');
    expect(out[i]).toEqual(analyzed[i]);
    expect(order(out[i])).toEqual(['serrar/VERB', 'sierra/NOUN']);
    // with the dictionary's analyzer in the set the same token is ordered
    expect(order(refine(tokens, analyzed, both)[i])).toEqual(['sierra/NOUN', 'serrar/VERB']);
  });

  it('after an article the noun comes first', () => {
    const { tokens, analyzed } = withDictionary('Veo la sierra.', { sierra: [VERB3S('serrar'), NOUN('sierra')] });
    const out = refine(tokens, analyzed, both);
    const c = out[at(tokens, 'sierra')].candidates;
    expect(c[0]).toMatchObject({ lemma: 'sierra', pos: 'NOUN', origin: 'dictionary', sourceId: DICT, confidence: 0.45 });
    expect(c[0].notes?.context).toMatch(/article/);
    expect(out[at(tokens, 'sierra')].analyzer).toBe(DICT);
  });

  it('after "no" the verb comes first', () => {
    const { tokens, analyzed } = withDictionary('Ana no sierra.', { sierra: [NOUN('sierra'), VERB3S('serrar')] });
    const out = refine(tokens, analyzed, both);
    expect(order(out[at(tokens, 'sierra')])).toEqual(['serrar/VERB', 'sierra/NOUN']);
  });

  it('after a subject pronoun the verb that agrees with it comes first', () => {
    const readings = [NOUN('canto'), VERB3S('cantar'), dictReading('cantar', 'VERB', ['first-person', 'plural', 'present', 'indicative'])];
    const { tokens, analyzed } = withDictionary('Nosotros cantamos.', { cantamos: readings });
    const c = refine(tokens, analyzed, both)[at(tokens, 'cantamos')].candidates;
    expect(c[0]).toMatchObject({ lemma: 'cantar', pos: 'VERB', morph: { Person: '1', Number: 'Plur' } });
    expect(order({ token: tokens[0], candidates: c, analyzer: DICT })).toEqual(['cantar/VERB', 'canto/NOUN', 'cantar/VERB']); // the others keep their order below it
  });

  it('a dictionary reading with person and tense but no VerbForm still counts as conjugated', () => {
    const noForm = (c: AnalysisCandidate): AnalysisCandidate => { const { VerbForm: _v, ...morph } = c.morph; return { ...c, morph }; };
    const readings = [NOUN('canto'), noForm(VERB3S('cantar')), noForm(dictReading('cantar', 'VERB', ['first-person', 'plural', 'present', 'indicative']))];
    const { tokens, analyzed } = withDictionary('Nosotros cantamos.', { cantamos: readings });
    const c = refine(tokens, analyzed, both)[at(tokens, 'cantamos')].candidates;
    expect(c[0]).toMatchObject({ lemma: 'cantar', morph: { Person: '1', Number: 'Plur' } });
    expect(c[0].morph.VerbForm).toBeUndefined();
  });

  it('a dictionary reading with no features at all is not taken for a conjugated verb', () => {
    const bare = dictReading('serrar', 'VERB', []);
    const { tokens, analyzed } = withDictionary('Ana no sierra.', { sierra: [bare, NOUN('sierra')] });
    // after "no" a conjugated verb is wanted; this one is not known to be conjugated: nothing decides, order kept
    expect(order(refine(tokens, analyzed, both)[at(tokens, 'sierra')])).toEqual(['serrar/VERB', 'sierra/NOUN']);
  });

  it('a noun or adjective of the dictionary goes before a "tú" form or a command when nothing else decides', () => {
    const verb2 = dictReading('calar', 'VERB', ['second-person', 'singular', 'present', 'indicative']);
    const { tokens, analyzed } = withDictionary('Calles anchas.', { Calles: [verb2, dictReading('calle', 'NOUN', ['feminine', 'plural'])], anchas: [] });
    const out = refine(tokens, analyzed, both);
    expect(order(out[at(tokens, 'Calles')])).toEqual(['calle/NOUN', 'calar/VERB']);
  });
});

describe('refine: a dictionary token as a neighbour', () => {
  const NEXT = 'cuenta'; // a noun and a verb form for the adapter

  it('a dictionary noun before an adapter word that is a noun or a third-person verb: the verb', () => {
    const { tokens, analyzed } = withDictionary('Mi abuelita cuenta la historia.', { abuelita: [NOUN('abuelita')] });
    const i = at(tokens, NEXT);
    expect(analyzed[i].analyzer).toBe(OWN);
    const out = refine(tokens, analyzed, both);
    expect(out[i].candidates[0]).toMatchObject({ lemma: 'contar', pos: 'VERB' });
    expect(out[i].candidates[0].notes?.context).toMatch(/subject/);
    expect(out[i].analyzer).toBe(OWN);
  });

  it('the same word after a dictionary conjugated verb: not another conjugated verb', () => {
    const { tokens, analyzed } = withDictionary('Mi abuelita cuenta la historia.', { abuelita: [VERB3S('abuelitar')] });
    const out = refine(tokens, analyzed, both);
    expect(out[at(tokens, NEXT)].candidates[0]).toMatchObject({ lemma: 'cuenta', pos: 'NOUN' });
  });
});

describe('refine: never adds, removes or rewrites a reading', () => {
  const CASES: [string, Record<string, AnalysisCandidate[]>][] = [
    ['Veo la sierra.', { sierra: [VERB3S('serrar'), NOUN('sierra')] }],
    ['Ana no sierra.', { sierra: [NOUN('sierra'), VERB3S('serrar')] }],
    ['Mi abuelita cuenta la historia.', { abuelita: [NOUN('abuelita')] }],
    ['Mi abuelita cuenta la historia.', { abuelita: [VERB3S('abuelitar')], historia: [NOUN('historia'), VERB3S('historiar')] }],
    ['Nosotros cantamos.', { cantamos: [NOUN('canto'), VERB3S('cantar')] }],
    ['No sé dónde está la casa.', { casa: [VERB3S('casar'), NOUN('casa')] }],
  ];

  it('the same lemma and part of speech per token, the same readings but for order, confidence and notes.context', () => {
    for (const [text, replaced] of CASES) {
      const { tokens, analyzed } = withDictionary(text, replaced);
      const out = refine(tokens, analyzed, both);
      expect(out).toHaveLength(analyzed.length);
      out.forEach((o, i) => {
        expect(o.token, text).toBe(analyzed[i].token);
        expect(o.analyzer, text).toBe(analyzed[i].analyzer);
        expect(multiset(o), `${text} / ${tokens[i].surface}`).toEqual(multiset(analyzed[i]));
        // each reading is the input reading but for confidence and notes.context
        const strip = (c: AnalysisCandidate) => { const { confidence: _c, notes, ...rest } = c; const { context: _x, ...n } = (notes ?? {}) as Record<string, unknown>; return JSON.stringify({ ...rest, notes: n }); };
        expect(o.candidates.map(strip).sort(), `${text} / ${tokens[i].surface}`).toEqual(analyzed[i].candidates.map(strip).sort());
        // no confidence rises above what the reading had before any ordering: for the adapter's own token that is its
        // context-free reading (analysing the word alone), for a dictionary token what it arrived with
        const free = analyzed[i].analyzer === OWN ? es.analyze([tokens[i]])[0].candidates : analyzed[i].candidates;
        o.candidates.forEach((c, k) => {
          const before = free.find((x) => strip(x) === strip(c))!;
          expect(c.confidence <= before.confidence, `${text} / ${tokens[i].surface} / ${k}`).toBe(true);
        });
      });
    }
  });

  it('does not change what it was given (the input readings are not mutated)', () => {
    const { tokens, analyzed } = withDictionary('Veo la sierra.', { sierra: [VERB3S('serrar'), NOUN('sierra')] });
    const snapshot = JSON.stringify(analyzed);
    refine(tokens, analyzed, both);
    expect(JSON.stringify(analyzed)).toBe(snapshot);
  });

  it('punctuation and a token no analyzer owns keep their (empty) readings', () => {
    const { tokens, analyzed } = analyzeText('¿Cómo estás? Muy bien.');
    const out = refine(tokens, analyzed, both);
    out.forEach((o, i) => { if (!tokens[i].isWord) expect(o.candidates).toEqual([]); });
  });
});

describe('refine: `given` — one of our own tokens with a dictionary reading put beside ours', () => {
  /** The sentence analysed by the adapter, with dictionary readings appended to the named words' own lists (the analyzer stays ours). */
  function withBeside(text: string, added: Record<string, AnalysisCandidate[]>) {
    const { tokens, analyzed } = analyzeText(text);
    const given = new Set<number>();
    const out = analyzed.map((a, i) => {
      const more = added[tokens[i].surface];
      if (!more) return a;
      given.add(i);
      return { ...a, candidates: [...a.candidates, ...more.map((c) => ({ ...c }))] };
    });
    return { tokens, analyzed: out, given };
  }

  it('the list is kept whole and ordered by its neighbours: la marcha (the noun), no marcha (the verb)', () => {
    const noun = withBeside('La marcha fue larga.', { marcha: [VERB3S('marchar')] });
    const i = at(noun.tokens, 'marcha');
    const out = refine(noun.tokens, noun.analyzed, both, noun.given);
    expect(order(out[i])).toEqual(['marcha/NOUN', 'marchar/VERB']);
    expect(out[i].analyzer).toBe(OWN);
    expect(out[i].candidates[0].origin).toBe('hand');
    expect(out[i].candidates[1]).toMatchObject({ origin: 'dictionary', sourceId: DICT });

    const verb = withBeside('No marcha bien.', { marcha: [VERB3S('marchar')] });
    const j = at(verb.tokens, 'marcha');
    const res = refine(verb.tokens, verb.analyzed, both, verb.given);
    expect(order(res[j])).toEqual(['marchar/VERB', 'marcha/NOUN']);
    expect(res[j].candidates[0].notes?.context).toMatch(/"no"/);
    expect(res[j].candidates[0]).toMatchObject({ origin: 'dictionary', confidence: 0.45 }); // moved, not rewritten
  });

  it('without `given` such a token starts again from the adapter\'s own readings (which is why the importer names it)', () => {
    const { tokens, analyzed } = withBeside('No marcha bien.', { marcha: [VERB3S('marchar')] });
    expect(order(refine(tokens, analyzed, both)[at(tokens, 'marcha')])).toEqual(['marcha/NOUN']);
  });

  it('nothing is added or dropped, and the other tokens are as without `given`', () => {
    const { tokens, analyzed, given } = withBeside('Ella cuenta la marcha.', { marcha: [VERB3S('marchar')], cuenta: [dictReading('cuento', 'NOUN', ['masculine', 'singular'])] });
    const out = refine(tokens, analyzed, both, given);
    out.forEach((o, i) => expect(multiset(o), tokens[i].surface).toEqual(multiset(analyzed[i])));
    expect(out[at(tokens, 'cuenta')].candidates[0]).toMatchObject({ lemma: 'contar', pos: 'VERB' }); // after its subject
    const plain = refine(tokens, analyzed, both);
    for (const k of [at(tokens, 'Ella'), at(tokens, 'la')]) expect(out[k]).toEqual(plain[k]);
  });

  it('the readings that are still ours start again: an earlier ordering (lowered confidence, a stale notes.context) does not leak', () => {
    const clean = withBeside('Pagó la cuenta.', { cuenta: [dictReading('cuento', 'NOUN', ['masculine', 'singular'])] });
    const i = at(clean.tokens, 'cuenta');
    const stale = clean.analyzed.map((a, k) => (k === i
      ? { ...a, candidates: [...a.candidates].reverse().map((c) => (c.origin === 'dictionary' ? c : { ...c, confidence: 0.1, notes: { ...(c.notes ?? {}), context: 'an earlier pass' } })) }
      : a));
    const a = refine(clean.tokens, clean.analyzed, both, clean.given);
    const b = refine(clean.tokens, stale, both, clean.given);
    expect(b[i]).toEqual(a[i]);
    expect(a[i].candidates[0]).toMatchObject({ lemma: 'cuenta', pos: 'NOUN', origin: 'hand' });
    expect(a[i].candidates.filter((c) => c.notes?.context)).toHaveLength(1);
    // the context-free confidence of the noun, not the 0.1 it arrived with
    expect(a[i].candidates[0].confidence).toBeGreaterThan(0.5);
  });

  it('a reading of ours that the importer changed (another gloss, another confidence) is kept as it came', () => {
    const { tokens, analyzed } = analyzeText('Pagó la cuenta.');
    const i = at(tokens, 'cuenta');
    const changed = analyzed.map((a, k) => (k === i
      ? { ...a, candidates: a.candidates.map((c) => (c.pos === 'NOUN' ? { ...c, confidence: 0.7, gloss: 'bill (from the lemma entry)' } : c)) }
      : a));
    const out = refine(tokens, changed, both, new Set([i]));
    const noun = out[i].candidates.find((c) => c.pos === 'NOUN')!;
    expect(noun.gloss).toBe('bill (from the lemma entry)'); // not swapped for the adapter's context-free copy
    expect(noun.confidence).toBeLessThanOrEqual(0.7);
    expect(multiset(out[i])).toEqual(multiset(changed[i]));
    expect(out[i].candidates[0].pos).toBe('NOUN'); // still ordered by the article before it
  });

  it('`given` never unlocks a token whose analyzer is not in the set, and an index that is not a word changes nothing', () => {
    const { tokens, analyzed, given } = withBeside('No marcha bien.', { marcha: [VERB3S('marchar')] });
    const i = at(tokens, 'marcha');
    expect(refine(tokens, analyzed, new Set([DICT]), given)[i]).toEqual(analyzed[i]);
    const dot = tokens.findIndex((t) => !t.isWord);
    const out = refine(tokens, analyzed, both, new Set([...given, dot]));
    expect(out[dot]).toEqual(analyzed[dot]);
    expect(order(out[i])).toEqual(['marchar/VERB', 'marcha/NOUN']);
  });

  it('with an empty `given` it is the same as with none: equal to analyze for our own tokens', () => {
    const { tokens, analyzed } = analyzeText('La abuela llena la jarra y cuenta una historia.');
    expect(refine(tokens, analyzed, new Set([OWN]), new Set())).toEqual(analyzed);
  });
});

describe('lemmaVariants: the other headword a dictionary may file a verb under', () => {
  const variants = (lemma: string, pos?: AnalysisCandidate['pos']) => es.lemmaVariants!(lemma, pos);

  it('a verb in -ar, -er, -ir, -ír: the pronominal headword', () => {
    expect(variants('arrepentir', 'VERB')).toEqual(['arrepentirse']);
    expect(variants('quejar', 'VERB')).toEqual(['quejarse']);
    expect(variants('atrever', 'VERB')).toEqual(['atreverse']);
    expect(variants('reír', 'VERB')).toEqual(['reírse']);
    expect(variants('ir', 'VERB')).toEqual(['irse']);
  });

  it('a lemma that already ends in -se: the bare verb', () => {
    expect(variants('arrepentirse', 'VERB')).toEqual(['arrepentir']);
    expect(variants('quejarse', 'VERB')).toEqual(['quejar']);
    expect(variants('atreverse', 'VERB')).toEqual(['atrever']);
    expect(variants('reírse', 'VERB')).toEqual(['reír']);
    expect(variants('quejarse')).toEqual(['quejar']); // no part of speech given: by the shape
  });

  it('anything else: none', () => {
    expect(variants('mujer', 'NOUN')).toEqual([]); // ends in -er but is not a verb
    expect(variants('base', 'NOUN')).toEqual([]);
    expect(variants('familiar', 'ADJ')).toEqual([]);
    expect(variants('clase', 'VERB')).toEqual([]); // -se that is not an infinitive with se
    expect(variants('casa', 'VERB')).toEqual([]);
    expect(variants('pues')).toEqual([]);
    expect(variants('ser', 'AUX')).toEqual([]);
  });
});
