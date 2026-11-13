/**
 * The table of a word's forms, as GoLearn's word card builds it: the analyser's cells merged with the dictionary's inflection table
 * (Wiktionary, via kaikki.org), each cell with who vouches for it, and the cells the selected form occupies.
 *
 * A MIRROR of the builder in packages/golearn-extension/src/content/enrich.ts. GoReview may not import from the extension
 * (test/audit/conformance.structure.test.ts), so it carries its own copy of the five functions below, and
 * test/goreview-app/paradigm-table-mirror.test.ts fails the moment the two differ by a character. Change the extension's builder
 * and this file together; nothing here is GoReview's own invention.
 */
import { cellsForSelection, featureKey, mergeParadigm, type Paradigm } from '../../../../src/core/paradigm';
import type { LanguageAdapter } from '../../../../src/core/adapters';
import type { PartOfSpeech } from '../../../../src/core/model';

/** The dictionary's full record, as far as a table needs it (the `full-1` keys; every field optional and untrusted). */
export interface LexicalRecord {
  w: string; p: string;
  f?: Array<{ f: string; t: string[]; s?: string; r?: string }>;
  tpl?: string[];
}

const WIKTIONARY = { label: 'Wiktionary (kaikki.org extract)', licence: 'CC BY-SA 4.0' };
const str = (v: unknown, max = 400): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : undefined);

/** The record that matches the part of speech best (the dictionary's POS vocabulary is the parser's), else the first. */
export function pickRecord(records: LexicalRecord[] | undefined, pos?: string): LexicalRecord | undefined {
  if (!records?.length) return undefined;
  return (pos && records.find((r) => r.p === pos)) || records[0];
}

/** The paradigm: the analyser's generated cells merged with the dictionary's table. Undefined when neither side has anything for this lemma. */
export function buildParadigm(adapter: LanguageAdapter | undefined, languageId: string, lemma: string, pos: PartOfSpeech, record: LexicalRecord | undefined, hint?: { features?: Record<string, string>; surface?: string }): Paradigm | undefined {
  const generated = adapter?.paradigm ? safe(() => adapter.paradigm!(lemma, pos, hint)) : undefined;
  const table: Array<{ features: Record<string, string>; form: string; note?: string }> = [];
  if (record?.f && adapter?.featuresFromTableTags) {
    for (const row of record.f) {
      const form = str(row.f, 80);
      if (!form || !Array.isArray(row.t)) continue;
      const features = safe(() => adapter.featuresFromTableTags!(row.t, pos, form));
      if (features && Object.keys(features).length) table.push({ features, form });
    }
  }
  if (!generated && !table.length) return undefined;
  const aligned = alignTable(generated?.cells, table);
  if (generated?.kind === 'none') {
    return { languageId, lemma, pos, kind: 'none', cells: [], notes: generated.notes, sources: [{ id: `${adapter!.lang}@${adapter!.version}`, label: `${adapter!.name} analyser` }], status: 'none', constructions: generated.constructions };
  }
  const sources: Paradigm['sources'] = [];
  if (generated && adapter) sources.push({ id: `adapter-${adapter.lang}@${adapter.version}`, label: generated.attested ? `${adapter.name} analyser (forms attested in its sources)` : `${adapter.name} analyser (rules and its irregular tables)` });
  if (table.length) sources.push({ id: 'wiktionary', label: `${WIKTIONARY.label}${record?.tpl?.length ? `, table ${record.tpl.join(', ')}` : ''}`, licence: WIKTIONARY.licence });
  const kind = generated?.kind ?? (pos === 'VERB' ? 'verb-conjugation' : pos === 'ADJ' ? 'adjective-declension' : pos === 'NOUN' || pos === 'PROPN' ? 'noun-declension' : pos === 'PRON' ? 'pronoun-paradigm' : 'none');
  const notes = [...(generated?.notes ?? [])];
  if (!generated && table.length) notes.push('The analyser has no rules for this word; every form here is the dictionary\'s table, unverified by the rules.');
  if (generated && !generated.attested && !table.length) notes.push('The dictionary has no table for this word; every form here comes from the analyser\'s rules and is unverified by a second source.');
  return mergeParadigm({ languageId, lemma, pos, kind, layout: generated?.layout, template: generated?.template ?? record?.tpl?.[0], notes, sources, constructions: generated?.constructions, ...(generated?.attested ? { attested: true } : {}) }, generated?.cells ?? [], aligned);
}

/** Put the dictionary's rows on the generated cells' keys where the two sides describe the same cell in different words. */
export function alignTable<R extends { features: Record<string, string>; form: string }>(generated: ReadonlyArray<{ features: Record<string, string> }> | undefined, table: R[]): R[] {
  if (!generated?.length) return table;
  const required = new Set(Object.keys(generated[0].features));
  for (const c of generated) for (const k of [...required]) if (c.features[k] === undefined) required.delete(k);
  const constant: Record<string, string> = {};
  for (const k of required) { const vals = new Set(generated.map((c) => c.features[k])); if (vals.size === 1) constant[k] = [...vals][0]; }
  const keys = new Set(generated.map((c) => featureKey(c.features)));
  const out: R[] = [];
  for (const row of table) {
    const f: Record<string, string> = { ...row.features };
    for (const [k, v] of Object.entries(constant)) if (f[k] === undefined) f[k] = v;
    if ([...required].some((k) => f[k] === undefined)) continue; // a headline form, not a cell
    if (!keys.has(featureKey(f))) {
      const fits = generated.filter((c) => { const ck = Object.keys(c.features); return ck.length === Object.keys(f).length && ck.every((k) => f[k] !== undefined && c.features[k].split(',').includes(f[k])); });
      if (fits.length === 1) { out.push({ ...row, features: { ...fits[0].features } }); continue; }
    }
    out.push({ ...row, features: f });
  }
  return out;
}

/** The romanization the dictionary gives for each form of a table, by form. */
export function formRomanOf(record: LexicalRecord | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of (record?.f ?? []).slice(0, 200)) {
    const form = str(row?.f, 80); const rom = str(row?.r, 80);
    if (form && rom && !(form in out)) out[form] = rom;
  }
  return out;
}

/** The feature keys of the cells the selected form occupies. */
export function selectedCellKeys(adapter: LanguageAdapter | undefined, paradigm: Paradigm | undefined, features: Record<string, string>, surface?: string): string[] {
  if (!paradigm || paradigm.kind === 'none' || !paradigm.cells.length) return [];
  const own = adapter?.cellsFor ? safe(() => adapter.cellsFor!(paradigm, features, surface)) : undefined;
  const cells = own?.length ? own : cellsForSelection(paradigm, features, surface);
  return [...new Set(cells.map((c) => featureKey(c.features)))];
}

function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }
