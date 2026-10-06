/**
 * Readings DERIVED by rule for a written word the word list does not hold, from a base it does hold: a diminutive
 * (Töpfchen), the feminine -in of a listed masculine noun (Mechanikerin, Köchinnen), the genitive of a name (Annas, Jonas'),
 * the clitic es (geht's, wirds), the old full ending of Luther's German (führet, salbest). Every one says in its rule that it is derived; none poses as a listed word. They are tried
 * only when the word has no listed reading, and before any guess.
 */
import type { WordPart } from '../../core';
import type { DeCell, DeLexiconView, DeNoun, DeReading } from './types';
import { morphOfCells } from './types';
import { describeGermanMorph } from './morph-describe';
import { isCapitalised } from './morph-util';
import { separablePrefixVerb } from './morph-separable';

/** The readings the word list itself gives for a word (no derivation, no guess). */
type Listed = (word: string) => DeReading[];


export function deriveReadings(word: string, lex: DeLexiconView, listed: Listed): DeReading[] {
  if (word.length < 4 || !/^[\p{L}'’ʼ]+$/u.test(word)) return [];
  for (const attempt of [() => nameGenitive(word, lex), () => diminutive(word, lex), () => feminine(word, lex), () => clitic(word, listed), () => (isCapitalised(word) ? [] : separablePrefixVerb(word, listed)), () => oldEnding(word, listed)]) {
    const found = attempt();
    if (found.length) return found;
  }
  return [];
}

// ---------------------------------------------------------------------------------------------------------------
// diminutives in -chen and -lein

/** Undo the umlaut of the last umlauted vowel: Töpf → Topf, Häus → Haus, Kämmer → Kammer. */
function undoUmlaut(s: string): string {
  const last = [...s.matchAll(/äu|Äu|ä|Ä|ö|Ö|ü|Ü/g)].pop();
  if (!last) return s;
  const back: Record<string, string> = { ä: 'a', Ä: 'A', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U', äu: 'au', Äu: 'Au' };
  return s.slice(0, last.index) + back[last[0]] + s.slice(last.index + last[0].length);
}

/** The noun a diminutive stem comes from: as written, umlaut undone, with a dropped -e or -en put back (Kätz → Katze, Gärt → Garten). */
function diminutiveBase(stem: string, lex: DeLexiconView): DeNoun | undefined {
  for (const v of new Set([stem, undoUmlaut(stem)])) {
    for (const cand of [v, `${v}e`, `${v}en`]) {
      if (cand.length < 3) continue;
      const hit = lex.nouns(cand.toLowerCase()).find((n) => n.lemma === cand && !n.adjectival && n.gender !== 'pl');
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Features of a neuter diminutive's cells, with the gender stated also for the plural. */
function neuterMorph(cells: DeCell[]): Record<string, string> {
  const m = morphOfCells(cells);
  const out: Record<string, string> = {};
  if (m.Case) out.Case = m.Case;
  out.Gender = 'Neut';
  for (const [k, v] of Object.entries(m)) if (k !== 'Case' && k !== 'Gender') out[k] = v;
  return out;
}

function diminutive(word: string, lex: DeLexiconView): DeReading[] {
  const m = /^(\p{L}+?)(chen|lein)(s?)$/u.exec(word);
  if (!m || !isCapitalised(word)) return [];
  const [, stem, suffix, genitive] = m;
  const base = diminutiveBase(stem, lex);
  if (!base) return [];
  const lemma = `${stem}${suffix}`;
  const parts: WordPart[] = [
    { text: stem, start: 0, end: stem.length, lemma: base.lemma, pos: 'NOUN', kind: 'stem', role: `base noun: ${base.gloss}` },
    { text: suffix, start: stem.length, end: lemma.length, kind: 'marker', role: `diminutive suffix -${suffix}: makes a small or dear one` },
  ];
  if (genitive) parts.push({ text: 's', start: lemma.length, end: word.length, kind: 'marker', role: 'genitive -s' });
  const groups: DeCell[][] = genitive
    ? [[{ c: 'G', g: 'n' }]]
    : [[{ c: 'N', g: 'n' }, { c: 'A', g: 'n' }, { c: 'D', g: 'n' }], [{ c: 'N', g: 'p' }, { c: 'A', g: 'p' }, { c: 'D', g: 'p' }, { c: 'G', g: 'p' }]];
  return groups.map((cells) => {
    const morph = neuterMorph(cells);
    return {
      lemma, pos: 'NOUN', morph, cells, confidence: 0.6, lemmaKnown: false,
      rule: `derived diminutive noun ${lemma} (not in the word list): ${base.lemma} + -${suffix} makes a small or dear one; always neuter, genitive -s, plural unchanged; ${describeGermanMorph(morph)}`,
      parts: parts.map((p) => ({ ...p })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the feminine -in of a masculine noun the list holds

/**
 * The masculine noun a feminine -in comes from: as written, with the umlaut undone (Ärztin → Arzt, Köchin → Koch), with a dropped
 * -e put back (Kollegin → Kollege, Löwin → Löwe). Only a masculine noun counts.
 */
function feminineBase(stem: string, lex: DeLexiconView): DeNoun | undefined {
  for (const v of new Set([stem, undoUmlaut(stem)])) {
    for (const cand of [v, `${v}e`]) {
      const hit = lex.nouns(cand.toLowerCase()).find((n) => n.lemma === cand && n.gender === 'm' && !n.adjectival);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Mechanikerin, Kassiererinnen: the German dictionaries list the feminine form as a word of its own (Lehrerin is not Lehrer), and
 * so does this one; the reading is derived, not listed (0.6, no gloss), and ties the plural -innen to the singular -in, so that
 * the two do not become two lemmas. Listed feminine forms (Lehrerin, Ärztin, Erzieherin) never reach this.
 */
function feminine(word: string, lex: DeLexiconView): DeReading[] {
  const m = /^(\p{Lu}\p{L}{3,}?)(innen|in)$/u.exec(word);
  if (!m) return [];
  const [, stem, suffix] = m;
  const base = feminineBase(stem, lex);
  const plural = suffix === 'innen';
  // -innen is the plural of a feminine -in noun whatever the masculine is (Anwohnerinnen), so it is tied to the singular even where the masculine is not listed
  if (!base && !(plural && stem.length >= 5)) return [];
  const lemma = `${stem}in`;
  const cells: DeCell[] = (['N', 'A', 'D', 'G'] as const).map((c) => ({ c, g: plural ? ('p' as const) : ('f' as const) }));
  const morph = morphOfCells(cells);
  const gendered: Record<string, string> = {};
  if (morph.Case) gendered.Case = morph.Case;
  gendered.Gender = 'Fem';
  for (const [k, v] of Object.entries(morph)) if (k !== 'Case' && k !== 'Gender') gendered[k] = v;
  return [{
    lemma, pos: 'NOUN', morph: gendered, cells, confidence: base ? 0.6 : 0.5, lemmaKnown: false,
    rule: `derived feminine noun ${lemma} (not in the word list): ${base ? `${base.lemma} + -in names the woman` : `the plural -innen of a noun in -in`}; ${describeGermanMorph(gendered)}`,
    parts: [
      { text: stem, start: 0, end: stem.length, ...(base ? { lemma: base.lemma } : {}), pos: 'NOUN', kind: 'stem', role: base ? `masculine noun: ${base.gloss}` : 'the person named' },
      { text: suffix, start: stem.length, end: word.length, kind: 'marker', role: plural ? 'feminine suffix -in, with the plural ending -nen' : 'feminine suffix -in: a woman who does this' },
    ],
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// the genitive of a name

function nameGenitive(word: string, lex: DeLexiconView): DeReading[] {
  if (!isCapitalised(word)) return [];
  const ap = /^(\p{L}+)(['’ʼ])$/u.exec(word);
  const s = !ap && /^(\p{L}{2,})s$/u.exec(word);
  // names in s, ß, x, z take an apostrophe (Jonas'), the others -s (Annas)
  if (ap ? !/[sßxz]$/.test(ap[1]) : !s || /[sßxz]$/.test(s[1])) return [];
  const base = ap ? ap[1] : (s as RegExpExecArray)[1];
  const marker = word.slice(base.length);
  const seen = new Set<string>();
  const out: DeReading[] = [];
  for (const p of lex.plain(base.toLowerCase())) {
    if (p.pos !== 'PROPN' || p.lemma !== base || seen.has(p.lemma)) continue;
    seen.add(p.lemma);
    out.push({
      lemma: p.lemma, pos: 'PROPN', morph: { Case: 'Gen' }, confidence: 0.8, lemmaKnown: true, gloss: p.gloss,
      rule: `derived: the genitive of the name ${p.lemma} (${ap ? 'apostrophe after a name in s, ß, x or z' : 'name + -s'}); not listed as such`,
      parts: [
        { text: base, start: 0, end: base.length, lemma: p.lemma, pos: 'PROPN', kind: 'stem' },
        { text: marker, start: base.length, end: word.length, kind: 'marker', role: ap ? 'apostrophe: genitive of a name ending in s, ß, x or z' : 'genitive -s' },
      ],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// the clitic es: geht's, wirds

const ES_MORPH = { PronType: 'Prs', Person: '3', Number: 'Sing', Gender: 'Neut' };

function clitic(word: string, listed: Listed): DeReading[] {
  const ap = /^(\p{L}{2,})['’ʼ]s$/u.exec(word);
  const bare = !ap && !isCapitalised(word) && /^(\p{L}{2,})s$/u.exec(word);
  const m = ap ?? bare;
  if (!m) return [];
  const base = m[1];
  const written = word.slice(base.length);
  const parts = (lemma: string, pos: DeReading['pos'], text = base): WordPart[] => [
    { text, start: 0, end: text.length, lemma, pos, kind: 'stem' },
    { text: written, start: text.length, end: word.length, lemma: 'es', pos: 'PRON', morph: { ...ES_MORPH }, kind: 'clitic', role: 'the pronoun es, shortened to s' },
  ];
  const out: DeReading[] = [];
  const keep = (r: DeReading): boolean => r.lemmaKnown && (
    (r.pos === 'VERB' && r.morph.VerbForm === 'Fin') ||
    (r.pos === 'PRON' && (!!ap || r.morph.PronType === 'Prs' || r.morph.Reflex === 'Yes')));
  for (const r of listed(base).filter(keep)) {
    const c: DeReading = {
      ...r, parts: parts(r.lemma, r.pos), confidence: ap ? r.confidence : 0.6,
      rule: `${r.rule}; derived: ${word} is ${base} + the clitic es (${written})`,
    };
    out.push(c);
  }
  if (ap && !base.endsWith('e')) {
    // hab's, mach's: the -e of the first person singular is dropped in speech
    for (const r of listed(`${base}e`)) {
      if (!(r.pos === 'VERB' && r.lemmaKnown && r.morph.Mood === 'Ind' && r.morph.Tense === 'Pres' && r.morph.Number === 'Sing' && r.morph.Person?.split(',').includes('1'))) continue;
      out.push({
        ...r, parts: parts(r.lemma, r.pos), confidence: 0.6,
        rule: `${r.rule}; derived: ${word} is ${base}(e) with the -e dropped, + the clitic es (${written})`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// the old full endings -et / -est

export function oldEnding(word: string, listed: Listed): DeReading[] {
  if (isCapitalised(word)) return [];
  const m = /^(\p{L}{2,}?)(est|et)$/u.exec(word);
  if (!m) return [];
  const [, stem, end] = m;
  const today = end === 'est' ? `${stem}st` : `${stem}t`;
  const person = (r: DeReading, p: string, n: string): boolean => r.morph.Number === n && !!r.morph.Person?.split(',').includes(p);
  const fits = (r: DeReading): boolean => {
    if (!(r.pos === 'VERB' && r.lemmaKnown && r.morph.VerbForm === 'Fin' && r.morph.Tense !== 'Past')) return false;
    if (end === 'est') return r.morph.Mood === 'Ind' && person(r, '2', 'Sing');
    return (r.morph.Mood === 'Ind' && (person(r, '3', 'Sing') || person(r, '2', 'Plur'))) || (r.morph.Mood === 'Imp' && person(r, '2', 'Plur'));
  };
  const out: DeReading[] = [];
  for (const r of listed(today)) {
    if (!fits(r)) continue;
    const c: DeReading = {
      ...r, confidence: 0.6, register: ['literary'],
      rule: `${r.rule}; derived: the full ending -${end} is the older form of today's ${today} (as in Luther's German)`,
    };
    delete c.parts;
    out.push(c);
  }
  return out;
}

