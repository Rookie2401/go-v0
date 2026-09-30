import { describe, expect, it } from 'vitest';
import { makeWorld } from './fakes';
import type { World } from './fakes';
import { esAdapter, esStoryA } from './fixtures';

const FORBIDDEN = /not found or not owned|not permitted|different users/;

async function twoUsers(): Promise<{ w: World; tA: string; r1: string; r2: string; sug: string }> {
  const w = await makeWorld([esAdapter()]);
  await esStoryA(w, 'A');
  const t = await w.gotell.getOrCreateTestimony('A', 'es');
  const a = await w.gotell.submitDraft(t.id, 'El casa.');
  const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
  const r2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
  return { w, tA: t.id, r1: r1.id, r2: r2.id, sug: a.suggestions[0].id };
}

describe('privacy: user B cannot reach user A\'s testimony', () => {
  it('assertOwner passes for the owner and rejects everyone else (and unknown ids)', async () => {
    const { w, tA } = await twoUsers();
    await expect(w.gotell.assertOwner('A', tA)).resolves.toBeUndefined();
    await expect(w.gotell.assertOwner('B', tA)).rejects.toThrow(FORBIDDEN);
    await expect(w.gotell.assertOwner('A', 'tst:nope')).rejects.toThrow(FORBIDDEN);
  });

  it('every accessor of a B-bound GoTell rejects A\'s testimony, revisions and suggestions', async () => {
    const { w, tA, r1, r2, sug } = await twoUsers();
    const asB = w.gotell.forUser('B');
    await expect(asB.listRevisions(tA)).rejects.toThrow(FORBIDDEN);
    await expect(asB.submitDraft(tA, 'Yo no sé.')).rejects.toThrow(FORBIDDEN);
    await expect(asB.acceptRevision(tA, 'Yo no sé. Otra cosa.')).rejects.toThrow(FORBIDDEN);
    await expect(asB.diffRevisions(r1, r2)).rejects.toThrow(FORBIDDEN);
    await expect(asB.acceptSuggestion(sug)).rejects.toThrow(FORBIDDEN);
    await expect(asB.rejectSuggestion(sug)).rejects.toThrow(FORBIDDEN);
    await expect(asB.editSuggestion(sug, 'x')).rejects.toThrow(FORBIDDEN);
    await expect(asB.getOrCreateTestimony('A', 'es')).rejects.toThrow(FORBIDDEN);
    await expect(asB.analyzeProduction({ userId: 'A', lang: 'es', text: 'Yo.', task: 'testimony', contextId: tA })).rejects.toThrow(FORBIDDEN);
    await expect(asB.intent({ userId: 'A', lang: 'es', english: 'I know' })).rejects.toThrow(FORBIDDEN);
    // B naming his own id but A's testimony as the context is also refused
    await expect(asB.analyzeProduction({ userId: 'B', lang: 'es', text: 'Yo.', task: 'testimony', contextId: tA })).rejects.toThrow(FORBIDDEN);

    // nothing leaked or changed
    expect(await w.store.revisions.count()).toBe(2);
    expect((await w.store.suggestions.get(sug))!.status).toBe('shown');
    expect((await w.store.testimonies.get(tA))!.userId).toBe('A');
  });

  it('the owner-bound view works, and an actor supplied in deps binds the base object', async () => {
    const { w, tA } = await twoUsers();
    await expect(w.gotell.forUser('A').listRevisions(tA)).resolves.toHaveLength(2);

    let who: string | undefined = 'B';
    const w2 = await makeWorld([esAdapter()], { actor: () => who });
    who = 'A';
    const t = await w2.gotell.getOrCreateTestimony('A', 'es');
    await w2.gotell.acceptRevision(t.id, 'Yo no sé.');
    who = 'B';
    await expect(w2.gotell.listRevisions(t.id)).rejects.toThrow(FORBIDDEN);
    await expect(w2.gotell.acceptRevision(t.id, 'Otra.')).rejects.toThrow(FORBIDDEN);
    who = 'A';
    await expect(w2.gotell.listRevisions(t.id)).resolves.toHaveLength(1);
  });

  it('two users have independent testimonies for the same language', async () => {
    const { w, tA } = await twoUsers();
    const tB = await w.gotell.forUser('B').getOrCreateTestimony('B', 'es');
    expect(tB.id).not.toBe(tA);
    expect(await w.gotell.forUser('B').listRevisions(tB.id)).toEqual([]);
  });
});
