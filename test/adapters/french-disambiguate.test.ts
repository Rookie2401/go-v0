/**
 * French readings ordered by their neighbours (src/adapters/french/disambiguate.ts), through the real adapter.
 * For every rule one sentence where it decides and a near miss where it must not (or decides the other way); then the
 * invariants: the SET of readings never changes, `notes.context` is set only on a reading that was moved, and the order is
 * left alone where nothing decides. The sentences are this file's own, not the fixtures'. Machine-drafted, not native-reviewed.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisCandidate, RawToken } from '../../src/core';

const seen = vi.hoisted(() => ({ calls: [] as Array<{ before: AnalysisCandidate[]; after: AnalysisCandidate[] }>, record: false }));
vi.mock('../../src/adapters/french/disambiguate', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/adapters/french/disambiguate')>();
  return {
    ...real,
    disambiguateFrench: (i: number, tokens: RawToken[], base: AnalysisCandidate[][]) => {
      const before = base[i].map((c) => JSON.parse(JSON.stringify(c)) as AnalysisCandidate);
      const after = real.disambiguateFrench(i, tokens, base);
      if (seen.record) seen.calls.push({ before, after });
      return after;
    },
  };
});

import { frAdapter } from '../../src/adapters/fr';
import { FRENCH_CONTEXT_RULES } from '../../src/adapters/french/disambiguate';

/** The readings of `target` (its n-th occurrence) in `sentence`, in the order the adapter gives them. */
function readings(sentence: string, target: string, occurrence = 1): AnalysisCandidate[] {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  const want = frAdapter.normalize(target);
  let n = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isWord && tokens[i].normalized === want && ++n === occurrence) return analyses[i].candidates;
  }
  throw new Error(`${target} not in ${sentence}`);
}
const first = (sentence: string, target: string, occurrence = 1) => readings(sentence, target, occurrence)[0];
const sig = (c: AnalysisCandidate | undefined) => (c ? `${c.lemma}/${c.pos}` : '(none)');
const has = (c: AnalysisCandidate, k: string, v: string) => (c.morph[k] ?? '').split(',').includes(v);

describe('French disambiguation: the rules, each with a near miss', () => {
  it('lists its rules by name', () => {
    expect(FRENCH_CONTEXT_RULES.length).toBeGreaterThan(15);
    expect(new Set(FRENCH_CONTEXT_RULES).size).toBe(FRENCH_CONTEXT_RULES.length);
  });

  it('le / la / les / l\': object pronoun before a verb, article before a noun', () => {
    expect(sig(first('Paul la regarde souvent.', 'la'))).toBe('le/PRON');
    expect(sig(first('Paul regarde la mer.', 'la'))).toBe('le/DET');
    expect(sig(first('Tu l\'écoutes.', 'l\''))).toBe('le/PRON');
    expect(sig(first('Tu écoutes l\'oiseau.', 'l\''))).toBe('le/DET');
    expect(sig(first('Nous les avons cherchés.', 'les'))).toBe('le/PRON');
    expect(sig(first('Nous avons cherché les clés.', 'les'))).toBe('le/DET');
  });

  it('a pronoun after a command and its hyphen', () => {
    expect(sig(first('Prends-la avec toi !', 'la'))).toBe('le/PRON');
    expect(sig(first('Prends la boîte avec toi !', 'la'))).toBe('le/DET');
  });

  it('leur: dative pronoun before a verb, possessive before a noun', () => {
    expect(first('Nous leur écrivons.', 'leur')).toMatchObject({ pos: 'PRON', morph: expect.objectContaining({ Case: 'Dat' }) });
    expect(first('Leur jardin est grand.', 'leur').pos).toBe('DET');
  });

  it('en: pronoun between the subject and the verb, preposition before a noun or a participle', () => {
    expect(sig(first('Tu en manges trop.', 'en'))).toBe('en/PRON');
    expect(sig(first('Il habite en Suisse.', 'en'))).toBe('en/ADP');
    expect(sig(first('Elle sourit en parlant.', 'en'))).toBe('en/ADP');
  });

  it('s\': si before il / ils, se before a verb', () => {
    expect(sig(first('S\'ils partent, je reste.', 's\''))).toBe('si/SCONJ');
    expect(sig(first('Elle s\'habille vite.', 's\''))).toBe('se/PRON');
  });

  it('si: "if" before a subject, "so" before an adjective', () => {
    expect(sig(first('Si nous partons, tu restes.', 'si'))).toBe('si/SCONJ');
    expect(sig(first('Il est si gentil.', 'si'))).toBe('si/ADV');
  });

  it('que: conjunction after a verb, relative after a noun, "only" in ne … que, comparison', () => {
    expect(sig(first('Elle croit que tu mens.', 'que'))).toBe('que/SCONJ');
    expect(sig(first('La lettre que tu lis est longue.', 'que'))).toBe('que/PRON');
    expect(sig(first('Il ne boit que de l\'eau.', 'que'))).toBe('que/ADV');
    expect(sig(first('Il est plus petit que moi.', 'que'))).toBe('que/SCONJ');
    expect(sig(first('Est-ce que tu dors ?', 'que'))).toBe('que/SCONJ');
    expect(sig(first('Que veux-tu ?', 'que'))).toBe('que/PRON');
  });

  it('ce: pronoun before a verb or a relative, determiner before a noun', () => {
    expect(sig(first('Ce sont mes amis.', 'ce'))).toBe('ce/PRON');
    expect(sig(first('Ce qui brille est beau.', 'ce'))).toBe('ce/PRON');
    expect(sig(first('Ce chien dort.', 'ce'))).toBe('ce/DET');
  });

  it('tout: adverb before an adjective, pronoun before a verb, determiner before an article', () => {
    expect(sig(first('Il est tout content.', 'tout'))).toBe('tout/ADV');
    expect(sig(first('Tout va bien.', 'tout'))).toBe('tout/PRON');
    expect(sig(first('Tout le village dort.', 'tout'))).toBe('tout/DET');
  });

  it('même: "even" before what it stresses, left alone after a determiner', () => {
    expect(sig(first('Même les enfants rient.', 'même'))).toBe('même/ADV');
    expect(first('Ils ont le même âge.', 'même').pos).not.toBe('ADV');
  });

  it('du / des: de + the article after a word that takes de, the article after a verb of eating', () => {
    expect(sig(first('Il sort du cinéma.', 'du'))).toBe('du/ADP');
    expect(first('Il boit du lait.', 'du').pos).toBe('DET');
    expect(sig(first('Le toit des maisons est rouge.', 'des'))).toBe('des/ADP');
    expect(first('Des oiseaux chantent.', 'des').pos).toBe('DET');
  });

  it('a verb before its inverted subject', () => {
    const r = first('Porte-t-il un chapeau ?', 'porte');
    expect(r.pos).toBe('VERB');
    expect(has(r, 'Person', '3')).toBe(true);
    expect(first('La porte est ouverte.', 'porte').pos).toBe('NOUN');
  });

  it('the past participle after avoir or être, the noun after a determiner', () => {
    expect(first('Nous avons fait un gâteau.', 'fait')).toMatchObject({ lemma: 'faire', morph: expect.objectContaining({ VerbForm: 'Part' }) });
    expect(sig(first('Le fait est clair.', 'fait'))).toBe('fait/NOUN');
    expect(first('Elle est sortie tôt.', 'sortie')).toMatchObject({ lemma: 'sortir', morph: expect.objectContaining({ VerbForm: 'Part' }) });
  });

  it('a noun after a determiner, a verb after its subject pronoun', () => {
    expect(first('Une montre coûte cher.', 'montre').pos).toBe('NOUN');
    expect(first('Elle montre le chemin.', 'montre').pos).toBe('VERB');
    const marches = first('Tu marches vite.', 'marches');
    expect(marches.lemma).toBe('marcher');
    expect(has(marches, 'Person', '2')).toBe(true);
    expect(first('Les marches sont hautes.', 'marches').pos).toBe('NOUN');
  });

  it('the person of the subject picks the verb cell (vous dites: present, not the participle)', () => {
    const r = first('Vous dites la vérité.', 'dites');
    expect(r.morph.VerbForm).toBe('Fin');
    expect(has(r, 'Person', '2')).toBe(true);
    expect(first('Ces choses dites, il partit.', 'dites').morph.VerbForm).not.toBe('Fin');
  });

  it('a verb after ne or an object pronoun', () => {
    expect(first('Je te livre le paquet.', 'livre').pos).toBe('VERB');
    expect(first('Je te donne le livre.', 'livre').pos).toBe('NOUN');
    expect(first('Il ne ferme jamais.', 'ferme').pos).toBe('VERB');
  });

  it('a verb after qui', () => {
    expect(first('L\'homme qui ferme la porte.', 'ferme').pos).toBe('VERB');
    expect(first('Une ferme isolée.', 'ferme').pos).toBe('NOUN');
  });

  it('after a preposition: the infinitive, the participle after en, the noun', () => {
    expect(first('Il apprend à écrire.', 'écrire').morph.VerbForm).toBe('Inf');
    expect(sig(first('Il fait chaud en été.', 'été'))).toBe('été/NOUN');
    expect(first('Il a été malade.', 'été').lemma).toBe('être');
  });

  it('a command at the start of a clause', () => {
    expect(first('Ferme la porte !', 'ferme').morph.Mood).toBe('Imp');
    expect(first('Il ferme la porte.', 'ferme').morph.Mood).toBe('Ind');
    expect(first('Regarde-moi.', 'regarde').morph.Mood).toBe('Imp');
    expect(first('Regardes-tu la télé ?', 'regardes').morph.Mood).toBe('Ind');
  });

  it('a verb after a noun subject; a noun after its determiner', () => {
    expect(sig(first('Ce bruit nuit au sommeil.', 'nuit'))).toBe('nuire/VERB');
    expect(sig(first('La nuit tombe.', 'nuit'))).toBe('nuit/NOUN');
  });

  it('the adverb after a verb, the noun after a determiner', () => {
    expect(sig(first('Elle chante bien.', 'bien'))).toBe('bien/ADV');
    expect(sig(first('Le bien et le mal.', 'bien'))).toBe('bien/NOUN');
  });

  it('the subjunctive after il faut que, the indicative elsewhere', () => {
    expect(first('Il faut que vous chantiez.', 'chantiez').morph.Mood).toBe('Sub');
    expect(first('Vous chantiez souvent.', 'chantiez').morph.Mood).toBe('Ind');
    expect(first('Je veux que tu partes.', 'partes').morph.Mood).toBe('Sub');
  });

  it('the passé simple where the sentence tells a story in the past', () => {
    expect(first('Il finit son verre et partit.', 'finit').morph.Tense).toBe('Past');
    expect(first('Il finit son verre.', 'finit').morph.Tense).toBe('Pres');
  });

  it('leaves a capitalised name alone', () => {
    const r = readings('Nous visitons Vienne demain.', 'Vienne');
    expect(r[0].notes?.context).toBeUndefined();
  });
});

const CORPUS = [
  'Je le lui donne demain.', 'Il me l\'a dit hier.', 'La porte de la maison est ouverte.', 'Il porte un manteau bleu.',
  'Elle est arrivée hier soir.', 'Les lettres que j\'ai écrites sont parties.', 'Je ne mange que du pain.', 'Il y en a trois.',
  'Donne-le-moi !', 'Est-ce que tu viens ?', 'Viens-tu avec nous ?', 'Il faut que tu partes.', 'Elle finit son repas, puis elle sortit.',
  'Le livre dont je parle est bon.', 'La ville où je vis est belle.', 'Il vient du marché.', 'Il mange du pain.', 'Les enfants qui jouent rient.',
  'Si tu viens, je pars.', 'S\'il pleut, nous restons.', 'Il est si grand.', 'Tout est fini.', 'Il est tout petit.', 'Même lui le sait.',
  'Je sais que tu viens.', 'Elle est plus grande que lui.', 'Ce n\'est pas vrai.', 'C\'est la vie.', 'L\'été est chaud.', 'Il a été malade.',
  'J\'en veux deux.', 'Il habite en France.', 'Je leur parle souvent.', 'Leur maison est grande.', 'Nous nous sommes levés tôt.',
  'Ils se sont parlé.', 'La maison est vendue.', 'Il fut reçu par le roi.', 'Quand il eut fini, il sortit.', 'Je vais manger.',
  'Il vient de partir.', 'Elle est en train de lire.', 'Il chante en marchant.', 'Je sais pas.', 'Personne ne vient.',
  'Il ne pouvait point sortir.', 'Ces sommes sont grandes.', 'Les avions volent haut.', 'Ce bruit nuit à la santé.', 'Ferme la fenêtre !',
];

describe('French disambiguation: invariants', () => {
  it('never changes the set of readings (50 sentences)', () => {
    seen.calls.length = 0;
    seen.record = true;
    try { for (const s of CORPUS) frAdapter.analyze(frAdapter.tokenize(s)); } finally { seen.record = false; }
    expect(CORPUS.length).toBe(50);
    expect(seen.calls.length).toBeGreaterThan(200);
    const key = (c: AnalysisCandidate) => {
      const { confidence: _c, notes, ...rest } = c;
      const { context: _x, ...kept } = notes ?? {};
      return JSON.stringify({ ...rest, notes: kept });
    };
    for (const { before, after } of seen.calls) {
      expect(after.map(key).sort()).toEqual(before.map(key).sort());
    }
  });

  it('sets notes.context only on a reading it moved to the front, and moved something on many words', () => {
    seen.calls.length = 0;
    seen.record = true;
    try { for (const s of CORPUS) frAdapter.analyze(frAdapter.tokenize(s)); } finally { seen.record = false; }
    let moved = 0;
    for (const { before, after } of seen.calls) {
      expect(before.some((c) => c.notes?.context)).toBe(false);
      after.slice(1).forEach((c) => expect(c.notes?.context).toBeUndefined());
      if (after[0]?.notes?.context) {
        moved++;
        expect(typeof after[0].notes.context).toBe('string');
        expect(JSON.stringify({ ...after[0], notes: undefined, confidence: 0 })).not.toBe(JSON.stringify({ ...before[0], notes: undefined, confidence: 0 }));
      } else {
        // nothing moved: the order is exactly as it came
        expect(after.map((c) => `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}`)).toEqual(before.map((c) => `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}`));
      }
    }
    expect(moved).toBeGreaterThan(20);
  });
});
