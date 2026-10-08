/**
 * Golden test: `assistanceFor` answers, for a sample of Thai, Albanian and Hindi texts and stages, are exactly what they were
 * before the Spanish / German / Norwegian fading profiles (R5) touched catalog.ts. The snapshot in golden/assistance.json was
 * generated from the unmodified catalogue (GOLDEN_WRITE=1 regenerates it; never do that to make a failure pass).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore } from '../../src/core';
import type { AppStore } from '../../src/core';
import { ALBANIAN_COURSE_ID, HINDI_COURSE_ID, THAI_COURSE_ID, createCourseCatalog } from '../../src/course';

const FILE = path.join(__dirname, 'golden', 'assistance.json');
const COURSES = [[THAI_COURSE_ID, 'th'], [ALBANIAN_COURSE_ID, 'sq'], [HINDI_COURSE_ID, 'hi']] as const;

async function textOf(store: AppStore, lang: 'th' | 'sq' | 'hi', slug: string, workId?: string) {
  const text = await buildFixtureText(store, { lang, slug, sentences: [{ tokens: [{ surface: 'x', lemma: 'x' }] }] });
  await store.texts.put({ ...text, ...(workId ? { workId } : {}) });
  return text.id;
}

/** Every answer the sample asks of the catalogue, keyed by the question. */
async function sample(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [courseId, lang] of COURSES) {
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store });
    await catalog.install(courseId);
    const stages = await catalog.stages(courseId);
    const works = await catalog.works(courseId);
    const first = stages[0]!;
    const last = stages[stages.length - 1]!;
    const mid = stages[Math.floor(stages.length / 2)]!;
    const key = (...p: string[]) => `${courseId} | ${p.join(' | ')}`;
    out[key('no arguments')] = await catalog.assistanceFor({ courseId });
    out[key('unknown stage')] = await catalog.assistanceFor({ courseId, currentStageId: 'stage:nope' });
    out[key('unknown text')] = await catalog.assistanceFor({ courseId, textId: `text:${lang}:missing`, currentStageId: first.id });
    for (const s of stages) out[key('stage', s.key)] = await catalog.assistanceFor({ courseId, currentStageId: s.id });
    // the first work of each stage, with and without a current stage (the text's own stage wins), and the last works of the course
    const picked = stages.flatMap((s) => works.filter((w) => w.stageId === s.id).slice(0, 1));
    for (const w of picked) {
      const id = await textOf(store, lang, `w-${w.id.split(':').pop()}`, w.id);
      out[key('work', w.id, 'alone')] = await catalog.assistanceFor({ courseId, textId: id });
      out[key('work', w.id, 'at first')] = await catalog.assistanceFor({ courseId, textId: id, currentStageId: first.id });
      out[key('work', w.id, 'at mid')] = await catalog.assistanceFor({ courseId, textId: id, currentStageId: mid.id });
      out[key('work', w.id, 'at last')] = await catalog.assistanceFor({ courseId, textId: id, currentStageId: last.id });
    }
    // scripture: it takes the profile of the stage the learner is working at
    for (const w of works.filter((x) => x.role === 'scripture').slice(0, 2)) {
      const id = await textOf(store, lang, `bible-${w.id.split(':').pop()}`, w.id);
      for (const [label, s] of [['first', first], ['mid', mid], ['last', last]] as const) {
        out[key('scripture', w.id, label)] = await catalog.assistanceFor({ courseId, textId: id, currentStageId: s.id });
      }
      out[key('scripture', w.id, 'alone')] = await catalog.assistanceFor({ courseId, textId: id });
    }
    // a text on no shelf (the learner's own book, his testimony)
    const free = await textOf(store, lang, 'free');
    out[key('outside', 'alone')] = await catalog.assistanceFor({ courseId, textId: free });
    out[key('outside', 'at mid')] = await catalog.assistanceFor({ courseId, textId: free, currentStageId: mid.id });
    // a ladder-unit-shaped text (no work) must not be treated as a shelf text in these courses
    const unit = await textOf(store, lang, `${lang}-a2-1-03`);
    out[key('unit-shaped', 'alone')] = await catalog.assistanceFor({ courseId, textId: unit });
    out[key('unit-shaped', 'at mid')] = await catalog.assistanceFor({ courseId, textId: unit, currentStageId: mid.id });
  }
  return out;
}

describe('assistanceFor for Thai, Albanian and Hindi is unchanged', () => {
  it('matches the snapshot taken before the Spanish / German / Norwegian profiles', async () => {
    const got = await sample();
    if (process.env.GOLDEN_WRITE === '1') {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
    }
    const golden = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(got).sort()).toEqual(Object.keys(golden).sort());
    expect(Object.keys(got).length).toBeGreaterThan(150);
    for (const k of Object.keys(golden)) expect(got[k], k).toEqual(golden[k]);
  });

  it('the snapshot really covers all three courses and their distinct profiles', () => {
    const golden = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, { englishRescue?: string }>;
    for (const [courseId] of COURSES) expect(Object.keys(golden).filter((k) => k.startsWith(`${courseId} |`)).length).toBeGreaterThan(40);
    expect(new Set(Object.values(golden).map((p) => JSON.stringify(p))).size).toBeGreaterThan(15);
  });
});
