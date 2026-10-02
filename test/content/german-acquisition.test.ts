/**
 * GF — the controlled German starter corpus: Weg 1–3, Deutschland — Lesungen 1, Gespräche 1.
 * Every document is a machine draft: it must validate with the real validator, belong to its work, stay unpublished
 * for the one stated reason, carry one English line per sentence, and show the forms its level is meant to seed.
 * Analysis coverage is printed, not asserted (the lexicon is still growing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { computePublished, validateBatch, validateDocument, type CorpusDocument } from '../../src/ingest';
import { GERMAN_WORKS } from '../../src/course/german';

const DIR = path.resolve(__dirname, '../../data/corpus/de');
const registry = createAdapterRegistry();
const knownWorks = new Set(GERMAN_WORKS.map((w) => w.id));

const files = fs.readdirSync(DIR).filter((f) => /^(weg|deutschland|gespraeche)-.*\.json$/.test(f)).sort();
const raw: unknown[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const docs = raw as CorpusDocument[];

type S = { text: string; english?: string; speaker?: string; spans?: unknown; corrections?: unknown };
const sentencesOf = (d: CorpusDocument): S[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? (p.sentences as S[]) : [])));
const wordsOf = (s: string): string[] => s.toLowerCase().match(/[\p{L}]+/gu) ?? [];
const textOf = (d: CorpusDocument) => sentencesOf(d).map((s) => s.text).join(' ');
const wordCount = (d: CorpusDocument) => sentencesOf(d).reduce((n, s) => n + wordsOf(s.text).length, 0);

const PLAN = [
  { slug: 'weg-1', texts: 8, min: 70, max: 120, maxSentence: 10, difficulty: 'A0', type: 'story', streams: ['acquisition'] },
  { slug: 'weg-2', texts: 8, min: 120, max: 180, maxSentence: 16, difficulty: 'A1', type: 'story', streams: ['acquisition'] },
  { slug: 'weg-3', texts: 6, min: 200, max: 300, maxSentence: 22, difficulty: 'A2', type: 'story', streams: ['acquisition'] },
  { slug: 'deutschland-lesungen-1', texts: 4, min: 150, max: 220, maxSentence: 22, difficulty: 'A2', type: 'story', streams: ['germany', 'acquisition'] },
  { slug: 'gespraeche-1', texts: 6, min: 100, max: 160, maxSentence: 18, difficulty: 'A2', type: 'dialogue', streams: ['conversation', 'acquisition'] },
] as const;

const byWork = (slug: string) => docs.filter((d) => d.work?.slug === slug);
const allText = (slug: string) => byWork(slug).map(textOf).join('\n');
/** Assert a pattern occurs in a long text without dumping the whole text when it does not. */
const has = (text: string, re: RegExp, label = String(re)) => expect(re.test(text), label).toBe(true);

describe('German acquisition corpus: shape', () => {
  it('has the planned number of texts per work, numbered 1..n, and nothing else', () => {
    expect(docs).toHaveLength(PLAN.reduce((n, p) => n + p.texts, 0));
    for (const p of PLAN) {
      const ds = byWork(p.slug);
      expect(ds, p.slug).toHaveLength(p.texts);
      expect(ds.map((d) => d.work?.chapter?.index), p.slug).toEqual(Array.from({ length: p.texts }, (_, i) => i + 1));
      ds.forEach((d, i) => {
        expect(d.work?.chapter?.title, d.id).toBe(d.title);
        expect(d.id, d.id).toBe(`${p.slug}-${String(i + 1).padStart(2, '0')}`);
        expect(files).toContain(`${d.id}.json`);
        expect(d.lang, d.id).toBe('de');
        expect(d.contentType, d.id).toBe(p.type);
        expect(d.difficulty, d.id).toBe(p.difficulty);
      });
    }
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => d.source.id)).size).toBe(docs.length);
    for (const d of docs) expect(d.source.id, d.id).toBe(`src:de:${d.id}`);
  });

  it('uses the German comprehensible-input corpus block of the existing German documents', () => {
    for (const d of docs) expect(d.corpus, d.id).toEqual({ id: 'ci-de', kind: 'comprehensible-input', title: 'Comprehensible input — German' });
  });

  it('word counts are in range for each work', () => {
    for (const p of PLAN) for (const d of byWork(p.slug)) {
      const n = wordCount(d);
      expect(n, `${d.id} has ${n} words`).toBeGreaterThanOrEqual(p.min);
      expect(n, `${d.id} has ${n} words`).toBeLessThanOrEqual(p.max);
    }
  });

  it('no sentence is longer than the limit of its level', () => {
    for (const p of PLAN) for (const d of byWork(p.slug)) for (const s of sentencesOf(d)) {
      expect(wordsOf(s.text).length, `${d.id}: ${s.text}`).toBeLessThanOrEqual(p.maxSentence);
    }
  });

  it('sentences lengthen from Weg 1 to 2 to 3', () => {
    const mean = (slug: string) => {
      const ss = byWork(slug).flatMap(sentencesOf);
      return ss.reduce((a, s) => a + wordsOf(s.text).length, 0) / ss.length;
    };
    expect(mean('weg-1')).toBeLessThan(mean('weg-2'));
    expect(mean('weg-2')).toBeLessThan(mean('weg-3'));
  });

  it('streams, variety and domains are set per work', () => {
    for (const p of PLAN) for (const d of byWork(p.slug)) {
      const x = d as CorpusDocument & { streams?: string[]; domains?: string[]; variety?: string };
      expect(x.streams, d.id).toEqual(p.streams);
      expect(x.variety, d.id).toBe('de-DE');
      expect(x.domains?.length, d.id).toBeGreaterThan(0);
    }
    // the work is one the German course holds (src/course/german.ts), with the same streams and variety
    for (const p of PLAN) {
      const w = GERMAN_WORKS.find((x) => x.id.endsWith(`:${p.slug}`));
      expect(w, p.slug).toBeDefined();
      expect(w?.streams, p.slug).toEqual(p.streams);
      expect(w?.variety, p.slug).toBe('de-DE');
    }
  });
});

describe('German acquisition corpus: validation and publication', () => {
  const batch = validateBatch(raw, { registry, knownWorks });

  it('every document validates with the real validator (batch and one by one)', () => {
    expect(batch.documents).toHaveLength(docs.length);
    for (const r of batch.documents) {
      const errors = r.issues.filter((i) => i.severity === 'error');
      expect(errors.map((e) => `${e.path}: ${e.message}`), r.id).toEqual([]);
    }
    expect(batch.ok).toBe(true);
    for (const d of docs) expect(validateDocument(d, { registry, knownWorks }).filter((i) => i.severity === 'error'), d.id).toEqual([]);
  });

  it('raises no warning except low analysis coverage (while the lexicon grows) and the adapter\'s sentence splitting', () => {
    const other: string[] = [];
    for (const r of batch.documents) {
      for (const w of r.issues.filter((i) => i.severity === 'warning')) {
        if (w.code !== 'adapter-would-split' && w.code !== 'low-analysis-coverage') other.push(`${r.id} ${w.code} ${w.path}`);
      }
    }
    expect(other).toEqual([]);
  });

  it('every document is a machine draft, owner-authored, unreviewed and NOT published, for the one stated reason', () => {
    for (const d of docs) {
      expect(d.generated, d.id).toBe(true);
      expect(d.review.status, d.id).toBe('unreviewed');
      expect(d.review.reviewedBy, d.id).toBeUndefined();
      expect(d.source.rights, d.id).toBe('owner-authored');
      expect(d.source.authorship, d.id).toBe('generated');
      expect(d.source.attribution, d.id).toMatch(/Drafted by an AI model; not yet reviewed by a native speaker/);
      expect(d.source.provenance, d.id).toMatch(/Drafted by an AI model for the course; not reviewed by a native speaker/);
      expect(d.editorialTags, d.id).toEqual(expect.arrayContaining(['machine-drafted', 'needs-native-review']));
      expect(d.english?.source, d.id).toBe('drafted with the text; not reviewed');
      const gate = computePublished(d);
      expect(gate.published, d.id).toBe(false);
      expect(gate.unpublishedReasons, d.id).toHaveLength(1);
      expect(gate.unpublishedReasons[0], d.id).toMatch(/native-speaker review/);
    }
  });

  it('Deutschland — Lesungen say that a German reviewer must check them', () => {
    for (const d of byWork('deutschland-lesungen-1')) {
      expect(d.source.provenance, d.id).toMatch(/German reviewer/);
      expect(d.review.notes, d.id).toMatch(/German reviewer/);
      expect(d.editorialTags, d.id).toContain('needs-regional-review');
    }
  });
});

describe('German acquisition corpus: sentences and English', () => {
  it('exactly one non-empty English line per declared sentence, and no author analysis spans', () => {
    for (const d of docs) {
      for (const s of sentencesOf(d)) {
        expect(s.text.trim().length, d.id).toBeGreaterThan(0);
        expect(typeof s.english === 'string' && s.english.trim().length > 0, `${d.id}: ${s.text}`).toBe(true);
        expect(s.spans, `${d.id}: ${s.text}`).toBeUndefined();
        expect(s.corrections, `${d.id}: ${s.text}`).toBeUndefined();
      }
      for (const sec of d.sections) for (const p of sec.paragraphs) expect('sentences' in p, d.id).toBe(true);
    }
  });

  it('text is NFC and trimmed; quotation marks are German („ “), balanced, and there are no straight quotes', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(s.text, d.id).toBe(s.text.normalize('NFC'));
      expect(s.text, d.id).toBe(s.text.trim());
      expect(s.text, `${d.id}: ${s.text}`).not.toMatch(/["«»]/);
      expect((s.text.match(/„/g) ?? []).length, `${d.id}: ${s.text}`).toBe((s.text.match(/“/g) ?? []).length);
    }
  });

  it('dialogues declare their speakers, and every sentence has one of them', () => {
    for (const d of byWork('gespraeche-1')) {
      const speakers = (d as CorpusDocument & { speakers?: Record<string, string> }).speakers ?? {};
      expect(Object.keys(speakers).length, d.id).toBeGreaterThanOrEqual(2);
      const used = new Set<string>();
      for (const s of sentencesOf(d)) {
        expect(s.speaker && speakers[s.speaker], `${d.id}: ${s.text}`).toBeTruthy();
        used.add(s.speaker as string);
      }
      expect(used.size, d.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('German acquisition corpus: modern spelling of Germany', () => {
  const OLD = /(?<!\p{L})(daß|muß\p{L}*|wußt\p{L}*|läßt|ißt|naß|Faß|Kuß|Fluß|Schluß|Haß|Schloß|bißchen|gewiß|Genuß|Nuß|Paß|Anlaß|Verständniß|Roß|dass?\s?ß)(?!\p{L})/iu;
  const SWISS_OR_ALL_SS = /(?<!\p{L})(strasse\p{L}*|gross\p{L}*|heiss\p{L}*|weiss\p{L}*|fuss\p{L}*|gruss\p{L}*|grüsse\p{L}*|spass|draussen|ausser\p{L}*|schliess\p{L}*|geniess\p{L}*|fliess\p{L}*|süss\p{L}*)(?!\p{L})/iu;

  it('uses dass and muss, never daß or muß, and no other pre-1996 ß', () => {
    for (const d of docs) for (const s of sentencesOf(d)) expect(OLD.test(s.text), `${d.id}: ${s.text}`).toBe(false);
    expect(docs.map(textOf).join(' ')).toMatch(/(?<!\p{L})dass(?!\p{L})/u);
    expect(docs.map(textOf).join(' ')).toMatch(/(?<!\p{L})muss(?!\p{L})/u);
  });

  it('writes ß after long vowels and diphthongs only, and never ss where ß belongs', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(SWISS_OR_ALL_SS.test(s.text), `${d.id}: ${s.text}`).toBe(false);
      for (const m of s.text.matchAll(/(.{0,2})ß/gu)) {
        // ß follows a long vowel (a e i o u ä ö ü) or a diphthong (au, ei, eu, äu, ie), never a consonant
        expect(m[1], `${d.id}: ${s.text}`).toMatch(/[aeiouäöüAEIOUÄÖÜ]$/u);
      }
    }
  });

  it('is Standard German of Germany: no Swiss or Austrian markers', () => {
    const all = docs.map(textOf).join(' ');
    for (const w of ['Grüezi', 'Servus', 'Jänner', 'Paradeiser', 'Erdäpfel', 'Moin', 'Grüß Gott']) expect(all.includes(w), w).toBe(false);
  });
});

describe('German acquisition corpus: what each level seeds', () => {
  it('Weg 1 opens with the owner\'s progression, in the present tense, with sein and haben, nominative and accusative', () => {
    const w1 = byWork('weg-1');
    expect(sentencesOf(w1[0]).map((s) => s.text).slice(0, 2)).toEqual(['Ich bin Anna.', 'Ich habe ein Haus.']);
    const t = textOf(w1[0]);
    for (const line of ['Ich habe auch ein Buch.', 'Das Buch ist auf dem Tisch.', 'Ich nehme das Buch.', 'Jetzt habe ich das Buch in der Hand.']) {
      expect(t, line).toContain(line);
    }
    const all = allText('weg-1');
    has(all, /\bIch bin\b/);
    has(all, /\bhat\b/);
    has(all, /\bist\b/);
    has(all, /\b(einen|den|keinen) \p{L}+/u); // accusative masculine
    // nothing but the present: no preterite of sein/haben, no perfect, no subordinate clause
    const PERFECT = ['gesehen', 'gegangen', 'gemacht', 'gekommen', 'gegessen', 'gefahren', 'gehabt', 'gewesen', 'gelesen', 'genommen'];
    for (const d of w1) for (const s of sentencesOf(d)) {
      expect(s.text, `${d.id}: ${s.text}`).not.toMatch(/(?<!\p{L})(war|waren|hatte|hatten|weil|dass|wenn|als|ob)(?!\p{L})/u);
      for (const w of wordsOf(s.text)) expect(PERFECT, `${d.id}: ${s.text}`).not.toContain(w);
    }
    for (const d of w1) for (const s of sentencesOf(d)) expect(wordsOf(s.text).length, s.text).toBeGreaterThanOrEqual(2);
  });

  it('Weg 1 repeats heavily: the 40 most frequent word forms cover at least 70 % of the running words', () => {
    const freq = new Map<string, number>();
    let total = 0;
    for (const d of byWork('weg-1')) for (const w of wordsOf(textOf(d))) { freq.set(w, (freq.get(w) ?? 0) + 1); total++; }
    const top = [...freq.values()].sort((a, b) => b - a).slice(0, 40).reduce((a, n) => a + n, 0);
    console.info(`Weg 1: ${total} running words, ${freq.size} distinct forms, top-40 forms cover ${((top / total) * 100).toFixed(1)} %`);
    expect(top / total).toBeGreaterThanOrEqual(0.7);
  });

  it('Weg 2 seeds separable verbs in main clauses (steht … auf, fängt … an, ruft … an, kauft … ein, kommt … mit, gehen … zurück)', () => {
    const t = allText('weg-2');
    for (const re of [
      /\bsteht\b[^.!?]*\bauf\b/, /\bfängt\b[^.!?]*\ban\b/, /\bruft\b[^.!?]*\ban\b/, /\bkauft\b[^.!?]*\bein\b/,
      /\bkommt\b[^.!?]*\bmit\b/, /\bgehen\b[^.!?]*\bzurück\b/, /\bkommt\b[^.!?]*\bzurück\b/, /\bhole\b[^.!?]*\bab\b/, /\bfährt\b[^.!?]*\bab\b/,
    ]) has(t, re);
  });

  it('Weg 2 seeds dative with the common prepositions, the contractions, the modal verbs, the perfect and weil / dass', () => {
    const t = allText('weg-2').toLowerCase();
    const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u');
    for (const p of ['in', 'auf', 'an', 'mit', 'zu', 'bei', 'nach', 'von', 'aus']) has(t, word(p), p);
    for (const c of ['im', 'ins', 'am', 'zum', 'zur', 'beim', 'vom']) has(t, word(c), c);
    for (const m of ['kann', 'können', 'muss', 'musst', 'will', 'wollen', 'möchte']) has(t, word(m), m);
    has(t, /\b(mit|auf|in|bei|aus|nach|von|zu) (dem|der|einem|seinem|ihrem|meinem|diesem) \p{L}+/u, 'dative after a preposition');
    has(t, /\b(ist|sind|bin) [^.!?]*\b(gefahren|gegangen|gekommen|geblieben)\b/, 'perfect with sein');
    has(t, /\b(hat|habe|haben) [^.!?]*\b(gegessen|gemacht|gesehen|gegeben|getrunken|gebacken)\b/, 'perfect with haben');
    has(t, /, weil /, 'weil clause');
    has(t, /, dass /, 'dass clause');
  });

  it('Weg 3 seeds subordinate clauses (weil, dass, wenn, als, ob), the preterite, relative clauses and separable verbs', () => {
    const t = allText('weg-3').toLowerCase();
    const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u');
    for (const c of ['weil', 'dass', 'wenn', 'als', 'ob']) has(t, word(c), c);
    for (const v of ['war', 'hatte', 'ging', 'kam', 'sah', 'sagte']) has(t, word(v), v);
    has(t, /, (das|die|der|den|dem|in der) [^,.!?]*\b(hatte|war|saß|stand|lag|hat|kennt|habe)\b/, 'a relative clause');
    has(t, /\b(aufgestanden|angerufen|abgefahren|mitgebracht)\b/, 'separable verbs in the perfect');
    has(t, /\b(weiterfuhr|aufmachte|umsteigen mussten|herauszunehmen)\b/, 'separable verbs in subordinate clauses and zu-infinitives');
    has(t, /\b(kleine|große|neue|alte|ältere|schwarze|beste|schönen|kalten)\b/, 'adjective endings in use');
  });

  it('Weg 3 holds a letter and a plain-German retelling of a parable', () => {
    const letter = byWork('weg-3').find((d) => /^Liebe Oma,/.test(sentencesOf(d)[0].text));
    expect(letter, 'the letter').toBeDefined();
    expect(textOf(letter as CorpusDocument)).toMatch(/Viele liebe Grüße/);
    const parable = byWork('weg-3').find((d) => /^Ein Mann hatte zwei Söhne\./.test(textOf(d)));
    expect(parable, 'the parable').toBeDefined();
    expect(sentencesOf(parable as CorpusDocument).at(-1)?.text).toBe('Die Geschichte sagt nicht, ob der ältere Sohn ins Haus ging.');
  });

  it('Deutschland — Lesungen cover the train and tram, a Sunday in the congregation, bakery and market, and a first family visit', () => {
    const ds = byWork('deutschland-lesungen-1');
    expect(textOf(ds[0])).toMatch(/Regionalzug/);
    expect(textOf(ds[0])).toMatch(/Straßenbahn/);
    for (const w of ['Gottesdienst', 'Gemeinde', 'Lied', 'Predigt', 'Kaffee']) expect(textOf(ds[1]), w).toContain(w);
    for (const w of ['Bäckerei', 'Wochenmarkt', 'Brötchen']) expect(textOf(ds[2]), w).toContain(w);
    for (const w of ['Hausschuhe', 'Abendbrot', 'duzen', 'Sie']) expect(textOf(ds[3]), w).toContain(w);
    // Sie with strangers, du among friends: the last text moves from Sie to du
    expect(textOf(ds[3])).toMatch(/Kommen Sie herein/);
    expect(textOf(ds[3])).toMatch(/Darf ich auch du sagen/);
  });

  it('Gespräche carry the modal particles in real use: at least five of the eight overall, and three in every dialogue', () => {
    const PARTICLES = ['doch', 'mal', 'ja', 'denn', 'eben', 'halt', 'schon', 'wohl'];
    const seen = new Set<string>();
    for (const d of byWork('gespraeche-1')) {
      const ws = new Set(wordsOf(textOf(d)));
      const here = PARTICLES.filter((p) => ws.has(p));
      expect(here.length, `${d.id}: ${here.join(' ')}`).toBeGreaterThanOrEqual(3);
      for (const p of here) seen.add(p);
    }
    console.info(`Gespräche: particles seeded: ${[...seen].join(', ')}`);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it('Gespräche use everyday contractions and both registers: Sie with strangers, du among friends', () => {
    const t = allText('gespraeche-1');
    expect(t).toMatch(/\b(geht's|gibt's)/);
    const ds = byWork('gespraeche-1');
    for (const d of [ds[0], ds[1], ds[2]]) expect(textOf(d), d.id).toMatch(/\b(Sie|Ihnen|Ihre)\b/);
    for (const d of [ds[3], ds[5]]) has(textOf(d), /(?<!\p{L})(du|dir|dich|dein|deine|Komm|Bring)(?!\p{L})/u, `${d.id} uses du`);
    const first = ds.map((d) => (sentencesOf(d)[0].text));
    expect(first[0]).toMatch(/Guten Morgen/);
    expect(ds.map((d) => d.title)).toEqual([
      'Hallo, ich bin Daniel', 'Beim Bäcker', 'Wie komme ich zum Bahnhof?', 'Am Telefon', 'Nach dem Gottesdienst', 'Eine Einladung zum Abendbrot',
    ]);
  });
});

describe('German acquisition corpus: the recurring world', () => {
  it('Weg 1 uses a tiny world: Anna, Paul, Lena, Max, a house, a book, a table, bread', () => {
    const ws = new Set(byWork('weg-1').flatMap((d) => wordsOf(textOf(d))));
    for (const w of ['anna', 'paul', 'lena', 'max', 'haus', 'buch', 'tisch', 'brot', 'hund', 'stadt']) expect(ws.has(w), w).toBe(true);
    expect(ws.size).toBeLessThan(160);
  });

  it('recycles vocabulary: most words of each Weg 2 text were met in Weg 1 or 2 already', () => {
    const seen = new Set(byWork('weg-1').flatMap((d) => wordsOf(textOf(d))));
    for (const d of byWork('weg-2')) {
      const ws = [...new Set(wordsOf(textOf(d)))];
      const known = ws.filter((w) => seen.has(w)).length;
      expect(known / ws.length, d.id).toBeGreaterThan(0.3);
      for (const w of ws) seen.add(w);
    }
  });
});

describe('German acquisition corpus: analysis coverage (reported, not asserted)', () => {
  it('prints the coverage of each text with the German adapter as it is today', () => {
    const batch = validateBatch(raw, { registry, knownWorks });
    const unanalysed = new Map<string, number>();
    let words = 0;
    let analysed = 0;
    const lines: string[] = [];
    for (const r of batch.documents) {
      const c = r.coverage;
      if (!c) { lines.push(`${r.id}: no coverage`); continue; }
      words += c.words; analysed += c.analysed;
      for (const u of c.unanalysed) unanalysed.set(u, (unanalysed.get(u) ?? 0) + 1);
      lines.push(`${r.id.padEnd(28)} ${(c.coverage * 100).toFixed(1).padStart(5)}%  (${c.analysed}/${c.words} words, ${c.unanalysed.length} distinct unanalysed)`);
    }
    console.info(`German acquisition coverage (adapter ${registry.get('de').name} v${registry.get('de').version}):\n${lines.join('\n')}`);
    console.info(`TOTAL ${(words ? (analysed / words) * 100 : 100).toFixed(1)}% (${analysed}/${words}); distinct unanalysed forms across all texts: ${unanalysed.size}`);
    expect(batch.documents.length).toBe(docs.length);
  });
});
