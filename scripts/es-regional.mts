/// <reference types="node" />
/**
 * npx vite-node scripts/es-regional.mts [-- --in <kaikki file>] [--labels Honduras,Central-America] [--out <dir>]
 *
 * Which Spanish words does the dictionary source (Wiktionary, via kaikki.org) itself label as Honduran or Central
 * American? Every Honduran word in the course's hand list is machine-drafted and unverified; this lists what an
 * independent, human-written source says, sense by sense, for a reviewer and for the authors of the Honduran readings.
 *
 * It decides nothing. A label on a dictionary sense says that Wiktionary's editors marked that sense for that region;
 * it does not say the word is unused elsewhere, that it is current, or that it is polite. Labels are incomplete: a
 * Honduran word without the label is simply absent here.
 *
 * Output (under data/review/es/generated/, which is git-ignored: it is an extract of CC BY-SA content and is
 * regenerated, never committed): regional-<label>.json with one record per labelled sense, and a summary on stdout.
 * Reads the .jsonl or .jsonl.gz; downloads nothing.
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { createAdapterRegistry } from '../src/adapters';
import { esLexicon } from '../src/adapters/es';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const inputs = [opt('in'), 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl.gz', 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl'].filter((f): f is string => !!f);
const file = inputs.find((f) => existsSync(f));
if (!file) { console.error(`cannot read the dictionary file (tried ${inputs.join(', ')})`); process.exit(1); }
const labels = (opt('labels') ?? 'Honduras,Central-America').split(',').map((s) => s.trim()).filter(Boolean);
const outDir = opt('out') ?? 'data/review/es/generated';

const es = createAdapterRegistry().get('es');
/** Region and country labels the source uses on Spanish senses (anything else on a sense is grammar, register or topic). */
const REGIONS = new Set([
  'Honduras', 'Central-America', 'El-Salvador', 'Nicaragua', 'Guatemala', 'Costa-Rica', 'Panama', 'Mexico', 'Latin-America', 'Spain',
  'Caribbean', 'Cuba', 'Puerto-Rico', 'Dominican-Republic', 'Colombia', 'Venezuela', 'Ecuador', 'Peru', 'Bolivia', 'Chile', 'Argentina',
  'Uruguay', 'Paraguay', 'Rioplatense', 'South-America', 'Andalusia', 'Canary-Islands', 'Philippines', 'US', 'Equatorial-Guinea', 'Belize',
  'Louisiana', 'New-Mexico', 'Southern-Cone', 'Andes', 'North-America', 'Americas', 'Antilles',
]);
const REGISTER = new Set(['colloquial', 'slang', 'vulgar', 'derogatory', 'offensive', 'informal', 'familiar', 'humorous', 'euphemistic', 'dated', 'obsolete', 'archaic', 'rare', 'figuratively', 'idiomatic', 'childish', 'pejorative']);

interface Row {
  word: string; pos: string; gloss: string; regions: string[]; register: string[]; grammar: string[];
  /** Every sense of this entry carries the label (the word itself is regional), or only this sense among others. */
  scope: 'whole-entry' | 'this-sense';
  senses: number; examples: number;
  /** What the course's hand word list says about the same written form, if it has it. */
  inWordList?: { pos: string; gloss: string; varieties: string[] }[];
}
const rows = new Map<string, Row[]>(labels.map((l) => [l, []]));
const counts = { lines: 0, headwords: 0 };
const regionTotals = new Map<string, number>();

const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file, 'utf8');
for await (const line of createInterface({ input })) {
  if (!line.trim()) continue;
  counts.lines++;
  let e: { word?: unknown; pos?: unknown; lang_code?: unknown; senses?: unknown };
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'es' || typeof e.word !== 'string') continue;
  const senses = (Array.isArray(e.senses) ? e.senses : []) as Array<{ glosses?: unknown; tags?: unknown; form_of?: unknown; examples?: unknown }>;
  const own = senses.filter((s) => !(Array.isArray(s.form_of) && s.form_of.length) && Array.isArray(s.glosses) && s.glosses.length);
  if (!own.length) continue;
  counts.headwords++;
  const tagsOf = (s: { tags?: unknown }): string[] => (Array.isArray(s.tags) ? (s.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []);
  for (const s of own) for (const t of tagsOf(s)) if (REGIONS.has(t)) regionTotals.set(t, (regionTotals.get(t) ?? 0) + 1);
  for (const label of labels) {
    const hits = own.filter((s) => tagsOf(s).includes(label));
    if (!hits.length) continue;
    const scope = hits.length === own.length ? 'whole-entry' : 'this-sense';
    const hand = esLexicon.lookup(es.normalize(e.word)).filter((h) => es.normalize(h.entry.lemma) === es.normalize(e.word as string));
    const inWordList = hand.length
      ? [...new Map(hand.map((h) => [`${h.entry.lemma}|${h.entry.pos}`, { pos: h.entry.pos, gloss: h.entry.gloss ?? '', varieties: [] as string[] }])).values()]
      : undefined;
    if (inWordList) {
      for (const w of inWordList) {
        const c = es.analyze(es.tokenize(e.word)).flatMap((a) => a.candidates).find((x) => x.pos === w.pos && x.origin === 'hand');
        w.varieties = c?.varieties ? [...c.varieties] : [];
      }
    }
    for (const s of hits) {
      const tags = tagsOf(s);
      const glosses = s.glosses as unknown[];
      rows.get(label)!.push({
        word: e.word, pos: String(e.pos), gloss: String(glosses[glosses.length - 1] ?? ''),
        regions: tags.filter((t) => REGIONS.has(t)), register: tags.filter((t) => REGISTER.has(t)),
        grammar: tags.filter((t) => !REGIONS.has(t) && !REGISTER.has(t)),
        scope, senses: own.length, examples: Array.isArray(s.examples) ? s.examples.length : 0,
        ...(inWordList ? { inWordList } : {}),
      });
    }
  }
}

mkdirSync(outDir, { recursive: true });
console.log(`es:regional - ${file}: ${counts.lines} lines, ${counts.headwords} headword entries`);
console.log(`region labels on headword senses: ${[...regionTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const label of labels) {
  const list = rows.get(label)!.sort((a, b) => a.word.localeCompare(b.word, 'es') || a.pos.localeCompare(b.pos) || a.gloss.localeCompare(b.gloss));
  const words = new Set(list.map((r) => `${r.word}|${r.pos}`));
  const whole = new Set(list.filter((r) => r.scope === 'whole-entry').map((r) => `${r.word}|${r.pos}`));
  const only = list.filter((r) => r.regions.length === 1);
  const byPos = list.reduce<Record<string, number>>((m, r) => { m[r.pos] = (m[r.pos] ?? 0) + 1; return m; }, {});
  const rude = list.filter((r) => r.register.some((t) => ['vulgar', 'derogatory', 'offensive', 'pejorative'].includes(t))).length;
  const known = list.filter((r) => r.inWordList);
  const out = path.join(outDir, `regional-${label.toLowerCase()}.json`);
  writeFileSync(out, `${JSON.stringify({
    note: `Senses that Wiktionary (via kaikki.org) labels "${label}". An extract for review: it decides nothing, and a label is not proof of current or exclusive use. CC BY-SA 4.0 (Wiktionary contributors); regenerate with scripts/es-regional.mts, do not commit.`,
    source: file, label, senses: list.length, entries: words.size, rows: list,
  }, null, 1)}\n`, 'utf8');
  console.log(`\n"${label}": ${list.length} senses in ${words.size} entries (${whole.size} entries where every sense carries the label); by part of speech: ${Object.entries(byPos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  labelled for this region alone: ${only.length} senses; also marked vulgar, derogatory or offensive: ${rude}; with a usage example: ${list.filter((r) => r.examples > 0).length}`);
  console.log(`  already in the course word list (same written form): ${new Set(known.map((r) => r.word)).size} words → ${[...new Set(known.map((r) => `${r.word}${r.inWordList!.some((w) => w.varieties.length) ? ` [${r.inWordList!.flatMap((w) => w.varieties).join(' ')}]` : ' [no tag]'}`))].slice(0, 60).join(', ')}`);
  console.log(`  written to ${out}`);
}
