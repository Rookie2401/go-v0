/**
 * The Hindi BASE manifest: data/sources/hi/library-manifest.json = the IRV Bible, the GDL collection (one entry per Class
 * shelf, from scripts/prepare-hi-gdl-collection.mts) and the Andher Nagari play. It is the INPUT of
 * scripts/integrate-reading-bridges.mts, which adds the literature bridge and writes the manifest the build reads,
 * data/sources/course-library/hi.json. (The base has fewer entries than course-library/hi.json by design.)
 */
import fs from 'node:fs';
const root = 'data/sources/hi';
const g = JSON.parse(fs.readFileSync(`${root}/gdl/gdl-library-entry.json`, 'utf8'));
const b = JSON.parse(fs.readFileSync(`${root}/irv2019-library-manifest.json`, 'utf8'));
const literature = JSON.parse(fs.readFileSync('data/sources/hi-literature/bharatendu-andher-nagari-manifest.json', 'utf8'));
fs.mkdirSync(`${root}/literature`, { recursive: true });
for (const entry of literature.entries) {
  fs.copyFileSync(`data/sources/hi-literature/${entry.source.file}`, `${root}/literature/${entry.source.file}`);
}
const entries = [...b.entries,
  ...g.entries.map((e: any) => ({ ...e, streams: ['children'], stage: e.stage ?? 'c1', source: { ...e.source, file: 'gdl/' + e.source.file } })), // one entry per Class shelf (prepare-hi-gdl-collection.mts)
  ...literature.entries.map((e: any) => ({ ...e, stage: e.stage ?? 'c8', source: { ...e.source, file: 'literature/' + e.source.file } }))]; // the play stands on Class 8 (its catalogue shelf)
fs.writeFileSync(`${root}/library-manifest.json`, `${JSON.stringify({ schema: 1, lang: 'hi', entries }, null, 2)}\n`);
