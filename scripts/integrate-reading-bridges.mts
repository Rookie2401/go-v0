import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BuildEntry, BuildManifest } from '../src/library/build';
import { ids, type LanguageCode, type Work } from '../src/core';

// Source acquisition remains separate. This binds new catalogue records to exact installed bytes.
const configs: Record<LanguageCode, { courseId: string; stage: string; base: string; prefix: string; additions: string[] }> = {
  de: { courseId: 'germany-de', stage: 's1', base: 'de/library-manifest.json', prefix: '', additions: ['reading-bridge/de/library-manifest.json'] },
  es: { courseId: 'honduras-es', stage: 's1', base: 'es/library-manifest.json', prefix: '', additions: ['reading-bridge/es/library-manifest.json', 'reading-bridge/es-es/library-manifest.json'] },
  hi: { courseId: 'india-hi', stage: 'c5', base: 'hi/library-manifest.json', prefix: 'hi', additions: ['hi-literature-bridge/library-manifest.json'] },
  th: { courseId: 'thailand-th', stage: 'g1', base: 'th/otcv2025-library-manifest.json', prefix: 'th', additions: ['reading-bridge/th/library-manifest.json'] },
  sq: { courseId: 'albania-sq', stage: '7', base: 'sq-literature/library-manifest.json', prefix: 'sq-literature', additions: ['sq-modern-open/library-manifest.json'] },
};
const root = 'data/sources';
const read = (relative: string): BuildManifest => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
fs.mkdirSync(path.join(root, 'course-library'), { recursive: true });
const records: Partial<Record<LanguageCode, Work[]>> = {};
for (const [language, cfg] of Object.entries(configs)) {
  const lang = language as LanguageCode;
  const entries = read(cfg.base).entries.map((entry) => ({ ...entry, source: { ...entry.source, file: path.posix.join(cfg.prefix, entry.source.file) } }));
  const added: BuildEntry[] = [];
  for (const file of cfg.additions) {
    if (!fs.existsSync(path.join(root, file))) continue;
    for (const entry of read(file).entries) {
      if (entries.some((old) => old.slug === entry.slug)) continue;
      const slug = entry.slug === 'premchand-panch-parmeshwar' ? 'premchand-panch-parameshwar' : entry.slug;
      const rights = entry.source.url?.includes('digitallibrary.io') ? { ...entry.rights,
        sourceRepository: 'Global Digital Library', jurisdictions: ['CC BY 4.0 worldwide licence'],
        modifications: 'EPUB reading body extracted; source wording retained; navigation and credit pages excluded from the reading body.',
        compliance: 'Retain source URL, title, publisher and full source credits; link CC BY 4.0 and indicate extraction changes.',
      } : entry.rights;
      const prepared = { ...entry, rights, slug, courseId: cfg.courseId, stage: entry.stage ?? cfg.stage,
        source: { ...entry.source, file: path.posix.join(path.posix.dirname(file), entry.source.file) } };
      entries.push(prepared);
      added.push(prepared);
    }
  }
  const combinedFile = path.join(root, 'course-library', `${lang}.json`);
  if (fs.existsSync(combinedFile)) {
    const current: BuildManifest = JSON.parse(fs.readFileSync(combinedFile, 'utf8'));
    const omitted = current.entries.filter(entry => !entries.some(next => next.slug === entry.slug));
    if (omitted.length) throw new Error(`${lang}: refusing to remove existing course sources (${omitted.map(entry => entry.slug).join(', ')}). Use merge-course-gap-materials.mts to append verified acquisitions.`);
  }
  fs.writeFileSync(combinedFile, JSON.stringify({ schema: 1, lang, entries }, null, 2) + '\n');
  let installed = new Map<string, string>();
  const provenance = `public/library/${lang}/provenance.json`;
  if (fs.existsSync(provenance)) installed = new Map(JSON.parse(fs.readFileSync(provenance, 'utf8')).works.map((w: any) => [w.slug, w.source.sha256]));
  records[lang] = (lang === 'sq' ? [] : added).map((entry, i): Work => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, entry.source.file))).digest('hex');
    const available = installed.get(entry.slug) === digest;
    return { id: ids.work(cfg.courseId, entry.slug), courseId: cfg.courseId, lang, stageId: ids.stage(cfg.courseId, entry.stage!), role: 'subsidiary', order: 950 + i,
      title: entry.title, author: entry.author, edition: entry.source.edition, sourceUrl: entry.source.url, streams: entry.streams ?? [entry.stream ?? 'library'],
      purpose: ['source-authored reading bridge with exact edition and licence retained'], rights: { ...entry.rights, canBundleAudio: false, audiobook: 'unknown' },
      bibliographyVerified: true, optional: true, ingestion: available ? 'ingested' : 'catalogued', readiness: available ? 'implemented' : 'verified-ready',
      variety: entry.variety, genre: entry.genre, domains: entry.domains,
      notes: 'Shelf placement is an orientation, not a CEFR or native-speaker certification. Source wording and attribution are retained.' };
  });
  console.log(`${lang}: ${entries.length} source entries, ${added.length} additions`);
}
fs.writeFileSync('src/course/reading-bridge-works.json', JSON.stringify(records, null, 2) + '\n');
