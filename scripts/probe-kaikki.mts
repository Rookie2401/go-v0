/**
 * Probe: what is actually in the kaikki Thai file? Shapes and counts only (no content is copied anywhere).
 * Run: npx vite-node scripts/probe-kaikki.mts [path]
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2] ?? 'data/dictionaries/kaikki.org-dictionary-Thai.jsonl';
const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Map<string, number>, n = 40) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');

const keys = new Map<string, number>(), pos = new Map<string, number>(), senseKeys = new Map<string, number>(), tags = new Map<string, number>();
const rawTags = new Map<string, number>(), soundShapes = new Map<string, number>(), exKeys = new Map<string, number>(), topics = new Map<string, number>();
const clfShapes = new Map<string, number>(), langs = new Map<string, number>();
let lines = 0, withPhonemic = 0, withIpa = 0, withExamples = 0, examples = 0, spacedExamples = 0, multiSyllablePhonemic = 0, formOfOnly = 0;
const samples: string[] = [];
const exSamples: string[] = [];
const forms = new Set<string>();

for await (const line of createInterface({ input: createReadStream(file, 'utf8') })) {
  if (!line.trim()) continue;
  lines++;
  let e: any;
  try { e = JSON.parse(line); } catch { count(keys, '(malformed)'); continue; }
  for (const k of Object.keys(e)) count(keys, k);
  count(pos, String(e.pos));
  count(langs, String(e.lang_code));
  forms.add(e.word);
  const sounds: any[] = Array.isArray(e.sounds) ? e.sounds : [];
  const phon = sounds.filter((s) => (s.raw_tags ?? []).includes('Phonemic'));
  if (phon.length) { withPhonemic++; if (phon.some((s) => String(s.other ?? '').includes('-'))) multiSyllablePhonemic++; }
  if (sounds.some((s) => s.ipa)) withIpa++;
  for (const s of sounds) count(soundShapes, Object.keys(s).sort().join('+') + (s.raw_tags ? `[${s.raw_tags.join(',')}]` : '') + (s.tags ? `{${s.tags.join(',')}}` : ''));
  const senses: any[] = Array.isArray(e.senses) ? e.senses : [];
  let hasEx = false;
  let allFormOf = senses.length > 0;
  for (const s of senses) {
    for (const k of Object.keys(s)) count(senseKeys, k);
    for (const t of s.tags ?? []) count(tags, t);
    for (const t of s.raw_tags ?? []) count(rawTags, t);
    for (const t of s.topics ?? []) count(topics, t);
    if (!(s.tags ?? []).some((t: string) => t === 'form-of' || t === 'alt-of')) allFormOf = false;
    if (s.classifiers) count(clfShapes, JSON.stringify(s.classifiers).replace(/[฀-๿]+/g, 'ก').slice(0, 80));
    for (const x of s.examples ?? []) {
      hasEx = true; examples++;
      for (const k of Object.keys(x)) count(exKeys, k);
      if (typeof x.text === 'string' && / /.test(x.text.trim())) spacedExamples++;
      if (exSamples.length < 6 && typeof x.text === 'string' && x.text.length > 12) exSamples.push(JSON.stringify(x).slice(0, 420));
    }
  }
  if (allFormOf) formOfOnly++;
  if (hasEx) withExamples++;
  if (e.classifiers) count(clfShapes, 'TOP:' + JSON.stringify(e.classifiers).replace(/[฀-๿]+/g, 'ก').slice(0, 80));
  if (samples.length < 2 && sounds.length > 5) samples.push(JSON.stringify(sounds).slice(0, 700));
}
console.log('lines', lines, 'distinct forms', forms.size, 'languages', top(langs));
console.log('\ntop-level keys:', top(keys));
console.log('\npos:', top(pos, 60));
console.log('\nsense keys:', top(senseKeys));
console.log('\nsense tags:', top(tags, 90));
console.log('\nsense raw_tags:', top(rawTags, 40));
console.log('\ntopics:', top(topics, 30));
console.log('\nsound shapes:', top(soundShapes, 30));
console.log('\nclassifier shapes:', top(clfShapes, 10));
console.log(`\nwith phonemic respelling: ${withPhonemic} (multi-syllable ${multiSyllablePhonemic}); with IPA: ${withIpa}; form-of only: ${formOfOnly}`);
console.log(`entries with examples: ${withExamples}; examples: ${examples}; examples whose text contains a space: ${spacedExamples}`);
console.log('\nexample keys:', top(exKeys));
console.log('\nexample samples:\n' + exSamples.join('\n'));
console.log('\nsound samples:\n' + samples.join('\n'));
