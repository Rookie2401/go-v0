// @vitest-environment jsdom
// The profile the reader really uses (useAssistance -> real catalogue) in the shelf courses: the shelf a learner is working at
// never sets the help of a text. Hindi's off-shelf texts keep the romanization rescue exactly as shipped.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANCE, buildFixtureText, ids } from '../../src/core';
import type { AssistanceProfile } from '../../src/core';
import { HINDI_COURSE_ID, SPANISH_COURSE_ID } from '../../src/course';
import { HINDI_ASSISTANCE, HINDI_OUTSIDE_ASSISTANCE, HINDI_WORKS } from '../../src/course/hindi';
import { SPANISH_ASSISTANCE, SPANISH_WORKS } from '../../src/course/spanish';
import { useAssistance } from '../../src/ui/reader/useAssistance';
import { makeHarness } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

function Probe({ textId, out }: { textId: string; out: { profile: AssistanceProfile | null } }) {
  out.profile = useAssistance(textId);
  return null;
}

async function profileOf(courseId: string, lang: 'hi' | 'es', stageKey: string, opts: { workId?: string; slug: string }) {
  const h = await makeHarness({ courseId });
  const text = await buildFixtureText(h.store, { lang: lang as 'es', slug: opts.slug, sentences: [{ tokens: [{ surface: 'x', lemma: 'x' }] }] });
  await h.store.texts.put({ ...text, ...(opts.workId ? { workId: opts.workId } : {}) });
  await h.services.catalog.setCurrentStage('u1', courseId, ids.stage(courseId, stageKey));
  expect((await h.services.catalog.currentStage('u1', courseId))!.key).toBe(stageKey);
  const out: { profile: AssistanceProfile | null } = { profile: null };
  mounted = await h.mount(<Probe textId={text.id} out={out} />);
  return out.profile;
}

describe('useAssistance in a shelf course', () => {
  it('a Hindi text with no work, learner at c3, gets the outside profile with the romanization rescue', async () => {
    const p = await profileOf(HINDI_COURSE_ID, 'hi', 'c3', { slug: 'own-book' });
    expect(p).toEqual(HINDI_OUTSIDE_ASSISTANCE);
    expect(p!.romanization).toBe('rescue');
    expect(HINDI_ASSISTANCE.c3!.romanization).toBe('never'); // the shelf he is at would have taken it away
  });

  it('a Hindi text on a shelf keeps its shelf\'s profile, and Scripture its own (open) shelf, whatever shelf he is at', async () => {
    const onShelf = HINDI_WORKS.find((w) => w.stageId === ids.stage(HINDI_COURSE_ID, 'c1') && w.role !== 'scripture')!;
    expect(await profileOf(HINDI_COURSE_ID, 'hi', 'c8', { slug: 'on-c1', workId: onShelf.id })).toEqual(HINDI_ASSISTANCE.c1);
    await mounted?.unmount(); mounted = undefined;
    const bible = HINDI_WORKS.find((w) => w.role === 'scripture');
    if (bible) expect(await profileOf(HINDI_COURSE_ID, 'hi', 'c3', { slug: 'bible', workId: bible.id })).toEqual(HINDI_ASSISTANCE[bible.stageId.split(':').pop()!]);
  });

  it('a Spanish text with no work keeps the default word sheet, a shelf text its shelf\'s profile, at any current shelf', async () => {
    expect(await profileOf(SPANISH_COURSE_ID, 'es', 's6', { slug: 'own-book' })).toEqual(DEFAULT_ASSISTANCE);
    await mounted?.unmount(); mounted = undefined;
    const work = SPANISH_WORKS.find((w) => w.stageId === ids.stage(SPANISH_COURSE_ID, 's1'))!;
    expect(await profileOf(SPANISH_COURSE_ID, 'es', 's6', { slug: 'on-s1', workId: work.id })).toEqual(SPANISH_ASSISTANCE.s1);
  });
});
