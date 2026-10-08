import { describe, expect, it } from 'vitest';
import { buildFixtureText, hash, ids, courseForLang, type AppStore, type LanguageCode } from '../../src/core';
import { FixtureTtsProvider, GOLISTEN_VERSION, stripVerseMarkers } from '../../src/golisten';
import { LANGS, MarksTestProvider, STORY, SCRIPTURE, addScripture, addStory, editSentence, makeEnv } from './support';

const textId = (lang: LanguageCode, slug = 'story-01') => ids.text(lang, slug);

/** Structural invariant: a ready segment always has an existing, validated asset. */
async function assertReadyImpliesAsset(store: AppStore) {
  for (const s of await store.audioSegments.all()) {
    if (s.status !== 'ready') {
      expect(s.assetId, `non-ready segment ${s.id} must not carry an asset`).toBeUndefined();
      continue;
    }
    expect(s.assetId, `ready segment ${s.id} needs an asset`).toBeTruthy();
    expect(await store.assets.has(s.assetId!)).toBe(true);
    const asset = await store.audioAssets.get(s.assetId!);
    expect(asset).toBeTruthy();
    expect(asset!.validation?.ok).toBe(true);
  }
}

describe.each(LANGS)('pipeline (%s)', (lang) => {
  it('turns every sentence into a validated, content-addressed asset with by-construction alignment', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, lang);
    const r = await gl.ensureAudio(textId(lang), { runNow: true });
    expect(r).toMatchObject({ created: 3, reused: 0, failed: 0 });
    expect(r.manifest.complete).toBe(true);
    expect(r.manifest.segmentIds).toHaveLength(3);
    expect(r.manifest.segmentIds.every((id) => /^seg:ck:[0-9a-f]{32}$/.test(id))).toBe(true);
expect(new Set(r.manifest.segmentIds).size).toBe(3);

    const sentences = (await store.sentences.where('textId', textId(lang))).sort((a, b) => a.index - b.index);
    for (let i = 0; i < 3; i++) {
      const seg = (await gl.getSegment(r.manifest.segmentIds[i]))!;
      expect(seg.status).toBe('ready');
      expect(seg.sentenceIds).toEqual([sentences[i].id]);
      expect(seg.displayText).toBe(sentences[i].text);
      expect(seg.assetId).toBeTruthy();
      const asset = (await gl.getAsset(seg.assetId!))!;
      expect(asset).toMatchObject({ sourceType: 'generated-tts', lang, mime: 'audio/wav', sampleRate: 22050, channels: 1 });
      expect(asset.validation!.ok).toBe(true);
      expect(asset.durationMs).toBeGreaterThan(300);
      expect(asset.generation).toMatchObject({ providerId: 'fixture', engine: 'fixture-tone-v1', sourceTextHash: hash(sentences[i].text), speechTextHash: hash(seg.speechText) });
      expect(await store.assets.has(asset.id)).toBe(true);
      expect(await gl.assetUrl(asset.id)).toMatch(/^data:audio\/wav;base64,/);

      const als = await gl.alignments(seg.id);
      expect(als).toHaveLength(1); // the fixture never produces marks, so sentence-level only
      expect(als[0]).toMatchObject({ unit: 'sentence', unitId: sentences[i].id, method: 'by-construction', confidence: 1, startMs: 0, endMs: asset.durationMs, assetId: asset.id });
    }
    await assertReadyImpliesAsset(store);
  });

  it('is idempotent: a second ensureAudio reuses every segment and synthesizes nothing', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers().find((p) => p.id === 'fixture') as FixtureTtsProvider;
    await addStory(store, lang);
    const first = await gl.ensureAudio(textId(lang), { runNow: true });
    const calls = fixture.calls.length;
    const assets = await store.audioAssets.count();
    const jobs = (await gl.jobs()).length;
    const second = await gl.ensureAudio(textId(lang), { runNow: true });
    expect(second).toMatchObject({ created: 0, reused: 3, failed: 0 });
    expect(second.manifest.id).toBe(first.manifest.id);
    expect(second.manifest.segmentIds).toEqual(first.manifest.segmentIds);
    expect(fixture.calls.length).toBe(calls);
    expect(await store.audioAssets.count()).toBe(assets);
    expect((await gl.jobs()).length).toBe(jobs);
    expect(await store.audioSegments.count()).toBe(3);
  });

  it('a text edit invalidates only the changed sentence segment (and reverting reuses the old one)', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers().find((p) => p.id === 'fixture') as FixtureTtsProvider;
    await addStory(store, lang);
    const before = await gl.ensureAudio(textId(lang), { runNow: true });
    const originalText = (await store.sentences.get(ids.sentence(textId(lang), 1)))!.text;
    const calls = fixture.calls.length;

    await editSentence(store, textId(lang), 1, originalText + ' ' + (lang === 'th' ? 'สวัสดี' : lang === 'hi' ? 'हूँ' : 'hola'));
    const after = await gl.ensureAudio(textId(lang), { runNow: true });
    expect(after).toMatchObject({ created: 1, reused: 2, failed: 0 });
    expect(after.manifest.contentVersion).toBe(2);
    expect(after.manifest.segmentIds[0]).toBe(before.manifest.segmentIds[0]);
    expect(after.manifest.segmentIds[2]).toBe(before.manifest.segmentIds[2]);
    expect(after.manifest.segmentIds[1]).not.toBe(before.manifest.segmentIds[1]);
    expect(fixture.calls.length).toBe(calls + 1);
    expect(after.manifest.complete).toBe(true);

    await editSentence(store, textId(lang), 1, originalText); // revert: the old cache key is back
    const reverted = await gl.ensureAudio(textId(lang), { runNow: true });
    expect(reverted).toMatchObject({ created: 0, reused: 3 });
    expect(reverted.manifest.segmentIds).toEqual(before.manifest.segmentIds);
    expect(fixture.calls.length).toBe(calls + 1);
    await assertReadyImpliesAsset(store);
  });

  it('never speaks verse markers: scripture speech text has no digits (verse numbers live in verseRefs)', async () => {
    const { store, gl } = await makeEnv();
    await addScripture(store, lang);
    const r = await gl.ensureAudio(textId(lang, 'john-3'), { runNow: true });
    expect(r.manifest.complete).toBe(true);
    for (const id of r.manifest.segmentIds) {
      const seg = (await gl.getSegment(id))!;
      expect(seg.speechText).not.toMatch(/\d/);
      expect(seg.speechText).not.toMatch(/[¹²³⁰⁴-⁹]/);
      const sentence = (await store.sentences.get(seg.sentenceIds[0]))!;
      expect(sentence.verseRefs?.length).toBeGreaterThan(0);
      expect(sentence.text).not.toMatch(/\d/); // display text is canonical and carries no verse number either
    }
  });

  it('strips a bracketed verse marker present in the display text, keeping the display text canonical', async () => {
    const { store, gl } = await makeEnv();
    const base = SCRIPTURE[lang][0];
    const sep = lang === 'th' ? '' : ' ';
    const plain = base.tokens.map((t, i) => (i > 0 && t.isWord !== false ? sep : '') + t.surface).join('');
    await buildFixtureText(store, { lang, slug: 'john-marked', kind: 'scripture', version: 'fixture', sentences: [{ text: `[16] ${plain}`, tokens: base.tokens, verseRefs: ['JHN.3.16'] }] });
    const r = await gl.ensureAudio(textId(lang, 'john-marked'), { runNow: true });
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect(seg.displayText).toBe(`[16] ${plain}`);
    expect(seg.speechText).toBe(plain);
    expect(seg.speechText).not.toMatch(/\d|\[|\]/);
    expect(seg.speechNormalization.length).toBeGreaterThan(0);
    expect(seg.status).toBe('ready');
  });

  it('the pipeline strips verse markers itself when the adapter does not (safety net, recorded)', async () => {
    const { store, gl } = await makeEnv({ identitySpeech: true });
    const base = SCRIPTURE[lang][0];
    const sep = lang === 'th' ? '' : ' ';
    const plain = base.tokens.map((t, i) => (i > 0 && t.isWord !== false ? sep : '') + t.surface).join('');
    await buildFixtureText(store, { lang, slug: 'john-leaky', kind: 'scripture', version: 'fixture', sentences: [{ text: `[16] ${plain}¹⁶`, tokens: base.tokens, verseRefs: ['JHN.3.16'] }] });
    const r = await gl.ensureAudio(textId(lang, 'john-leaky'), { runNow: true });
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect(seg.speechText).toBe(plain);
    expect(seg.speechNormalization.some((t) => t.tool === GOLISTEN_VERSION && /verse marker/.test(t.description))).toBe(true);
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset.generation!.normalizerVersion).toMatch(/golisten-strip@1$/);
  });

  it('records requestedLocale vs actualLocale honestly and leaves voices unapproved', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, lang);
    const course = courseForLang(lang);
    const voice = await gl.resolveVoice(lang);
    // a companion language (nn) is requested in its own locale, the others in the course's first preferred locale
    expect(voice.requestedLocale).toBe(lang === course.lang ? course.preferredLocales[0] : 'nn-NO');
    expect(voice.approved).toBe(false);
    expect(voice.providerId).toBe('fixture');
    expect(voice.qaNote).toMatch(/not speech/i);
    const offered = (await gl.providers()[0].listVoices(lang)).map((v) => v.locale);
    expect(offered).toContain(voice.actualLocale);
    if (lang === 'es') {
      expect(voice.requestedLocale).toBe('es-HN');
      expect(voice.actualLocale).toBe('es-419');
      expect(voice.qaNote).toMatch(/fallback accent/i);
    } else {
      expect(voice.actualLocale).toBe(voice.requestedLocale);
    }
    expect(await store.voices.get(voice.id)).toMatchObject({ requestedLocale: voice.requestedLocale, actualLocale: voice.actualLocale });
    // resolving again returns the same stored row (a human's approval would survive)
    expect((await gl.resolveVoice(lang)).id).toBe(voice.id);
    expect(voice).toMatchObject({ reviewStatus: 'unreviewed', isSpeech: false, providerVersion: '1' });
    await store.voices.put({ ...voice, reviewStatus: 'in-review' });
    expect((await gl.resolveVoice(lang)).reviewStatus).toBe('in-review'); // a stored review decision survives re-resolution

    const r = await gl.ensureAudio(textId(lang), { runNow: true });
    const d = await gl.diagnostics(textId(lang));
    expect(d.segments).toHaveLength(3);
    for (const s of d.segments) {
      expect(s).toMatchObject({ status: 'ready', providerId: 'fixture', requestedLocale: voice.requestedLocale, actualLocale: voice.actualLocale, overridesUsed: [], contentVersion: 1 });
      expect(s.alignmentMethods).toEqual(['by-construction']);
      expect(s.minAlignmentConfidence).toBe(1);
      expect(s.validation?.ok).toBe(true);
    }
    expect(d.failedJobs).toBe(0);
    expect(d.deadJobs).toBe(0);
    expect(r.manifest.voiceConfigId).toBe(voice.id);
  });
});

describe('pipeline details', () => {
  it('stripVerseMarkers removes bracketed numerals always and superscripts only for scripture', () => {
    expect(stripVerseMarkers('[16] Porque Dios', { superscripts: false })).toEqual({ text: 'Porque Dios', removed: ['[16]'] });
    expect(stripVerseMarkers('So [3-4] and [ 5 ] it', { superscripts: false }).text).toBe('So and it');
    expect(stripVerseMarkers('Dios¹⁶ amó', { superscripts: true }).text).toBe('Dios amó');
    expect(stripVerseMarkers('10 m²', { superscripts: false })).toEqual({ text: '10 m²', removed: [] });
    expect(stripVerseMarkers('no markers', { superscripts: true }).removed).toEqual([]);
  });

  it('identical sentences in one text share a single segment and a single synthesis', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    await addStory(store, 'es', 'repeat', [STORY.es[0], STORY.es[1], STORY.es[0]]);
    const r = await gl.ensureAudio(textId('es', 'repeat'), { runNow: true });
    expect(r.created).toBe(2);
    expect(r.manifest.segmentIds).toHaveLength(3);
    expect(r.manifest.segmentIds[0]).toBe(r.manifest.segmentIds[2]);
    expect(fixture.calls).toHaveLength(2);
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect(seg.sentenceIds).toEqual([ids.sentence(textId('es', 'repeat'), 0), ids.sentence(textId('es', 'repeat'), 2)]);
    const als = await gl.alignments(seg.id);
    expect(als.map((a) => a.unitId).sort()).toEqual(seg.sentenceIds.slice().sort());
    expect(r.manifest.complete).toBe(true);
  });

  it('honours a sentence subset but the manifest always describes the whole text', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'de');
    const sids = [ids.sentence(textId('de'), 1)];
    const r = await gl.ensureAudio(textId('de'), { sentenceIds: sids, runNow: true });
    expect(r).toMatchObject({ created: 1, reused: 0 });
    expect(r.manifest.segmentIds).toHaveLength(1);
    expect(r.manifest.complete).toBe(false); // other sentences have no audio yet
    const full = await gl.ensureAudio(textId('de'), { runNow: true });
    expect(full).toMatchObject({ created: 2, reused: 1 });
    expect(full.manifest.complete).toBe(true);
    expect(await gl.getManifest(textId('de'))).toMatchObject({ id: full.manifest.id, complete: true });
  });

  it('runNow:false leaves pending segments without assets; runJobs completes them and the manifest flips complete', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'sq');
    const r = await gl.ensureAudio(textId('sq'));
    expect(r.created).toBe(3);
    expect(r.manifest.complete).toBe(false);
    for (const id of r.manifest.segmentIds) {
      const s = (await gl.getSegment(id))!;
      expect(s.status).toBe('pending');
      expect(s.assetId).toBeUndefined();
    }
    await assertReadyImpliesAsset(store);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(textId('sq')))!.complete).toBe(true);
    expect(await gl.runJobs()).toBe(0);
    await assertReadyImpliesAsset(store);
  });

  it('pronunciation substitution changes speech text only, re-keys just the sentences it touches and is recorded', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'es');
    const before = await gl.ensureAudio(textId('es'), { runNow: true });
    await store.pronunciations.put({ id: 'pr1', lang: 'es', match: 'Dios', mechanism: 'substitution', value: 'Diós', provenance: 'human', reviewed: true, lexiconVersion: '1' });
    const after = await gl.ensureAudio(textId('es'), { runNow: true });
    expect(after).toMatchObject({ created: 2, reused: 1 }); // "Dios" occurs in sentences 0 and 1 only
    expect(after.manifest.segmentIds[2]).toBe(before.manifest.segmentIds[2]);
    const s0 = (await gl.getSegment(after.manifest.segmentIds[0]))!;
    expect(s0.displayText).toBe('Yo creo en Dios.');
    expect(s0.speechText).toBe('Yo creo en Diós.');
    expect(s0.pronunciationOverridesUsed).toEqual(['pr1']);
    expect(s0.speechNormalization.some((t) => /pronunciation override pr1/.test(t.description))).toBe(true);
    const asset = (await gl.getAsset(s0.assetId!))!;
    expect(asset.generation!.pronunciationLexiconVersion).toBe('pr1@1');
    expect((await gl.diagnostics(textId('es'))).segments[0].overridesUsed).toEqual(['pr1']);

    // bumping the entry's lexiconVersion invalidates exactly the sentences that used it
    await store.pronunciations.put({ id: 'pr1', lang: 'es', match: 'Dios', mechanism: 'substitution', value: 'Diós', provenance: 'human', reviewed: true, lexiconVersion: '2' });
    const bumped = await gl.ensureAudio(textId('es'), { runNow: true });
    expect(bumped).toMatchObject({ created: 2, reused: 1 });
  });

  it('substitution only matches whole words in spaced scripts, and plain substrings in Thai', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'de');
    await store.pronunciations.put({ id: 'pr-de', lang: 'de', match: 'an', mechanism: 'substitution', value: 'ahn', provenance: 'human', reviewed: true, lexiconVersion: '1' });
    const r = await gl.ensureAudio(textId('de'), { runNow: true });
    const s0 = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect(s0.speechText).toBe('Ich glaube ahn Gott.'); // "an" as a word, not inside "glaube"
    await addStory(store, 'th');
    await store.pronunciations.put({ id: 'pr-th', lang: 'th', match: 'พระเจ้า', mechanism: 'substitution', value: 'พระ เจ้า', provenance: 'human', reviewed: true, lexiconVersion: '1' });
    const t = await gl.ensureAudio(textId('th'), { runNow: true });
    expect((await gl.getSegment(t.manifest.segmentIds[0]))!.speechText).toBe('ฉันเชื่อในพระ เจ้า');
  });

  it('ssml-phoneme is applied only when the provider can honour it (never claimed otherwise)', async () => {
    const entry = { id: 'ph1', lang: 'es' as const, match: 'Dios', mechanism: 'ssml-phoneme' as const, value: 'djos', provenance: 'human' as const, reviewed: true, lexiconVersion: '1' };
    // fixture provider: no ssml/phoneme support -> not applied, not reported
    const a = await makeEnv();
    await addStory(a.store, 'es');
    await a.store.pronunciations.put(entry);
    const ra = await a.gl.ensureAudio(textId('es'), { runNow: true });
    const sa = (await a.gl.getSegment(ra.manifest.segmentIds[0]))!;
    expect(sa.pronunciationOverridesUsed).toEqual([]);
    expect((await a.gl.getAsset(sa.assetId!))!.generation!.pronunciationLexiconVersion).toBe('none');

    // capable provider: ssml is built, speech text is untouched
    let marks: MarksTestProvider | undefined;
    const b = await makeEnv({ providerFactory: (reg) => [(marks = new MarksTestProvider(reg))], defaultProviderId: 'marks-test' });
    await addStory(b.store, 'es');
    await b.store.pronunciations.put(entry);
    const rb = await b.gl.ensureAudio(textId('es'), { runNow: true });
    const sb = (await b.gl.getSegment(rb.manifest.segmentIds[0]))!;
    expect(sb.speechText).toBe('Yo creo en Dios.');
    expect(sb.pronunciationOverridesUsed).toEqual(['ph1']);
    const req = marks!.calls.find((c) => c.text === 'Yo creo en Dios.')!;
    expect(req.ssml).toBe('<speak version="1.0" xml:lang="es-419">Yo creo en <phoneme alphabet="ipa" ph="djos">Dios</phoneme>.</speak>');
    expect(marks!.calls.find((c) => c.text === 'Entiendo mi corazón.')!.ssml).toBeUndefined();
  });

  it('cache keys differ across providers/voices: the same text under another provider is a new segment', async () => {
    let marks: MarksTestProvider | undefined;
    const env = await makeEnv({ providerFactory: (reg) => [(marks = new MarksTestProvider(reg))] });
    await addStory(env.store, 'de');
    const a = await env.gl.ensureAudio(textId('de'), { runNow: true });
    env.gl.setDefaultProvider('marks-test');
    const b = await env.gl.ensureAudio(textId('de'), { runNow: true });
    expect(b).toMatchObject({ created: 3, reused: 0 });
    expect(b.manifest.voiceConfigId).not.toBe(a.manifest.voiceConfigId);
    expect(b.manifest.segmentIds.some((id) => a.manifest.segmentIds.includes(id))).toBe(false);
    expect(marks!.calls).toHaveLength(3);
  });

  it('a sentence with nothing speakable never reaches a provider and is never ready', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    await addStory(store, 'es', 'punct', [{ tokens: [{ surface: '[16]', isWord: false }] }, STORY.es[0]]);
    const r = await gl.ensureAudio(textId('es', 'punct'), { runNow: true });
    expect(r.failed).toBe(1);
    expect(r.manifest.complete).toBe(false);
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(1);
    expect(dead[0].lastError).toMatch(/nothing speakable|empty speech/);
    expect(fixture.calls).toHaveLength(1);
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect(seg.status).toBe('failed');
    expect(seg.assetId).toBeUndefined();
    expect(await gl.retryDead()).toBe(0); // retrying cannot help
    await assertReadyImpliesAsset(store);
  });

  it('regenerates when the asset bytes have disappeared, without touching other segments', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    await addStory(store, 'hi');
    const first = await gl.ensureAudio(textId('hi'), { runNow: true });
    const lostAsset = (await gl.getSegment(first.manifest.segmentIds[0]))!.assetId!;
    const realHas = store.assets.has.bind(store.assets);
    store.assets.has = async (id: string) => (id === lostAsset ? false : realHas(id));
    const calls = fixture.calls.length;
    const second = await gl.ensureAudio(textId('hi'), { runNow: true });
    expect(second.reused).toBe(2);
    expect(fixture.calls.length).toBe(calls + 1);
    expect(await store.audioAssets.count()).toBe(3); // same content address, no duplicate
    store.assets.has = realHas;
  });

  it('runs one synthesis per job even when ensureAudio is called concurrently', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    await addStory(store, 'sq');
    await Promise.all([gl.ensureAudio(textId('sq'), { runNow: true }), gl.ensureAudio(textId('sq'), { runNow: true })]);
    expect(fixture.calls.length).toBe(3); // the in-flight guard prevents double synthesis
    expect(await store.audioAssets.count()).toBe(3);
    const final = await gl.ensureAudio(textId('sq'), { runNow: true });
    expect(final).toMatchObject({ created: 0, reused: 3 });
    await assertReadyImpliesAsset(store);
  });

  it('rejects unknown texts, unknown voice configs and language mismatches', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'de');
    await expect(gl.ensureAudio('text:de:missing')).rejects.toThrow(/not found/);
    await expect(gl.ensureAudio(textId('de'), { voiceConfigId: 'nope' })).rejects.toThrow(/not found/);
    const es = await gl.resolveVoice('es');
    await expect(gl.ensureAudio(textId('de'), { voiceConfigId: es.id })).rejects.toThrow(/is es, text is de/);
    await expect(gl.resolveVoice('de', 'honduras-es')).rejects.toThrow(/is es, not de/);
  });
});
