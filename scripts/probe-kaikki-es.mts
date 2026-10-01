/// <reference types="node" />
/**
 * Probe: what is actually in the kaikki Spanish file? Shapes and counts only (no content is copied anywhere).
 * Reads the .jsonl or the .jsonl.gz. Run: npx vite-node scripts/probe-kaikki-es.mts [path]
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const file = process.argv[2] ?? 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl';
const count = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m: Map<string, number>, n = 60) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');

const keys = new Map<string, number>(), pos = new Map<string, number>(), senseKeys = new Map<string, number>();
const formOfTags = new Map<string, number>(), formOfTagsByPos = new Map<string, Map<string, number>>(), senseTags = new Map<string, number>();
const exKeys = new Map<string, number>(), tableTags = new Map<string, number>(), formOfPos = new Map<string, number>(), langs = new Map<string, number>();
const tagSets = new Map<string, number>();
let lines = 0, formOfEntries = 0, formOfSenses = 0, lemmaEntries = 0, withForms = 0, tableForms = 0, examples = 0, withBold = 0, withTranslation = 0, multiWord = 0, exampleChars = 0;
const shapes: string[] = [];

const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file, 'utf8');
let partial = '';
try {
for await (const line of createInterface({ input })) {
  if (!line.trim()) continue;
  lines++;
  let e: any;
  try { e = JSON.parse(line); } catch { count(keys, '(malformed)'); continue; }
  for (const k of Object.keys(e)) count(keys, k);
  count(pos, String(e.pos));
  count(langs, String(e.lang_code));
  if (typeof e.word === 'string' && /\s/.test(e.word)) multiWord++;
  const senses: any[] = Array.isArray(e.senses) ? e.senses : [];
  let isFormOf = false;
  for (const s of senses) {
    for (const k of Object.keys(s)) count(senseKeys, k);
    const tags: string[] = Array.isArray(s.tags) ? s.tags : [];
    if (Array.isArray(s.form_of) && s.form_of.length) {
      isFormOf = true; formOfSenses++;
      for (const t of tags) { count(formOfTags, t); const m = formOfTagsByPos.get(String(e.pos)) ?? new Map(); count(m, t); formOfTagsByPos.set(String(e.pos), m); }
      if (e.pos === 'verb') count(tagSets, [...tags].sort().join(' '));
    } else for (const t of tags) count(senseTags, t);
    for (const ex of Array.isArray(s.examples) ? s.examples : []) {
      examples++;
      for (const k of Object.keys(ex)) count(exKeys, k);
      if (ex.bold_text_offsets) withBold++;
      if (ex.english || ex.translation) withTranslation++;
      if (typeof ex.text === 'string') exampleChars += ex.text.length;
    }
  }
  if (isFormOf) { formOfEntries++; count(formOfPos, String(e.pos)); } else lemmaEntries++;
  if (Array.isArray(e.forms) && e.forms.length) {
    withForms++;
    for (const f of e.forms) { tableForms++; for (const t of Array.isArray(f.tags) ? f.tags : []) count(tableTags, t); }
  }
  // one shape per interesting kind, keys only (no content)
  const shapeOf = (o: any, depth = 0): any => Array.isArray(o) ? (o.length ? [shapeOf(o[0], depth + 1)] : []) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).slice(0, 14).map((k) => [k, depth > 3 ? '…' : shapeOf(o[k], depth + 1)])) : typeof o;
  if (shapes.length < 1 && e.pos === 'verb' && isFormOf) shapes.push(`verb form-of entry: ${JSON.stringify(shapeOf(e))}`);
  if (shapes.length === 1 && e.pos === 'verb' && !isFormOf && Array.isArray(e.forms) && senses.some((s) => s.examples?.length)) shapes.push(`verb lemma entry: ${JSON.stringify(shapeOf(e))}`);
  if (shapes.length === 2 && e.pos === 'noun' && !isFormOf && senses.some((s) => s.examples?.some((x: any) => x.bold_text_offsets))) shapes.push(`noun lemma entry with bold example: ${JSON.stringify(shapeOf(e))}`);
}
} catch (err) { partial = ` (the file ended early: ${err instanceof Error ? err.message : String(err)} — counts are for the part that could be read)`; }

console.log(`lines ${lines}${partial}; lemma-like entries ${lemmaEntries}; entries with a form-of sense ${formOfEntries} (${formOfSenses} senses); multi-word headwords ${multiWord}`);
console.log(`languages: ${top(langs, 5)}`);
console.log(`entry keys: ${top(keys)}`);
console.log(`parts of speech: ${top(pos)}`);
console.log(`form-of entries by part of speech: ${top(formOfPos)}`);
console.log(`sense keys: ${top(senseKeys)}`);
console.log(`\nTAGS ON FORM-OF SENSES (all): ${top(formOfTags, 200)}`);
for (const [p, m] of formOfTagsByPos) console.log(`  form-of tags for ${p}: ${top(m, 80)}`);
console.log(`\nverb form-of tag sets (top 80): ${top(tagSets, 80)}`);
console.log(`\ntags on other senses (top 80): ${top(senseTags, 80)}`);
console.log(`\nentries with a forms table: ${withForms} (${tableForms} forms); table tags: ${top(tableTags, 120)}`);
console.log(`\nexamples: ${examples} (${exampleChars} characters); with bold offsets ${withBold}; with a translation ${withTranslation}; example keys: ${top(exKeys)}`);
for (const s of shapes) console.log(`\n${s}`);
