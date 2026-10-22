/**
 * Paradigms and period variants of a Hebrew lemma, read off the installed form indexes (nothing is generated):
 *   paradigm   every attested or listed form of the lemma that stands without attached prefixes or suffix pronouns, as a cell
 *              named by its features; a cell no source holds is absent, never invented.
 *   variants   the word across the periods (the card's "Variants" tab): attested in the Tanakh, listed in the Modern tables,
 *              labelled Mishnaic / Medieval by Wiktionary — or "not in our sources", said so.
 * A lemma is found in an index by its headword, pointed or by consonants (a Modern lemma is written unpointed; a Tanakh headword is
 * pointed); the part of speech must agree when it is given.
 */
import type { GeneratedParadigm, PartOfSpeech, VariantForm, VariantSet } from '../../core';
import { type HeFormRow, type HebrewFormIndex, installedHebrewIndexes, lemmaStem } from './index-store';
import { decodeOshb } from './oshb';
import { heFeaturesFromTableTags } from './tags';
import { consonantal, hasCantillation, isPointed, pointed } from './text';
import { HE_PERIOD_ORDER, HE_VARIETIES } from './varieties';

interface Reverse { byHeadword: Map<string, string[]>; byLemma: Map<string, Array<[key: string, row: HeFormRow]>> }
const REVERSE = new WeakMap<HebrewFormIndex, Reverse>();

function reverse(idx: HebrewFormIndex): Reverse {
  let r = REVERSE.get(idx);
  if (r) return r;
  r = { byHeadword: new Map(), byLemma: new Map() };
  for (const [id, row] of Object.entries(idx.lemmas)) {
    const skel = consonantal(row[0]);
    const list = r.byHeadword.get(skel) ?? [];
    list.push(id);
    r.byHeadword.set(skel, list);
  }
  for (const [key, rows] of Object.entries(idx.forms)) {
    for (const row of rows) {
      const stem = lemmaStem(row[0]);
      const list = r.byLemma.get(stem) ?? [];
      list.push([key, row]);
      r.byLemma.set(stem, list);
    }
  }
  REVERSE.set(idx, r);
  return r;
}

/** Lemma ids of an index whose headword is this lemma (pointed match first, then by consonants), with the part of speech agreeing. */
function lemmaIdsIn(idx: HebrewFormIndex, lemma: string, pos?: PartOfSpeech): string[] {
  const r = reverse(idx);
  const ids = r.byHeadword.get(consonantal(lemma)) ?? [];
  const exact = ids.filter((id) => pointed(idx.lemmas[id][0]) === pointed(lemma));
  const pool = isPointed(lemma) && exact.length ? exact : ids;
  return pool.filter((id) => !pos || idx.lemmas[id][2] === pos || (pos === 'AUX' && idx.lemmas[id][2] === 'VERB'));
}

const KIND: Partial<Record<PartOfSpeech, GeneratedParadigm['kind']>> = { NOUN: 'noun-declension', PROPN: 'noun-declension', ADJ: 'adjective-declension', NUM: 'adjective-declension', VERB: 'verb-conjugation', AUX: 'verb-conjugation', PRON: 'pronoun-paradigm', DET: 'determiner-paradigm' };

export function heParadigm(lemma: string, pos: PartOfSpeech): GeneratedParadigm | undefined {
  const kind = KIND[pos];
  if (!kind) return undefined;
  const cells = new Map<string, { features: Record<string, string>; form: string; note?: string }>();
  const sources: string[] = [];
  let binyan: string | undefined;
  for (const idx of installedHebrewIndexes()) {
    const ids = lemmaIdsIn(idx, lemma, pos);
    if (!ids.length) continue;
    const r = reverse(idx);
    let used = false;
    for (const id of ids) {
      for (const [key, row] of r.byLemma.get(id) ?? []) {
        let features: Record<string, string> | undefined;
        let note: string | undefined;
        if (idx.codes === 'oshb') {
          const d = decodeOshb(row[0], row[1]);
          // a prefix chain is the same cell as the bare form — except the sequential forms, whose וַ / וְ IS the form
          const sequential = (d.morph.Conj === 'Wayyiqtol' || d.morph.Conj === 'WeQatal') && row[0].startsWith('c/') && !row[0].slice(2).includes('/');
          if (row[0].includes('/') && !sequential) continue;
          if (d.suffix) continue; // pronominal and other suffixes: not a cell of the bare paradigm
          features = { ...d.morph };
          delete features.Definite;
          if (d.aramaic) note = 'Biblical Aramaic';
          binyan ??= features.Binyan;
        } else {
          const tags = row[1] ? row[1].split('|') : [];
          if (tags.includes('citation-form')) continue;
          features = heFeaturesFromTableTags(tags, pos);
          if (!features) continue;
          binyan ??= features.Binyan;
        }
        if (!Object.keys(features).length) continue;
        const fk = Object.keys(features).sort().map((k) => `${k}=${features![k]}`).join('|');
        const have = cells.get(fk);
        if (!have) cells.set(fk, { features, form: key, ...(note ? { note } : {}) });
        else if (have.form !== key && !(have.note ?? '').includes(key)) have.note = `${have.note ? `${have.note}; ` : ''}also ${key}`;
        used = true;
      }
    }
    if (used) sources.push(idx.id);
  }
  if (!cells.size) return undefined;
  const layout = kind === 'verb-conjugation'
    ? { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] as Array<[string, string]> }, rows: { key: 'Person', values: [['1', '1st'], ['2', '2nd'], ['3', '3rd']] as Array<[string, string]> }, sections: ['Binyan', 'Conj', 'Gender', 'Voice', 'VerbForm'] }
    : kind === 'pronoun-paradigm' || kind === 'determiner-paradigm'
      ? { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] as Array<[string, string]> }, rows: { key: 'Person', values: [['1', '1st'], ['2', '2nd'], ['3', '3rd']] as Array<[string, string]> }, sections: ['PronType', 'Gender'] }
      : { columns: { key: 'Number', values: [['Sing', 'singular'], ['Dual', 'dual'], ['Plur', 'plural']] as Array<[string, string]> }, rows: { key: 'State', values: [['Abs', 'absolute'], ['Cons', 'construct'], ['Det', 'determined']] as Array<[string, string]> }, sections: ['Gender', 'Poss', 'Person'] };
  return {
    kind, cells: [...cells.values()], layout, ...(binyan ? { template: binyan } : {}),
    notes: [
      `Cells are the forms the sources hold for this word: ${sources.map((s) => (s.startsWith('oshb') ? 'attested in the Tanakh (Open Scriptures morphology)' : 'listed in the Wiktionary table')).join(' and ')}. A cell no source holds is absent — nothing is generated. Forms with attached prefixes (וְ בְּ לְ …) or pronominal suffixes are not listed as cells.`,
    ],
  };
}

/** The word across the periods: what each source attests, or that it attests nothing. */
export function heVariants(lemma: string, pos?: PartOfSpeech, surface?: string): VariantSet | undefined {
  const rows: VariantForm[] = [];
  const indexes = installedHebrewIndexes();
  const tanakh = indexes.filter((i) => i.codes === 'oshb');
  const modern = indexes.filter((i) => i.codes === 'kaikki-tags');
  if (!tanakh.length && !modern.length) return undefined;
  const surfaceKey = surface ? pointed(surface) : undefined;
  const currentIsBiblical = !!surface && (hasCantillation(surface) || tanakh.some((i) => surfaceKey! in i.forms && !modern.some((m) => surfaceKey! in m.forms)));

  // Biblical: attested lemma(s) with the token count
  const bib: { forms: string[]; count: number; aramaic: boolean } = { forms: [], count: 0, aramaic: false };
  // the compiled core and the full index hold the same lemma ids: a lemma is counted once (the larger figure), never summed across them
  const counted = new Map<string, number>();
  for (const idx of tanakh) for (const id of lemmaIdsIn(idx, lemma, pos)) {
    const row = idx.lemmas[id];
    if (!bib.forms.includes(row[0])) bib.forms.push(row[0]);
    counted.set(id, Math.max(counted.get(id) ?? 0, row[3]));
    for (const [, r] of reverse(idx).byLemma.get(id) ?? []) if (r[1][0] === 'A') bib.aramaic = true;
  }
  bib.count = [...counted.values()].reduce((a, b) => a + b, 0);
  // Modern: the lemma row(s) and their period labels
  const mod: { forms: string[]; gloss?: string; labels: Set<string> } = { forms: [], labels: new Set() };
  for (const idx of modern) for (const id of lemmaIdsIn(idx, lemma, pos)) {
    const row = idx.lemmas[id];
    const unpointed = id.split('|')[0];
    for (const f of [row[0], unpointed]) if (f && !mod.forms.includes(f)) mod.forms.push(f);
    mod.gloss ??= row[1] || undefined;
    for (const l of String((row as unknown as unknown[])[5] ?? '').split(',').filter(Boolean)) mod.labels.add(l);
  }
  const fullIndexes = { bib: tanakh.some((i) => i.id === 'oshb-tanakh'), mod: modern.length > 0 };

  // Biblical Aramaic (a heritage language read beside Hebrew): first, when the lemma has readings in the Aramaic chapters of Daniel and Ezra
  if (bib.aramaic) rows.push({ varietyId: 'arc-bib', label: HE_VARIETIES['arc-bib'].label, forms: bib.forms, status: 'attested', sources: ['oshb-tanakh'], note: 'read in the Aramaic chapters (Daniel 2–7, Ezra 4–7) with its own morphology' });
  for (const code of HE_PERIOD_ORDER) {
    const label = HE_VARIETIES[code].label;
    if (code === 'he-bib') {
      if (bib.forms.length) rows.push({ varietyId: code, label, forms: bib.forms, status: 'attested', sources: ['oshb-tanakh'], note: `${bib.count.toLocaleString('en')} occurrence${bib.count === 1 ? '' : 's'} in the Tanakh${bib.aramaic ? ' (some in the Aramaic chapters)' : ''}`, ...(currentIsBiblical ? { current: true } : {}) });
      else if (mod.labels.has('he-bib')) rows.push({ varietyId: code, label, forms: mod.forms, status: 'attested', sources: ['kaikki-he'], note: 'labelled Biblical by Wiktionary; not found as a Tanakh headword here' });
      else rows.push({ varietyId: code, label, forms: [], status: 'not-in-sources', sources: [], note: fullIndexes.bib ? 'no headword of the Tanakh has this form' : 'the full Tanakh index is not loaded; only its core was searched' });
    } else if (code === 'he-mod') {
      if (mod.forms.length) rows.push({ varietyId: code, label, forms: mod.forms, status: 'attested', sources: ['kaikki-he'], ...(mod.gloss ? { gloss: mod.gloss } : {}), ...(!currentIsBiblical && surface ? { current: true } : {}) });
      else rows.push({ varietyId: code, label, forms: [], status: 'not-in-sources', sources: [], note: fullIndexes.mod ? 'no Wiktionary Hebrew entry has this headword' : 'the Modern index is not loaded' });
    } else {
      if (mod.labels.has(code)) rows.push({ varietyId: code, label, forms: mod.forms, status: 'attested', sources: ['kaikki-he'], note: `labelled ${label} by Wiktionary` });
      else rows.push({ varietyId: code, label, forms: [], status: 'not-in-sources', sources: [], note: 'recognised from dictionary labels only; none here' });
    }
  }
  return { lemma, ...(pos ? { pos } : {}), rows };
}
