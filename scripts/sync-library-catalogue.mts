/// <reference types="node" />
/**
 * npm run library:sync-catalogue
 *
 * Makes the catalogue say which library works are really installed: for every work recorded in
 * src/course/acquired-library-works.json and src/course/reading-bridge-works.json, `installed` / `ingestion` follow the
 * built library's provenance (public/library/<lang>/provenance.json) — a work is installed when the library was built
 * from exactly the source file the catalogue record names (same sha256). A work the ordering step withheld, or a build
 * refused, is then a catalogue entry again, not a readable text. Changes nothing else; run after every library build.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BuildEntry, BuildManifest } from '../src/library/build';

const LANGS = ['de', 'es', 'hi', 'sq', 'th'] as const;
const provenanceOf = (lang: string): Map<string, string> => {
  const file = `public/library/${lang}/provenance.json`;
  if (!fs.existsSync(file)) return new Map();
  return new Map((JSON.parse(fs.readFileSync(file, 'utf8')) as { works: Array<{ slug: string; source: { sha256: string } }> }).works.map((w) => [w.slug, w.source.sha256]));
};
const sha = (file: string): string | undefined => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : undefined);
/** The source file a slug is built from, from the language's combined build manifest. */
const sourceOf = (lang: string): Map<string, string> => {
  const file = `data/sources/course-library/${lang}.json`;
  if (!fs.existsSync(file)) return new Map();
  const m = JSON.parse(fs.readFileSync(file, 'utf8')) as BuildManifest & { withheld?: Array<{ slug: string }> };
  return new Map(m.entries.map((e: BuildEntry) => [e.slug, path.join('data/sources', e.source.file)]));
};

let changed = 0;
const lines: string[] = [];

const acquiredFile = 'src/course/acquired-library-works.json';
const acquired = JSON.parse(fs.readFileSync(acquiredFile, 'utf8')) as Record<string, Record<string, { installed: boolean }>>;
for (const lang of LANGS) {
  const prov = provenanceOf(lang);
  const sources = sourceOf(lang);
  for (const [slug, rec] of Object.entries(acquired[lang] ?? {})) {
    const file = sources.get(slug);
    const installed = !!file && prov.get(slug) === sha(file);
    if (rec.installed !== installed) { rec.installed = installed; changed++; lines.push(`${lang}/${slug}: installed ${installed}`); }
  }
}
fs.writeFileSync(acquiredFile, `${JSON.stringify(acquired, null, 2)}\n`);

const bridgeFile = 'src/course/reading-bridge-works.json';
const bridges = JSON.parse(fs.readFileSync(bridgeFile, 'utf8')) as Record<string, Array<{ id: string; ingestion?: string; readiness?: string }>>;
for (const lang of LANGS) {
  const prov = provenanceOf(lang);
  const sources = sourceOf(lang);
  for (const w of bridges[lang] ?? []) {
    const slug = w.id.split(':').pop()!;
    const file = sources.get(slug);
    const installed = !!file && prov.get(slug) === sha(file);
    const ingestion = installed ? 'ingested' : 'catalogued';
    const readiness = installed ? 'implemented' : 'verified-ready';
    if (w.ingestion !== ingestion || w.readiness !== readiness) { w.ingestion = ingestion; w.readiness = readiness; changed++; lines.push(`${lang}/${slug}: ${ingestion}`); }
  }
}
fs.writeFileSync(bridgeFile, `${JSON.stringify(bridges, null, 2)}\n`);
for (const l of lines) console.log(`  ${l}`);
console.log(`library:sync-catalogue — ${changed} record(s) changed`);
