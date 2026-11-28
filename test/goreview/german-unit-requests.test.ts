/**
 * German candidates are not stored units. The batch says so, and the pass then asks for each of them again (deck intake, the session):
 * each of those asks cost one GET /units/<id> that answered 404 (296 in one browser run). A unit the batch answered as unknown stays
 * unknown for that pass, and two concurrent asks for one unprimed unit are one request.
 */
import { describe, expect, it } from 'vitest';
import { repositoryLookup } from '../../packages/goreview/src/facts/provider';

const miss = { ok: false as const };
describe('repositoryLookup: no wasted single-unit request', () => {
  it('a unit the batch reported missing is not asked for again, however often it is asked about', async () => {
    const singles: string[] = [];
    const lookup = repositoryLookup({
      async unit(id) { singles.push(id); return miss; },
      async units(ids) { return { ok: true, data: { units: {}, missing: ids } }; },
    });
    const ids = ['lemma:de:Auto:NOUN', 'lemma:de:Baum:NOUN'];
    await lookup.prime!(ids);
    for (let pass = 0; pass < 3; pass++) for (const id of ids) expect(await lookup(id)).toBeUndefined();
    expect(singles).toEqual([]);
    lookup.clearPrime!();
    await lookup(ids[0]);
    expect(singles, 'after the pass ends the Repository is asked afresh').toEqual([ids[0]]);
  });

  it('two concurrent asks for one unprimed unit are one request', async () => {
    let n = 0;
    const lookup = repositoryLookup({ async unit() { n++; await new Promise((r) => setTimeout(r, 5)); return miss; } });
    await Promise.all([lookup('lemma:de:Brot:NOUN'), lookup('lemma:de:Brot:NOUN')]);
    expect(n).toBe(1);
  });
});
