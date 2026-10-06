/**
 * The words the German ladder plan (data/ladder/de/PLAN.md, sections 6 and 7) needs: its planned lemmas that the word list
 * lacked, the names of its cast and places, and the trip points it measured (wrong first readings, E-Mail, tut weh, the
 * feminine -in). The word list is machine-drafted and unchecked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';

const de = createAdapterRegistry().get('de')!;

/** The first reading (lemma, part of speech) of `word` inside `text`, as the ladder gate reads it. */
function first(text: string, word: string): string {
  const toks = de.tokenize(text);
  const an = de.analyze(toks);
  const i = toks.findIndex((t) => t.isWord && t.surface === word);
  expect(i, `${word} is a token of ${text}`).toBeGreaterThanOrEqual(0);
  const c = an[i].candidates[0];
  return c ? `${c.lemma}/${c.pos}` : '(none)';
}

describe('words of the ladder plan that were not in the list', () => {
  it('a noun keeps one lemma in its plural and genitive (Kurs, Kurse, Kurses)', () => {
    expect(first('Der Kurs ist gut.', 'Kurs')).toBe('Kurs/NOUN');
    expect(first('Die Kurse sind gut.', 'Kurse')).toBe('Kurs/NOUN');
    expect(first('Das ist das Ende des Kurses.', 'Kurses')).toBe('Kurs/NOUN');
    expect(first('Wir sprechen mit den Praxen.', 'Praxen')).toBe('Praxis/NOUN');
    expect(first('Die Mülltonnen stehen draußen.', 'Mülltonnen')).toBe('Mülltonne/NOUN');
  });

  it('a verb keeps one lemma in the participle and the imperative (beachtet, vermisst)', () => {
    expect(first('Wir haben es beachtet.', 'beachtet')).toBe('beachten/VERB');
    expect(first('Beachte das!', 'Beachte')).toBe('beachten/VERB');
    expect(first('Er hat uns vermisst.', 'vermisst')).toBe('vermissen/VERB');
    expect(first('Er hat das Auto ausgetauscht.', 'ausgetauscht')).toBe('austauschen/VERB');
    // a separable verb: the particle is a token of the verb
    expect(first('Er stellt das Auto ab.', 'ab')).toMatch(/^abstellen\//);
  });

  it('der Leiter (leader) and die Leiter (ladder) are both listed; Erbe has both genders', () => {
    expect(first('Die Leiter steht im Treppenhaus.', 'Leiter')).toBe('Leiter/NOUN');
    expect(first('Das Erbe ist groß.', 'Erbe')).toBe('Erbe/NOUN');
  });
});

describe('names', () => {
  it('names that had no reading or were read as common nouns are proper nouns', () => {
    for (const name of ['Sam', 'Ben', 'Tim', 'Jan', 'Ute', 'Marta', 'Elena', 'Müller', 'Hannover', 'Freiburg', 'Katharina']) {
      expect(first(`Das ist ${name}.`, name), name).toBe(`${name}/PROPN`);
    }
  });

  it('a name that is also a noun is read as the name after a title, a first name or a place preposition, as the noun elsewhere', () => {
    expect(first('Herr Koch kommt.', 'Koch')).toBe('Koch/PROPN');
    expect(first('Familie Keller wohnt hier.', 'Keller')).toBe('Keller/PROPN');
    expect(first('Anna Wolf kommt.', 'Wolf')).toBe('Wolf/PROPN');
    expect(first('Wir fahren nach Halle.', 'Halle')).toBe('Halle/PROPN');
    expect(first('Frau Dr. Richter kommt.', 'Richter')).toBe('Richter/PROPN');
    expect(first('Der Koch kocht.', 'Koch')).toBe('Koch/NOUN');
    expect(first('Der Keller ist kalt.', 'Keller')).toBe('Keller/NOUN');
    expect(first('Die Halle ist groß.', 'Halle')).toBe('Halle/NOUN');
    expect(first('Annas Keller ist groß.', 'Keller')).toBe('Keller/NOUN');
  });

  it('a name is a name only with a capital letter: Klein ist er nicht is the adjective', () => {
    expect(first('Klein ist er nicht.', 'Klein')).toBe('klein/ADJ');
    expect(first('Das Haus ist klein.', 'klein')).toBe('klein/ADJ');
  });
});

describe('the trip points of the plan, section 7', () => {
  it('Meister, kaputt, fest have their own readings', () => {
    expect(first('Der Meister kommt.', 'Meister')).toBe('Meister/NOUN');
    expect(first('Das Auto ist kaputt.', 'kaputt')).toBe('kaputt/ADJ');
    expect(first('Das Holz ist fest.', 'fest')).toBe('fest/ADJ');
  });

  it('tut weh is one verb (wehtun), tut mir leid is leidtun', () => {
    expect(first('Mein Kopf tut weh.', 'tut')).toBe('wehtun/VERB');
    expect(first('Mein Kopf tut weh.', 'weh')).toMatch(/^wehtun\//);
    expect(first('Es tut mir leid.', 'leid')).toMatch(/^leidtun\//);
  });

  it('E-Mail is one token, with its plural', () => {
    const words = de.tokenize('Ich schreibe eine E-Mail an Anna.').filter((t) => t.isWord).map((t) => t.surface);
    expect(words).toEqual(['Ich', 'schreibe', 'eine', 'E-Mail', 'an', 'Anna']);
    expect(first('Ich schreibe eine E-Mail.', 'E-Mail')).toBe('E-Mail/NOUN');
    expect(first('Er liest viele E-Mails.', 'E-Mails')).toBe('E-Mail/NOUN');
    expect(first('Die U-Bahn fährt.', 'U-Bahn')).toBe('U-Bahn/NOUN');
    // offsets stay exact
    const t = de.tokenize('Eine E-Mail-Adresse.').find((x) => x.surface.startsWith('E-'))!;
    expect(t.surface).toBe('E-Mail-Adresse');
    expect('Eine E-Mail-Adresse.'.slice(t.start, t.end)).toBe('E-Mail-Adresse');
  });

  it('feminine -in is its own lemma (Lehrerin), with the plural tied to it, also for a masculine the list holds only by derivation', () => {
    expect(first('Die Lehrerin kommt.', 'Lehrerin')).toBe('Lehrerin/NOUN');
    expect(first('Die Lehrerinnen kommen.', 'Lehrerinnen')).toBe('Lehrerin/NOUN');
    expect(first('Die Mechanikerinnen arbeiten.', 'Mechanikerinnen')).toBe('Mechanikerin/NOUN');
    expect(first('Die Köchin kocht.', 'Köchin')).toBe('Köchin/NOUN');
    expect(first('Die Kassiererinnen arbeiten.', 'Kassiererinnen')).toBe('Kassiererin/NOUN');
  });

  it('a nominalised adjective is its own lemma, in every form', () => {
    expect(first('Der Kranke ist hier.', 'Kranke')).toBe('Kranke/NOUN');
    expect(first('Die Kranken sind hier.', 'Kranken')).toBe('Kranke/NOUN');
    expect(first('Ein Kranker kommt.', 'Kranker')).toBe('Kranke/NOUN');
  });
});
