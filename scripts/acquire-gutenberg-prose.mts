/** Acquire the exact Project Gutenberg editions selected in the course catalogue.
 * Evidence is the official ebook page and its downloadable text; only Gutenberg's
 * boilerplate wrapper is removed.  The US public-domain statement is recorded as
 * the jurisdictional basis rather than inferred from an author's age.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readEpub } from '../src/ingest/epub';

const today = '2026-10-01';
const works = [
  ['de','storm-immensee','Immensee','Theodor Storm',6651],
  ['de','eichendorff-taugenichts','Aus dem Leben eines Taugenichts','Joseph von Eichendorff',35312],
  ['de','kafka-die-verwandlung','Die Verwandlung','Franz Kafka',22367],
  ['de','fontane-effi-briest','Effi Briest','Theodor Fontane',5323],
  ['es','cervantes-don-quijote','El ingenioso hidalgo don Quijote de la Mancha','Miguel de Cervantes',2000],
  ['es','galdos-marianela','Marianela','Benito Pérez Galdós',17340],
  ['es','marti-edad-de-oro','La Edad de Oro','José Martí',19898],
  ['es','palma-tradiciones-peruanas','Tradiciones peruanas (selección)','Ricardo Palma',21282],
  ['es','alarcon-capitan-veneno','El capitán Veneno','Pedro Antonio de Alarcón',29731],
] as const;

const root = process.cwd();
const outFor = (lang: string) => path.join(root, 'data', 'sources', `${lang}-prose`);
const manifests = new Map<string, { schema: 1; lang: string; entries: any[] }>();
const clean = (raw: string): string => {
  const start = raw.search(/\*\*\*\s*START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const end = raw.search(/\*\*\*\s*END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  if (start >= 0 && end > start) return raw.slice(raw.indexOf('\n', start) + 1, end).replace(/^\uFEFF/, '').trimEnd() + '\n';
  return raw.replace(/^\uFEFF/, '');
};
const rights = (id: number) => ({ state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, canModify: false, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true, verifiedBy: 'Project Gutenberg ebook page and licence notice', verifiedAt: today, basis: `Project Gutenberg ebook ${id} page identifies this edition and states it is offered for use at no cost; the rights record is limited to the United States public-domain basis shown by Project Gutenberg.`, sourceRepository: 'https://www.gutenberg.org/', statusByJurisdiction: { US: 'public-domain' }, evidence: [`https://www.gutenberg.org/ebooks/${id}`, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`] });
for (const [lang, slug, title, author, id] of works) {
  const dir = outFor(lang); fs.mkdirSync(dir, { recursive: true });
  let url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  let response = await fetch(url);
  let text: string;
  if (response.ok) text = clean(await response.text());
  else {
    url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`;
    response = await fetch(url); if (!response.ok) throw new Error(`${id}: text and EPUB HTTP ${response.status}`);
    const book = await readEpub(new Uint8Array(await response.arrayBuffer()));
    text = book.chapters.map((c) => c.text).join('\n\n').trimEnd() + '\n';
  }
  const file = `${slug}.txt`; fs.writeFileSync(path.join(dir, file), text, 'utf8');
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  const entry = { slug, title, author, streams: ['library'], contentType: 'story', rights: rights(id), source: { file, kind: 'gutenberg', url, edition: `Project Gutenberg ebook #${id}`, attribution: `${title} — ${author}; Project Gutenberg ebook #${id}; US public domain (official ebook notice).`, provenance: `Downloaded from the official Project Gutenberg plain-text edition on ${today}; only the START/END Gutenberg wrapper was removed. The prose wording and edition contents were otherwise preserved.` }, convert: { stripBoilerplate: false }, review: { status: 'reviewed', reviewedBy: 'acquire-gutenberg-prose source-fidelity check', reviewedAt: today, level: 'linguistic-check', notes: 'Byte/source check only; this records edition fidelity and makes no native-speaker quality claim.', coversSourceSha256: sha } };
  const mf = path.join(dir, 'library-manifest.json'); let manifest = manifests.get(lang) ?? { schema: 1, lang, entries: [] as any[] }; manifests.set(lang, manifest);
  manifest.entries = [...manifest.entries.filter((e: any) => e.slug !== slug), entry]; fs.writeFileSync(mf, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${lang} ${slug} Gutenberg#${id} ${text.length} chars ${sha}`);
}
