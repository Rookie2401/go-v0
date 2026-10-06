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
  ...g.entries.map((e: any) => ({ ...e, streams: ['children'], stage: 'c1', source: { ...e.source, file: 'gdl/' + e.source.file } })),
  ...literature.entries.map((e: any) => ({ ...e, source: { ...e.source, file: 'literature/' + e.source.file } }))];
fs.writeFileSync(`${root}/library-manifest.json`, `${JSON.stringify({ schema: 1, lang: 'hi', entries }, null, 2)}\n`);
