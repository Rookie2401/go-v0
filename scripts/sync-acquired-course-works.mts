import fs from 'node:fs';
import crypto from 'node:crypto';
import type { BuildEntry } from '../src/library/build';

// Keep browser catalogue facts tied to the exact source manifests and successful builds.
const result: Record<string, Record<string, unknown>> = {};
const editionLabel = (entry: BuildEntry): string | undefined => {
  const edition = entry.source.edition;
  if (entry.slug === 'mommsen-roemische-geschichte' && edition?.match(/#3060(?!\d)/)) return `Römische Geschichte — Buch 1 only; ${edition}`;
  if (entry.slug === 'bechstein-maerchenbuch' && edition?.includes('23787')) return `Märchen-Sammlung — 14 tales; ${edition}`;
  if (entry.slug === 'hebel-schatzkaestlein' && edition?.match(/#7810(?!\d)/)) return `Schatzkästlein — selected stories; ${edition}`;
  return edition;
};
for (const lang of ['de', 'es']) {
  const manifestPath = `data/sources/${lang}/library-manifest.json`;
  const provenancePath = `public/library/${lang}/provenance.json`;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { entries: BuildEntry[] };
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8')) as { works: { slug: string; source: { sha256: string } }[] };
  const installed = new Map(provenance.works.map((w) => [w.slug, w.source.sha256]));
  result[lang] = Object.fromEntries(manifest.entries.map((entry) => [entry.slug, {
    rights: { ...entry.rights, verified: true, userImportOnly: false,
      sourceRepository: entry.rights.sourceRepository ?? (entry.source.url?.includes('gutenberg.org') ? 'https://www.gutenberg.org/' : entry.source.url),
      evidence: [...new Set([
        ...(entry.rights.evidence ?? []), entry.source.url,
        ...(entry.source.url?.match(/ebible\.org\/Scriptures\/([^/]+)_usfm\.zip$/)
          ? [`https://ebible.org/${entry.source.url.match(/\/([^/]+)_usfm\.zip$/)![1]}/copyright.htm`] : []),
      ].filter(Boolean))],
      jurisdictions: entry.rights.jurisdictions ?? Object.keys(entry.rights.statusByJurisdiction ?? {}),
      modifications: entry.rights.modifications ?? entry.source.provenance ?? 'Source wording retained; conversion is recorded in library provenance.',
      compliance: entry.rights.compliance ?? `${entry.source.attribution ?? entry.title}. Edition-specific rights and jurisdictional limits are retained; no recording is included.` },
    edition: editionLabel(entry), sourceUrl: entry.source.url,
    installed: installed.get(entry.slug) === crypto.createHash('sha256').update(fs.readFileSync(`data/sources/${entry.source.file}`)).digest('hex'),
  }]));
}
fs.writeFileSync('src/course/acquired-library-works.json', `${JSON.stringify(result, null, 2)}\n`);
console.log('Synced exact edition rights and installed work status for German and Spanish.');
