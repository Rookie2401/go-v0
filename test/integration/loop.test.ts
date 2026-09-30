/**
 * The end-to-end acquisition loop, run for all five languages against the REAL adapters, the REAL
 * bundled corpora and the three engines sharing one store and one event bus:
 *
 *   encounter → understand → re-encounter → hear → use in Scripture → express → rehearse
 *   → independently produce → update learner state
 *
 * plus the Scripture preparation loop. Nothing here is mocked except the clock.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppStore, LanguageCode, LearnerItemState, Sentence, Text, Token } from '../../src/core';
import { LEVEL_ORDER, StoreEventBus, createMemoryStore, ids, seedBasics } from '../../src/core';
import type { AudioSegmentCompleted, EnglishRescueRevealed, SentenceViewed, ShadowingAttempt, TokenHelpOpened } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { ingestAll, loadBundledCorpus } from '../../src/ingest';
import { createGoLearn } from '../../src/golearn';
import { createGoListen } from '../../src/golisten';
import { createGoTell } from '../../src/gotell';

interface Scenario {
  lang: LanguageCode;
  course: string;
  /** Surface form of "sin" as it appears in the story. */
  sin: string;
  /** Story sentence indexes the learner "writes" in his testimony (both contain the sin word). */
  draftSentences: number[];
  /** How the learner separates sentences in his draft: Thai writers use a space, which is also a clause separator,
   *  so the Thai adapter only splits on a newline / double space — the editor keeps one sentence per line. */
  joiner?: string;
  /** Optional: a rough sentence with a known-word error and the repair GoTell should offer. */
  repair?: { draft: string; expectContains: string };
}

const SCENARIOS: Scenario[] = [
  { lang: 'es', course: 'honduras-es', sin: 'pecado', draftSentences: [1, 3], repair: { draft: 'Dios ama a el mundo.', expectContains: 'al mundo' } },
  { lang: 'sq', course: 'albania-sq', sin: 'mëkat', draftSentences: [1, 3] },
  { lang: 'th', course: 'thailand-th', sin: 'บาป', draftSentences: [1, 3], joiner: '\n' },
  { lang: 'hi', course: 'india-hi', sin: 'पाप', draftSentences: [1, 3] },
  { lang: 'de', course: 'germany-de', sin: 'Sünde', draftSentences: [1, 3] },
];

const lvl = (l: string) => LEVEL_ORDER.indexOf(l as (typeof LEVEL_ORDER)[number]);

function makeClock() {
  let t = Date.parse('2026-03-01T08:00:00.000Z');
  return { now: () => new Date((t += 1000)).toISOString(), jumpDays: (d: number) => { t += d * 86_400_000; } };
}

async function sentencesOf(store: AppStore, textId: string): Promise<Sentence[]> {
  return (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
}
async function tokensOf(store: AppStore, sentenceId: string): Promise<Token[]> {
  return (await store.tokens.where('sentenceId', sentenceId)).sort((a, b) => a.index - b.index);
}

for (const sc of SCENARIOS) {
  describe(`acquisition loop — ${sc.lang}`, () => {
    const store = createMemoryStore();
    const clock = makeClock();
    const bus = new StoreEventBus(store, clock.now);
    const adapters = createAdapterRegistry();
    const golearn = createGoLearn({ store, bus, adapters, clock: clock.now });
    const golisten = createGoListen({ store, bus, adapters, clock: clock.now });
    const gotellAll = createGoTell({ store, bus, adapters, golearn, golisten, clock: clock.now });
    const user = `learner-${sc.lang}`;
    const gotell = gotellAll.forUser(user);
    let story: Text, bible: Text, dialogue: Text;
    let storySentences: Sentence[];
    let sinFormId: string;
    /** The lemma behind the sin form (inflected languages produce other forms of it — Albanian "mëkatin"). */
    let sinLemmaId: string;
    let sinItemBeforeListening: LearnerItemState | undefined;

    const view = async (text: Text, session: string, sentences: Sentence[]) => {
      for (const s of sentences) {
        const toks = await tokensOf(store, s.id);
        await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: user, lang: sc.lang, surface: text.kind === 'scripture' ? 'scripture' : 'corpus', session, dedupeKey: `view:${user}:${session}:${s.id}`, textId: text.id, sentenceId: s.id, tokenIds: toks.map((t) => t.id) });
      }
    };

    beforeAll(async () => {
      await seedBasics(store, user, sc.course);
      golearn.attach();
      const docs = loadBundledCorpus().filter((d) => d.lang === sc.lang);
      expect(docs.length).toBe(3);
      await ingestAll(store, adapters, docs);
      story = (await store.texts.get(ids.text(sc.lang, 'story-01')))!;
      bible = (await store.texts.get(ids.text(sc.lang, 'bible-1john-1')))!;
      dialogue = (await store.texts.get(ids.text(sc.lang, 'dialogue-01')))!;
      expect(story && bible && dialogue).toBeTruthy();
      storySentences = await sentencesOf(store, story.id);
      sinFormId = ids.form(sc.lang, adapters.get(sc.lang).normalize(sc.sin));
      const sinToken = (await store.tokens.where('formId', sinFormId)).find((t) => t.textId === story.id)!;
      const an = await golearn.resolveAnalysis(sinToken.id);
      expect(an?.lemmaId, 'the sin word is analysed by the real adapter').toBeDefined();
      sinLemmaId = an!.lemmaId!;
    });

    it('the corpus is real, tokenized by the adapter, and story/Bible share lexical ids', async () => {
      expect(bible.kind).toBe('scripture');
      expect(bible.generated).toBe(false);
      const bibleSentences = await sentencesOf(store, bible.id);
      expect(bibleSentences.every((s) => s.verseRefs && s.verseRefs.length > 0)).toBe(true);
      expect(bibleSentences.every((s) => !/\d/.test(s.text))).toBe(true); // verse numbers are metadata, never text
      // Every token is an exact slice of the canonical sentence.
      for (const s of [...storySentences, ...bibleSentences]) for (const t of await tokensOf(store, s.id)) expect(s.text.slice(t.start, t.end)).toBe(t.surface);
      if (sc.lang === 'th') {
        const toks = await tokensOf(store, storySentences[7].id); // พระเจ้าทรงรักโลก
        expect(storySentences[7].text.includes(' ')).toBe(false);
        expect(toks.filter((t) => t.isWord).length).toBeGreaterThanOrEqual(4);
      }
      const storyForms = new Set((await store.tokens.where('textId', story.id)).filter((t) => t.isWord).map((t) => t.formId));
      const bibleForms = (await store.tokens.where('textId', bible.id)).filter((t) => t.isWord).map((t) => t.formId);
      const shared = bibleForms.filter((f) => storyForms.has(f));
      expect(shared.length).toBeGreaterThan(0);
      expect(storyForms.has(sinFormId)).toBe(true);
    });

    it('step 1 — reading the story creates encounters; tapping two words weakens only their evidence', async () => {
      const session = 'read-1';
      const first = storySentences[0];
      const toks = (await tokensOf(store, first.id)).filter((t) => t.isWord);
      await view(story, session, storySentences);
      // Tap two words after viewing (help arriving after the view re-weights the same encounter).
      for (const t of toks.slice(0, 2)) {
        await bus.emit<TokenHelpOpened>({ type: 'TokenHelpOpened', userId: user, lang: sc.lang, surface: 'corpus', session, dedupeKey: `help:${user}:${session}:${t.id}:1`, sentenceId: first.id, tokenId: t.id, itemId: t.formId, level: 1 });
      }
      const encs = await store.encounters.where('userId', user);
      expect(encs.length).toBeGreaterThan(0);
      const tapped = encs.filter((e) => e.sentenceId === first.id && e.itemId === toks[0].formId);
      const untapped = encs.filter((e) => e.sentenceId === first.id && e.itemId === toks[2].formId);
      expect(tapped.length).toBe(1);
      expect(untapped.length).toBe(1);
      expect(tapped[0].assistance).toBe(1);
      expect(untapped[0].assistance).toBe(0);
      expect(tapped[0].weight).toBeLessThan(untapped[0].weight);
      expect(tapped[0].weight).toBeGreaterThan(0);
      // Rerender: same dedupeKey → nothing new.
      await view(story, session, [first]);
      expect((await store.encounters.where('userId', user)).length).toBe(encs.length);
      const sin = await golearn.getItemState(user, sinFormId);
      expect(sin?.textIds).toEqual([story.id]);
      expect(lvl(sin!.reading.level)).toBeGreaterThan(lvl('unseen'));
      expect(sin!.listening.level).toBe('unseen');
    });

    it('step 2 — GoListen makes real sentence audio; listening evidence stays in the listening dimension', async () => {
      const r = await golisten.ensureAudio(story.id, { runNow: true });
      expect(r.manifest.complete).toBe(true);
      expect(r.failed).toBe(0);
      expect(r.manifest.segmentIds.length).toBe(storySentences.length);
      const seg0 = (await golisten.getSegment(r.manifest.segmentIds[0]))!;
      expect(seg0.status).toBe('ready');
      const asset = (await golisten.getAsset(seg0.assetId!))!;
      expect(asset.validation?.ok).toBe(true);
      expect(asset.generation?.providerId).toBe('fixture'); // honest: not speech
      expect(asset.durationMs).toBeGreaterThan(100);
      expect(seg0.speechText.length).toBeGreaterThan(0);
      const align = await golisten.alignments(seg0.id);
      expect(align.map((a) => a.unit)).toEqual(['sentence']); // no fabricated word timings
      expect(align[0].method).toBe('by-construction');
      // Second call reuses everything.
      const r2 = await golisten.ensureAudio(story.id, { runNow: true });
      expect(r2.created).toBe(0);
      expect(r2.reused).toBe(storySentences.length);

      // Listen to the sentence that contains "sin", replay it three times, reveal the transcript.
      const sinSentence = storySentences[sc.draftSentences[0]];
      const segId = r.manifest.segmentIds[sinSentence.index];
      sinItemBeforeListening = await golearn.getItemState(user, sinFormId);
      await bus.emit<AudioSegmentCompleted>({ type: 'AudioSegmentCompleted', userId: user, lang: sc.lang, surface: 'listen', session: 'listen-1', dedupeKey: `done:${user}:listen-1:${segId}:0`, textId: story.id, segmentId: segId, sentenceIds: [sinSentence.id], speed: 1, transcriptVisible: true, replayCount: 3, revealedTranscript: true, revealedTranslation: false });
      const after = (await golearn.getItemState(user, sinFormId))!;
      expect(after.listening.level).not.toBe('unseen');
      expect(after.listening.evidence).toBeGreaterThan(0);
      expect(after.reading).toEqual(sinItemBeforeListening!.reading); // reading untouched by listening
      expect(after.writing.level).toBe('unseen');
    });

    it('step 3 — Scripture: familiar items come from the story; the Bible text is unchanged and English is rescue only', async () => {
      const readiness = await golearn.scriptureReadiness(user, bible.id);
      expect(readiness.familiarItems.length).toBeGreaterThan(0);
      expect(readiness.coverage.knownLexicalCoverage + readiness.coverage.partialCoverage).toBeGreaterThan(0);
      const bibleSentences = await sentencesOf(store, bible.id);
      const doc = loadBundledCorpus().find((d) => d.lang === sc.lang && d.slug === 'bible-1john-1')!;
      const docTexts = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));
      expect(bibleSentences.map((s) => s.text)).toEqual(docTexts);
      const support = await golearn.sentenceSupport(user, bibleSentences[0].id);
      expect(support.rescue).toBeUndefined(); // hidden unless asked
      const withRescue = await golearn.sentenceSupport(user, bibleSentences[0].id, { withRescue: true });
      expect(withRescue.rescue?.english.length).toBeGreaterThan(0);
      await view(bible, 'scripture-1', bibleSentences);
      await bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', userId: user, lang: sc.lang, surface: 'scripture', session: 'scripture-1', dedupeKey: `rescue:${user}:scripture-1:${bibleSentences[0].id}`, textId: bible.id, sentenceIds: [bibleSentences[0].id], scope: 'verse' });
      const bibleForms = new Set((await store.tokens.where('textId', bible.id)).map((t) => t.formId));
      if (bibleForms.has(sinFormId)) {
        const sin = (await golearn.getItemState(user, sinFormId))!;
        expect(sin.textIds).toContain(story.id);
        expect(sin.textIds).toContain(bible.id);
      }
      const k = await golearn.queryItem(user, { surface: sc.sin, lang: sc.lang });
      expect(k.exists).toBe(true);
      expect(k.exactFormSeen).toBe(true);
      expect(k.encounterCount).toBeGreaterThanOrEqual(1);
    });

    let revisionTextId: string;

    it('steps 4–5 — testimony: GoTell analyzes against learner state; independent and assisted production are scored differently', async () => {
      const testimony = await gotell.getOrCreateTestimony(user, sc.lang);
      const draft = sc.draftSentences.map((i) => storySentences[i].text).join(sc.joiner ?? ' ');
      const analysis = await gotell.submitDraft(testimony.id, draft);
      expect(analysis.sentences.length).toBe(sc.draftSentences.length);
      // Everything he wrote he had read: high familiarity, and no suggestion may introduce new language.
      for (const s of analysis.sentences) expect(s.familiarity).toBeGreaterThan(0.5);
      for (const sug of analysis.suggestions) expect(sug.kind).not.toBe('expansion');
      if (sc.lang === 'th') expect(analysis.sentences[0].tokenSurfaces.length).toBeGreaterThan(3); // no whitespace tokenization

      const before = await golearn.getItemState(user, sinFormId);
      const rev = await gotell.acceptRevision(testimony.id, draft);
      expect(rev.number).toBe(1);
      expect(rev.textId).toBeDefined();
      revisionTextId = rev.textId!;
      const revText = (await store.texts.get(revisionTextId))!;
      expect(revText.kind).toBe('testimony');
      const prod = (await bus.history({ userId: user, types: ['ProductionRecorded'] })).filter((e) => e.type === 'ProductionRecorded');
      expect(prod.some((e) => e.type === 'ProductionRecorded' && e.itemId === sinFormId && e.kind === 'independent')).toBe(true);
      const after = (await golearn.getItemState(user, sinFormId))!;
      expect(after.writing.level).toBe('used_independently');
      expect(after.reading).toEqual(before!.reading); // production does not touch reading
      expect(after.speaking.level).toBe('unseen');

      if (sc.repair) {
        const a2 = await gotell.submitDraft(testimony.id, `${draft}${sc.joiner ?? ' '}${sc.repair.draft}`);
        const repair = a2.suggestions.find((s) => s.kind === 'repair' && s.suggested.includes(sc.repair!.expectContains));
        expect(repair, JSON.stringify(a2.suggestions)).toBeDefined();
        expect(repair!.newItems).toEqual([]);
        await gotell.acceptSuggestion(repair!.id);
        const fixed = `${draft}${sc.joiner ?? ' '}${repair!.suggested}`;
        const rev2 = await gotell.acceptRevision(testimony.id, fixed);
        expect(rev2.number).toBe(2);
        expect(rev2.acceptedSuggestionIds).toContain(repair!.id);
        const prod2 = (await bus.history({ userId: user, types: ['ProductionRecorded'] })).filter((e) => e.type === 'ProductionRecorded' && e.revisionId === rev2.id);
        const kinds = new Set(prod2.map((e) => (e.type === 'ProductionRecorded' ? e.kind : '')));
        expect(kinds.has('assisted')).toBe(true);
        expect(kinds.has('independent')).toBe(true);
        const assistedItem = prod2.find((e) => e.type === 'ProductionRecorded' && e.kind === 'assisted')!;
        const assisted = await golearn.queryItem(user, { itemId: (assistedItem as { itemId: string }).itemId, lang: sc.lang });
        const independent = await golearn.queryItem(user, { itemId: sinFormId, lang: sc.lang });
        expect(assisted.productionEvidence.assisted).toBeGreaterThan(0);
        expect(assisted.writing.evidence).toBeLessThan(independent.writing.evidence);
        // History is never overwritten.
        const revs = await gotell.listRevisions(testimony.id);
        expect(revs.map((r) => r.number)).toEqual([1, 2]);
        expect(revs[0].fullText).toBe(draft);
      }
    });

    it('step 6 — the testimony becomes personal listening material; hearing it does not claim spoken mastery', async () => {
      const r = await golisten.ensureAudio(revisionTextId, { runNow: true });
      expect(r.manifest.complete).toBe(true);
      const revSentences = await sentencesOf(store, revisionTextId);
      expect(revSentences.length).toBe(sc.draftSentences.length);
      const seg = (await golisten.getSegment(r.manifest.segmentIds[0]))!;
      expect(seg.status).toBe('ready');
      const before = (await golearn.getItemState(user, sinFormId))!;
      for (let pass = 0; pass < 2; pass++) {
        await bus.emit<AudioSegmentCompleted>({ type: 'AudioSegmentCompleted', userId: user, lang: sc.lang, surface: 'testimony', session: 'rehearse-1', dedupeKey: `done:${user}:rehearse-1:${seg.id}:${pass}`, textId: revisionTextId, segmentId: seg.id, sentenceIds: seg.sentenceIds, speed: 0.8, transcriptVisible: false, replayCount: pass, revealedTranscript: false, revealedTranslation: false });
        await bus.emit<ShadowingAttempt>({ type: 'ShadowingAttempt', userId: user, lang: sc.lang, surface: 'testimony', session: 'rehearse-1', dedupeKey: `shadow:${user}:rehearse-1:${seg.id}:${pass}`, textId: revisionTextId, segmentId: seg.id, sentenceIds: seg.sentenceIds, speed: 0.8, transcriptVisible: false, attempt: pass + 1 });
      }
      const after = (await golearn.getItemState(user, sinFormId))!;
      expect(after.listening.evidence).toBeGreaterThan(before.listening.evidence);
      expect(after.speaking.level).toBe('unseen');
      expect(after.writing).toEqual(before.writing);
      const listenEnc = (await store.encounters.where('userId', user)).filter((e) => e.textId === revisionTextId);
      expect(listenEnc.every((e) => e.modality === 'listening' && e.playbackSpeed === 0.8)).toBe(true);
    });

    it('step 7 — later independent recall strengthens productive evidence', async () => {
      clock.jumpDays(4);
      const testimony = await gotell.getOrCreateTestimony(user, sc.lang);
      const before = (await golearn.getItemState(user, sinLemmaId))!;
      const revs = await gotell.listRevisions(testimony.id);
      const latest = revs[revs.length - 1].fullText;
      // He rewrites the second draft sentence in a fresh version (a new sentence hash → new evidence).
      const extra = storySentences[4].text; // "God forgave my sin."
      const rev = await gotell.acceptRevision(testimony.id, `${latest}${sc.joiner ?? ' '}${extra}`);
      expect(rev.number).toBe(revs.length + 1);
      const after = (await golearn.getItemState(user, sinLemmaId))!;
      expect(after.writing.evidence).toBeGreaterThan(before.writing.evidence);
      expect(after.writing.unassisted).toBeGreaterThan(before.writing.unassisted);
      const k = await golearn.queryItem(user, { itemId: sinLemmaId, lang: sc.lang });
      expect(k.productionEvidence.independent).toBeGreaterThanOrEqual(2);
      expect(k.writing.level).toBe('used_independently');
      // Derived state is recomputable from the log.
      const snapshot = JSON.stringify([after, await golearn.getItemState(user, sinFormId)]);
      await golearn.rebuild(user);
      expect(JSON.stringify([await golearn.getItemState(user, sinLemmaId), await golearn.getItemState(user, sinFormId)])).toBe(snapshot);
    });

    it('privacy — another learner cannot read this testimony, and it never appears as corpus material', async () => {
      const other = gotellAll.forUser('someone-else');
      const testimony = await gotell.getOrCreateTestimony(user, sc.lang);
      await expect(other.listRevisions(testimony.id)).rejects.toThrow();
      const recs = await golearn.recommend(user, { limit: 10 });
      for (const r of recs) if (r.textId) expect((await store.texts.get(r.textId))!.kind).not.toBe('testimony');
      const readiness = await golearn.scriptureReadiness(user, bible.id);
      for (const p of readiness.preparatoryTexts) expect((await store.texts.get(p.textId))!.kind).not.toBe('testimony');
    });
  });
}

describe('scripture preparation loop', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.lang}: readiness → preparatory text → read it → readiness improves; Bible unchanged`, async () => {
      const store = createMemoryStore();
      const clock = makeClock();
      const bus = new StoreEventBus(store, clock.now);
      const adapters = createAdapterRegistry();
      const golearn = createGoLearn({ store, bus, adapters, clock: clock.now });
      const user = `fresh-${sc.lang}`;
      await seedBasics(store, user, sc.course);
      golearn.attach();
      await ingestAll(store, adapters, loadBundledCorpus().filter((d) => d.lang === sc.lang));
      const bible = ids.text(sc.lang, 'bible-1john-1');
      const before = await golearn.scriptureReadiness(user, bible);
      expect(before.coverage.knownLexicalCoverage).toBe(0);
      expect(before.prerequisites.length).toBeGreaterThan(0);
      expect(before.preparatoryTexts.length).toBeGreaterThan(0);
      for (const p of before.preparatoryTexts) expect((await store.texts.get(p.textId))!.kind).not.toBe('scripture');
      const bibleTextBefore = (await sentencesOf(store, bible)).map((s) => s.text);
      // Read every preparatory text twice (two sittings) so items reach "recognized" (needs ≥ 2 unassisted).
      for (const session of ['prep-1', 'prep-2']) {
        for (const p of before.preparatoryTexts) {
          const text = (await store.texts.get(p.textId))!;
          for (const s of await sentencesOf(store, p.textId)) {
            const toks = await tokensOf(store, s.id);
            await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: user, lang: sc.lang, surface: 'corpus', session, dedupeKey: `view:${user}:${session}:${s.id}`, textId: text.id, sentenceId: s.id, tokenIds: toks.map((t) => t.id) });
          }
        }
      }
      const after = await golearn.scriptureReadiness(user, bible);
      expect(after.coverage.knownLexicalCoverage).toBeGreaterThan(before.coverage.knownLexicalCoverage);
      expect(after.coverage.unseenCoverage).toBeLessThan(before.coverage.unseenCoverage);
      expect(after.familiarItems.length).toBeGreaterThan(before.familiarItems.length);
      expect((await sentencesOf(store, bible)).map((s) => s.text)).toEqual(bibleTextBefore);
      const recs = await golearn.recommend(user, { targetTextId: bible, limit: 5 });
      expect(recs.length).toBeGreaterThan(0);
    });
  }
});
