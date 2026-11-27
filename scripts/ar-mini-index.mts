/// <reference types="node" />
/**
 * Generates test/adapters/arabic-mini-index.json: an ArabicFormIndex of about seventy chosen Wiktionary Arabic entries with ALL their
 * table rows, built by the row rules of docs/arabic/PLAN.md ("The index build"), so that the morphology package (arabic/{tags,
 * clitics,closed,analyze,...}.ts) can be tested before the real index of Package A exists. It is a FIXTURE, not the index: it holds
 * a handful of lexemes, and counts are measured over the whole extract only for the keys of those lexemes.
 *
 *   npx vite-node scripts/ar-mini-index.mts [-- --in <kaikki-arabic.jsonl>] [--freq <ar_50k.txt>] [--out test/adapters/arabic-mini-index.json]
 *
 * Row rules used here (the same as PLAN.md; where the plan is silent, what this script does is said):
 *  - a lemma entry has table rows (conjugation, declension, inflection) or a sense that is not a form-of; an entry whose senses are
 *    ALL form-of and that has no table is a FORM PAGE (كُتُب "plural of كِتَاب"), resolved to the chosen lemma by vocalized target;
 *  - key = arKey(form), vocal = packVocal(form), code = the row's tags sorted and joined "|" (verbatim);
 *  - left out: forms "-" or with a space or starting "#", rows tagged table-tags / inflection-template / romanization / canonical /
 *    error-unrecognized-form;
 *  - head-line forms (no source: plural, feminine, masculine ...) are rows when the table does not have the same (key, vocal);
 *  - an entry with NO table rows at all (a pronoun, a particle) gets ONE row for its canonical form with the code "" (the source
 *    gives such a word nothing else);
 *  - lemma id "<canonical NFC>|<POS>", "|2" ... for a further entry with the same head and part of speech, in file order of the WHOLE file.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { arCanon, arKey, arLoose, packVocal } from '../src/adapters/arabic/text';
import type { ArabicFormIndex, ArFormRow, ArLemmaRow } from '../src/adapters/arabic/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const IN = opt.in ?? 'C:/Users/CJWal/dev/lisan-v0/data/dict/kaikki-arabic.jsonl';
const FREQ = opt.freq ?? 'C:/Users/CJWal/dev/lisan-v0/data/dict/ar_50k.txt';
const OUT = opt.out ?? 'test/adapters/arabic-mini-index.json';

/** Open-class lexemes: chosen by key AND vowels (the brief's list, plus a few the edge cases need). */
const OPEN = ('كَتَبَ كِتَاب كَاتِب مَكْتَبَة مَكْتُوب قَالَ بَاعَ وَعَدَ وَجَدَ دَعَا رَمَى مَدَّ أَخَذَ أَكَلَ رَأَى عَلِمَ عَلَّمَ تَعَلَّمَ عِلْم عَلَم عَالَم ' +
  'اِسْتَغْفَرَ أَخْرَجَ قَاتَلَ تَعَاوَنَ اِنْكَسَرَ اِجْتَمَعَ اِحْمَرَّ كَانَ لَيْسَ ذَهَبَ قَرَأَ مُعَلِّم مُعَلِّمَة طَالِب بَيْت بَاب رَجُل قَلْب مَدِينَة مَدْرَسَة ' +
  'ذَهَب إِنَّ لَيْسَ قَامَ مَاتَ عَادَ دَوْلَة اِسْتَطَاعَ أَطَاعَ خَرَجَ أَذْهَبَ اِسْم اِسْمِيّ كِلَا كُلْيَة أَعْطَى لِأَنَّ كَأَنَّ شَمْس قَمَر كَبِير جَمِيل جَدِيد أَب أَخ جَدّ وَلَد وَلَدَ كُلّ كَاتَبَ كَتَّبَ عَلِيّ يَد مَاء اِبْن').split(' ');
/** Closed-class words: chosen by key and part of speech (any vowels), only the non-open parts of speech. */
const CLOSED_KEYS = new Set(('و ف ثم أو بل في من إلى على عن ب ل ك إن أن لن لم لا ما قد س سوف هل إذا لو حتى كي لكن ' +
  'لأن كأن هو هي هم هن هما نحن أنا أنت أنتم هذا هذه ذلك الذي التي الذين ماذا لماذا كيف أين متى مع عند بعد قبل بين لدى كل ها ي ني نا').split(' '));
const CLOSED_POS = new Set(['prep', 'conj', 'particle', 'pron', 'det', 'article', 'adv', 'intj', 'num']);
const OPEN_KV = new Set(OPEN.map((w) => `${arKey(w)}\t${packVocal(w)}`));

const POS: Record<string, string> = { noun: 'NOUN', name: 'PROPN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', article: 'DET', prep: 'ADP', conj: 'CONJ', particle: 'PART', num: 'NUM', intj: 'INTJ' };
const SKIP_TAGS = new Set(['table-tags', 'inflection-template', 'romanization', 'canonical', 'error-unrecognized-form']);
const TABLE_SRC = new Set(['conjugation', 'declension', 'inflection']);
const FORMS_NUM: Record<string, string> = { 'form-i': 'I', 'form-ii': 'II', 'form-iii': 'III', 'form-iv': 'IV', 'form-v': 'V', 'form-vi': 'VI', 'form-vii': 'VII', 'form-viii': 'VIII', 'form-ix': 'IX', 'form-x': 'X', 'form-iq': 'Iq', 'form-iiq': 'IIq', 'form-iiiq': 'IIIq', 'form-ivq': 'IVq' };

interface Form { form: string; tags?: string[]; source?: string }
interface Entry {
  word: string; pos: string; forms?: Form[]; senses?: Array<{ glosses?: string[]; tags?: string[]; form_of?: Array<{ word: string }>; alt_of?: unknown[] }>;
  etymology_templates?: Array<{ name: string; args: Record<string, string> }>;
}

const canonicalOf = (e: Entry): string | undefined => {
  const f = (e.forms ?? []).find((x) => (x.tags ?? []).includes('canonical') && !/[a-zA-Z#\s]/.test(x.form) && x.form !== '-');
  return f ? arCanon(f.form) : undefined;
};
const isTableForm = (f: Form): boolean => !!f.source && TABLE_SRC.has(f.source) && !(f.tags ?? []).some((t) => SKIP_TAGS.has(t)) && usable(f.form);
const usable = (form: string): boolean => !!form && form !== '-' && !/[\s#a-zA-Z]/.test(form) && /[ء-ي]/.test(form);
const tableRows = (e: Entry): Form[] => (e.forms ?? []).filter(isTableForm);
const isFormPage = (e: Entry): boolean => !tableRows(e).length && !!e.senses?.length && e.senses.every((s) => s.form_of || s.alt_of);

async function* lines(file: string): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield l;
}

interface Chosen { entry: Entry; head: string; pos: string; id: string }

async function main(): Promise<void> {
  // ── pass 1: choose entries, number every (head, POS) in file order ──
  const seen = new Map<string, number>();
  const chosen: Chosen[] = [];
  const pages: Entry[] = [];
  const wantTargets = new Set<string>();
  for await (const line of lines(IN)) {
    const e = JSON.parse(line) as Entry;
    const pos = POS[e.pos];
    if (!pos) continue;
    const head = canonicalOf(e);
    if (!head) continue;
    if (head.includes('ـ')) continue; // a clitic's own entry (ـهَا, ـني): the analyser's clitic table is hand-written, and the bare key must not read as the clitic
    const k = arKey(head);
    const n = (seen.get(`${head}|${pos}`) ?? 0) + 1;
    seen.set(`${head}|${pos}`, n);
    const fp = isFormPage(e);
    const pick = fp ? false : OPEN_KV.has(`${k}\t${packVocal(head)}`)
      || (CLOSED_KEYS.has(k) && CLOSED_POS.has(e.pos));
    if (pick) chosen.push({ entry: e, head, pos, id: n === 1 ? `${head}|${pos}` : `${head}|${pos}|${n}` });
    else if (fp && e.senses?.some((s) => s.form_of?.some((t) => OPEN_KV.has(`${arKey(t.word)}\t${packVocal(t.word)}`) || CLOSED_KEYS.has(arKey(t.word))))) pages.push(e);
    void wantTargets;
  }
  console.error(`chosen ${chosen.length} entries, ${pages.length} candidate form pages`);

  // ── rows ──
  const lemmaIds: string[] = [];
  const lemmas: Record<string, ArLemmaRow> = {};
  const codes: string[] = [];
  const codeIx = new Map<string, number>();
  const forms: Record<string, ArFormRow[]> = {};
  const codeOf = (tags: string[]): number => {
    const c = [...tags].sort().join('|');
    let i = codeIx.get(c);
    if (i === undefined) { i = codes.length; codes.push(c); codeIx.set(c, i); }
    return i;
  };
  const rowSeen = new Set<string>();
  const addRow = (form: string, lemmaIx: number, tags: string[], viaHeadline: boolean): void => {
    const key = arKey(form);
    const vocal = packVocal(form);
    const sig = `${key}\t${lemmaIx}\t${vocal}`;
    if (viaHeadline) { if (rowSeen.has(sig)) return; } else if (rowSeen.has(`${sig}\t${tags.slice().sort().join('|')}`)) return;
    rowSeen.add(sig);
    rowSeen.add(`${sig}\t${tags.slice().sort().join('|')}`);
    (forms[key] ??= []).push(vocal ? [lemmaIx, codeOf(tags), vocal] : [lemmaIx, codeOf(tags)]);
  };
  const lemmaKeys = new Map<string, Set<string>>();
  const idIndex = new Map<string, number>();

  for (const c of chosen) {
    const e = c.entry;
    const ix = lemmaIds.length;
    lemmaIds.push(c.id);
    idIndex.set(c.id, ix);
    const cans = (e.forms ?? []).find((f) => (f.tags ?? []).includes('canonical'))!;
    const ctags = cans.tags ?? [];
    // lex
    const lex: string[] = [];
    const tagsAll = new Set<string>();
    for (const f of tableRows(e)) for (const t of f.tags ?? []) tagsAll.add(t);
    const decl = ['triptote', 'diptote', 'invariable'].filter((t) => tagsAll.has(t));
    if (e.pos === 'noun' || e.pos === 'name' || e.pos === 'adj') {
      if (decl.length === 1) lex.push(`Decl=${{ triptote: 'Trip', diptote: 'Dip', invariable: 'Indecl' }[decl[0]]}`);
    }
    const form = ctags.map((t) => FORMS_NUM[t]).find(Boolean);
    if (e.pos === 'verb' && form) lex.push(`Form=${form}`);
    if (e.pos === 'noun' || e.pos === 'name') { if (ctags.includes('masculine') && !ctags.includes('feminine')) lex.push('Gender=Masc'); else if (ctags.includes('feminine') && !ctags.includes('masculine')) lex.push('Gender=Fem'); }
    const senseTags = (e.senses ?? []).map((s) => s.tags ?? []);
    const old = ['obsolete', 'archaic', 'Classical', 'dated'];
    if (senseTags.length && senseTags.every((t) => t.some((x) => old.includes(x)))) lex.push('Reg=Cla');
    lex.sort();
    const glossSense = (e.senses ?? []).find((s) => !s.form_of && !s.alt_of && s.glosses?.length) ?? (e.senses ?? []).find((s) => s.glosses?.length);
    let gloss = (glossSense?.glosses?.[0] ?? '').split(/[,;]/)[0].trim();
    if (gloss.length > 80) gloss = gloss.slice(0, 80);
    const rootT = (e.etymology_templates ?? []).find((t) => t.name === 'ar-root' || t.name === 'ar-rootbox');
    const root = rootT ? Object.keys(rootT.args).filter((k) => /^\d+$/.test(k)).sort((a, b) => +a - +b).map((k) => rootT.args[k]).join(' ').replace(/\s+/g, ' ').trim() : '';
    const row = [c.head, gloss, c.pos, lex.join("|"), 0, ...(root ? [root] : [])] as unknown as ArLemmaRow;
    lemmas[c.id] = row;
    const keys = new Set<string>();
    lemmaKeys.set(c.id, keys);
    const rows = tableRows(e);
    for (const f of rows) { addRow(f.form, ix, f.tags ?? [], false); keys.add(arKey(f.form)); }
    for (const f of e.forms ?? []) {
      if (f.source || !usable(f.form)) continue;
      const tags = f.tags ?? [];
      if (tags.some((t) => ['canonical', 'romanization', 'non-past', 'noun-from-verb'].includes(t))) continue;
      addRow(f.form, ix, tags, true);
      keys.add(arKey(f.form));
    }
    if (!rows.length) { addRow(c.head, ix, [], false); keys.add(arKey(c.head)); }
  }
  // form pages
  let resolved = 0;
  for (const e of pages) {
    const page = canonicalOf(e)!;
    for (const s of e.senses ?? []) {
      for (const t of s.form_of ?? []) {
        const hits = chosen.filter((c) => arKey(c.head) === arKey(t.word) && packVocal(c.head) === packVocal(t.word));
        if (hits.length !== 1) continue; // ambiguous or unknown target: left out (counted)
        const tags = (s.tags ?? []).filter((x) => !['form-of', 'alt-of', 'transitive', 'intransitive', 'obsolete', 'archaic', 'dated', 'Classical', 'Arabic', 'no-gloss'].includes(x));
        const before = Object.keys(forms).length;
        addRow(page, idIndex.get(hits[0].id)!, tags, true);
        lemmaKeys.get(hits[0].id)!.add(arKey(page));
        void before;
        resolved++;
      }
    }
  }
  console.error(`form pages resolved: ${resolved}`);

  // ── counts: Σ freq(k) / (number of lemma ENTRIES of the whole extract holding k as a table form) over the lemma's keys ──
  const freq = new Map<string, number>();
  for (const l of fs.readFileSync(FREQ, 'utf8').split(/\r?\n/)) {
    const sp = l.lastIndexOf(' ');
    if (sp > 0) { const k = arKey(l.slice(0, sp)); freq.set(k, (freq.get(k) ?? 0) + Number(l.slice(sp + 1))); }
  }
  const wanted = new Set<string>();
  for (const ks of lemmaKeys.values()) for (const k of ks) wanted.add(k);
  const holders = new Map<string, number>();
  for await (const line of lines(IN)) {
    const e = JSON.parse(line) as Entry;
    if (!POS[e.pos] || !canonicalOf(e)) continue;
    const ks = new Set<string>();
    for (const f of tableRows(e)) { const k = arKey(f.form); if (wanted.has(k)) ks.add(k); }
    if (!ks.size) { const k = arKey(canonicalOf(e)!); if (wanted.has(k) && !isFormPage(e)) ks.add(k); }
    for (const k of ks) holders.set(k, (holders.get(k) ?? 0) + 1);
  }
  for (const [id, ks] of lemmaKeys) {
    let n = 0;
    for (const k of ks) n += (freq.get(k) ?? 0) / Math.max(1, holders.get(k) ?? 1);
    lemmas[id][4] = Math.round(n);
  }
  // ── loose ──
  const loose: Record<string, string[]> = {};
  for (const k of Object.keys(forms).sort()) { const l = arLoose(k); if (l !== k) (loose[l] ??= []).push(k); }
  const sorted: Record<string, ArFormRow[]> = {};
  for (const k of Object.keys(forms).sort()) sorted[k] = forms[k];
  const idx: ArabicFormIndex = {
    schema: 1, id: 'ar-mini-fixture', built: '2026-11-25', codes, lemmaIds, lemmas, forms: sorted, loose,
    source: { label: 'Wiktionary via kaikki.org (test fixture: about seventy entries)', licence: 'CC BY-SA 4.0', url: 'https://kaikki.org/dictionary/Arabic/', note: 'generated by scripts/ar-mini-index.mts' },
    stats: { lemmas: lemmaIds.length, keys: Object.keys(sorted).length, formPages: resolved },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(idx));
  console.error(`wrote ${OUT}: ${lemmaIds.length} lemmas, ${Object.keys(sorted).length} keys, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  console.error(`missing open heads: ${OPEN.filter((w) => !chosen.some((c) => arKey(c.head) === arKey(w) && packVocal(c.head) === packVocal(w))).join(' ') || 'none'}`);
}
void main();
