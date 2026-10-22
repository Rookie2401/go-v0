/**
 * Paradigms and period variants of a Greek lemma, read off the installed form indexes (nothing is generated) — the Hebrew design
 * (src/adapters/hebrew/paradigm.ts) with Greek sources:
 *   paradigm   every form a source attests (MorphGNT) or lists (a Wiktionary table) for the lemma, as a cell named by its features;
 *              a cell no source holds is absent.
 *   variants   the word across the periods (the card's "Variants" tab): Homeric from the Epic tables and forms, Attic from the
 *              default tables, Koine from the New Testament (with the Septuagint count) and Koine-labelled forms, Medieval from
 *              Byzantine-labelled forms, Modern from the Modern tables or the descendant Wiktionary states — or "not in our sources".
 */
import type { GeneratedParadigm, PartOfSpeech, VariantForm, VariantSet } from '../../core';
import { type ElFormRow, type GreekFormIndex, installedGreekIndexes } from './index-store';
import { decodeMorphGnt } from './morphgnt';
import { elFeaturesFromTableTags } from './tags';
import { bare, elKey, isPolytonic } from './text';
import { EL_PERIOD_ORDER, EL_VARIETIES, elVarietiesFromTags } from './varieties';

interface Reverse { byHeadword: Map<string, string[]>; byBare: Map<string, string[]>; byLemma: Map<string, Array<[key: string, row: ElFormRow]>> }
const REVERSE = new WeakMap<GreekFormIndex, Reverse>();
function reverse(idx: GreekFormIndex): Reverse {
  let r = REVERSE.get(idx);
  if (r) return r;
  r = { byHeadword: new Map(), byBare: new Map(), byLemma: new Map() };
  for (const [id, row] of Object.entries(idx.lemmas)) {
    const k = elKey(row[0]);
    (r.byHeadword.get(k) ?? r.byHeadword.set(k, []).get(k)!).push(id);
    const b = bare(row[0]);
    (r.byBare.get(b) ?? r.byBare.set(b, []).get(b)!).push(id);
  }
  for (const [key, rows] of Object.entries(idx.forms)) for (const row of rows) (r.byLemma.get(row[0]) ?? r.byLemma.set(row[0], []).get(row[0])!).push([key, row]);
  REVERSE.set(idx, r);
  return r;
}
function lemmaIdsIn(idx: GreekFormIndex, lemma: string, pos?: PartOfSpeech): string[] {
  const r = reverse(idx);
  const exact = r.byHeadword.get(elKey(lemma)) ?? [];
  const pool = exact.length ? exact : r.byBare.get(bare(lemma)) ?? [];
  return pool.filter((id) => !pos || idx.lemmas[id][2] === pos || (pos === 'AUX' && idx.lemmas[id][2] === 'VERB') || (pos === 'PROPN' && idx.lemmas[id][2] === 'NOUN') || (pos === 'NOUN' && idx.lemmas[id][2] === 'PROPN'));
}

const KIND: Partial<Record<PartOfSpeech, GeneratedParadigm['kind']>> = { NOUN: 'noun-declension', PROPN: 'noun-declension', ADJ: 'adjective-declension', NUM: 'adjective-declension', VERB: 'verb-conjugation', AUX: 'verb-conjugation', PRON: 'pronoun-paradigm', DET: 'determiner-paradigm' };

export function elParadigm(lemma: string, pos: PartOfSpeech): GeneratedParadigm | undefined {
  const kind = KIND[pos];
  if (!kind) return undefined;
  const cells = new Map<string, { features: Record<string, string>; form: string; note?: string }>();
  const sources = new Set<string>();
  for (const idx of installedGreekIndexes()) {
    for (const id of lemmaIdsIn(idx, lemma, pos)) {
      for (const [key, row] of reverse(idx).byLemma.get(id) ?? []) {
        let features: Record<string, string> | undefined;
        let note: string | undefined;
        if (idx.codes === 'morphgnt') { features = { ...decodeMorphGnt(row[1], id).morph }; delete features.PronType; delete features.Definite; }
        else {
          const tags = row[1] ? row[1].split('|') : [];
          if (tags.includes('citation-form') || tags.includes('alternative')) continue;
          features = elFeaturesFromTableTags(tags, pos);
          const dialect = elVarietiesFromTags(tags).filter((v) => v !== 'el-att');
          if (dialect.length) note = dialect.map((d) => EL_VARIETIES[d]?.label ?? d).join(', ');
        }
        if (!features || !Object.keys(features).length) continue;
        if (note) features = { ...features, Dialect: note.split(', ')[0] };
        const fk = Object.keys(features).sort().map((k) => `${k}=${features![k]}`).join('|');
        const have = cells.get(fk);
        if (!have) cells.set(fk, { features, form: key, ...(note ? { note } : {}) });
        else if (have.form !== key && !(have.note ?? '').includes(key)) have.note = `${have.note ? `${have.note}; ` : ''}also ${key}`;
        sources.add(idx.id);
      }
    }
  }
  if (!cells.size) return undefined;
  const num = { key: 'Number', values: [['Sing', 'singular'], ['Dual', 'dual'], ['Plur', 'plural']] as Array<[string, string]> };
  const layout = kind === 'verb-conjugation'
    ? { columns: num, rows: { key: 'Person', values: [['1', '1st'], ['2', '2nd'], ['3', '3rd']] as Array<[string, string]> }, sections: ['Tense', 'Voice', 'Mood', 'VerbForm', 'Dialect', 'Case', 'Gender'] }
    : { columns: num, rows: { key: 'Case', values: [['Nom', 'nominative'], ['Gen', 'genitive'], ['Dat', 'dative'], ['Acc', 'accusative'], ['Voc', 'vocative']] as Array<[string, string]> }, sections: ['Gender', 'Degree', 'Dialect', 'Person'] };
  const names: Record<string, string> = { 'morphgnt-sblgnt': 'attested in the New Testament (MorphGNT)', 'morphgnt-sblgnt-core': 'attested in the New Testament (MorphGNT)', 'kaikki-grc-tables': 'listed in the Wiktionary Ancient Greek table', 'kaikki-el-tables': 'listed in the Wiktionary Modern Greek table' };
  return {
    kind, cells: [...cells.values()], layout,
    notes: [`Cells are the forms the sources hold for this word: ${[...sources].map((s) => names[s] ?? s).join(' and ')}. A cell no source holds is absent — nothing is generated. A cell from a dialect table (Epic, Ionic, Doric …) is marked with its dialect.`],
  };
}

export function elVariants(lemma: string, pos?: PartOfSpeech, surface?: string): VariantSet | undefined {
  const idxs = installedGreekIndexes();
  if (!idxs.length) return undefined;
  const nt = idxs.filter((i) => i.codes === 'morphgnt');
  const grc = idxs.filter((i) => i.id === 'kaikki-grc-tables');
  const mod = idxs.filter((i) => i.id === 'kaikki-el-tables');
  const rows: VariantForm[] = [];
  const surfaceKey = surface ? elKey(surface) : undefined;
  const surfacePeriod: string | undefined = surface
    ? (nt.some((i) => surfaceKey! in i.forms) ? 'el-koi' : isPolytonic(surface) ? 'el-att' : mod.some((i) => surfaceKey! in i.forms) ? 'el-mod' : undefined)
    : undefined;

  // what each source holds
  // the compiled core and the full index hold the same lemma ids: each lemma once, with the larger count (never summed across them)
  const ntById = new Map<string, (typeof nt)[number]['lemmas'][string]>();
  for (const i of nt) for (const id of lemmaIdsIn(i, lemma, pos)) { const row = i.lemmas[id]; const have = ntById.get(id); if (!have || row[3] > have[3]) ntById.set(id, row); }
  const ntRows = [...ntById.values()];
  const grcIds = grc.flatMap((i) => lemmaIdsIn(i, lemma, pos).map((id) => [i, id] as const));
  const modIds = mod.flatMap((i) => lemmaIdsIn(i, lemma, pos).map((id) => [i, id] as const));
  const dialectForms = (code: string): string[] => {
    const out: string[] = [];
    for (const [i, id] of grcIds) {
      if ((i.lemmas[id][5] ?? '').split(',').includes(code) && !out.includes(i.lemmas[id][0])) out.push(i.lemmas[id][0]);
      for (const [key, row] of reverse(i).byLemma.get(id) ?? []) {
        const tags = row[1].split('|');
        if (elVarietiesFromTags(tags).includes(code) && (tags.includes('alternative') || tags.includes('citation-form') || /nominative\|singular|singular\|nominative/.test(tags.filter((t) => !t.startsWith('table:')).sort().join('|')) || tags.some((t) => t === 'first-person') && tags.includes('singular') && tags.includes('present') && tags.includes('indicative') && tags.includes('active')) && !out.includes(key)) out.push(key);
      }
    }
    return out;
  };
  const descendants = grcIds.flatMap(([i, id]) => i.links?.[id] ?? []);

  for (const code of EL_PERIOD_ORDER) {
    const lab = EL_VARIETIES[code].label;
    const current = surfacePeriod === code ? { current: true } : {};
    if (code === 'el-hom') {
      const f = dialectForms('el-hom');
      if (f.length) rows.push({ varietyId: code, label: lab, forms: f, status: 'attested', sources: ['kaikki-grc'], note: 'Epic forms Wiktionary lists for this word', ...current });
      else if (grcIds.length) rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: 'the Ancient Greek entry lists no Epic-specific form; the Perseus treebank of Homer is not yet consulted here' });
      else rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: grc.length ? 'no Ancient Greek entry has this headword' : 'the Ancient Greek index is not loaded' });
    } else if (code === 'el-att') {
      if (grcIds.length) rows.push({ varietyId: code, label: lab, forms: [...new Set(grcIds.map(([i, id]) => i.lemmas[id][0]))], status: 'attested', sources: ['kaikki-grc'], ...(grcIds[0][0].lemmas[grcIds[0][1]][1] ? { gloss: grcIds[0][0].lemmas[grcIds[0][1]][1] } : {}), note: 'the Ancient Greek entry (its tables are Attic unless the header says otherwise)', ...current });
      else rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: grc.length ? 'no Ancient Greek entry has this headword' : 'the Ancient Greek index is not loaded' });
    } else if (code === 'el-koi') {
      const koineAlt = dialectForms('el-koi');
      if (ntRows.length) {
        const n = ntRows.reduce((s, r) => s + r[3], 0);
        const lxx = ntRows.reduce((s, r) => s + (r[6] ?? 0), 0);
        rows.push({ varietyId: code, label: lab, forms: [...new Set([...ntRows.map((r) => r[0]), ...koineAlt])], status: 'attested', sources: ['morphgnt', ...(koineAlt.length ? ['kaikki-grc'] : [])], ...(ntRows[0][1] ? { gloss: ntRows[0][1] } : {}), note: `${n.toLocaleString('en')}× in the New Testament${lxx ? `, ${lxx.toLocaleString('en')}× in the Septuagint` : ''}`, ...current });
      } else if (koineAlt.length) rows.push({ varietyId: code, label: lab, forms: koineAlt, status: 'attested', sources: ['kaikki-grc'], note: 'Koine forms Wiktionary lists for this word' });
      else rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: nt.some((i) => i.id === 'morphgnt-sblgnt') ? 'not in the New Testament; Wiktionary lists no Koine form' : 'only the New Testament core is loaded; the full index was not searched' });
    } else if (code === 'el-med') {
      const f = dialectForms('el-med');
      if (f.length) rows.push({ varietyId: code, label: lab, forms: f, status: 'attested', sources: ['kaikki-grc'], note: 'Byzantine forms Wiktionary lists for this word' });
      else rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: 'recognised from Byzantine labels only; none here' });
    } else {
      if (modIds.length) {
        const [i, id] = modIds[0];
        rows.push({ varietyId: code, label: lab, forms: [...new Set(modIds.map(([j, k]) => j.lemmas[k][0]))], status: 'attested', sources: ['kaikki-el'], ...(i.lemmas[id][1] ? { gloss: i.lemmas[id][1] } : {}), ...current });
      } else if (descendants.length) rows.push({ varietyId: code, label: lab, forms: [...new Set(descendants)], status: 'attested', sources: ['kaikki-grc'], note: 'the Modern Greek descendant Wiktionary states under the Ancient entry' });
      else rows.push({ varietyId: code, label: lab, forms: [], status: 'not-in-sources', sources: [], note: mod.length ? 'no Modern Greek entry has this headword and the Ancient entry names no Modern descendant' : 'the Modern Greek index is not loaded' });
    }
  }
  return { lemma, ...(pos ? { pos } : {}), rows };
}
