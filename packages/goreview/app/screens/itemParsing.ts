/**
 * "This item" on a card: the parsing of the word and its table of forms (2026-11-12).
 *
 * The parsing is the analysis the card was built from (the facts' word analysis: lemma, part of speech, features, named with the
 * pack's own vocabulary). The table is the one GoLearn's word card shows under "Forms": the analyser's cells merged with the
 * dictionary's inflection table (Wiktionary, via kaikki.org), every cell marked with who vouches for it, the card's own form marked.
 * `deps.paradigm` builds it (packFacts.ts, with the card's own builder); this file only lays it out, the way the card does.
 *
 * Nothing here is a meaning: no gloss, no translation, no "other readings" written in English before the answer. So the section can
 * stand on the front of a card that asks for the meaning. A card that asks for the form or its grammar does not get it until the
 * answer is in (session.ts decides), and a concealed (audio) item never gets it before the response.
 *
 * It is filled when the learner opens "This item", not before: the table of a Hebrew verb reads several form files.
 */
import { reviewFacts } from '../../src/facts/review-facts';
import type { FeatureDef } from '../../src/facts/review-facts';
import type { AppContext } from '../context';
import { append, clear, h, langProps, p } from '../dom';
import type { ItemParadigm, Paradigm, ParadigmCell } from '../packFacts';

export interface ItemParsingRequest {
  unitId: string;
  languageId: string;
  varietyId?: string;
  /** The language tag of the target text (the variety when there is one). */
  tag: string;
  /** After the answer: other readings of the form may be listed (they are written as meanings). */
  afterAnswer: boolean;
}

/** The analysis as "This item" shows it. */
export interface ParsingModel {
  tag: string;
  surface: string;
  lemma?: string;
  pos?: string;
  features: Array<{ key: string; value: string }>;
  /** The analyser's plain description of the form ("masculine singular absolute"). */
  description?: string;
  featureDefs?: Record<string, FeatureDef>;
  /** Other possible readings, as the analysis words them (after the answer only). */
  otherReadings?: string[];
}

const POS_NAME: Record<string, string> = {
  NOUN: 'noun', PROPN: 'proper noun', VERB: 'verb', AUX: 'auxiliary verb', ADJ: 'adjective', ADV: 'adverb', PRON: 'pronoun', DET: 'determiner',
  ADP: 'preposition', CCONJ: 'conjunction', SCONJ: 'subordinating conjunction', NUM: 'numeral', PART: 'particle', INTJ: 'interjection', SYM: 'symbol', X: 'unclassified',
};
const STATUS_MARK: Record<ParadigmCell['status'], string> = { verified: '✓', supported: '◌', generated: '~', conflicted: '‼' };
const STATUS_LABEL: Record<ParadigmCell['status'], string> = {
  verified: 'both the rules and the dictionary', supported: 'the dictionary only', generated: 'the rules only (unverified)', conflicted: 'the two disagree',
};
/** `Case=Acc|Number=Sing`, the key the table's builder names a cell by (src/core/paradigm.ts `featureKey`). */
const keyOf = (features: Record<string, string>): string => Object.keys(features).sort().map((k) => `${k}=${features[k]}`).join('|');
const spaced = (key: string): string => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
/** Plain words for the values every analyser writes the same way, used where a pack has no name of its own for one. */
const COMMON_VALUE: Record<string, Record<string, string>> = { VerbForm: { Fin: 'finite', Inf: 'infinitive', Part: 'participle', Ger: 'gerund', Conv: 'converb', Sup: 'supine' } };

/** A feature's name and its value's name in the pack's vocabulary; the analyser's own key and value when the pack has no word for them. */
export function nameFeature(key: string, value: string, defs?: Record<string, FeatureDef>): { label: string; value: string } {
  const def = defs?.[key];
  const values = value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => def?.values[v] ?? COMMON_VALUE[key]?.[v] ?? v);
  return { label: def?.label ?? spaced(key), value: values.join(' or ') };
}

/** The analysis: the form, its lemma and part of speech, each feature on its own row. */
export function renderParsing(el: HTMLElement, m: ParsingModel): void {
  const rows: HTMLElement[] = [];
  const row = (name: string, value: string | HTMLElement, id: string): void => { rows.push(h('div', { class: 'parsing-row', 'data-row': id }, h('dt', {}, name), h('dd', {}, value))); };
  row('Form', h('span', langProps(m.tag), m.surface), 'form');
  if (m.lemma) row('Lemma', h('span', langProps(m.tag), m.lemma), 'lemma');
  if (m.pos) row('Part of speech', POS_NAME[m.pos] ?? m.pos.toLowerCase(), 'pos');
  for (const f of m.features) {
    const named = nameFeature(f.key, f.value, m.featureDefs);
    row(named.label.charAt(0).toUpperCase() + named.label.slice(1), named.value, `feature-${f.key}`);
  }
  append(el, [
    h('h3', {}, 'Parsing'),
    h('dl', { class: 'parsing-facts', id: 'parsing-facts' }, ...rows),
    m.description ? h('p', { class: 'muted', id: 'parsing-description' }, `In words: ${m.description}.`) : null,
    !m.lemma && !m.features.length ? p('The analysis holds no lemma and no grammatical features for this item.', 'muted') : null,
    m.otherReadings?.length ? h('p', { class: 'muted', id: 'parsing-readings' }, `Other possible readings: ${m.otherReadings.join('; ')}.`) : null,
  ]);
}

/**
 * The table of forms, laid out as GoLearn's word card lays it out: one table per section, the card's form marked. A table merged from
 * the rules and the dictionary marks every cell with who vouches for it; a table read off the form files (Hebrew, Greek) holds only
 * forms a source holds, so its cells carry no mark. Rows and columns with no form are left out, so a phone shows no empty grid.
 */
export function renderForms(el: HTMLElement, table: ItemParadigm | undefined, opts: { tag: string; featureDefs?: Record<string, FeatureDef> }): void {
  clear(el);
  const paradigm: Paradigm | undefined = table?.paradigm;
  if (!paradigm) {
    append(el, [p('No table of forms is available for this lemma: neither the analyser nor the dictionary supplied one.', 'muted')]);
    return;
  }
  if (paradigm.kind === 'none') {
    append(el, [p(paradigm.notes.join(' ') || 'This language does not inflect its words.', 'muted'),
      paradigm.constructions?.length ? h('p', { class: 'muted' }, `Constructions to know instead: ${paradigm.constructions.join('; ')}.`) : null]);
    return;
  }
  const cells = paradigm.cells;
  const counts: Record<ParadigmCell['status'], number> = { verified: 0, supported: 0, generated: 0, conflicted: 0 };
  for (const c of cells) counts[c.status]++;
  const parts = (Object.keys(counts) as Array<ParadigmCell['status']>).filter((k) => counts[k]).map((k) => `${counts[k]} from ${STATUS_LABEL[k]}`);
  const selected = new Set(table!.selected);
  const roman = table!.formRoman;
  const marked = table!.origin !== 'attested';
  // the pack's whole vocabulary first (it names every value a table can hold), then the unit's own
  const names: Record<string, FeatureDef> = { ...(opts.featureDefs ?? {}), ...table!.featureNames };
  const describe = (f: Record<string, string>): string => Object.keys(f).sort().map((k) => nameFeature(k, f[k], names).value).join(', ');
  const mark = (c: ParadigmCell): HTMLElement | null => (marked ? h('span', { class: 'pmark', role: 'img', 'aria-label': `from ${STATUS_LABEL[c.status]}` }, STATUS_MARK[c.status]) : null);
  const formOf = (c: ParadigmCell): string => (c.status === 'conflicted' && c.alternatives?.length ? `${c.form} / ${c.alternatives.join(' / ')}` : c.form);
  const isSelected = (c: ParadigmCell): boolean => selected.has(keyOf(c.features));
  const cellNode = (c: ParadigmCell | undefined): HTMLElement => {
    if (!c) return h('td', { class: 'pcell none' }, '—');
    return h('td', { class: `pcell${marked ? ` ${c.status}` : ''}${isSelected(c) ? ' sel' : ''}`, 'data-cell': keyOf(c.features), ...(isSelected(c) ? { 'data-selected': 'true' } : {}) },
      h('span', langProps(opts.tag), formOf(c)),
      mark(c),
      roman[c.form] ? h('span', { class: 'rom' }, ` ${roman[c.form]}`) : null,
      c.note ? h('span', { class: 'pnote' }, ` (${c.note})`) : null,
      isSelected(c) ? h('span', { class: 'sr' }, ' (the form on this card)') : null);
  };
  const out: Array<HTMLElement | null> = [
    h('h3', {}, 'Forms'),
    h('p', { class: 'muted', id: 'forms-summary' }, marked
      ? `${cells.length} form${cells.length === 1 ? '' : 's'}${paradigm.template ? ` · ${paradigm.template}` : ''}: ${parts.join('; ')}.`
      : `${cells.length} form${cells.length === 1 ? '' : 's'}${paradigm.template ? ` · ${paradigm.template}` : ''}, each one held by a source; nothing is generated.`),
  ];
  const listOf = (title: string, list: ParadigmCell[]): HTMLElement => h('div', { class: 'forms-list' }, h('h4', {}, title),
    h('ul', {}, ...list.map((c) => h('li', { ...(isSelected(c) ? { class: 'sel', 'data-selected': 'true' } : {}), 'data-cell': keyOf(c.features) },
      h('span', langProps(opts.tag), formOf(c)), ` — ${describe(c.features)} `, mark(c),
      isSelected(c) ? h('span', { class: 'sr' }, ' (the form on this card)') : null))));
  const L = paradigm.layout;
  if (L) {
    const sectionKeys = L.sections ?? [];
    // a slot is named by its section, row and column values; a cell may carry more (a noun's gender), which does not unplace it
    const layoutKeys = [...sectionKeys, L.rows.key, L.columns.key];
    const cellAt = (want: Record<string, string>): ParadigmCell | undefined => {
      const hits = cells.filter((c) => layoutKeys.every((k) => c.features[k] === want[k]));
      return hits.length <= 1 ? hits[0] : (hits.find((c) => keyOf(c.features) === keyOf(want)) ?? hits[0]);
    };
    const combos: Array<Record<string, string>> = [];
    const seen = new Set<string>();
    for (const c of cells) {
      const combo: Record<string, string> = {};
      for (const k of sectionKeys) if (c.features[k] !== undefined) combo[k] = c.features[k];
      const key = keyOf(combo);
      if (!seen.has(key)) { seen.add(key); combos.push(combo); }
    }
    const placed = new Set<string>();
    for (const combo of combos) {
      const grid = L.rows.values.map(([rv]) => L.columns.values.map(([cv]) => cellAt({ ...combo, [L.rows.key]: rv, [L.columns.key]: cv })));
      if (!grid.some((r) => r.some(Boolean))) continue; // a section whose cells the layout cannot place is listed under "Other forms"
      for (const r of grid) for (const c of r) if (c) placed.add(keyOf(c.features));
      // a finite form is the plain case of a table of persons and numbers: its section is not named "Fin"
      const title = sectionKeys.filter((k) => !(k === 'VerbForm' && combo[k] === 'Fin')).map((k) => (combo[k] !== undefined ? (L.labels?.[k]?.[combo[k]] ?? nameFeature(k, combo[k], names).value) : undefined)).filter(Boolean).join(' · ');
      // only the rows and columns that hold a form
      const cols = L.columns.values.map((v, i) => ({ label: v[1], i })).filter(({ i }) => grid.some((r) => r[i]));
      const rows = L.rows.values.map((v, i) => ({ label: v[1], i })).filter(({ i }) => grid[i].some(Boolean));
      // the section's name is a heading, not a caption: a caption is only as wide as its (narrow) table
      if (title) out.push(h('h4', {}, title));
      const tableEl = h('table', { class: 'paradigm', ...(title ? { 'aria-label': title } : {}) },
        h('thead', {}, h('tr', {}, h('td', {}), ...cols.map((c) => h('th', { scope: 'col' }, c.label)))),
        h('tbody', {}, ...rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.label), ...cols.map((c) => cellNode(grid[r.i][c.i]))))));
      out.push(h('div', { class: 'table-scroll' }, tableEl));
    }
    const rest = cells.filter((c) => !placed.has(keyOf(c.features)));
    if (rest.length) out.push(listOf('Other forms', rest));
  } else out.push(listOf('All forms', cells));
  out.push(h('p', { class: 'muted', id: 'forms-legend' }, marked
    ? `${STATUS_MARK.verified} the rules and the dictionary agree · ${STATUS_MARK.supported} the dictionary only · ${STATUS_MARK.generated} the rules only · ${STATUS_MARK.conflicted} they disagree (both shown). The form on this card is underlined.`
    : 'The form on this card is underlined.'));
  for (const n of paradigm.notes) out.push(p(n, 'muted'));
  if (table!.incomplete) out.push(h('p', { class: 'muted', id: 'forms-incomplete' }, 'Some form files could not be loaded, so this table may be missing cells. Open “This item” again when you are online.'));
  const credited = table!.sources.length ? table!.sources : paradigm.sources;
  out.push(h('p', { class: 'muted', id: 'forms-sources' }, `Sources: ${credited.map((s) => `${s.label}${s.licence ? ` (${s.licence})` : ''}`).join('; ')}.`));
  append(el, out);
}

/**
 * Fill the parsing box of "This item": the analysis first, then the table (what is on the device at once, the rest of a verb's
 * table when its files arrive). Safe to call again: a box that is filled or filling is left alone; one that failed is tried again.
 */
export async function fillItemParsing(ctx: AppContext, el: HTMLElement, request: ItemParsingRequest): Promise<void> {
  const state = el.getAttribute('data-state');
  if (state === 'ready' || state === 'loading') return;
  el.setAttribute('data-state', 'loading');
  clear(el);
  append(el, [h('p', { class: 'muted', role: 'status' }, 'Looking up the parsing…')]);
  let model: ParsingModel | undefined;
  let lemma: string | undefined;
  let pos: string | undefined;
  let features: Record<string, string> = {};
  let defs: Record<string, FeatureDef> | undefined;
  try {
    const { api } = await ctx.api();
    const found = await ctx.engine.factsFor?.(request.unitId, request.languageId, api);
    const facts = found ? reviewFacts(found) : undefined;
    const analysis = facts?.wordAnalysis;
    if (facts && analysis) {
      lemma = analysis.lemma ?? undefined;
      pos = analysis.pos ?? undefined;
      features = Object.fromEntries(analysis.grammaticalFeatures.map((f) => [f.key, f.value]));
      defs = facts.featureDefs;
      model = {
        tag: request.tag, surface: analysis.surface ?? facts.unit.label, ...(lemma ? { lemma } : {}), ...(pos ? { pos } : {}),
        features: analysis.grammaticalFeatures.map((f) => ({ key: f.key, value: f.value })),
        ...(facts.morphDescription ? { description: facts.morphDescription } : {}), ...(defs ? { featureDefs: defs } : {}),
        ...(request.afterAnswer && analysis.ambiguity.length ? { otherReadings: analysis.ambiguity } : {}),
      };
    }
  } catch {
    clear(el);
    append(el, [h('p', { class: 'muted', role: 'status' }, 'The parsing could not be loaded. Close and open “This item” to try again.')]);
    el.setAttribute('data-state', 'error');
    return;
  }
  clear(el);
  if (!model) {
    append(el, [h('h3', {}, 'Parsing'), p('No analysis is recorded for this item, so there is no parsing to show.', 'muted')]);
    el.setAttribute('data-state', 'ready');
    return;
  }
  renderParsing(el, model);
  const forms = h('div', { id: 'item-forms', class: 'item-forms' });
  el.append(forms);
  const lookUp = ctx.deps.paradigm;
  if (!lookUp || !lemma || !pos) {
    if (lemma && pos) append(forms, [p('No table of forms is available in this copy of GoReview.', 'muted')]);
    el.setAttribute('data-state', 'ready');
    return;
  }
  append(forms, [h('p', { class: 'muted', role: 'status' }, 'Looking up the forms…')]);
  const ask = { languageId: request.languageId, lemma, pos, surface: model.surface, features, ...(request.varietyId ? { varietyId: request.varietyId } : {}) };
  const draw = (table: ItemParadigm | undefined): void => renderForms(forms, table, { tag: request.tag, ...(defs ? { featureDefs: defs } : {}) });
  try {
    const first = await lookUp(ask);
    draw(first);
    if (first?.more && el.isConnected) {
      // the rest of a verb's table lives in other form files: show what is here, then the whole table when they arrive
      const waiting = h('p', { class: 'muted', id: 'forms-loading', role: 'status' }, 'Loading the rest of the table…');
      forms.append(waiting);
      try { draw(await lookUp({ ...ask, whole: true })); }
      catch { waiting.textContent = 'The rest of the table could not be loaded. Open “This item” again when you are online.'; }
    }
    el.setAttribute('data-state', 'ready');
  } catch {
    clear(forms);
    append(forms, [h('p', { class: 'muted', role: 'status' }, 'The forms could not be loaded. Close and open “This item” to try again.')]);
    el.setAttribute('data-state', 'error');
  }
}
