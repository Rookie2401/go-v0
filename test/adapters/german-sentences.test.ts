/** German sentence segmentation: abbreviations, ordinal dots, quotations, ellipses, verse lines; every span slices the input exactly. */
import { describe, expect, it } from 'vitest';
import { segmentGermanSentences as constructionsSplit } from '../../src/adapters/german/constructions';
import { GERMAN_ABBREVIATIONS, segmentGermanSentences } from '../../src/adapters/german/sentences';

const split = (t: string): string[] => segmentGermanSentences(t).map((s) => s.text);

const CASES: Array<[name: string, text: string, expected: string[]]> = [
  ['plain full stops', 'Das ist gut. Das ist schlecht.', ['Das ist gut.', 'Das ist schlecht.']],
  ['question then exclamation', 'Wie geht es dir? Gut!', ['Wie geht es dir?', 'Gut!']],
  ['the old splitter\'s case', 'Am 3. Mai kam er. Dr. Müller blieb. Was denn? Nichts.', ['Am 3. Mai kam er.', 'Dr. Müller blieb.', 'Was denn?', 'Nichts.']],
  ['date with year', 'Er kam am 3. Mai 1990 nach Berlin. Sie blieb.', ['Er kam am 3. Mai 1990 nach Berlin.', 'Sie blieb.']],
  ['ordinal before a noun', 'Im 19. Jahrhundert war das anders. Heute nicht.', ['Im 19. Jahrhundert war das anders.', 'Heute nicht.']],
  ['date before a month at the end', 'Wir treffen uns am 24. Dezember. Dann feiern wir.', ['Wir treffen uns am 24. Dezember.', 'Dann feiern wir.']],
  ['date with year and month', 'Er wurde am 5. Juli 1950 geboren. Er starb 2010.', ['Er wurde am 5. Juli 1950 geboren.', 'Er starb 2010.']],
  ['roman ordinal before a lower-case word', 'Friedrich II. von Preußen starb 1786. Danach kam sein Neffe.', ['Friedrich II. von Preußen starb 1786.', 'Danach kam sein Neffe.']],
  ['roman ordinal at the end of a name', 'Ludwig XIV. regierte lange. Er starb 1715.', ['Ludwig XIV. regierte lange.', 'Er starb 1715.']],
  ['a number that ends a sentence', 'Sie wurde 25. Der Zug fuhr ab.', ['Sie wurde 25.', 'Der Zug fuhr ab.']],
  ['a page number that ends a sentence', 'Seite 3. Dann geht es weiter.', ['Seite 3.', 'Dann geht es weiter.']],
  ['a house number that ends a sentence', 'Er wohnt in der Hauptstraße 3. Dort ist es ruhig.', ['Er wohnt in der Hauptstraße 3.', 'Dort ist es ruhig.']],
  ['a year that ends a sentence before a name', 'Im Jahr 1990. Berlin war geteilt.', ['Im Jahr 1990.', 'Berlin war geteilt.']],
  ['a list marker is not a sentence', '1. Das erste Kapitel.', ['1. Das erste Kapitel.']],
  ['decimal numbers and times', 'Der Preis beträgt 3.50 Euro. Er kommt um 12.30 Uhr an.', ['Der Preis beträgt 3.50 Euro.', 'Er kommt um 12.30 Uhr an.']],
  ['z. B.', 'Das kostet z. B. fünf Euro. Das ist teuer.', ['Das kostet z. B. fünf Euro.', 'Das ist teuer.']],
  ['d. h.', 'Es gibt viele Tiere, d. h. Hunde und Katzen. Das ist alles.', ['Es gibt viele Tiere, d. h. Hunde und Katzen.', 'Das ist alles.']],
  ['z. B. before a capital', 'Er mag Tiere, z. B. Hunde. Sie nicht.', ['Er mag Tiere, z. B. Hunde.', 'Sie nicht.']],
  ['Prof. Dr.', 'Prof. Dr. Meier hält einen Vortrag. Alle kommen.', ['Prof. Dr. Meier hält einen Vortrag.', 'Alle kommen.']],
  ['Nr. and Bd.', 'Siehe Nr. 5 und Bd. 2. Weiter unten.', ['Siehe Nr. 5 und Bd. 2.', 'Weiter unten.']],
  ['ca.', 'Es kamen ca. 50 Leute. Alle waren müde.', ['Es kamen ca. 50 Leute.', 'Alle waren müde.']],
  ['usw. closes a sentence before a capital', 'Er kaufte Äpfel, Birnen usw. Dann ging er heim.', ['Er kaufte Äpfel, Birnen usw.', 'Dann ging er heim.']],
  ['usw. in the middle', 'Er kaufte Äpfel, Birnen usw. und ging heim.', ['Er kaufte Äpfel, Birnen usw. und ging heim.']],
  ['etc.', 'Er kaufte Brot, Käse etc. Danach schlief er.', ['Er kaufte Brot, Käse etc.', 'Danach schlief er.']],
  ['v. Chr. closes a sentence before a capital', 'Das war 44 v. Chr. Danach änderte sich alles.', ['Das war 44 v. Chr.', 'Danach änderte sich alles.']],
  ['n. Chr. before a lower-case word', 'Im Jahr 79 n. Chr. brach der Vesuv aus. Viele starben.', ['Im Jahr 79 n. Chr. brach der Vesuv aus.', 'Viele starben.']],
  ['vgl. and evtl. and S.', 'Das gilt vgl. S. 12 und evtl. S. 14. Weiter.', ['Das gilt vgl. S. 12 und evtl. S. 14.', 'Weiter.']],
  ['St. Fr. Hr.', 'Herr Schmidt kommt aus St. Gallen. Fr. Müller und Hr. Meyer kamen auch. Es regnete.', ['Herr Schmidt kommt aus St. Gallen.', 'Fr. Müller und Hr. Meyer kamen auch.', 'Es regnete.']],
  ['initials', 'Ich lese ein Buch von J. S. Bach. Er war Komponist.', ['Ich lese ein Buch von J. S. Bach.', 'Er war Komponist.']],
  ['a capital letter that ends a sentence', 'Das ist Plan B. Die Kosten steigen.', ['Das ist Plan B.', 'Die Kosten steigen.']],
  ['direct speech after a colon', 'Er sagte: „Komm her!“ Dann ging er.', ['Er sagte: „Komm her!“', 'Dann ging er.']],
  ['direct speech with two sentences after a colon stays whole', 'Er sagte: „Ich komme. Du bleibst.“ Dann ging er.', ['Er sagte: „Ich komme. Du bleibst.“', 'Dann ging er.']],
  ['a reporting clause after a comma', '„Komm!“, sagte er. Er ging.', ['„Komm!“, sagte er.', 'Er ging.']],
  ['a reporting clause after a question mark', '„Kommst du?“ fragte sie. „Ja“, sagte er.', ['„Kommst du?“ fragte sie.', '„Ja“, sagte er.']],
  ['a quotation split by the reporting clause', '„Nein“, sagte sie, „das glaube ich nicht.“ Er schwieg.', ['„Nein“, sagte sie, „das glaube ich nicht.“', 'Er schwieg.']],
  ['guillemets », «', '»Komm!« sagte er. Sie kam.', ['»Komm!« sagte er.', 'Sie kam.']],
  ['a quotation inside a sentence', 'Sie las „Faust. Der Tragödie erster Teil“ und lachte.', ['Sie las „Faust. Der Tragödie erster Teil“ und lachte.']],
  ['a quotation with an exclamation inside a sentence', 'Er rief „Hilfe!“ und rannte weg. Niemand hörte ihn.', ['Er rief „Hilfe!“ und rannte weg.', 'Niemand hörte ihn.']],
  ['single quotes ‚ ‘', 'Er sagte ‚Hallo‘ und ging. Sie blieb.', ['Er sagte ‚Hallo‘ und ging.', 'Sie blieb.']],
  ['a quotation at the end', 'Sie sagte: „Er kommt.“', ['Sie sagte: „Er kommt.“']],
  ['straight quotation marks', 'Er sagte: "Komm her." Dann ging er.', ['Er sagte: "Komm her."', 'Dann ging er.']],
  ['an unclosed quotation mark does not swallow the text', 'Er sagte: „Komm. Dann gehen wir. Sie auch.', ['Er sagte: „Komm.', 'Dann gehen wir.', 'Sie auch.']],
  ['ellipsis then lower case continues', 'Nein… ich glaube nicht. Doch!', ['Nein… ich glaube nicht.', 'Doch!']],
  ['ellipsis then a capital ends', 'Er wartete… Dann kam sie.', ['Er wartete…', 'Dann kam sie.']],
  ['three dots then lower case', 'Wenn du willst... gehen wir. Sonst nicht.', ['Wenn du willst... gehen wir.', 'Sonst nicht.']],
  ['stacked marks', 'Was?! Wie bitte? Ach so.', ['Was?!', 'Wie bitte?', 'Ach so.']],
  ['a closing bracket', 'Er las die Zeitung (siehe oben). Danach schlief er.', ['Er las die Zeitung (siehe oben).', 'Danach schlief er.']],
  ['verse lines', 'Über allen Gipfeln\nIst Ruh,\nIn allen Wipfeln\nSpürest du\nKaum einen Hauch.', ['Über allen Gipfeln', 'Ist Ruh,', 'In allen Wipfeln', 'Spürest du', 'Kaum einen Hauch.']],
  ['one sentence per line', 'Erste Zeile.\nZweite Zeile.', ['Erste Zeile.', 'Zweite Zeile.']],
  ['paragraphs', 'Es war einmal ein König.\n\nEr hatte drei Söhne.', ['Es war einmal ein König.', 'Er hatte drei Söhne.']],
  ['windows line breaks', 'Erste Zeile.\r\nZweite Zeile.', ['Erste Zeile.', 'Zweite Zeile.']],
  ['no punctuation', 'Ohne Satzzeichen', ['Ohne Satzzeichen']],
  ['empty', '', []],
  ['only white space', '   \n  ', []],
  ['surrounding white space is trimmed', '  Hallo Welt.  Wie geht es?  ', ['Hallo Welt.', 'Wie geht es?']],
];

describe('German sentence segmentation', () => {
  for (const [name, text, expected] of CASES) {
    it(name, () => { expect(split(text)).toEqual(expected); });
  }

  it('has at least 40 cases', () => { expect(CASES.length).toBeGreaterThanOrEqual(40); });

  it('every span slices the input exactly, in order, with no white space at its ends', () => {
    for (const [, text] of CASES) {
      let last = 0;
      for (const s of segmentGermanSentences(text)) {
        expect(text.slice(s.start, s.end)).toBe(s.text);
        expect(s.start).toBeGreaterThanOrEqual(last);
        expect(s.text).toBe(s.text.trim());
        expect(s.text.length).toBeGreaterThan(0);
        last = s.end;
      }
    }
  });

  it('keeps every non-white-space character of the input (nothing is dropped)', () => {
    for (const [, text] of CASES) {
      const joined = segmentGermanSentences(text).map((s) => s.text).join('').replace(/\s+/gu, '');
      expect(joined).toBe(text.replace(/\s+/gu, ''));
    }
  });

  it('is the function the constructions module exports', () => {
    const t = 'Am 3. Mai kam er. Dr. Müller blieb.';
    expect(constructionsSplit(t)).toEqual(segmentGermanSentences(t));
  });

  it('lists the abbreviations the brief names', () => {
    for (const a of ['dr', 'prof', 'nr', 'ca', 'vgl', 'evtl', 'ggf', 'st', 'hr', 'fr', 'str', 's', 'bd', 'jh', 'bzw']) expect(GERMAN_ABBREVIATIONS).toContain(a);
  });
});
