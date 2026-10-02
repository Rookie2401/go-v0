/**
 * Older German spelling (src/adapters/german/historical.ts). The test controls what counts as a modern word: the list
 * below is the whole dictionary. Table rows are from the author's own knowledge of the spelling of 1901–1996 and
 * before 1901.
 */
import { describe, expect, it } from 'vitest';
import { historicalGerman, LISTED_COUNT, LISTED_GROUPS } from '../../src/adapters/german/historical';

const MODERN = new Set<string>([
  // words the older spellings turn into
  'dass', 'muss', 'musste', 'müsste', 'lässt', 'isst', 'wusste', 'gewiss', 'bisschen', 'Kuss', 'Fluss', 'Schloss', 'nass', 'Prozess',
  'rau', 'Stängel', 'nummerieren', 'platzieren', 'Schifffahrt', 'tun', 'Tun', 'tut', 'Tut', 'Tal', 'Teil', 'Tier', 'Tür', 'Rat', 'Mut', 'Not',
  'rot', 'Wert', 'Wirt', 'Atem', 'Turm', 'Kultur', 'Kapitel', 'Klasse', 'Zentrum', 'Konzert', 'studieren', 'regiert', 'sein', 'bei',
  'frei', 'zwei', 'drei', 'tot', 'Tot', 'Tod', 'Zeugnis', 'Gleichnis', 'Finsternis', 'Geheimnis', 'Ware', 'Schar', 'Herd', 'gibt', 'ging',
  'fing', 'hing', 'Hilfe', 'echt', 'Eltern', 'Tat', 'tat', 'Tränen', 'Träne',
  // words reached by a pattern
  'Torheit', 'Teilnahme', 'Rathaus', 'Wirtshaus', 'Türklinke', 'notwendig', 'mutig', 'Kapelle', 'Kardinal', 'Zirkel', 'praktisch',
  'speziell', 'regierte', 'probiert', 'spazierten', 'Heirat', 'freien', 'Seite', 'bleiben', 'tote', 'Totenstille', 'Ärgernis',
  'Missverständnis', 'zitiert', 'Warenhaus', 'verging', 'empfingen', 'vergingen', 'anhing', 'nachgibt', 'Äpfel', 'Öfen', 'Überfall',
  'Über', 'Übung', 'Misserfolg', 'Misstrauen', 'Kongress', 'Esslöffel', 'Missbrauch', 'bewusst', 'Bewusstsein', 'Schlossherr',
  'Schifffahrtsgesellschaft', 'Brennnesseln', 'Zeitung', 'Reise', 'Prozesse', 'tödlich',
  // modern words that must never be related to anything
  'Maße', 'Masse', 'Fuß', 'groß', 'Straße', 'heißen', 'Thron', 'Theater', 'Thema', 'Theologie', 'Apotheke', 'Bibliothek', 'Mathematik',
  'Methode', 'Ethik', 'Rhythmus', 'Katholik', 'Stadt', 'Waagen', 'Meer', 'Haar', 'Boot', 'Heer', 'Griffe', 'Stillleben', 'Wut', 'Maß',
  'wurde', 'Frau', 'Hirt', 'Thüringen', 'Goethe',
  // not German words, so that the Greek th-words can only be protected by the rule itself
  'Teaters', 'Temen', 'Apoteken', 'Matematiker', 'Teologen', 'Bibliotek',
]);
const isModern = (w: string): boolean => MODERN.has(w);

type Row = [old: string, modern: string, period: 'de-1901' | 'de-pre1901', confidence: number];

const LISTED_ROWS: Row[] = [
  // 1901–1996: ß after a short vowel
  ['daß', 'dass', 'de-1901', 0.9], ['muß', 'muss', 'de-1901', 0.9], ['mußte', 'musste', 'de-1901', 0.9], ['müßte', 'müsste', 'de-1901', 0.9],
  ['läßt', 'lässt', 'de-1901', 0.9], ['ißt', 'isst', 'de-1901', 0.9], ['wußte', 'wusste', 'de-1901', 0.9], ['gewiß', 'gewiss', 'de-1901', 0.9],
  ['bißchen', 'bisschen', 'de-1901', 0.9], ['Kuß', 'Kuss', 'de-1901', 0.9], ['Fluß', 'Fluss', 'de-1901', 0.9], ['Schloß', 'Schloss', 'de-1901', 0.9],
  ['naß', 'nass', 'de-1901', 0.9], ['Prozeß', 'Prozess', 'de-1901', 0.9],
  // the reform of 1996
  ['rauh', 'rau', 'de-1901', 0.9], ['Stengel', 'Stängel', 'de-1901', 0.9], ['numerieren', 'nummerieren', 'de-1901', 0.9],
  ['plazieren', 'platzieren', 'de-1901', 0.9], ['Schiffahrt', 'Schifffahrt', 'de-1901', 0.9],
  // before 1901: th
  ['thun', 'tun', 'de-pre1901', 0.9], ['thut', 'tut', 'de-pre1901', 0.9], ['that', 'tat', 'de-pre1901', 0.9], ['Thal', 'Tal', 'de-pre1901', 0.9],
  ['Theil', 'Teil', 'de-pre1901', 0.9], ['Thier', 'Tier', 'de-pre1901', 0.9], ['Thür', 'Tür', 'de-pre1901', 0.9], ['Thränen', 'Tränen', 'de-pre1901', 0.9],
  ['Rath', 'Rat', 'de-pre1901', 0.9], ['Muth', 'Mut', 'de-pre1901', 0.9], ['Noth', 'Not', 'de-pre1901', 0.9], ['roth', 'rot', 'de-pre1901', 0.9],
  ['Werth', 'Wert', 'de-pre1901', 0.9], ['Wirth', 'Wirt', 'de-pre1901', 0.9], ['Athem', 'Atem', 'de-pre1901', 0.9], ['Thurm', 'Turm', 'de-pre1901', 0.9],
  // before 1901: c, -iren, ey, dt, -niß, aa / ee, giebt / gieng, single words
  ['Cultur', 'Kultur', 'de-pre1901', 0.9], ['Capitel', 'Kapitel', 'de-pre1901', 0.9], ['Classe', 'Klasse', 'de-pre1901', 0.9],
  ['Centrum', 'Zentrum', 'de-pre1901', 0.9], ['Concert', 'Konzert', 'de-pre1901', 0.9],
  ['studiren', 'studieren', 'de-pre1901', 0.9], ['regirt', 'regiert', 'de-pre1901', 0.9],
  ['seyn', 'sein', 'de-pre1901', 0.9], ['bey', 'bei', 'de-pre1901', 0.9], ['frey', 'frei', 'de-pre1901', 0.9], ['zwey', 'zwei', 'de-pre1901', 0.9],
  ['drey', 'drei', 'de-pre1901', 0.9], ['todt', 'tot', 'de-pre1901', 0.9], ['Todt', 'Tod', 'de-pre1901', 0.9],
  ['Zeugniß', 'Zeugnis', 'de-pre1901', 0.9], ['Gleichniß', 'Gleichnis', 'de-pre1901', 0.9], ['Finsterniß', 'Finsternis', 'de-pre1901', 0.9],
  ['Geheimniß', 'Geheimnis', 'de-pre1901', 0.9],
  ['Waare', 'Ware', 'de-pre1901', 0.9], ['Schaar', 'Schar', 'de-pre1901', 0.9], ['Heerd', 'Herd', 'de-pre1901', 0.9],
  ['giebt', 'gibt', 'de-pre1901', 0.9], ['gieng', 'ging', 'de-pre1901', 0.9], ['fieng', 'fing', 'de-pre1901', 0.9], ['hieng', 'hing', 'de-pre1901', 0.9],
  ['Hülfe', 'Hilfe', 'de-pre1901', 0.9], ['ächt', 'echt', 'de-pre1901', 0.9], ['Aeltern', 'Eltern', 'de-pre1901', 0.9],
];

const PATTERN_ROWS: Row[] = [
  // ß (1996)
  ['Mißerfolg', 'Misserfolg', 'de-1901', 0.7], ['Mißtrauen', 'Misstrauen', 'de-1901', 0.7], ['Kongreß', 'Kongress', 'de-1901', 0.7],
  ['Eßlöffel', 'Esslöffel', 'de-1901', 0.7], ['Mißbrauch', 'Missbrauch', 'de-1901', 0.7], ['bewußt', 'bewusst', 'de-1901', 0.7],
  ['Bewußtsein', 'Bewusstsein', 'de-1901', 0.7], ['Schloßherr', 'Schlossherr', 'de-1901', 0.7],
  // three equal consonants (1996)
  ['Schiffahrtsgesellschaft', 'Schifffahrtsgesellschaft', 'de-1901', 0.7], ['Brennesseln', 'Brennnesseln', 'de-1901', 0.7],
  // th
  ['Thorheit', 'Torheit', 'de-pre1901', 0.7], ['Theilnahme', 'Teilnahme', 'de-pre1901', 0.7], ['Rathhaus', 'Rathaus', 'de-pre1901', 0.7],
  ['Wirthshaus', 'Wirtshaus', 'de-pre1901', 0.7], ['Thürklinke', 'Türklinke', 'de-pre1901', 0.7], ['nothwendig', 'notwendig', 'de-pre1901', 0.7],
  ['muthig', 'mutig', 'de-pre1901', 0.7],
  // c
  ['Capelle', 'Kapelle', 'de-pre1901', 0.7], ['Cardinal', 'Kardinal', 'de-pre1901', 0.7], ['Cirkel', 'Zirkel', 'de-pre1901', 0.7],
  ['practisch', 'praktisch', 'de-pre1901', 0.7], ['speciell', 'speziell', 'de-pre1901', 0.7],
  // -iren
  ['regirte', 'regierte', 'de-pre1901', 0.7], ['probirt', 'probiert', 'de-pre1901', 0.7], ['spazirten', 'spazierten', 'de-pre1901', 0.7],
  // ey
  ['freyen', 'freien', 'de-pre1901', 0.7], ['Seyte', 'Seite', 'de-pre1901', 0.7], ['bleyben', 'bleiben', 'de-pre1901', 0.7],
  // dt
  ['todte', 'tote', 'de-pre1901', 0.7], ['Todtenstille', 'Totenstille', 'de-pre1901', 0.7],
  // aa / ee before r
  ['Waarenhaus', 'Warenhaus', 'de-pre1901', 0.7],
  // gieng, giebt
  ['vergieng', 'verging', 'de-pre1901', 0.7], ['empfiengen', 'empfingen', 'de-pre1901', 0.7], ['vergiengen', 'vergingen', 'de-pre1901', 0.7],
  ['anhieng', 'anhing', 'de-pre1901', 0.7], ['nachgiebt', 'nachgibt', 'de-pre1901', 0.7],
  // Ae, Oe, Ue at the start of a word
  ['Aepfel', 'Äpfel', 'de-pre1901', 0.7], ['Oefen', 'Öfen', 'de-pre1901', 0.7], ['Ueberfall', 'Überfall', 'de-pre1901', 0.7],
  ['Uebung', 'Übung', 'de-pre1901', 0.7],
  // two patterns combined
  ['Heyrath', 'Heirat', 'de-pre1901', 0.5], ['citirt', 'zitiert', 'de-pre1901', 0.5], ['Aergerniß', 'Ärgernis', 'de-pre1901', 0.5],
  ['Mißverständniß', 'Missverständnis', 'de-pre1901', 0.5],
];

describe('historicalGerman: listed pairs (0.9)', () => {
  it.each(LISTED_ROWS)('%s → %s (%s, %s)', (old, modern, period, confidence) => {
    const r = historicalGerman(old, isModern);
    expect(r[0]).toMatchObject({ modern, period, confidence });
    expect(r[0].rule.length).toBeGreaterThan(10);
  });

  it('needs no dictionary: a listed pair is certain on its own', () => {
    expect(historicalGerman('daß', () => false)[0]).toMatchObject({ modern: 'dass', confidence: 0.9 });
    expect(historicalGerman('Thal', () => false)[0]).toMatchObject({ modern: 'Tal', confidence: 0.9 });
  });
});

describe('historicalGerman: patterns (0.7 for one, 0.5 for two)', () => {
  it.each(PATTERN_ROWS)('%s → %s (%s, %s)', (old, modern, period, confidence) => {
    const r = historicalGerman(old, isModern);
    expect(r[0]).toMatchObject({ modern, period, confidence });
    expect(r[0].rule.length).toBeGreaterThan(10);
  });

  it('a pattern result must be a modern word: with no dictionary nothing is related', () => {
    for (const [old] of PATTERN_ROWS) expect(historicalGerman(old, () => false)).toEqual([]);
  });

  it('two patterns combined: the older period wins and the rule names both', () => {
    const r = historicalGerman('Mißverständniß', isModern)[0];
    expect(r.period).toBe('de-pre1901');
    expect(r.rule).toContain('-niß');
    expect(r.rule).toContain('ß after a short vowel');
  });

  it('a pattern of 1901–1996 stays in that period', () => {
    expect(historicalGerman('Mißerfolg', isModern)[0].period).toBe('de-1901');
  });
});

describe('historicalGerman: the table is large enough and every row is distinct', () => {
  it('has at least 70 rows, with no duplicates', () => {
    const all = [...LISTED_ROWS, ...PATTERN_ROWS];
    expect(all.length).toBeGreaterThanOrEqual(70);
    expect(new Set(all.map((r) => r[0])).size).toBe(all.length);
  });
  it('the pattern rows are not listed pairs (so they really exercise the patterns)', () => {
    const listedOld = new Set(LISTED_GROUPS.flatMap((g) => g.pairs.map(([o]) => o.toLowerCase())));
    for (const [old] of PATTERN_ROWS) expect(listedOld.has(old.toLowerCase()), old).toBe(false);
  });
  it('the lists are consistent', () => {
    for (const g of LISTED_GROUPS) {
      for (const [old, modern] of g.pairs) {
        expect(old, `${old} is a different spelling`).not.toBe(modern);
        expect(modern.includes('ß') && g.rule.startsWith('ß'), `${modern} keeps a ß that ss replaces`).toBe(false);
      }
    }
    expect(LISTED_COUNT['de-1901']).toBeGreaterThan(40);
    expect(LISTED_COUNT['de-pre1901']).toBeGreaterThan(100);
  });
});

describe('historicalGerman: forms that must NOT be related', () => {
  it.each([
    'Maße', 'Fuß', 'groß', 'Straße', 'heißen', 'Masse', 'Stadt', 'Waagen', 'Meer', 'Haar', 'Boot', 'Heer', 'Griffe', 'Stillleben',
    'dass', 'Tür', 'Rat', 'Tat', 'Seite', 'Hirt', 'Wut', 'Maß',
  ])('modern word %s gives nothing', (w) => {
    expect(historicalGerman(w, isModern)).toEqual([]);
  });

  it('Maße does not become Masse, Fuß does not become Fuss, groß does not become gross', () => {
    expect(historicalGerman('Maße', isModern)).toEqual([]);
    expect(historicalGerman('Fuß', isModern)).toEqual([]);
    expect(historicalGerman('groß', isModern)).toEqual([]);
  });

  it('the Greek th-words keep their th', () => {
    for (const w of ['Thron', 'Theater', 'Thema', 'Theologie', 'Apotheke', 'Bibliothek', 'Mathematik', 'Methode', 'Ethik', 'Rhythmus', 'Katholik']) {
      expect(historicalGerman(w, isModern), w).toEqual([]);
    }
  });

  it('th inside a Greek word is protected even when a th-less spelling is a word', () => {
    // Teaters, Temen, Apoteken, Matematiker, Teologen, Bibliotek are in the test's dictionary on purpose
    for (const w of ['Theaters', 'Themen', 'Apotheken', 'Mathematiker', 'Theologen', 'Bibliothek']) {
      const r = historicalGerman(w, (x) => (x === 'Bibliothek' ? false : isModern(x)));
      expect(r, w).toEqual([]);
    }
  });

  it('archaic vocabulary is not spelling', () => {
    for (const w of ['ward', 'Weib', 'Odem', 'Hirt']) expect(historicalGerman(w, isModern), w).toEqual([]);
  });

  it('unknown or non-word material gives nothing', () => {
    for (const w of ['xyz', 'Roth-Kehlchen', 'tHun', 'th1', '', '--']) expect(historicalGerman(w, isModern), w).toEqual([]);
  });

  it('a modern spelling with a legitimate ß is never rewritten (long vowel or diphthong)', () => {
    expect(historicalGerman('heißen', (w) => w === 'heißen' || w === 'heissen')).toEqual([]);
  });

  it('a form that is a modern word is not related even if a listed spelling shares it', () => {
    // the dictionary decides: a listed old form that has become a modern word (a name, say) is left alone
    expect(historicalGerman('Thal', (w) => w === 'Thal')).toEqual([]);
  });
});

describe('historicalGerman: capitalisation', () => {
  it('keeps the capital letter of the written form', () => {
    expect(historicalGerman('Thun', isModern)[0].modern).toBe('Tun'); // a sentence start: Thun → Tun
    expect(historicalGerman('thun', isModern)[0].modern).toBe('tun');
    expect(historicalGerman('THUN', isModern)[0].modern).toBe('TUN');
    expect(historicalGerman('Daß', isModern)[0].modern).toBe('Dass');
    expect(historicalGerman('Muß', isModern)[0].modern).toBe('Muss');
    expect(historicalGerman('Thut', isModern)[0].modern).toBe('Tut');
    expect(historicalGerman('THAL', isModern)[0].modern).toBe('TAL');
  });

  it('a capitalised pattern form may stand for a lower-case word (a sentence start)', () => {
    expect(historicalGerman('Bewußt', isModern)[0].modern).toBe('Bewusst');
    expect(historicalGerman('Muthig', isModern)[0].modern).toBe('Mutig');
  });

  it('ALL CAPS: the modern form is in capitals too', () => {
    expect(historicalGerman('UEBUNG', isModern)[0]).toMatchObject({ modern: 'ÜBUNG', confidence: 0.7 });
    expect(historicalGerman('WIRTH', isModern)[0].modern).toBe('WIRT');
  });

  it('a lower-case "hülfe" is not the noun Hilfe, a capitalised one is', () => {
    expect(historicalGerman('hülfe', isModern)).toEqual([]);
    expect(historicalGerman('Hülfe', isModern)[0].modern).toBe('Hilfe');
  });

  it('a lower-case form is never given a capital', () => {
    expect(historicalGerman('thal', isModern)).toEqual([]); // the noun is written Thal; no lower-case listed pair
  });

  it('Todt (a noun) is Tod first; todt (an adjective) is tot', () => {
    const noun = historicalGerman('Todt', isModern);
    expect(noun[0].modern).toBe('Tod');
    expect(noun.map((r) => r.modern)).toContain('Tot');
    expect(historicalGerman('todt', isModern).map((r) => r.modern)).toEqual(['tot']);
  });
});

describe('historicalGerman: ordering and bounds', () => {
  const all = [...LISTED_ROWS, ...PATTERN_ROWS].map((r) => r[0]);

  it('listed pairs beat patterns: one result, 0.9, no duplicate from a pattern', () => {
    for (const w of ['Thür', 'daß', 'Thal', 'studiren', 'giebt', 'Zeugniß']) {
      const r = historicalGerman(w, isModern);
      expect(r, w).toHaveLength(1);
      expect(r[0].confidence).toBe(0.9);
    }
  });

  it('results are best first, at most three, each modern spelling once, and never the written form', () => {
    for (const w of all) {
      const r = historicalGerman(w, isModern);
      expect(r.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < r.length; i++) expect(r[i - 1].confidence).toBeGreaterThanOrEqual(r[i].confidence);
      expect(new Set(r.map((x) => x.modern)).size).toBe(r.length);
      for (const x of r) { expect(x.modern).not.toBe(w); expect(['de-1901', 'de-pre1901']).toContain(x.period); }
    }
  });

  it('confidences are 0.9, 0.7 or 0.5 only', () => {
    for (const w of all) for (const x of historicalGerman(w, isModern)) expect([0.9, 0.7, 0.5]).toContain(x.confidence);
  });

  it('is deterministic and does not touch the text', () => {
    expect(historicalGerman('Thür', isModern)).toEqual(historicalGerman('Thür', isModern));
  });
});
