import { describe, expect, it } from 'vitest';
import type { CorpusDocument } from '../../src/ingest';
import { ingestDocument } from '../../src/ingest';
import { encodeWav } from '../../src/golisten';
import { canonicalTextSha256 } from '../../src/golisten/rights';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { isPlaceholder, manifestReadiness, manifestTemplate, packetHtml, recordingScript, type RecordingManifestTemplate } from '../../src/ladder/recording';
import { makeApp, liveSentences } from '../integration/harness';
import { baseDoc } from '../ingest/helpers';

/** A unit with an author id, a repeated sentence (hash key with ~1), a speaker and a raw prose paragraph the adapter segments. */
function unit(): CorpusDocument {
  return {
    ...baseDoc(), id: 'es-a1-1-99', title: 'En la casa', variety: 'es-HN',
    speakers: { m: 'Mamá' },
    sections: [
      { paragraphs: [
        { sentences: [{ id: 'saludo', text: 'Hola, Ana.', speaker: 'm' }, { text: 'Buenos días.' }, { text: 'Buenos días.' }] },
        { text: 'Ana come pan. Ana bebe agua.' },
      ] },
      { paragraphs: [{ sentences: [{ text: 'Adiós.' }] }] },
    ],
  };
}

const wav = (ms = 2000) => {
  const n = Math.floor(22050 * ms / 1000);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(i * 2 * Math.PI * 220 / 22050) * 0.15;
  return encodeWav({ samples, sampleRate: 22050, channels: 1 });
};

describe('ladder recording kit', () => {
  it('lists the sentences in order with exactly the ids the importer stores', async () => {
    const app = makeApp();
    const doc = unit();
    const script = recordingScript(doc, app.adapters.get('es'));
    const text = await ingestDocument(app.store, app.adapters, doc);
    const stored = await liveSentences(app.store, text.id);
    expect(script.textId).toBe(text.id);
    expect(script.sentences.map((s) => s.id)).toEqual(stored.map((s) => s.id));
    expect(script.sentences.map((s) => s.text)).toEqual(stored.map((s) => s.text));
    expect(script.sentences.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    // author id kept as the key; the repeat gets its own id; no two ids collide
    expect(script.sentences[0].id).toBe(`${text.id}/ssaludo`);
    expect(script.sentences[0].speaker).toBe('Mamá');
    expect(new Set(script.sentences.map((s) => s.id)).size).toBe(6);
    expect(script.sentences[2].id).toMatch(/~1$/);
    expect(script.sentences[3].text).toBe('Ana come pan.');
    expect(script.sentences.map((s) => s.paragraph)).toEqual([0, 0, 0, 1, 1, 2]);
  });

  it('binds the manifest to the stored text: release id, content version and SHA-256', async () => {
    const app = makeApp();
    const doc = unit();
    const tpl = await manifestTemplate(doc, { adapter: app.adapters.get('es') });
    const text = await ingestDocument(app.store, app.adapters, doc);
    const stored = await liveSentences(app.store, text.id);
    expect(tpl.textId).toBe(text.id);
    expect(tpl.contentVersion).toBe(text.contentVersion);
    expect(tpl.releaseId).toBe(`${text.id}@${text.contentVersion}`);
    expect(tpl.textSha256).toBe(await canonicalTextSha256(text.id, text.contentVersion, stored));
    expect(tpl.coverage.map((c) => c.sentenceId)).toEqual(stored.map((s) => s.id));
    // a different content version is a different fingerprint
    expect((await manifestTemplate(doc, { adapter: app.adapters.get('es'), contentVersion: 2 })).textSha256).not.toBe(tpl.textSha256);
  });

  it('has every field importRecordingFor requires, as placeholders, and is not ready', async () => {
    const app = makeApp();
    const tpl = await manifestTemplate(unit(), { adapter: app.adapters.get('es') });
    expect(tpl.kind).toBe('human');
    expect(tpl.lang).toBe('es');
    for (const v of [tpl.locale, tpl.narrator, tpl.variety, tpl.recording.owner, tpl.recording.basis, tpl.performance.performer, tpl.performance.permission, tpl.qualityState]) {
      expect(isPlaceholder(v)).toBe(true);
    }
    expect(tpl.id).toBeTruthy();
    expect(tpl.rights).toMatchObject({ status: 'pending', playInApp: false, segment: false });
    expect(tpl.coverage.every((c) => c.startMs === null && c.endMs === null && isPlaceholder(c.reviewState))).toBe(true);
    expect(tpl._notes.join(' ')).toMatch(/evidenceEligible/);
    const problems = manifestReadiness(tpl);
    expect(problems.length).toBeGreaterThan(10);
    expect(problems.join('\n')).toMatch(/manifest\.narrator is still a placeholder/);
    expect(problems.join('\n')).toMatch(/qualityState/);
    expect(problems.join('\n')).toMatch(/no startMs\/endMs/);
  });

  it('is refused by importRecordingFor as it stands', async () => {
    const app = makeApp();
    const text = await ingestDocument(app.store, app.adapters, unit());
    const tpl = await manifestTemplate(unit(), { adapter: app.adapters.get('es') });
    const { _notes, ...manifest } = tpl;
    void _notes;
    await expect(app.golisten.importRecording({ manifest: manifest as unknown as AudioImportManifest, bytes: wav(), origin: 'curated', reviewer: 'A. Reviewer' }))
      .rejects.toThrow(/is still the template placeholder/); // the importer refuses a leftover <…> before anything else (GoListen 06d4cf1)
    expect(await app.store.audioAssets.all()).toHaveLength(0);
    expect(text.id).toBe(tpl.textId);
  });

  it('still refuses when only the quality state is filled in: placeholders, then rights and times', async () => {
    const app = makeApp();
    await ingestDocument(app.store, app.adapters, unit());
    const tpl = await manifestTemplate(unit(), { adapter: app.adapters.get('es') });
    const { _notes, ...manifest } = tpl;
    void _notes;
    await expect(app.golisten.importRecording({ manifest: { ...manifest, qualityState: 'human_reviewed' } as unknown as AudioImportManifest, bytes: wav(), origin: 'curated', reviewer: 'A. Reviewer' }))
      .rejects.toThrow(/is still the template placeholder/);
    const rights = { ...manifest.rights, status: 'approved' as const, playInApp: true, segment: true };
    await expect(app.golisten.importRecording({ manifest: { ...manifest, rights, qualityState: 'human_reviewed' } as unknown as AudioImportManifest, bytes: wav(), origin: 'curated', reviewer: 'A. Reviewer' }))
      .rejects.toThrow(/is still the template placeholder|invalid alignment review state/);
  });

  it('a completed template imports as a reviewed human recording, and readiness is then empty', async () => {
    const app = makeApp();
    const doc = unit();
    const text = await ingestDocument(app.store, app.adapters, doc);
    const tpl: RecordingManifestTemplate = await manifestTemplate(doc, { adapter: app.adapters.get('es') });
    const step = 300;
    const done: RecordingManifestTemplate = {
      ...tpl,
      locale: 'es-HN', narrator: 'Test Speaker', variety: 'es-HN',
      recording: { owner: 'Test Owner', basis: 'recorded for this test under a test release' },
      performance: { performer: 'Test Speaker', permission: 'test permission: in-app playback and segmentation' },
      rights: { status: 'approved', playInApp: true, stream: true, offline: true, redistribute: false, segment: true, transform: false },
      qualityState: 'human_reviewed',
      coverage: tpl.coverage.map((c, i) => ({ sentenceId: c.sentenceId, startMs: i * step, endMs: i * step + 250, reviewState: 'reviewed' })),
      _notes: [],
    };
    expect(manifestReadiness(done)).toEqual([]);
    const { _notes, ...manifest } = done;
    void _notes;
    const result = await app.golisten.importRecording({ manifest: manifest as unknown as AudioImportManifest, bytes: wav(), origin: 'curated', reviewer: 'A. Reviewer' });
    expect(result.asset).toMatchObject({ audioKind: 'human', qualityState: 'human_reviewed', textBinding: { textId: text.id, textSha256: tpl.textSha256 } });
    expect(result.manifest.complete).toBe(true);
    expect(result.imported).toBe(6);
    // a learner could never do this
    expect(manifestReadiness({ ...done, narrator: '<name of the speaker>' }).join()).toMatch(/narrator is still a placeholder/);
  });

  it('refuses Scripture and a bad content version', async () => {
    const app = makeApp();
    await expect(manifestTemplate({ ...unit(), contentType: 'scripture' }, { adapter: app.adapters.get('es') })).rejects.toThrow(/not Scripture/);
    await expect(manifestTemplate(unit(), { adapter: app.adapters.get('es'), contentVersion: 0 })).rejects.toThrow(/contentVersion/);
  });

  it('the printable script shows numbers, text, version and the review warning, and escapes markup', async () => {
    const app = makeApp();
    const doc = unit();
    doc.sections[1].paragraphs = [{ sentences: [{ text: 'Uno <b> & dos.' }] }];
    const script = recordingScript(doc, app.adapters.get('es'));
    const tpl = await manifestTemplate(doc, { adapter: app.adapters.get('es') });
    const html = packetHtml({ script, contentVersion: 1, textSha256: tpl.textSha256, pipelineState: 'machine-draft' });
    expect(html).toContain('es-a1-1-99-01.wav');
    expect(html).toContain('Uno &lt;b&gt; &amp; dos.');
    expect(html).not.toContain('<b> &');
    expect(html).toContain('not yet reviewed');
    expect(html).toContain(tpl.textSha256);
    expect(html).toContain('evidenceEligible');
    expect(packetHtml({ script, contentVersion: 1, textSha256: tpl.textSha256, pipelineState: 'reviewed' })).not.toContain('class="box warn"');
    expect(packetHtml({ script, contentVersion: 1, textSha256: tpl.textSha256 })).toContain('no pipeline record');
  });
});
