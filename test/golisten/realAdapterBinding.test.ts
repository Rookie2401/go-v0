import { describe, expect, it } from 'vitest';
import { createMemoryStore, StoreEventBus, type LanguageCode } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { contentSignatureOf, ingestDocument, type CorpusDocument } from '../../src/ingest';
import { buildPlayerManifest, createGoListen, encodeWav } from '../../src/golisten';
import { canonicalTextSha256, releaseIdOf } from '../../src/golisten/rights';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';

const cases: [LanguageCode, string, string][] = [
  ['de', 'de-DE', 'Guten Tag!'], ['es', 'es-ES', '¡Buenos días!'],
  ['hi', 'hi-IN', 'नमस्ते।'], ['sq', 'sq-AL', 'Mirëdita!'], ['th', 'th-TH', 'สวัสดีครับ'],
];

describe('exact recording binding with the five real adapters', () => {
  it.each(cases)('preserves %s canonical Unicode and token offsets without treating a tone fixture as reviewed speech', async (lang, locale, wording) => {
    const store = createMemoryStore();
    const adapters = createAdapterRegistry();
    const doc: CorpusDocument = {
      schemaVersion: 2, id: `adapter-binding-${lang}`, lang, locale, title: 'Import contract fixture', contentType: 'dialogue',
      corpus: {id:`binding-fixtures-${lang}`,kind:'comprehensible-input',title:'Test-only'},
      source: {id:`binding-source-${lang}`,title:'Test-owned wording',rights:'public-domain',authorship:'public-domain',
        provenance:'Conventional greeting used only for an adapter contract test; no literary authorship claim',attribution:'Test-only Unicode greeting; no acoustic review claimed'},
      review: {status:'reviewed',reviewedBy:'contract-test',reviewedAt:'2026-10-03',level:'linguistic-check'},
      generated:false,topics:[],editorialTags:['test-only'],prepTargets:[],sections:[{paragraphs:[{sentences:[{id:'greeting',text:wording}]}]}],
    };
    doc.review.contentSignature = contentSignatureOf(doc);
    const text = await ingestDocument(store, adapters, doc);
    const sentences = (await store.sentences.where('textId', text.id)).sort((a,b)=>a.index-b.index);
    expect(sentences.map(s=>s.text)).toEqual([wording]);
    for (const token of await store.tokens.where('textId',text.id)) {
      expect(sentences[0].text.slice(token.start,token.end)).toBe(token.surface);
    }
    // A waveform is solely a storage/playback contract fixture, never native-speaker or acoustic QA.
    const samples = new Float32Array(22050).fill(0.1);
    const bytes = encodeWav({samples,sampleRate:22050,channels:1});
    const manifest: AudioImportManifest = {
      id:`test-binding-${lang}`,textId:text.id,contentVersion:text.contentVersion,releaseId:releaseIdOf(text),
      textSha256:await canonicalTextSha256(text.id,text.contentVersion,sentences),lang,locale,narrator:'test-only waveform',kind:'synthetic',qualityState:'machine_checked',
      recording:{owner:'test author',basis:'test-only generated waveform'},performance:{performer:'test provider',permission:'test-only unrestricted use'},
      syntheticProvider:{id:'test-waveform',terms:'local contract fixture; no external provider',retention:'none'},textDerivative:'allowed',
      rights:{status:'approved',playInApp:true,stream:false,offline:true,redistribute:false,segment:true,transform:false,textDerivative:'allowed',providerRetention:'none'},
      coverage:[{sentenceId:sentences[0].id,startMs:0,endMs:1000,reviewState:'checked'}],
    };
    const gl = createGoListen({store,bus:new StoreEventBus(store),adapters});
    const imported = await gl.importRecording({manifest,bytes});
    expect((await buildPlayerManifest(store,imported.manifest)).segments[0]).toMatchObject({ready:true,exactTextBound:true,audioKind:'synthetic'});
    expect((await gl.audioStatus(text.id)).evidenceEligible).toBe(false);
    expect((await store.sentences.where('textId',text.id))[0].text).toBe(wording);
  });
});
