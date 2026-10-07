/// <reference types="node" />
/**
 * npm run library:rebuild -- <hi|de|es|sq|th|all> [--out public/library] [--date YYYY-MM-DD] [--dict public/dict]
 *                            [--audit shallow|deep|none] [--limit N] [--no-sync] [--skip-prepare]
 *
 * ONE command that rebuilds the whole library of a language from its retained sources and leaves it in a state where
 * `npm run library:audit -- <lang> --deep` passes, in this order (each step is a separate script and can be run alone):
 *
 *   1  prepare     the language's own source preparation (Hindi: scripts/prepare-hi-gdl-collection.mts — NFC, difficulty
 *                  grading onto Classes 1-4, then the GDL entries of data/sources/course-library/hi.json are made to match —
 *                  and scripts/verify-hi-usfm.mjs --check-only, which never writes data/verified/scripture.json)
 *   2  order       scripts/library-order.mts <lang>: canon order, chapter numbers, duplicates, apparatus (idempotent)
 *   3  build       src/library/build.ts through scripts/library-build.mts, ANALYSED WITH THE INSTALLED DICTIONARY (--dict), so the
 *                  stored profiles are exactly what a learner's device measures today (this is the dictionary-aware profile
 *                  refresh: a build without --dict, or an old build under newer adapters, is what leaves profiles stale);
 *                  the build also splits paragraphs stored as one long sentence, carries the catalogue's streams and domains
 *                  onto every row, cleans and tells apart titles
 *   4  sync        scripts/sync-library-catalogue.mts: the catalogue says which works are really installed (skipped with
 *                  --no-sync; run with --dry when --out is not public/library)
 *   5  audit       scripts/library-audit.mts <lang> --library <out>: structure, catalogue, order, titles, sentences
 *                  (--audit deep adds the deep check of every text, or the first --limit N: slow, and the real proof)
 *
 * Needs: the five dictionaries installed (public/dict/<lang>/manifest.json; they are built from data/dictionaries, never
 * downloaded here), the retained sources under data/sources. No network. Exit 1 when any step fails.
 * The output directory gets <out>/<lang>/ replaced only when the build succeeded (see src/library/build-node.ts).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES, type LanguageCode } from '../src/core';

const USAGE = 'usage: npm run library:rebuild -- <hi|de|es|sq|th|all> [--out public/library] [--date YYYY-MM-DD] [--dict public/dict] [--audit shallow|deep|none] [--limit N] [--no-sync] [--skip-prepare]';
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes(`--${k}`);
const target = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
if (!target || (target !== 'all' && !(LANGUAGES as readonly string[]).includes(target))) { console.error(USAGE); process.exit(1); }
const out = opt('out') ?? 'public/library';
const date = opt('date') ?? new Date().toISOString().slice(0, 10);
const dict = opt('dict') ?? 'public/dict';
const auditMode = opt('audit') ?? 'shallow';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error(`--date must be YYYY-MM-DD\n${USAGE}`); process.exit(1); }
if (!['shallow', 'deep', 'none'].includes(auditMode)) { console.error(`--audit is shallow, deep or none\n${USAGE}`); process.exit(1); }
const installing = path.resolve(out) === path.resolve('public/library');

const viteNode = path.resolve('node_modules/vite-node/dist/cli.mjs');
const config = path.resolve('scripts/vite.config.ts');
function step(label: string, script: string, scriptArgs: string[], kind: 'ts' | 'mjs' = 'ts'): void {
  console.log(`\n── ${label} ──`);
  const cmd = kind === 'ts' ? [viteNode, '--config', config, path.resolve(script), ...scriptArgs] : [path.resolve(script), ...scriptArgs];
  const r = spawnSync(process.execPath, cmd, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`library:rebuild: "${label}" failed (exit ${r.status ?? 'signal'}); stopping`); process.exit(1); }
}

/** Hindi: the GDL books are placed on Classes 1-4 by prepare-hi-gdl-collection.mts; the build manifest must name the same books. */
function syncHindiGdlEntries(): void {
  const manifestFile = 'data/sources/course-library/hi.json';
  const raw = fs.readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(raw) as { entries: Array<{ slug: string; source: { file: string } }> };
  const fresh = (JSON.parse(fs.readFileSync('data/sources/hi/gdl/gdl-library-entry.json', 'utf8')) as { entries: Array<{ slug: string; source: { file: string } }> }).entries
    .map((e) => ({ ...e, streams: ['children'], source: { ...e.source, file: `hi/gdl/${e.source.file}` } }));
  const at = manifest.entries.findIndex((e) => e.slug.startsWith('gdl-hindi-ccby'));
  if (at < 0) throw new Error('data/sources/course-library/hi.json has no GDL entry to replace');
  const rest = manifest.entries.filter((e) => !e.slug.startsWith('gdl-hindi-ccby'));
  rest.splice(at, 0, ...fresh);
  const next = JSON.stringify({ ...manifest, entries: rest }, null, 2);
  if (next === raw) console.log('data/sources/course-library/hi.json already names the books of each Class shelf');
  else { fs.writeFileSync(manifestFile, next); console.log('data/sources/course-library/hi.json: the GDL entries now match the prepared Class shelves'); }
}

function rebuild(lang: LanguageCode): void {
  const manifest = `data/sources/course-library/${lang}.json`;
  if (!fs.existsSync(manifest)) { console.error(`no build manifest for ${lang}: ${manifest}`); process.exit(1); }
  if (!fs.existsSync(path.join(dict, lang, 'manifest.json'))) {
    console.error(`the ${lang} dictionary is not installed (${path.join(dict, lang, 'manifest.json')}): a library is analysed with it, so build the dictionaries first (npm run dict:build, then npm run dict:status)`);
    process.exit(1);
  }
  console.log(`\n════════ ${lang}: rebuild into ${out} (${date}) ════════`);
  if (!flag('skip-prepare') && lang === 'hi') {
    step('hi · prepare the GDL collection (NFC, Class grading)', 'scripts/prepare-hi-gdl-collection.mts', []);
    syncHindiGdlEntries();
    step('hi · verify the IRV library source against the publisher archive (check only)', 'scripts/verify-hi-usfm.mjs', ['--check-only'], 'mjs');
  }
  step(`${lang} · order the sources`, 'scripts/library-order.mts', [lang]);
  step(`${lang} · build with the installed dictionary`, 'scripts/library-build.mts', ['--lang', lang, '--manifest', manifest, '--in', 'data/sources', '--out', out, '--date', date, '--dict', dict]);
  if (!flag('no-sync')) step(`${lang} · sync the catalogue${installing ? '' : ' (dry run: the output is not public/library)'}`, 'scripts/sync-library-catalogue.mts', ['--lang', lang, '--library', out, ...(installing ? [] : ['--dry'])]);
  if (auditMode !== 'none') {
    step(`${lang} · audit (${auditMode})`, 'scripts/library-audit.mts', [lang, '--library', out, ...(auditMode === 'deep' ? ['--deep'] : []), ...(opt('limit') ? ['--limit', opt('limit')!] : [])]);
  }
  console.log(`\n${lang}: done. Full proof: npm run library:audit -- ${lang}${installing ? '' : ` --library ${out}`} --deep`);
}

for (const lang of (target === 'all' ? [...LANGUAGES] : [target]) as LanguageCode[]) rebuild(lang);
