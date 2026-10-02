/**
 * Package GB: the German lexicon (rows, parser, closed classes, prefixes). The facts below were written from the
 * tester's own knowledge of German and checked against the built view; a word list that is wrong fails here.
 */
import { describe, expect, it } from 'vitest';
import { parseRows } from '../../src/adapters/german/entries';
import { CLOSED_FORMS, CONTRACTIONS, FUNCTION_ROWS, PREPOSITIONS } from '../../src/adapters/german/function-words';
import { deLexiconStats, deLexiconView as lex } from '../../src/adapters/german/lexicon';
import { ADJECTIVE_ROWS, ADVERB_ROWS } from '../../src/adapters/german/lexicon-modifiers';
import { NOUN_ROWS } from '../../src/adapters/german/lexicon-nouns';
import { VERB_ROWS } from '../../src/adapters/german/lexicon-verbs';
import { PREFIXES, prefixKind } from '../../src/adapters/german/prefixes';
import type { DeCell, DeNoun, DeVerb } from '../../src/adapters/german/types';

const lower = (s: string) => s.normalize('NFC').toLocaleLowerCase('de');
const cellText = (cells: readonly DeCell[] | undefined) => (cells ?? []).map((c) => `${c.c}-${c.g}`).sort().join(',');
const nounOf = (lemma: string, gender?: string, plural?: string | null): DeNoun | undefined =>
  lex.nouns(lower(lemma)).find((n) => (!gender || n.gender === gender) && (plural === undefined || (plural === null ? n.plural === undefined : n.plural === plural)));
const verbOf = (lemma: string, prefix?: string | null): DeVerb | undefined =>
  lex.verb(lower(lemma)).find((v) => (prefix === undefined ? true : prefix === null ? !v.prefix : v.prefix === prefix));

describe('row parser: every row shape', () => {
  it('parses nouns of every class', () => {
    const r = parseRows(`
# NOUN
// a comment
Mann/m, -es, ¨-er = man; husband
Frau/f, -, -en = woman
Kind/n, -es, -er = child
Student/m, -en, -en = student (male) [weak]
Herz/n, -ens, -en = heart | dat sg: Herzen
Milch/f, -, 0 = milk
Eltern/pl = parents
Deutsche/adj = German (person) [adjectival]
Lehrer/m, -s, - = teacher
Vater/m, -s, ¨- = father
Zeugnis/n, -ses, -se = report
Studium/n, -s, Studien = studies
Opa/m, -s, -s = grandpa [colloquial]
Name/m, -ns, -n = name [weak] | D pl: Namen; G sg: Namens
`, 'test');
    const by = (l: string) => r.nouns.find((n) => n.lemma === l)!;
    expect(by('Mann')).toMatchObject({ gender: 'm', genSg: 'Mannes', plural: 'Männer', gloss: 'man; husband' });
    expect(by('Frau')).toMatchObject({ gender: 'f', genSg: 'Frau', plural: 'Frauen' });
    expect(by('Student')).toMatchObject({ weak: true, genSg: 'Studenten', plural: 'Studenten' });
    expect(by('Herz')).toMatchObject({ genSg: 'Herzens', plural: 'Herzen', irregular: { 'D sg': 'Herzen' } });
    expect(by('Milch').plural).toBeUndefined();
    expect(by('Eltern')).toMatchObject({ gender: 'pl', plural: 'Eltern' });
    expect(by('Eltern').genSg).toBeUndefined();
    expect(by('Deutsche')).toMatchObject({ adjectival: true });
    expect(by('Lehrer').plural).toBe('Lehrer');
    expect(by('Vater').plural).toBe('Väter');
    expect(by('Zeugnis')).toMatchObject({ genSg: 'Zeugnisses', plural: 'Zeugnisse' });
    expect(by('Studium')).toMatchObject({ genSg: 'Studiums', plural: 'Studien' });
    expect(by('Opa').register).toEqual(['colloquial']);
    expect(by('Name').irregular).toEqual({ 'D pl': 'Namen', 'G sg': 'Namens' });
  });

  it('parses verbs of every class', () => {
    const r = parseRows(`
# VERB
machen = to make; to do
reisen = to travel | sein
fahren = to drive | fährt, fuhr, gefahren, sein
bringen = to bring | bringt, brachte, gebracht [mixed]
auf|stehen = to get up | steht, stand, gestanden, sein
an|rufen = to call | ruft, rief, gerufen
sich freuen = to be glad
sich an|ziehen = to get dressed | zieht, zog, gezogen
helfen = to help | hilft, half, geholfen [dat]
sein = to be | ist, war, gewesen, sein [irregular]
brechen = to break | bricht, brach, gebrochen, haben/sein
um|fahren = to knock down | fährt, fuhr, gefahren
umfahren = to drive around | umfährt, umfuhr, umfahren
`, 'test');
    const [machen, reisen, fahren, bringen, aufstehen, anrufen, freuen, anziehen, helfen, sein, brechen, umfahrenSep, umfahrenIns] = r.verbs;
    expect(machen).toMatchObject({ lemma: 'machen', cls: 'weak', aux: 'haben' });
    expect(machen.pres3).toBeUndefined();
    expect(reisen).toMatchObject({ cls: 'weak', aux: 'sein' });
    expect(fahren).toMatchObject({ cls: 'strong', pres3: 'fährt', pret: 'fuhr', part: 'gefahren', aux: 'sein' });
    expect(bringen).toMatchObject({ cls: 'mixed', part: 'gebracht' });
    expect(aufstehen).toMatchObject({ lemma: 'aufstehen', prefix: 'auf', base: 'stehen', aux: 'sein', part: 'gestanden' });
    expect(anrufen).toMatchObject({ lemma: 'anrufen', prefix: 'an', base: 'rufen', aux: 'haben' });
    expect(freuen).toMatchObject({ lemma: 'freuen', reflexive: true });
    expect(anziehen).toMatchObject({ lemma: 'anziehen', reflexive: true, prefix: 'an' });
    expect(helfen.governs).toBe('dat');
    expect(sein.cls).toBe('irregular');
    expect(brechen.aux).toBe('haben/sein');
    expect(umfahrenSep).toMatchObject({ lemma: 'umfahren', prefix: 'um' });
    expect(umfahrenIns.prefix).toBeUndefined();
    expect(umfahrenIns.pres3).toBe('umfährt');
  });

  it('parses adjectives, plain words and tags', () => {
    const r = parseRows(`
# ADJ
klein = small
gut = good | besser, best
hoch = high | höher, höchst [stem: hoh]
teuer = expensive | teurer, teuerst [stem: teur]
rosa = pink [indeclinable]
prima = great [indeclinable colloquial]
# ADV
heute = today
# PART
doch = (modal particle) | role: contradicts a negative
# INTJ
amen = amen [religious de-AT]
`, 'test');
    expect(r.adjectives.map((a) => a.lemma)).toEqual(['klein', 'gut', 'hoch', 'teuer', 'rosa', 'prima']);
    expect(r.adjectives[1]).toMatchObject({ comparative: 'besser', superlative: 'best' });
    expect(r.adjectives[2]).toMatchObject({ stem: 'hoh', comparative: 'höher' });
    expect(r.adjectives[4].indeclinable).toBe(true);
    expect(r.adjectives[5]).toMatchObject({ indeclinable: true, register: ['colloquial'] });
    expect(r.plain[0]).toMatchObject({ lemma: 'heute', pos: 'ADV' });
    expect(r.plain[1]).toMatchObject({ pos: 'PART', role: 'contradicts a negative' });
    expect(r.plain[2]).toMatchObject({ register: ['religious'], varieties: ['de-AT'] });
  });

  it('rejects every malformed row, naming the label and the line', () => {
    const bad = (src: string, msg: RegExp) => expect(() => parseRows(src, 'lbl')).toThrow(msg);
    bad('Mann/m, -es, ¨-er = man', /lbl:1: a row before any section header/);
    bad('# NOUN\nMann/m, -es, ¨-er man', /lbl:2: expected "lemma = gloss"/);
    bad('# FOO\n', /lbl:1: unknown section "FOO"/);
    bad('# NOUN\nMann, -es, ¨-er = man', /lbl:2: a noun row needs "Lemma\/m/);
    bad('# NOUN\nmann/m, -es, ¨-er = man', /lbl:2: a noun lemma starts with a capital letter/);
    bad('# NOUN\nMann/m, -es = man', /lbl:2: a noun row needs "Lemma\/g, genitive, plural"/);
    bad('# NOUN\nEltern/pl, -n = parents', /lbl:2: a plural-only noun lists only/);
    bad('# NOUN\nDeutsche/adj, -n = German', /lbl:2: an adjectival noun lists only/);
    bad('# NOUN\nMann/m, -es, ¨-er = man [mixed]', /lbl:2: a tag that does not belong on a noun/);
    bad('# NOUN\nMann/m, -es, ¨-er = man [foo]', /lbl:2: unknown tag "foo"/);
    bad('# NOUN\nHerz/n, -ens, -en = heart | Herzen', /lbl:2: explicit form "Herzen" is not "case number: form"/);
    bad('# NOUN\nHerz/n, -ens, -en = heart | xyz sg: Herzen', /lbl:2: explicit form/);
    bad('# VERB\nfahren = to drive | fährt, fuhr', /lbl:2: principal parts are/);
    bad('# VERB\nfahren = to drive | fährt, fuhr, gefahren, drive', /lbl:2: unknown auxiliary "drive"/);
    bad('# VERB\nbringen = to bring [mixed]', /lbl:2: a mixed verb lists its three principal parts/);
    bad('# VERB\nMachen = to make', /lbl:2: bad verb lemma/);
    bad('# VERB\nauf|an|stehen = to get up', /lbl:2: bad verb lemma/);
    bad('# VERB\nmachen = to make [weak]', /lbl:2: a tag that does not belong on a verb/);
    bad('# ADJ\ngut = good | besser', /lbl:2: comparison is "comparative, superlative stem"/);
    bad('# ADJ\ngut = good [dat]', /lbl:2: a tag that does not belong on an adjective/);
    bad('# ADV\nheute = today [weak]', /lbl:2: a tag that does not belong on a plain word/);
    bad('# ADV\nheute = today | because', /lbl:2: after the bar a plain word states "role: …"/);
    bad('# NOUN\nMann/m, -es, ¨-er = ', /lbl:2: /);
    bad('# NOUN\n\n\nMann/m, -es, ¨-er = man | x', /lbl:4: explicit form/);
  });
});

describe('the built lists are complete and consistent', () => {
  const nounRows = parseRows(NOUN_ROWS, 'nouns').nouns;
  const verbRows = parseRows(VERB_ROWS, 'verbs').verbs;
  const adjRows = parseRows(ADJECTIVE_ROWS, 'adjectives').adjectives;
  const plainRows = [...parseRows(ADVERB_ROWS, 'adverbs').plain, ...parseRows(FUNCTION_ROWS, 'function words').plain];

  it('every noun has a gender; every singular noun has a genitive', () => {
    for (const n of nounRows) {
      expect(['m', 'f', 'n', 'pl']).toContain(n.gender);
      if (n.gender !== 'pl' && !n.adjectival) expect(n.genSg, n.lemma).toBeTruthy();
      expect(n.gloss.length, n.lemma).toBeGreaterThan(0);
    }
    expect(nounRows.filter((n) => n.gender === 'pl').map((n) => n.lemma)).toEqual(expect.arrayContaining(['Eltern', 'Leute', 'Geschwister', 'Ferien']));
    for (const n of lex.allNouns()) expect(n.gender === 'pl' || n.adjectival || n.genSg).toBeTruthy();
  });

  it('every weak noun is masculine; every plural is a whole form', () => {
    for (const n of nounRows) {
      if (n.weak) expect(n.gender, n.lemma).toBe('m');
      if (n.plural) expect(n.plural).not.toMatch(/¨|^0$|^-/u);
      if (n.genSg) expect(n.genSg).not.toMatch(/¨|^-/u);
    }
  });

  it('every strong or mixed verb has three parts', () => {
    for (const v of verbRows) {
      if (v.cls === 'strong' || v.cls === 'mixed') {
        expect(v.pres3, v.lemma).toBeTruthy();
        expect(v.pret, v.lemma).toBeTruthy();
        expect(v.part, v.lemma).toBeTruthy();
      }
      if (v.cls === 'weak') expect(v.pres3).toBeUndefined();
    }
  });

  it('every separable verb has base and prefix, and the prefix is separable or dual', () => {
    const sep = verbRows.filter((v) => v.prefix);
    expect(sep.length).toBeGreaterThanOrEqual(150);
    for (const v of sep) {
      expect(v.prefix, v.lemma).toBeTruthy();
      expect(v.base, v.lemma).toBeTruthy();
      expect(v.lemma).toBe(`${v.prefix}${v.base}`);
      expect(['separable', 'dual'], `${v.lemma}: prefix ${v.prefix}`).toContain(prefixKind(v.prefix!));
    }
    for (const v of verbRows.filter((x) => !x.prefix)) {
      // an inseparable verb's own prefix is never a separable one
      const kind = ['be', 'emp', 'ent', 'er', 'ge', 'miss', 'ver', 'zer'].find((p) => v.lemma.startsWith(p));
      if (kind) expect(prefixKind(kind)).toBe('inseparable');
    }
  });

  it('has no duplicate rows inside its own lists', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    const note = (key: string, facts: string) => { if (seen.has(key)) dup.push(`${key}: ${seen.get(key)} / ${facts}`); else seen.set(key, facts); };
    for (const n of nounRows) note(`noun ${n.lemma}|${n.gender}|${n.plural ?? ''}`, JSON.stringify([n.genSg, n.weak]));
    for (const v of verbRows) note(`verb ${v.lemma}|${v.prefix ?? ''}|${v.reflexive ? 'r' : ''}|${v.cls}`, JSON.stringify([v.pres3, v.pret, v.part, v.aux]));
    for (const a of adjRows) note(`adj ${a.lemma}`, JSON.stringify([a.comparative, a.superlative, a.stem]));
    for (const p of plainRows) note(`plain ${p.lemma}|${p.pos}`, p.gloss);
    expect(dup).toEqual([]);
  });

  it('is within the size targets', () => {
    expect(deLexiconStats.nouns).toBeGreaterThanOrEqual(700);
    expect(deLexiconStats.nouns).toBeLessThanOrEqual(1500);
    expect(deLexiconStats.verbs).toBeGreaterThanOrEqual(450);
    expect(deLexiconStats.verbs).toBeLessThanOrEqual(1000);
    expect(deLexiconStats.strongVerbs).toBeGreaterThanOrEqual(170);
    expect(deLexiconStats.separableVerbs).toBeGreaterThanOrEqual(150);
    expect(deLexiconStats.adjectives).toBeGreaterThanOrEqual(250);
    expect(plainRows.filter((p) => p.pos === 'ADV').length).toBeGreaterThanOrEqual(150);
    expect(deLexiconStats.closedForms).toBeGreaterThan(150);
    expect(deLexiconStats.plainWords).toBeGreaterThan(400);
    expect(lex.allNouns().length).toBe(deLexiconStats.nouns);
    expect(lex.allVerbs().length).toBe(deLexiconStats.verbs);
    expect(lex.allAdjectives().length).toBe(deLexiconStats.adjectives);
  });

  it('merges the course rows without overriding the main lists', () => {
    // the main list wins: Geld is listed there with the plural Gelder
    expect(nounOf('Geld')?.plural).toBe('Gelder');
    expect(Array.isArray(deLexiconStats.duplicates)).toBe(true);
    for (const d of deLexiconStats.duplicates) expect(d).toMatch(/course row differs/);
  });
});

describe('facts of nouns (gender, genitive, plural)', () => {
  // [lemma, gender, genitive singular, plural (null = none), flags]
  const NOUNS: Array<[string, string, string, string | null, string?]> = [
    ['Mann', 'm', 'Mannes', 'Männer'], ['Frau', 'f', 'Frau', 'Frauen'], ['Kind', 'n', 'Kindes', 'Kinder'],
    ['Student', 'm', 'Studenten', 'Studenten', 'weak'], ['Junge', 'm', 'Jungen', 'Jungen', 'weak'], ['Herr', 'm', 'Herrn', 'Herren', 'weak'],
    ['Mensch', 'm', 'Menschen', 'Menschen', 'weak'], ['Name', 'm', 'Namens', 'Namen', 'weak'], ['Kollege', 'm', 'Kollegen', 'Kollegen', 'weak'],
    ['Nachbar', 'm', 'Nachbarn', 'Nachbarn', 'weak'], ['Herz', 'n', 'Herzens', 'Herzen'], ['Haus', 'n', 'Hauses', 'Häuser'],
    ['Buch', 'n', 'Buches', 'Bücher'], ['Vater', 'm', 'Vaters', 'Väter'], ['Mutter', 'f', 'Mutter', 'Mütter'],
    ['Tochter', 'f', 'Tochter', 'Töchter'], ['Bruder', 'm', 'Bruders', 'Brüder'], ['Auto', 'n', 'Autos', 'Autos'],
    ['Hotel', 'n', 'Hotels', 'Hotels'], ['Museum', 'n', 'Museums', 'Museen'], ['Thema', 'n', 'Themas', 'Themen'],
    ['Zeugnis', 'n', 'Zeugnisses', 'Zeugnisse'], ['Bus', 'm', 'Busses', 'Busse'], ['Stadt', 'f', 'Stadt', 'Städte'],
    ['Hand', 'f', 'Hand', 'Hände'], ['Gott', 'm', 'Gottes', 'Götter'], ['Arzt', 'm', 'Arztes', 'Ärzte'],
    ['Ärztin', 'f', 'Ärztin', 'Ärztinnen'], ['Lehrer', 'm', 'Lehrers', 'Lehrer'], ['Wasser', 'n', 'Wassers', 'Wasser'],
    ['Käse', 'm', 'Käses', 'Käse'], ['Apfel', 'm', 'Apfels', 'Äpfel'], ['Bahnhof', 'm', 'Bahnhofes', 'Bahnhöfe'],
    ['Straßenbahn', 'f', 'Straßenbahn', 'Straßenbahnen'], ['Fuß', 'm', 'Fußes', 'Füße'], ['Baum', 'm', 'Baumes', 'Bäume'],
    ['Tag', 'm', 'Tages', 'Tage'], ['Bundesland', 'n', 'Bundeslandes', 'Bundesländer'], ['Rathaus', 'n', 'Rathauses', 'Rathäuser'],
    ['Krankenhaus', 'n', 'Krankenhauses', 'Krankenhäuser'], ['Lebensversicherung', 'f', 'Lebensversicherung', 'Lebensversicherungen'],
    ['Evangelium', 'n', 'Evangeliums', 'Evangelien'], ['Praktikum', 'n', 'Praktikums', 'Praktika'], ['Datum', 'n', 'Datums', 'Daten'],
    ['Kaffee', 'm', 'Kaffees', 'Kaffees'], ['Handschuh', 'm', 'Handschuhs', 'Handschuhe'], ['Frühstück', 'n', 'Frühstücks', 'Frühstücke'],
    ['Geburtstag', 'm', 'Geburtstages', 'Geburtstage'], ['Wochenende', 'n', 'Wochenendes', 'Wochenenden'], ['Hausaufgabe', 'f', 'Hausaufgabe', 'Hausaufgaben'],
    ['Wohnzimmer', 'n', 'Wohnzimmers', 'Wohnzimmer'], ['Kindergarten', 'm', 'Kindergartens', 'Kindergärten'], ['Arbeitszimmer', 'n', 'Arbeitszimmers', 'Arbeitszimmer'],
    ['Sünde', 'f', 'Sünde', 'Sünden'], ['Gnade', 'f', 'Gnade', 'Gnaden'], ['Glaube', 'm', 'Glaubens', null, 'weak'],
    ['Friede', 'm', 'Friedens', null, 'weak'], ['Vergebung', 'f', 'Vergebung', null], ['Auferstehung', 'f', 'Auferstehung', 'Auferstehungen'],
    ['Gebet', 'n', 'Gebetes', 'Gebete'], ['Gemeinde', 'f', 'Gemeinde', 'Gemeinden'], ['Kirche', 'f', 'Kirche', 'Kirchen'],
    ['Bibel', 'f', 'Bibel', 'Bibeln'], ['Seele', 'f', 'Seele', 'Seelen'], ['Himmel', 'm', 'Himmels', 'Himmel'],
    ['Erde', 'f', 'Erde', 'Erden'], ['Kreuz', 'n', 'Kreuzes', 'Kreuze'], ['Heil', 'n', 'Heils', null],
    ['Reich', 'n', 'Reiches', 'Reiche'], ['Wahrheit', 'f', 'Wahrheit', 'Wahrheiten'], ['Liebe', 'f', 'Liebe', null],
    ['Hoffnung', 'f', 'Hoffnung', 'Hoffnungen'], ['Geist', 'm', 'Geistes', 'Geister'], ['Untugend', 'f', 'Untugend', 'Untugenden'],
    ['Mädchen', 'n', 'Mädchens', 'Mädchen'], ['Zug', 'm', 'Zuges', 'Züge'], ['Schloss', 'n', 'Schlosses', 'Schlösser'],
    ['Milch', 'f', 'Milch', null], ['Ergebnis', 'n', 'Ergebnisses', 'Ergebnisse'],
  ];

  it.each(NOUNS)('%s is %s, gen %s, pl %s', (lemma, gender, genSg, plural, flags) => {
    const n = nounOf(lemma, gender, plural === null ? null : plural);
    expect(n, `${lemma} (${gender}, ${plural})`).toBeDefined();
    expect(n!.genSg).toBe(genSg);
    expect(n!.plural).toBe(plural ?? undefined);
    expect(!!n!.weak).toBe(flags === 'weak');
  });

  it('keeps the two plurals of Wort and the two nouns Bank and See', () => {
    expect(lex.nouns('wort').map((n) => n.plural).sort()).toEqual(['Worte', 'Wörter']);
    expect(lex.nouns('bank').map((n) => n.plural).sort()).toEqual(['Banken', 'Bänke']);
    expect(lex.nouns('see').map((n) => `${n.gender}:${n.plural ?? ''}`).sort()).toEqual(['f:', 'm:Seen']);
  });

  it('lists plural-only and adjectival nouns', () => {
    for (const l of ['Eltern', 'Leute', 'Geschwister', 'Ferien', 'Großeltern']) expect(nounOf(l)?.gender, l).toBe('pl');
    for (const l of ['Deutsche', 'Erwachsene', 'Verwandte', 'Bekannte', 'Angestellte']) expect(nounOf(l)?.adjectival, l).toBe(true);
    expect(nounOf('Herz')?.irregular).toEqual({ 'D sg': 'Herzen' });
  });

  it('finds nouns by their lower-case normalized lemma and no other way', () => {
    expect(lex.nouns('mann')).toHaveLength(1);
    expect(lex.nouns('Mann')).toHaveLength(0);
    expect(lex.nouns('männer')).toHaveLength(0);
  });
});

describe('facts of verbs (principal parts and auxiliary)', () => {
  // [lemma, pres3, preterite, participle, auxiliary]
  const STRONG: Array<[string, string, string, string, string]> = [
    ['fahren', 'fährt', 'fuhr', 'gefahren', 'sein'], ['gehen', 'geht', 'ging', 'gegangen', 'sein'], ['kommen', 'kommt', 'kam', 'gekommen', 'sein'],
    ['bleiben', 'bleibt', 'blieb', 'geblieben', 'sein'], ['sehen', 'sieht', 'sah', 'gesehen', 'haben'], ['geben', 'gibt', 'gab', 'gegeben', 'haben'],
    ['nehmen', 'nimmt', 'nahm', 'genommen', 'haben'], ['essen', 'isst', 'aß', 'gegessen', 'haben'], ['trinken', 'trinkt', 'trank', 'getrunken', 'haben'],
    ['schreiben', 'schreibt', 'schrieb', 'geschrieben', 'haben'], ['lesen', 'liest', 'las', 'gelesen', 'haben'], ['sprechen', 'spricht', 'sprach', 'gesprochen', 'haben'],
    ['helfen', 'hilft', 'half', 'geholfen', 'haben'], ['finden', 'findet', 'fand', 'gefunden', 'haben'], ['singen', 'singt', 'sang', 'gesungen', 'haben'],
    ['schlafen', 'schläft', 'schlief', 'geschlafen', 'haben'], ['laufen', 'läuft', 'lief', 'gelaufen', 'sein'], ['fallen', 'fällt', 'fiel', 'gefallen', 'sein'],
    ['fliegen', 'fliegt', 'flog', 'geflogen', 'sein'], ['treffen', 'trifft', 'traf', 'getroffen', 'haben'], ['werfen', 'wirft', 'warf', 'geworfen', 'haben'],
    ['ziehen', 'zieht', 'zog', 'gezogen', 'haben/sein'], ['tragen', 'trägt', 'trug', 'getragen', 'haben'], ['waschen', 'wäscht', 'wusch', 'gewaschen', 'haben'],
    ['wachsen', 'wächst', 'wuchs', 'gewachsen', 'sein'], ['sterben', 'stirbt', 'starb', 'gestorben', 'sein'], ['schwimmen', 'schwimmt', 'schwamm', 'geschwommen', 'haben/sein'],
    ['springen', 'springt', 'sprang', 'gesprungen', 'sein'], ['bringen', 'bringt', 'brachte', 'gebracht', 'haben'], ['denken', 'denkt', 'dachte', 'gedacht', 'haben'],
    ['kennen', 'kennt', 'kannte', 'gekannt', 'haben'], ['nennen', 'nennt', 'nannte', 'genannt', 'haben'], ['rennen', 'rennt', 'rannte', 'gerannt', 'sein'],
    ['beginnen', 'beginnt', 'begann', 'begonnen', 'haben'], ['gewinnen', 'gewinnt', 'gewann', 'gewonnen', 'haben'], ['verstehen', 'versteht', 'verstand', 'verstanden', 'haben'],
    ['vergessen', 'vergisst', 'vergaß', 'vergessen', 'haben'], ['verlieren', 'verliert', 'verlor', 'verloren', 'haben'], ['bekommen', 'bekommt', 'bekam', 'bekommen', 'haben'],
    ['empfehlen', 'empfiehlt', 'empfahl', 'empfohlen', 'haben'], ['entscheiden', 'entscheidet', 'entschied', 'entschieden', 'haben'], ['geschehen', 'geschieht', 'geschah', 'geschehen', 'sein'],
    ['gefallen', 'gefällt', 'gefiel', 'gefallen', 'haben'], ['heißen', 'heißt', 'hieß', 'geheißen', 'haben'], ['halten', 'hält', 'hielt', 'gehalten', 'haben'],
    ['laden', 'lädt', 'lud', 'geladen', 'haben'], ['lassen', 'lässt', 'ließ', 'gelassen', 'haben'], ['rufen', 'ruft', 'rief', 'gerufen', 'haben'],
    ['stehen', 'steht', 'stand', 'gestanden', 'haben'], ['sitzen', 'sitzt', 'saß', 'gesessen', 'haben'], ['liegen', 'liegt', 'lag', 'gelegen', 'haben'],
    ['vergeben', 'vergibt', 'vergab', 'vergeben', 'haben'], ['bekennen', 'bekennt', 'bekannte', 'bekannt', 'haben'], ['schließen', 'schließt', 'schloss', 'geschlossen', 'haben'],
    ['steigen', 'steigt', 'stieg', 'gestiegen', 'sein'], ['stehlen', 'stiehlt', 'stahl', 'gestohlen', 'haben'], ['brechen', 'bricht', 'brach', 'gebrochen', 'haben/sein'],
  ];
  it.each(STRONG)('%s: %s, %s, %s (%s)', (lemma, pres3, pret, part, aux) => {
    const v = verbOf(lemma, null);
    expect(v, lemma).toBeDefined();
    expect([v!.pres3, v!.pret, v!.part, v!.aux]).toEqual([pres3, pret, part, aux]);
    expect(['strong', 'mixed']).toContain(v!.cls);
  });
  it('has at least 40 of them tested here', () => expect(STRONG.length).toBeGreaterThanOrEqual(40));

  it('lists separable verbs with the parts of the verb without its prefix', () => {
    expect(verbOf('aufstehen')).toMatchObject({ prefix: 'auf', base: 'stehen', pres3: 'steht', pret: 'stand', part: 'gestanden', aux: 'sein' });
    expect(verbOf('anfangen')).toMatchObject({ prefix: 'an', base: 'fangen', pres3: 'fängt', pret: 'fing', part: 'gefangen' });
    expect(verbOf('anrufen')).toMatchObject({ prefix: 'an', pres3: 'ruft', part: 'gerufen' });
    expect(verbOf('einkaufen')).toMatchObject({ prefix: 'ein', base: 'kaufen', cls: 'weak' });
    expect(verbOf('mitkommen')).toMatchObject({ aux: 'sein' });
    expect(verbOf('kennenlernen')).toMatchObject({ prefix: 'kennen', base: 'lernen' });
    expect(verbOf('fernsehen')).toMatchObject({ prefix: 'fern', pres3: 'sieht' });
    expect(verbOf('stattfinden')).toMatchObject({ prefix: 'statt', part: 'gefunden' });
    expect(verbOf('teilnehmen')).toMatchObject({ prefix: 'teil', pret: 'nahm' });
    for (const l of ['zurückgehen', 'vorstellen', 'aufmachen', 'zumachen', 'ankommen', 'abfahren', 'aussehen', 'einladen', 'weitergehen', 'zurückkommen',
      'vorbereiten', 'aufhören', 'zuhören', 'anziehen', 'ausziehen', 'umziehen', 'mitbringen', 'mitnehmen', 'weggehen', 'hingehen', 'herkommen',
      'vorlesen', 'nachdenken', 'aufpassen', 'einschlafen', 'aufwachen']) expect(verbOf(l, undefined)?.prefix, l).toBeTruthy();
  });

  it('lists the dual-prefix pairs as two rows with different meanings', () => {
    for (const [lemma, prefix] of [['umfahren', 'um'], ['übersetzen', 'über'], ['umgehen', 'um'], ['durchfahren', 'durch'], ['unterstellen', 'unter'], ['wiederholen', 'wieder']] as const) {
      const rows = lex.verb(lemma);
      const sep = rows.find((v) => v.prefix === prefix);
      const ins = rows.find((v) => !v.prefix);
      expect(sep, `${lemma} separable`).toBeDefined();
      expect(ins, `${lemma} inseparable`).toBeDefined();
      expect(sep!.gloss).not.toBe(ins!.gloss);
      expect(prefixKind(prefix)).toBe('dual');
    }
    expect(verbOf('umfahren', null)).toMatchObject({ pres3: 'umfährt', pret: 'umfuhr', part: 'umfahren' });
    expect(verbOf('umfahren', 'um')).toMatchObject({ pres3: 'fährt', pret: 'fuhr', part: 'gefahren' });
  });

  it('lists reflexive verbs, dative-object verbs and the irregular ten', () => {
    expect(lex.verb('freuen').some((v) => v.reflexive)).toBe(true);
    expect(lex.verb('erinnern').some((v) => v.reflexive)).toBe(true);
    expect(lex.verb('waschen').map((v) => !!v.reflexive).sort()).toEqual([false, true]);
    for (const l of ['helfen', 'danken', 'gefallen', 'gehören', 'glauben', 'folgen', 'antworten', 'gratulieren', 'vertrauen', 'vergeben']) expect(verbOf(l)?.governs, l).toBe('dat');
    for (const l of ['sein', 'haben', 'werden', 'können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen', 'wissen', 'tun']) expect(verbOf(l)?.cls, l).toBe('irregular');
    expect(verbOf('sein')?.aux).toBe('sein');
    expect(verbOf('werden')?.aux).toBe('sein');
    expect(verbOf('haben')?.aux).toBe('haben');
  });

  it('finds the separable verbs of a base, and only those', () => {
    const ofStehen = lex.separableVerbsOf('stehen').map((v) => v.lemma);
    expect(ofStehen).toEqual(expect.arrayContaining(['aufstehen', 'beistehen']));
    expect(ofStehen).not.toContain('verstehen');
    expect(ofStehen).not.toContain('bestehen');
    expect(lex.separableVerbsOf('fahren').map((v) => v.lemma)).toEqual(expect.arrayContaining(['abfahren', 'mitfahren', 'umfahren']));
    expect(lex.separableVerbsOf('lernen').map((v) => v.lemma)).toEqual(['kennenlernen']);
    expect(lex.separableVerbsOf('nichtda')).toEqual([]);
  });
});

describe('facts of adjectives and adverbs', () => {
  it('lists irregular comparison', () => {
    const t: Array<[string, string, string]> = [
      ['gut', 'besser', 'best'], ['viel', 'mehr', 'meist'], ['gern', 'lieber', 'liebst'], ['hoch', 'höher', 'höchst'], ['nah', 'näher', 'nächst'],
      ['groß', 'größer', 'größt'], ['alt', 'älter', 'ältest'], ['jung', 'jünger', 'jüngst'], ['lang', 'länger', 'längst'], ['kurz', 'kürzer', 'kürzest'],
      ['warm', 'wärmer', 'wärmst'], ['kalt', 'kälter', 'kältest'], ['arm', 'ärmer', 'ärmst'], ['hart', 'härter', 'härtest'], ['stark', 'stärker', 'stärkst'],
      ['schwach', 'schwächer', 'schwächst'], ['klug', 'klüger', 'klügst'], ['dumm', 'dümmer', 'dümmst'], ['gesund', 'gesünder', 'gesündest'],
      ['teuer', 'teurer', 'teuerst'], ['dunkel', 'dunkler', 'dunkelst'], ['edel', 'edler', 'edelst'],
    ];
    for (const [l, c, s] of t) expect([lex.adjective(l)?.comparative, lex.adjective(l)?.superlative], l).toEqual([c, s]);
    expect(lex.adjective('hoch')?.stem).toBe('hoh');
    expect(lex.adjective('teuer')?.stem).toBe('teur');
    expect(lex.adjective('dunkel')?.stem).toBe('dunkl');
    expect(lex.adjective('edel')?.stem).toBe('edl');
    expect(lex.adjective('müde')?.stem).toBe('müd');
    expect(lex.adjective('klein')?.comparative).toBeUndefined();
  });

  it('lists indeclinable adjectives', () => {
    for (const l of ['rosa', 'lila', 'prima', 'extra']) expect(lex.adjective(l)?.indeclinable, l).toBe(true);
    expect(lex.adjective('gut')?.indeclinable).toBeUndefined();
  });

  it('lists ordinals as adjectives and the question, place and da-/wo-adverbs', () => {
    for (const l of ['erst', 'zweit', 'dritt', 'viert', 'fünft', 'sechst', 'siebt', 'zehnt']) expect(lex.adjective(l), l).toBeDefined();
    for (const l of ['wo', 'wohin', 'woher', 'wann', 'warum', 'wie', 'darauf', 'damit', 'dafür', 'worauf', 'womit', 'wofür', 'hier', 'dort', 'jetzt', 'heute']) {
      expect(lex.plain(l).some((p) => p.pos === 'ADV'), l).toBe(true);
    }
  });
});

describe('closed classes', () => {
  const reading = (form: string, lemma: string, pos: string, pronType?: string) =>
    lex.closed(form).find((f) => f.lemma === lemma && f.pos === pos && (!pronType || f.morph?.PronType === pronType));

  it('gives the cells of the definite article and its relative and demonstrative readings', () => {
    expect(cellText(reading('dem', 'der', 'DET')?.cells)).toBe('D-m,D-n');
    expect(cellText(reading('den', 'der', 'DET')?.cells)).toBe('A-m,D-p');
    expect(cellText(reading('der', 'der', 'DET')?.cells)).toBe('D-f,G-f,G-p,N-m');
    expect(cellText(reading('die', 'der', 'DET')?.cells)).toBe('A-f,A-p,N-f,N-p');
    expect(cellText(reading('das', 'der', 'DET')?.cells)).toBe('A-n,N-n');
    expect(cellText(reading('des', 'der', 'DET')?.cells)).toBe('G-m,G-n');
    expect(reading('der', 'der', 'DET')).toMatchObject({ morph: { PronType: 'Art', Definite: 'Def' }, governsDecl: 'wk' });
    for (const f of ['der', 'die', 'das', 'dem', 'den', 'dessen', 'deren', 'denen']) {
      expect(reading(f, 'der', 'PRON', 'Rel'), `${f} relative`).toBeDefined();
      expect(reading(f, 'der', 'PRON', 'Dem'), `${f} demonstrative`).toBeDefined();
    }
    expect(cellText(reading('deren', 'der', 'PRON', 'Rel')?.cells)).toBe('G-f,G-p');
    expect(cellText(reading('dessen', 'der', 'PRON', 'Rel')?.cells)).toBe('G-m,G-n');
    expect(cellText(reading('denen', 'der', 'PRON', 'Rel')?.cells)).toBe('D-p');
    expect(reading('des', 'der', 'PRON')).toBeUndefined();
    expect(lex.closed('daß')).toEqual([]);
  });

  it('gives the cells of ein, kein and the possessives', () => {
    expect(cellText(reading('einen', 'ein', 'DET')?.cells)).toBe('A-m');
    expect(cellText(reading('ein', 'ein', 'DET')?.cells)).toBe('A-n,N-m,N-n');
    expect(cellText(reading('eine', 'ein', 'DET')?.cells)).toBe('A-f,N-f');
    expect(cellText(reading('einer', 'ein', 'DET')?.cells)).toBe('D-f,G-f');
    expect(reading('einen', 'ein', 'DET')).toMatchObject({ governsDecl: 'mx', morph: { Definite: 'Ind' } });
    expect(cellText(reading('keinem', 'kein', 'DET')?.cells)).toBe('D-m,D-n');
    expect(cellText(reading('keine', 'kein', 'DET')?.cells)).toBe('A-f,A-p,N-f,N-p');
    expect(cellText(reading('meinem', 'mein', 'DET')?.cells)).toBe('D-m,D-n');
    expect(cellText(reading('meinen', 'mein', 'DET')?.cells)).toBe('A-m,D-p');
    expect(cellText(reading('ihr', 'ihr', 'DET')?.cells)).toBe('A-n,N-m,N-n');
    expect(cellText(reading('ihr', 'Ihr', 'DET')?.cells)).toBe('A-n,N-m,N-n');
    expect(reading('ihr', 'ihr', 'DET')).toMatchObject({ governsDecl: 'mx', morph: { Poss: 'Yes' } });
    expect(reading('eure', 'euer', 'DET')).toBeDefined();
    expect(reading('unsere', 'unser', 'DET')).toBeDefined();
    expect(reading('seinem', 'sein', 'DET')).toBeDefined();
    expect(reading('dein', 'dein', 'DET')).toBeDefined();
  });

  it('gives the cells of dieser, jeder, welcher, mancher, solcher, alle (weak adjective after them)', () => {
    expect(cellText(reading('diesen', 'dieser', 'DET')?.cells)).toBe('A-m,D-p');
    expect(cellText(reading('dieser', 'dieser', 'DET')?.cells)).toBe('D-f,G-f,G-p,N-m');
    expect(cellText(reading('dieses', 'dieser', 'DET')?.cells)).toBe('A-n,G-m,G-n,N-n');
    expect(reading('diesen', 'dieser', 'DET')).toMatchObject({ governsDecl: 'wk', morph: { PronType: 'Dem' } });
    for (const l of ['jener', 'jeder', 'welcher', 'mancher', 'solcher', 'alle']) {
      const d = lex.closed(l === 'alle' ? 'alle' : l).find((f) => f.lemma === l && f.pos === 'DET');
      expect(d?.governsDecl, l).toBe('wk');
    }
    expect(cellText(reading('jedem', 'jeder', 'DET')?.cells)).toBe('D-m,D-n');
    expect(cellText(reading('allen', 'alle', 'DET')?.cells)).toBe('A-m,D-p');
    expect(reading('welche', 'welcher', 'DET', 'Int')).toBeDefined();
    expect(reading('einige', 'einige', 'DET')?.governsDecl).toBeUndefined();
    expect(reading('beide', 'beide', 'DET')).toBeDefined();
    expect(reading('mehrere', 'mehrere', 'DET')).toBeDefined();
    expect(reading('viele', 'viele', 'DET')).toBeDefined();
    expect(reading('wenige', 'wenige', 'DET')).toBeDefined();
    expect(reading('alle', 'alle', 'PRON')).toBeDefined();
  });

  it('lists the personal pronouns in all cases with person, number, gender', () => {
    const p = (form: string, lemma: string) => lex.closed(form).filter((f) => f.lemma === lemma && f.pos === 'PRON').map((f) => f.morph!);
    expect(p('ich', 'ich')[0]).toMatchObject({ Person: '1', Number: 'Sing', Case: 'Nom' });
    expect(p('mich', 'ich')[0]).toMatchObject({ Case: 'Acc' });
    expect(p('mir', 'ich')[0]).toMatchObject({ Case: 'Dat' });
    expect(p('dich', 'du')[0]).toMatchObject({ Person: '2', Number: 'Sing', Case: 'Acc' });
    expect(p('dir', 'du')[0]).toMatchObject({ Case: 'Dat' });
    expect(p('er', 'er')[0]).toMatchObject({ Person: '3', Gender: 'Masc', Case: 'Nom' });
    expect(p('ihn', 'er')[0]).toMatchObject({ Gender: 'Masc', Case: 'Acc' });
    expect(p('ihm', 'er')[0]).toMatchObject({ Gender: 'Masc,Neut', Case: 'Dat' });
    expect(p('es', 'es')[0]).toMatchObject({ Gender: 'Neut', Case: 'Nom,Acc' });
    expect(p('uns', 'wir')[0]).toMatchObject({ Person: '1', Number: 'Plur', Case: 'Acc,Dat' });
    expect(p('euch', 'ihr')[0]).toMatchObject({ Person: '2', Number: 'Plur' });
    expect(p('ihnen', 'sie')[0]).toMatchObject({ Person: '3', Number: 'Plur', Case: 'Dat' });
    expect(p('ihnen', 'Sie')[0]).toMatchObject({ Polite: 'Form', Case: 'Dat' });
    // "sie" is three readings: she/her, they/them, formal you
    const sie = lex.closed('sie').filter((f) => f.pos === 'PRON');
    expect(sie.map((f) => f.lemma).sort()).toEqual(['Sie', 'sie', 'sie']);
    expect(sie.find((f) => f.lemma === 'Sie')?.morph).toMatchObject({ Polite: 'Form' });
    expect(sie.find((f) => f.morph?.Number === 'Sing')?.morph).toMatchObject({ Gender: 'Fem' });
    expect(lex.closed('ihr').filter((f) => f.pos === 'PRON').map((f) => f.lemma).sort()).toEqual(['ihr', 'sie']);
    expect(lex.closed('sich')[0]).toMatchObject({ morph: { Reflex: 'Yes' } });
    expect(lex.closed('wen')[0].morph).toMatchObject({ Case: 'Acc' });
    expect(lex.closed('wem')[0].morph).toMatchObject({ Case: 'Dat' });
    expect(lex.closed('wessen')[0].morph).toMatchObject({ Case: 'Gen' });
    expect(lex.closed('wer')[0].morph).toMatchObject({ Case: 'Nom' });
    for (const l of ['man', 'jemand', 'niemand', 'etwas', 'nichts', 'was', 'wer', 'jemanden', 'niemandem']) expect(lex.closed(l).length, l).toBeGreaterThan(0);
  });

  it('has an own reading for every cell and uses lower-case forms', () => {
    for (const f of CLOSED_FORMS) {
      expect(f.form).toBe(lower(f.form));
      expect(f.gloss.length).toBeGreaterThan(0);
      if (f.cells) { expect(f.cells.length).toBeGreaterThan(0); for (const c of f.cells) expect(['N', 'A', 'D', 'G']).toContain(c.c); }
    }
    for (const f of CLOSED_FORMS.filter((x) => x.governsDecl)) expect(['DET']).toContain(f.pos === 'NUM' ? 'DET' : f.pos);
  });
});

describe('prepositions, contractions and plain words', () => {
  it('lists the case(s) each preposition governs', () => {
    const t: Array<[string, string]> = [
      ['durch', 'A'], ['für', 'A'], ['gegen', 'A'], ['ohne', 'A'], ['um', 'A'], ['bis', 'A'], ['entlang', 'A'],
      ['aus', 'D'], ['außer', 'D'], ['bei', 'D'], ['mit', 'D'], ['nach', 'D'], ['seit', 'D'], ['von', 'D'], ['zu', 'D'], ['gegenüber', 'D'], ['ab', 'D'],
      ['an', 'AD'], ['auf', 'AD'], ['hinter', 'AD'], ['in', 'AD'], ['neben', 'AD'], ['über', 'AD'], ['unter', 'AD'], ['vor', 'AD'], ['zwischen', 'AD'],
      ['wegen', 'G'], ['während', 'G'], ['trotz', 'G'], ['statt', 'G'], ['anstatt', 'G'], ['innerhalb', 'G'], ['außerhalb', 'G'],
    ];
    for (const [form, cases] of t) expect(lex.preposition(form)?.cases.join(''), form).toBe(cases);
    expect(lex.preposition('xyz')).toBeUndefined();
    expect(PREPOSITIONS.length).toBeGreaterThanOrEqual(45);
    expect(lex.plain('mit').some((p) => p.pos === 'ADP')).toBe(true);
  });

  it('lists the contractions with their preposition and article', () => {
    const t: Array<[string, string, string]> = [
      ['am', 'an', 'dem'], ['ans', 'an', 'das'], ['aufs', 'auf', 'das'], ['beim', 'bei', 'dem'], ['im', 'in', 'dem'], ['ins', 'in', 'das'],
      ['vom', 'von', 'dem'], ['zum', 'zu', 'dem'], ['zur', 'zu', 'der'], ['fürs', 'für', 'das'], ['durchs', 'durch', 'das'], ['ums', 'um', 'das'],
      ['übers', 'über', 'das'], ['unters', 'unter', 'das'], ['vorm', 'vor', 'dem'], ['hinterm', 'hinter', 'dem'], ['überm', 'über', 'dem'], ['unterm', 'unter', 'dem'],
    ];
    for (const [form, prep, art] of t) {
      const c = lex.contraction(form);
      expect([c?.preposition, c?.article], form).toEqual([prep, art]);
      expect(lex.preposition(prep)).toBeDefined();
      expect(lex.closed(art).some((f) => f.pos === 'DET'), art).toBe(true);
    }
    expect(lex.contraction('zur')?.cell).toEqual({ c: 'D', g: 'f' });
    expect(lex.contraction('ins')?.cell).toEqual({ c: 'A', g: 'n' });
    expect(CONTRACTIONS.length).toBeGreaterThanOrEqual(18);
  });

  it('tells coordinating from subordinating conjunctions', () => {
    for (const w of ['und', 'oder', 'aber', 'denn', 'sondern', 'doch']) expect(lex.plain(w).some((p) => p.pos === 'CONJ'), w).toBe(true);
    for (const w of ['dass', 'weil', 'wenn', 'als', 'ob', 'obwohl', 'während', 'bevor', 'nachdem', 'damit', 'sodass', 'seit', 'seitdem', 'bis', 'da', 'falls', 'indem', 'sobald', 'solange']) {
      expect(lex.plain(w).some((p) => p.pos === 'SCONJ'), w).toBe(true);
    }
    expect(lex.plain('dass').every((p) => p.pos !== 'CONJ')).toBe(true);
    expect(lex.plain('zu').some((p) => p.pos === 'PART')).toBe(true);
    expect(lex.plain('nicht').some((p) => p.pos === 'PART')).toBe(true);
    expect(lex.plain('hallo').some((p) => p.pos === 'INTJ')).toBe(true);
  });

  it('gives each modal particle a role beside its ordinary reading', () => {
    const words = ['doch', 'mal', 'eben', 'halt', 'ja', 'wohl', 'schon', 'denn', 'eigentlich', 'einfach', 'ruhig', 'bloß', 'nur', 'auch', 'aber', 'vielleicht', 'etwa'];
    for (const w of words) {
      const readings = lex.plain(w);
      const particle = readings.find((r) => r.pos === 'PART');
      expect(particle, `${w} as a particle`).toBeDefined();
      expect(particle!.role?.length, `${w} role`).toBeGreaterThan(30);
      const ordinary = readings.some((r) => r.pos !== 'PART') || !!lex.adjective(w);
      expect(ordinary, `${w} ordinary reading`).toBe(true);
    }
    expect(lex.plain('doch').map((r) => r.pos).sort()).toEqual(expect.arrayContaining(['ADV', 'CONJ', 'PART']));
    expect(lex.plain('doch').find((r) => r.pos === 'PART')!.role).toMatch(/contradicts/);
    expect(lex.plain('einfach').some((r) => r.pos === 'ADV')).toBe(true);
    expect(lex.adjective('einfach')).toBeDefined();
  });

  it('lists numerals and the older seed words', () => {
    for (const w of ['null', 'eins', 'zwei', 'zwölf', 'neunzehn', 'zwanzig', 'dreißig', 'neunzig', 'hundert', 'tausend']) expect(lex.plain(w).some((p) => p.pos === 'NUM'), w).toBe(true);
    expect(cellText(lex.closed('einem').find((f) => f.pos === 'NUM')?.cells)).toBe('D-m,D-n');
  });
});

describe('prefixes', () => {
  it('classifies separable, inseparable and dual prefixes', () => {
    for (const p of ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'nach', 'vor', 'weg', 'zu', 'zurück', 'zusammen', 'weiter', 'fern', 'statt', 'teil', 'kennen']) expect(prefixKind(p), p).toBe('separable');
    for (const p of ['be', 'emp', 'ent', 'er', 'ge', 'miss', 'ver', 'zer']) expect(prefixKind(p), p).toBe('inseparable');
    for (const p of ['durch', 'über', 'um', 'unter', 'wieder', 'wider', 'hinter']) expect(prefixKind(p), p).toBe('dual');
    expect(prefixKind('xyz')).toBeUndefined();
    expect(prefixKind('Auf')).toBe('separable');
    expect(lex.prefixKind('um')).toBe('dual');
    expect(PREFIXES.dual).toHaveLength(7);
  });
  it('lists no prefix twice', () => {
    const all = [...PREFIXES.separable, ...PREFIXES.inseparable, ...PREFIXES.dual];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the older seed list is still covered', () => {
  const known = (w: string): boolean => {
    const k = lower(w);
    return lex.nouns(k).length > 0 || lex.verb(k).length > 0 || !!lex.adjective(k) || lex.closed(k).length > 0 || lex.plain(k).length > 0 || !!lex.preposition(k);
  };
  const SEED = [
    // verbs
    'sein', 'haben', 'verstehen', 'glauben', 'anfangen', 'vergeben', 'lieben', 'wollen', 'gehen', 'sagen', 'bekennen', 'verführen', 'reinigen', 'geben', 'verlieren', 'werden',
    // nouns and names
    'Herz', 'Sünde', 'Gott', 'Friede', 'Welt', 'Sohn', 'Wahrheit', 'Leben', 'Tag', 'Untugend', 'Haus', 'Wort', 'Mann', 'Anna', 'Paul',
    // articles, determiners, pronouns
    'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'einen', 'kein', 'mein', 'unser', 'sein', 'alle', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'mir', 'dir', 'uns', 'ihn', 'etwas', 'was',
    // adjectives, adverbs
    'jung', 'gut', 'treu', 'gerecht', 'ewig', 'eingeboren', 'ganz', 'selbst', 'jetzt', 'heute', 'dann', 'gestern', 'oft', 'manchmal', 'morgen', 'auch', 'nicht', 'also', 'wie', 'warum', 'so',
    // prepositions, particles, conjunctions, interjections
    'an', 'in', 'mit', 'von', 'aus', 'bei', 'nach', 'seit', 'auf', 'für', 'zu', 'und', 'aber', 'sondern', 'oder', 'als', 'dass', 'wenn', 'weil', 'hallo', 'ja', 'danke',
  ];
  it.each(SEED)('knows %s', (w) => expect(known(w), w).toBe(true));

  it('knows the church and Germany words of the brief', () => {
    for (const w of ['Gott', 'Glaube', 'Gnade', 'Sünde', 'Vergebung', 'Auferstehung', 'Gebet', 'Gemeinde', 'Kirche', 'Bibel', 'Evangelium', 'Herr', 'Geist', 'Seele', 'Himmel', 'Erde', 'Kreuz', 'Heil', 'Reich', 'Wort', 'Wahrheit', 'Liebe', 'Hoffnung', 'Friede',
      'Land', 'Stadt', 'Bundesland', 'Bahnhof', 'Zug', 'Straßenbahn', 'Rathaus', 'Hausaufgabe', 'Krankenhaus', 'Wohnzimmer', 'Kindergarten', 'Arbeitszimmer', 'Lebensversicherung', 'Geburtstag', 'Wochenende', 'Handschuh', 'Frühstück']) {
      expect(lex.nouns(lower(w)).length, w).toBeGreaterThan(0);
    }
  });
});
