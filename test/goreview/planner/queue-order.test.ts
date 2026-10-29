import { describe, expect, it } from 'vitest';
import { orderQueueCandidates } from '../../../packages/goreview/src/planner/planner';

type Entry = Parameters<typeof orderQueueCandidates>[0][number];
const candidate = (id:string,tier:number):Entry => ({ tier, due:0, score:0, planned:{ item:{ itemId:id } } } as Entry);
const ids = (rows:Entry[]) => rows.map(row=>row.planned.item.itemId);

describe('planner due ordering policies', () => {
  const pool = [candidate('due-1',1),candidate('new',3),candidate('remediation',2),candidate('due-2',1),candidate('learning',0),
    candidate('due-3',1),candidate('due-4',1),candidate('due-5',1)];
  it('keeps strict due ordering by default', () => {
    expect(ids(orderQueueCandidates(pool))).toEqual(['learning','due-1','due-2','due-3','due-4','due-5','remediation','new']);
  });
  it('allows bounded remediation interleaving without moving new admissions ahead of due work', () => {
    expect(ids(orderQueueCandidates(pool,'bounded-remediation'))).toEqual(['learning','due-1','due-2','due-3','due-4','remediation','due-5','new']);
  });
});
