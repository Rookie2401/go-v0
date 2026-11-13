// Throw-away: gives the LOCAL test account (cred.json, never printed) a review history like a learner who has done many decks:
// for U of the words in its vocabulary, a CardAdded and R CardReviewed events spread over two months.
//   npx vite-node scripts/loadcheck/goreview/seed-reviews.ts <serviceUrl> <U> <R>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { buildCardAdded, itemIdFor, FAMILY_DIMENSION } from '../../../packages/goreview/src';
import { CONTRACT_VERSION } from '../../../packages/repository-contract/src';

const base = process.argv[2];
const U = Number(process.argv[3] ?? 200), R = Number(process.argv[4] ?? 4);
const CRED_DIR = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-goreview');
const cred = JSON.parse(fs.readFileSync(path.join(CRED_DIR, 'cred.json'), 'utf8'));
const anon = createRepositoryApi({ baseUrl: base, fetch });
const s = await anon.createSession({ ...cred, deviceId: 'seed-device', platform: 'seed' });
if (!s.ok) throw new Error(`session: ${s.status}`);
const api = createRepositoryApi({ baseUrl: base, fetch, token: s.data.token });
const en = await api.listEnrolments();
const enrolment = ((en as { data: unknown }).data as { enrolments?: Array<{ enrolmentId: string; languageId: string }> }).enrolments?.find((e) => e.languageId === 'sq')
  ?? ((en as { data: unknown }).data as Array<{ enrolmentId: string; languageId: string }>).find?.((e) => e.languageId === 'sq');
if (!enrolment) throw new Error('no sq enrolment: ' + JSON.stringify(en).slice(0, 300));
const cand = await api.candidates({ learnerId: s.data.learnerId, enrolmentId: enrolment.enrolmentId, languageId: 'sq', limit: 500 } as never) as { ok: boolean; data: unknown };
if (!cand.ok) throw new Error('candidates ' + JSON.stringify(cand).slice(0, 300));
const list = (Array.isArray(cand.data) ? cand.data : (cand.data as { candidates?: unknown[]; items?: unknown[] }).candidates ?? (cand.data as { items?: unknown[] }).items ?? []) as Array<{ unitId: string; kind?: string }>;
const units = list.map((c) => c.unitId).slice(0, U);
console.log('candidate kinds', JSON.stringify(list.reduce((a: Record<string, number>, c) => { const k = c.unitId.split(':')[0]; a[k] = (a[k] ?? 0) + 1; return a; }, {})));
const family = 'meaning-to-form' as const;
const day = 86_400_000;
const start = Date.parse('2026-09-05T08:00:00Z');
const events: unknown[] = [];
units.forEach((unitId, u) => {
  const added = start + (u % 50) * day * 0.9;
  events.push(buildCardAdded({ learnerId: s.data.learnerId, enrolmentId: enrolment.enrolmentId, languageId: 'sq', at: new Date(added).toISOString(), deviceId: 'seed-device',
    unitId, unitKind: 'lemma', dimension: FAMILY_DIMENSION[family], family, addedBy: 'intake' } as never));
  for (let r = 0; r < R; r++) {
    const at = new Date(added + (r + 1) * (2 + r * 3) * day + u * 60_000).toISOString();
    const rating = ((u + r) % 7 === 0 ? 1 : 3) as 1 | 3;
    events.push({ id: `seed-rev-${u}-${r}`, v: CONTRACT_VERSION, learnerId: s.data.learnerId, enrolmentId: enrolment.enrolmentId, languageId: 'sq', at,
      producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'seed-device' }, kind: 'CardReviewed',
      subject: { itemIds: [unitId], cardId: itemIdFor(unitId, FAMILY_DIMENSION[family]) },
      payload: { cardKind: 'recognition', grade: rating >= 3 ? 'good' : 'again', correct: rating >= 3, hinted: false, rating, outcome: rating >= 3 ? 'correct' : 'incorrect', family },
      evidence: { quality: 'moderate', assisted: false } });
  }
});
let stored = 0;
for (let i = 0; i < events.length; i += 200) {
  const r = await api.appendEvents(events.slice(i, i + 200) as never);
  if (!r.ok) throw new Error(`events: ${r.status} ${(r as { message?: string }).message}`);
  stored += (r.data as { stored: number }).stored;
}
console.log(JSON.stringify({ units: units.length, events: events.length, stored }));
