/** Rebuild the rights-documented local QA manifest without downloading or synthesizing audio. */
import { readFile, writeFile } from 'node:fs/promises';
import { createMemoryStore } from '../src/core/memory';
import { createAdapterRegistry } from '../src/adapters';
import { contentSignatureOf, ingestDocument, type CorpusDocument } from '../src/ingest';
import { canonicalTextSha256, releaseIdOf } from '../src/golisten/rights';
import { inspectWav } from '../src/golisten/wav';
import type { AudioImportManifest } from '../src/core/contracts/golisten';

const dir = 'test/fixtures/golisten';
const store = createMemoryStore();
const doc = JSON.parse(await readFile(`${dir}/de-guten-tag.text.json`, 'utf8')) as CorpusDocument;
doc.review.contentSignature = contentSignatureOf(doc);
await writeFile(`${dir}/de-guten-tag.text.json`, JSON.stringify(doc, null, 2) + '\n');
const text = await ingestDocument(store, createAdapterRegistry(), doc);
const sentences = (await store.sentences.where('textId', text.id)).sort((a, b) => a.index - b.index);
const wav = inspectWav(new Uint8Array(await readFile(`${dir}/de-guten-tag.wav`)));
const manifest: AudioImportManifest = {
  id: 'commons-de-guten-tag-2007-qa', textId: text.id, contentVersion: text.contentVersion,
  textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text),
  lang: 'de', locale: 'de-DE', narrator: 'Beagle Beck (attributed as assumed by Commons)',
  variety: 'de-DE', kind: 'human', qualityState: 'machine_checked',
  recording: {
    owner: 'Beagle Beck (uploader copyright-holder statement)',
    basis: 'PD-self statement at https://commons.wikimedia.org/wiki/File:De-Guten_Tag.oga (oldid 888223486)',
    license: 'Public-domain dedication worldwide; unconditional any-purpose fallback grant',
    attribution: doc.source.attribution,
  },
  performance: {
    performer: 'Beagle Beck (own work assumed in source metadata)',
    permission: 'Uploader copyright-holder/own-work statement grants any-purpose use; no independent performer investigation claimed',
  },
  rights: { status: 'approved', playInApp: true, stream: true, offline: true, redistribute: true, segment: true, transform: true },
  coverage: [{ sentenceId: sentences[0].id, startMs: 0, endMs: wav.durationMs!, reviewState: 'checked' }],
};
await writeFile(`${dir}/de-guten-tag.audio.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ textId: text.id, published: text.published, textSha256: manifest.textSha256, durationMs: wav.durationMs }));
