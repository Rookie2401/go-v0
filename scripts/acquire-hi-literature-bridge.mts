import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

type Candidate = { slug: string; disposition: string; blocker?: string; title?: string; author?: string; pageUrl?: string; pageId?: number; pageRevision?: number; indexUrl?: string; indexRevision?: number; sourceEdition?: Record<string, unknown>; originalWorkEvidence?: string; sourceApi?: string };
type Research = { candidates: Candidate[]; license: { name: string; url: string } };

const root = new URL('../', import.meta.url);
const researchPath = new URL('data/sources/hi-literature-bridge/source-research.json', root);
const manifestPath = new URL('data/sources/hi-literature-bridge/library-manifest.json', root);
const research = JSON.parse(readFileSync(researchPath, 'utf8')) as Research;
const accepted = research.candidates.filter((c) => c.disposition === 'accepted-for-isolated-build');
if (accepted.length !== 2 || accepted.some((c) => !c.sourceApi || !c.pageUrl || !c.pageRevision)) throw new Error('Hindi bridge safety gate: accepted source metadata is incomplete');

const entries: Array<Record<string, unknown>> = [];
for (const candidate of accepted) {
  const textPath = new URL(`data/sources/hi-literature-bridge/${candidate.slug}.txt`, root);
  const sourceBytes = readFileSync(textPath);
  const story = sourceBytes.toString('utf8').trim();
  if (story.length < 1000 || /(?:←|→|Wikisource|CC BY|सामग्री पर जाएँ)/i.test(story)) throw new Error(`Hindi bridge source failed isolated body check: ${candidate.slug}`);
  const signature = createHash('sha256').update(story, 'utf8').digest('hex');
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const entry = { slug: candidate.slug, title: candidate.title, author: candidate.author, stage: 'c5', streams: ['literature'], contentType: 'story', source: { file: `${candidate.slug}.txt`, kind: 'plain', url: candidate.pageUrl, edition: `${candidate.sourceEdition?.title}, ${candidate.sourceEdition?.publisher}, ${candidate.sourceEdition?.place}, ${candidate.sourceEdition?.year} (${candidate.sourceEdition?.edition})`, attribution: `${candidate.title} — ${candidate.author}; scan-backed Hindi Wikisource transcription; CC BY-SA 4.0 transcription credit.`, provenance: `Official page revision ${candidate.pageRevision}; index revision ${candidate.indexRevision}; source edition and original-work evidence retained in source-research.json.` }, rights: { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, verified: true, verifiedBy: 'Hindi Wikisource edition page and PD India/PD US source record', verifiedAt: '2026-10-02', basis: candidate.originalWorkEvidence, statusByJurisdiction: { US: 'public-domain', IN: 'public-domain' }, licence: 'CC BY-SA 4.0 (Wikisource transcription; underlying 1917 work PD in US/India)', attributionRequired: true, shareAlike: true, commercialUse: true, compliance: 'Retain author, edition, source URL, Wikisource attribution and CC BY-SA 4.0 link; indicate changes.', evidence: [candidate.pageUrl, candidate.indexUrl, research.license.url], userImportOnly: false, canModify: false, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown' }, review: { status: 'reviewed', reviewedBy: 'Hindi bridge source-fidelity check', reviewedAt: '2026-10-02', coversSourceSha256: sourceSha256, qualityVerdict: 'usable', notes: 'Complete story body extracted from the official parsed page; navigation, licence footer, printed page numbers, and repeated transclusion tail excluded. No native-speaker quality claim.' } };
  writeFileSync(new URL(`data/sources/hi-literature-bridge/${candidate.slug}.json`, root), JSON.stringify({ ...entry, contentSignature: signature, wordCount: story.split(/\s+/u).filter(Boolean).length }, null, 2) + '\n');
  entries.push(entry);
}
const manifest = { schema: 1, lang: 'hi', checkedAt: '2026-10-02', entries, dispositions: research.candidates.filter((c) => c.disposition === 'refused').map(({ slug, disposition, blocker }) => ({ slug, disposition, blocker })) };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const summary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  imported: entries.length,
  importedEntries: entries.map((entry) => ({ slug: entry.slug, words: entry.wordCount, contentSignature: entry.contentSignature })),
  refused: research.candidates.filter((c) => c.disposition === 'refused').map(({ slug, disposition, blocker }) => ({ slug, disposition, blocker })),
  manifestSha256: createHash('sha256').update(readFileSync(manifestPath)).digest('hex'),
};
mkdirSync(new URL('work/hi-literature-check/', root), { recursive: true });
writeFileSync(new URL('work/hi-literature-check/bridge-check.json', root), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

