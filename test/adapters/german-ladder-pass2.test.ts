/**
 * The second pass over the German ladder (adapter-de@8): the misreads the drafting agents of the 69 units reported, each with
 * its carrier sentence (what was read wrongly) and a negative (what must keep its reading). The word list is machine-drafted and
 * unchecked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';

const de = createAdapterRegistry().get('de')!;

/** The readings of `word` inside `text`, best first, as `lemma/POS` (a trailing ? marks an unconfirmed reading). */
function readings(text: string, word: string): string[] {
  const toks = de.tokenize(text);
  const an = de.analyze(toks);
  const i = toks.findIndex((t) => t.isWord && t.surface === word);
  expect(i, `${word} is a token of ${text}`).toBeGreaterThanOrEqual(0);
  return an[i].candidates.map((c) => `${c.lemma}/${c.pos}${c.unconfirmed ? '?' : ''}`);
}
const first = (text: string, word: string): string => readings(text, word)[0] ?? '(none)';

describe('1. separable verbs: zusammen and a particle in front of und', () => {
  it('zusammen at the end of a clause is the adverb unless the list holds the verb with it', () => {
    expect(first('Wie viel kostet das zusammen?', 'kostet')).toBe('kosten/VERB');
    expect(first('Wie viel kostet das zusammen?', 'zusammen')).toBe('zusammen/ADV');
    expect(first('Wir essen zusammen.', 'essen')).toBe('essen/VERB');
    expect(first('Wir singen zusammen.', 'singen')).toBe('singen/VERB');
    expect(first('Man isst zusammen, man singt, man liest.', 'isst')).toBe('essen/VERB');
    expect(first('Mein Bruder und ich verkaufen zusammen.', 'zusammen')).toBe('zusammen/ADV');
    // no guessed zusammen- unit anywhere among the readings
    expect(readings('Wir essen zusammen.', 'essen').some((r) => r.startsWith('zusammenessen'))).toBe(false);
  });

  it('the listed zusammen verbs still join', () => {
    expect(first('Wir arbeiten zusammen.', 'arbeiten')).toBe('zusammenarbeiten/VERB');
    expect(first('Wir fassen das kurz zusammen.', 'fassen')).toBe('zusammenfassen/VERB');
    expect(first('Sie stellen die Tische zusammen.', 'stellen')).toBe('zusammenstellen/VERB');
    expect(first('Sie halten immer zusammen.', 'halten')).toBe('zusammenhalten/VERB');
    expect(first('Die Brücke bricht zusammen.', 'bricht')).toBe('zusammenbrechen/VERB');
    expect(first('Wir arbeiten zusammen.', 'zusammen')).toBe('zusammenarbeiten/ADV');
  });

  it('a determiner is not the verb of a clause that has its own verb (Meine Pause ist gleich vorbei)', () => {
    expect(first('Meine Pause ist gleich vorbei.', 'Meine')).toBe('mein/DET');
    expect(first('Meine Pause ist gleich vorbei.', 'vorbei')).toBe('vorbei/ADV');
    expect(first('Meine Eltern kommen morgen vorbei.', 'kommen')).toBe('vorbeikommen/VERB');
  });

  it('a particle in front of und / oder and another verb joins its own verb', () => {
    expect(first('Sie wachen früh auf und waschen sich.', 'wachen')).toBe('aufwachen/VERB');
    expect(first('Sie wachen früh auf und waschen sich.', 'auf')).toBe('aufwachen/ADP');
    expect(first('Sie wachen früh auf und waschen sich.', 'waschen')).toBe('waschen/VERB');
    expect(first('Wir stellen die Stühle auf und legen die Bücher hin.', 'stellen')).toBe('aufstellen/VERB');
    expect(first('Wir stellen die Stühle auf und legen die Bücher hin.', 'legen')).toBe('hinlegen/VERB');
  });

  it('negatives: a stranded prefix of an unlisted verb is still offered; a noun pair is no stretch', () => {
    expect(first('Der Hund rennt heute voran.', 'rennt')).toBe('voranrennen/VERB?');
    expect(first('Wir kaufen Brot und Milch.', 'kaufen')).toBe('kaufen/VERB');
  });
});

describe('2. nächst "next" beside the superlative of nah', () => {
  it('nächste Woche, der nächste Zug, am nächsten Tag: nächst first, nah (nearest) behind it', () => {
    for (const [text, word] of [['Nächste Woche habe ich Zeit.', 'Nächste'], ['Wann kommt der nächste Zug?', 'nächste'], ['Am nächsten Tag sind wir gefahren.', 'nächsten'], ['Ich fahre nächstes Jahr.', 'nächstes']] as const) {
      const r = readings(text, word);
      expect(r[0], text).toBe('nächst/ADJ');
      expect(r, text).toContain('nah/ADJ');
    }
  });
  it('nah itself is unchanged', () => {
    expect(first('Der Bahnhof ist ganz nah.', 'nah')).toBe('nah/ADJ');
    expect(first('Das ist näher.', 'näher')).toBe('nah/ADJ');
  });
});

describe('3. Liebe: the salutation, the noun, the verb', () => {
  it('a capital Liebe before a name or a noun at the start is the adjective lieb', () => {
    expect(first('Liebe Anna, ich bin in Leipzig.', 'Liebe')).toBe('lieb/ADJ');
    expect(first('Liebe Frau Weber, danke für alles.', 'Liebe')).toBe('lieb/ADJ');
    expect(first('Liebe Freunde,', 'Liebe')).toBe('lieb/ADJ');
    expect(first('Liebe Grüße, Sam', 'Liebe')).toBe('lieb/ADJ');
    expect(first('Er schreibt: Liebe Anna, ich komme.', 'Liebe')).toBe('lieb/ADJ');
    expect(first('Meine liebe Anna, wie geht es dir?', 'liebe')).toBe('lieb/ADJ');
  });
  it('negatives: the noun and the verb keep their places', () => {
    expect(first('Die Liebe ist groß.', 'Liebe')).toBe('Liebe/NOUN');
    expect(first('Liebe ist stark.', 'Liebe')).toBe('Liebe/NOUN');
    expect(first('Gott ist Liebe.', 'Liebe')).toBe('Liebe/NOUN');
    expect(first('Ich liebe meine Freunde.', 'liebe')).toBe('lieben/VERB');
    expect(first('Liebe deinen Nächsten.', 'Liebe')).toBe('lieben/VERB');
  });
});

describe('4. Preise, gehört, weiß', () => {
  it('Preise is the noun Preis in the plural', () => {
    expect(first('Die Preise sind gut.', 'Preise')).toBe('Preis/NOUN');
    expect(first('Preise sind hoch.', 'Preise')).toBe('Preis/NOUN');
    expect(first('Wegen der Preise der Mieten suchen wir eine Unterkunft.', 'Preise')).toBe('Preis/NOUN');
  });
  it('gehört after haben and with no dative object is the participle of hören', () => {
    expect(first('Ich habe das gehört.', 'gehört')).toBe('hören/VERB');
    expect(first('Habt ihr die Musik gehört?', 'gehört')).toBe('hören/VERB');
    expect(first('Er hat von dem Unfall gehört.', 'gehört')).toBe('hören/VERB');
    expect(first('Ich habe ihn gesehen und gehört.', 'gehört')).toBe('hören/VERB');
    // the other reading stays available behind it
    expect(readings('Ich habe das gehört.', 'gehört')).toContain('gehören/VERB');
  });
  it('negatives: gehört of belonging stays gehören', () => {
    expect(first('Das Buch gehört mir.', 'gehört')).toBe('gehören/VERB');
    expect(first('Dieses Buch gehört meinem Mann.', 'gehört')).toBe('gehören/VERB');
    expect(first('Das Haus hat meinem Vater gehört.', 'gehört')).toBe('gehören/VERB');
  });
  it('weiß as a colour is the adjective, as a verb form it is wissen', () => {
    expect(first('Die Wand ist rot und weiß.', 'weiß')).toBe('weiß/ADJ');
    expect(first('Sie sind rot, blau, weiß und gelb.', 'weiß')).toBe('weiß/ADJ');
    expect(first('Das Hemd ist weiß.', 'weiß')).toBe('weiß/ADJ');
    expect(first('Er war weiß und rot.', 'weiß')).toBe('weiß/ADJ');
    expect(first('Ich weiß nicht.', 'weiß')).toBe('wissen/VERB');
    expect(first('Er ist nervös und weiß es nicht.', 'weiß')).toBe('wissen/VERB');
    expect(first('Sie ist müde und geht nach Hause.', 'geht')).toBe('gehen/VERB');
  });
});

describe('5. adjectives, adverbs and nouns that had no reading', () => {
  it('every word has a confirmed reading with its own lemma', () => {
    const adjectives = ['streng', 'vorsichtig', 'deutlich', 'klar', 'fair', 'nervös', 'großzügig', 'verständlich', 'gültig', 'niedrig', 'selbstständig', 'riesig', 'sprachlos', 'gleichzeitig', 'gütig', 'vernünftig', 'sorgfältig', 'ungewöhnlich', 'abhängig', 'egal'];
    for (const w of adjectives) expect(first(`Das ist ${w}.`, w), w).toBe(`${w}/ADJ`);
    for (const w of ['ohnehin', 'zugleich', 'drin', 'los', 'nachmittags']) expect(first(`Das ist ${w}.`, w), w).toBe(`${w}/ADV`);
    expect(first('Ich brauche ein paar Euro.', 'paar')).toBe('paar/DET');
    expect(first('Wir fahren mit dem Rad.', 'Rad')).toBe('Rad/NOUN');
  });
  it('inflected forms keep the lemma', () => {
    expect(first('Das ist ein vorsichtiger Mann.', 'vorsichtiger')).toBe('vorsichtig/ADJ');
    expect(first('Es gibt einen deutlichen Fortschritt.', 'deutlichen')).toBe('deutlich/ADJ');
    expect(first('Je mehr ich spreche, desto klarer wird alles.', 'klarer')).toBe('klar/ADJ');
  });
  it('words that were listed already stay as they were', () => {
    expect(first('Die Bäckerei ist neu.', 'Bäckerei')).toBe('Bäckerei/NOUN');
    expect(first('Man kann hier essen.', 'Man')).toBe('man/PRON');
    expect(first('Der Ball ist rund.', 'Ball')).toBe('Ball/NOUN');
    expect(first('Viele Grüße', 'Grüße')).toBe('Gruß/NOUN');
    expect(first('Eine Frage, bitte.', 'Frage')).toBe('Frage/NOUN');
    expect(readings('Der Weg ist weiter als gedacht.', 'weiter')).toEqual(expect.arrayContaining(['weiter/ADV', 'weit/ADJ']));
  });
});

describe('6. wrong lemmas', () => {
  it('each form has the lemma a dictionary gives', () => {
    for (const [text, word, want] of [
      ['Das klingt kompliziert.', 'kompliziert', 'kompliziert/ADJ'],
      ['Das Fenster ist dicht.', 'dicht', 'dicht/ADJ'],
      ['Am Morgen lag dichter Nebel über dem Dorf.', 'dichter', 'dicht/ADJ'],
      ['Er wohnt im selben Haus wie derselbe Mann.', 'derselbe', 'derselbe/DET'],
      ['Sie hat dieselbe Jacke wie ich.', 'dieselbe', 'derselbe/DET'],
      ['Das ist dasselbe.', 'dasselbe', 'derselbe/DET'],
      ['Er wohnt auf derselben Station.', 'derselben', 'derselbe/DET'],
      ['Man hört auch öfter, dass jemand kommt.', 'öfter', 'oft/ADJ'],
      ['Ich würde jederzeit wieder gehen.', 'jederzeit', 'jederzeit/ADV'],
      ['Alles liegt nah beieinander.', 'beieinander', 'beieinander/ADV'],
      ['Der Bedarf des Teams ist unverändert.', 'unverändert', 'unverändert/ADJ'],
      ['Ich habe Ihnen längst vergeben.', 'längst', 'längst/ADV'],
      ['Wer von den dreien war es?', 'dreien', 'drei/NUM'],
      ['Gott behüte dich.', 'behüte', 'behüten/VERB'],
      ['Er hat eine Bescheinigung dazugelegt.', 'dazugelegt', 'dazulegen/VERB'],
      ['Wir legen etwas dazu.', 'legen', 'dazulegen/VERB'],
    ] as const) expect(first(text, word), `${word} in ${text}`).toBe(want);
  });
});

describe('7. towns, countries and compounds', () => {
  it('a town the list names is a proper noun', () => {
    for (const w of ['Meißen', 'Naumburg', 'Bamberg', 'Würzburg', 'Görlitz', 'Bautzen', 'Quedlinburg', 'Erfurt', 'Zwickau', 'Dänemark', 'Schweden']) {
      expect(first(`Wir sind nach ${w} gefahren.`, w), w).toBe(`${w}/PROPN`);
    }
  });
  it('Polen is the country after a preposition; Die Polen stays the people', () => {
    expect(first('Sie kamen aus Polen, aus Spanien und aus Frankreich.', 'Polen')).toBe('Polen/PROPN');
    expect(first('Wir fahren nach Polen.', 'Polen')).toBe('Polen/PROPN');
    expect(first('Die Polen sind nett.', 'Polen')).toBe('Pole/NOUN');
  });
  it('a compound of known parts is split into them (the mechanism of compounds.ts)', () => {
    for (const [text, word, part] of [
      ['Das ist eine Plastikflasche.', 'Plastikflasche', 'Flasche'],
      ['Die Pfandflasche ist leer.', 'Pfandflasche', 'Flasche'],
      ['Meine Heimatgemeinde ist klein.', 'Heimatgemeinde', 'Gemeinde'],
      ['Ich brauche eine Aufenthaltserlaubnis.', 'Aufenthaltserlaubnis', 'Erlaubnis'],
    ] as const) {
      const toks = de.tokenize(text);
      const c = de.analyze(toks)[toks.findIndex((t) => t.surface === word)].candidates[0];
      expect(c.parts?.some((p) => p.lemma === part), word).toBe(true);
    }
  });
});
