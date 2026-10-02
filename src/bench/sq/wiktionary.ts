/**
 * English Wiktionary's Albanian entries (the kaikki.org extract, CC BY-SA) as a second, independent statement about
 * written forms: which lemma a form belongs to and what the entry's own tables say about it. Used for VALIDATION only
 * (npm run sq:agreement); the file is research material in data/research/kaikki/, never bundled by this module.
 *
 * What is read from an entry:
 *   - the headword itself (the lemma, with the entry's part of speech);
 *   - its `forms` — the principal parts in the head line (aorist, participle, plural, definite) and every cell of the
 *     inflection table — but single written words only: a cell such as "kam hipur" or "do të hip" is a phrase and says
 *     nothing about one form. Two exceptions, both a fixed first word that is not part of the form: "të hip" (the
 *     subjunctive after its particle) and an adjective, possessive or pronoun written with its linking article
 *     ("i mirë", "të mira");
 *   - a sense that says "X of Y" (`form_of`): the form's own entry (dha: third-person singular aorist of jap).
 * What is NOT read: a form or sense marked as dialectal, older, non-standard or a spelling variant (Gheg, Tosk,
 * Arbëresh, archaic, obsolete, alternative …) — this comparison is about Standard Albanian — and anything the extract
 * itself marks as unrecognised.
 *
 * Tags are mapped to this adapter's feature names (src/adapters/albanian/types.ts); a tag with no counterpart is
 * ignored, never guessed. The tables' "dative" row is the genitive-dative form (librit), so it maps to Gen,Dat.
 */
import { sqNormalize } from '../../adapters/albanian/orthography';

export interface WiktReading {
  lemma: string;
  /** This adapter's part of speech for the entry. */
  pos: string;
  morph: Record<string, string>;
  /** Where the statement comes from: the headword, a table cell or head-line form, or a form-of entry. */
  from: 'headword' | 'table' | 'form-of';
  /** The entry has a full inflection table: only then does the ABSENCE of a form from a cell say anything. */
  tabled: boolean;
}

export interface KaikkiEntry {
  word?: string;
  pos?: string;
  forms?: Array<{ form?: string; tags?: string[] }>;
  senses?: Array<{ tags?: string[]; form_of?: Array<{ word?: string }>; glosses?: string[] }>;
}

const POS: Readonly<Record<string, string>> = {
  verb: 'VERB', noun: 'NOUN', name: 'PROPN', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', num: 'NUM',
  prep: 'ADP', conj: 'CONJ', particle: 'PART', intj: 'INTJ', article: 'DET',
};

/** A form or sense carrying one of these is not a statement about Standard Albanian, or not a statement at all. */
const SKIP = new Set([
  'Gheg', 'Tosk', 'dialectal', 'Arbëresh', 'Arvanitika', 'Cham', 'Old-Albanian', 'archaic', 'obsolete', 'dated', 'rare',
  'nonstandard', 'Northern', 'Northwestern', 'Northeastern', 'North', 'South', 'Southern', 'Eastern', 'Middle', 'Kosovo',
  'Macedonia', 'Ukraine', 'regional', 'historical', 'colloquial', 'informal', 'uncommon', 'proscribed', 'familiar',
  'misspelling', 'pronunciation-spelling', 'abbreviation', 'romanization', 'alternative', 'canonical',
  'table-tags', 'inflection-template', 'error-unrecognized-form', 'error-unknown-tag', 'vulgar',
]);

const TAG: Readonly<Record<string, readonly [string, string]>> = {
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'],
  indicative: ['Mood', 'Ind'], subjunctive: ['Mood', 'Sub'], imperative: ['Mood', 'Imp'], optative: ['Mood', 'Opt'], admirative: ['Mood', 'Adm'],
  present: ['Tense', 'Pres'], imperfect: ['Tense', 'Imp'], aorist: ['Tense', 'Past'],
  participle: ['VerbForm', 'Part'],
  nominative: ['Case', 'Nom'], accusative: ['Case', 'Acc'], genitive: ['Case', 'Gen'], ablative: ['Case', 'Abl'],
  definite: ['Definite', 'Def'], indefinite: ['Definite', 'Ind'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'], neuter: ['Gender', 'Neut'],
  active: ['Voice', 'Act'], mediopassive: ['Voice', 'Mid'], passive: ['Voice', 'Mid'],
};

/** Compound tenses and moods the tables build with a second word; a cell carrying one is a phrase. */
const PHRASAL = new Set(['perfect', 'pluperfect', 'future', 'future-i', 'future-ii', 'conditional', 'past', 'past-i', 'past-ii', 'progressive', 'gerund', 'infinitive', 'negative', 'jussive']);

/** kaikki tags → features; `undefined` when the tags mark something this comparison does not read. */
export function kaikkiTagsToMorph(tags: readonly string[]): Record<string, string> | undefined {
  if (tags.some((t) => SKIP.has(t))) return undefined;
  const sets: Record<string, string[]> = {};
  const add = (k: string, v: string) => { if (!(sets[k] ??= []).includes(v)) sets[k].push(v); };
  for (const t of tags) {
    const hit = TAG[t];
    if (hit) add(hit[0], hit[1]);
    else if (t === 'dative') { add('Case', 'Gen'); add('Case', 'Dat'); }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.join(',')]));
}

const ARTICLES = new Set(['i', 'e', 'të', 'së']);
const ARTICULATED_POS = new Set(['ADJ', 'DET', 'PRON', 'NUM']);
/** Stress marks the head line writes on the canonical form (líbër) are not spelling. */
const plain = (s: string): string => sqNormalize(s.normalize('NFD').replace(/[́̀]/g, '').normalize('NFC'));

/** The single written form a table cell states, or undefined for a phrase. */
function cellForm(form: string, tags: readonly string[], pos: string): string | undefined {
  const words = form.trim().split(/\s+/);
  if (words.length === 1) return tags.some((t) => PHRASAL.has(t)) ? undefined : plain(words[0]);
  if (words.length !== 2) return undefined;
  const [first, second] = words.map(plain);
  // "të hip": the present subjunctive after its particle (not the perfect, imperfect or admirative subjunctive)
  if (pos === 'VERB' && first === 'të' && tags.includes('subjunctive') && tags.includes('present') && !tags.some((t) => PHRASAL.has(t) || t === 'admirative')) return second;
  if (ARTICULATED_POS.has(pos) && ARTICLES.has(first)) return second;
  return undefined;
}

/** The head line's principal parts and the table cell each must be found in. */
const HEAD_CELL: Readonly<Record<string, Record<string, string>>> = {
  aorist: { Tense: 'Past', Person: '1', Number: 'Sing' },
  participle: { VerbForm: 'Part' },
  plural: { Number: 'Plur', Definite: 'Ind', Case: 'Nom' },
  definite: { Number: 'Sing', Definite: 'Def', Case: 'Nom' },
};

/**
 * Does the entry have a full inflection table that agrees with its own head line? The tables are generated by
 * templates, and an entry given the wrong template shows it: the head line says "përfundova, përfunduar" and the table
 * "përfundoja, përfundojur". Such a table (and an entry without one) is not used to say that a form is absent; its
 * cells are still read as partial statements. The check: every principal part the head line gives (aorist,
 * participle, plural, definite) must stand in the corresponding cell of the table.
 */
export function hasConsistentTable(e: KaikkiEntry, pos: string): boolean {
  const forms = e.forms ?? [];
  const at = forms.findIndex((f) => (f.tags ?? []).includes('inflection-template'));
  if (at < 0) return false;
  const cells = forms.slice(at + 1).flatMap((f) => {
    const morph = f.form ? kaikkiTagsToMorph(f.tags ?? []) : undefined;
    const form = morph && f.form ? cellForm(f.form, f.tags ?? [], pos) : undefined;
    return morph && form ? [{ form, morph }] : [];
  });
  for (const f of forms.slice(0, at)) {
    const tags = f.tags ?? [];
    if (tags.length !== 1 || !f.form || /\s/.test(f.form.trim())) continue;
    const want = HEAD_CELL[tags[0]];
    if (!want) continue;
    const head = plain(f.form);
    if (!cells.some((c) => c.form === head && Object.entries(want).every(([k, v]) => c.morph[k] === v))) return false;
  }
  return true;
}

/** Every statement one entry makes about a written form: [normalized form, reading]. */
export function kaikkiEntryReadings(e: KaikkiEntry): Array<[string, WiktReading]> {
  const pos = POS[e.pos ?? ''];
  if (!pos || !e.word || /\s/.test(e.word.trim())) return [];
  const out: Array<[string, WiktReading]> = [];
  const word = plain(e.word);
  const senses = e.senses ?? [];
  const formOf = senses.filter((s) => s.form_of?.length);
  const tabled = hasConsistentTable(e, pos);
  // a headword is a lemma unless every sense only points at another word
  if (formOf.length < senses.length || senses.length === 0) out.push([word, { lemma: word, pos, morph: {}, from: 'headword', tabled }]);
  for (const s of formOf) {
    const morph = kaikkiTagsToMorph((s.tags ?? []).filter((t) => t !== 'form-of'));
    if (!morph) continue;
    for (const target of s.form_of ?? []) {
      if (!target.word || /\s/.test(target.word.trim())) continue;
      out.push([word, { lemma: plain(target.word), pos, morph, from: 'form-of', tabled: false }]);
    }
  }
  if (formOf.length < senses.length) {
    for (const f of e.forms ?? []) {
      if (!f.form || f.form === '-') continue;
      const tags = f.tags ?? [];
      const morph = kaikkiTagsToMorph(tags);
      if (!morph) continue;
      const form = cellForm(f.form, tags, pos);
      if (!form) continue;
      out.push([form, { lemma: word, pos, morph, from: 'table', tabled }]);
    }
  }
  return out;
}

export interface WiktIndex {
  /** form → every statement about it. */
  forms: Map<string, WiktReading[]>;
  /** lemma → the cells of its full inflection table(s): [form, statement]. Only entries that have a table. */
  tables: Map<string, Array<[string, WiktReading]>>;
}

/** The index of the extract's lines (one JSON object per line). Lines that are not JSON are skipped. */
export function buildWiktIndex(lines: Iterable<string>): WiktIndex {
  const index: WiktIndex = { forms: new Map(), tables: new Map() };
  for (const line of lines) {
    if (!line.trim()) continue;
    let e: KaikkiEntry;
    try { e = JSON.parse(line) as KaikkiEntry; } catch { continue; }
    for (const [form, r] of kaikkiEntryReadings(e)) {
      const list = index.forms.get(form) ?? [];
      list.push(r);
      index.forms.set(form, list);
      if (r.tabled && r.from === 'table') {
        const cells = index.tables.get(r.lemma) ?? [];
        cells.push([form, r]);
        index.tables.set(r.lemma, cells);
      }
    }
  }
  return index;
}
