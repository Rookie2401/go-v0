// Throw-away seeding for the GoReview load profile: a generated test account on the LOCAL throw-away service only, enrolled in Albanian,
// with `N` lookups of real Albanian words (most frequent lemmas), so GoReview has a realistic history to pull and a deck to build.
//   npx vite-node scripts/loadcheck/goreview/seed.ts <serviceUrl> <N>
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent } from '../../../packages/golearn-extension/src/store/index';
import { PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const base = process.argv[2];
const N = Number(process.argv[3] ?? 1500);
const cred = { email: `speed-${crypto.randomBytes(4).toString('hex')}@example.test`, password: crypto.randomBytes(18).toString('base64url') };
const CRED_DIR = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-goreview');
fs.mkdirSync(CRED_DIR, { recursive: true });
fs.writeFileSync(path.join(CRED_DIR, 'cred.json'), JSON.stringify(cred));
const anon = createRepositoryApi({ baseUrl: base, fetch });
const made = await anon.createAccount({ ...cred, displayName: 'Speed' });
if (!made.ok) throw new Error(`account: ${made.status} ${made.message}`);
const s = await anon.createSession({ ...cred, deviceId: 'seed-device', platform: 'seed' });
if (!s.ok) throw new Error(`session: ${s.status}`);
const api = createRepositoryApi({ baseUrl: base, fetch, token: s.data.token });
const en = await api.enrol({ learnerId: s.data.learnerId, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] } as never);
if (!en.ok) throw new Error(`enrol: ${en.status} ${en.message}`);
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, Math.ceil(N / 2));
const events = [];
const day0 = Date.parse('2026-09-01T08:00:00Z');
for (let i = 0; i < N; i++) {
  const word = words[i % words.length];
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  const e = buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId: s.data.learnerId, enrolmentId: en.data.enrolment.enrolmentId, deviceId: 'seed-device' } as never, version: '0.1.0', sessionId: `s${Math.floor(i / 40)}`, now: new Date(day0 + i * 37 * 60_000) });
  events.push(e);
}
let stored = 0;
for (let i = 0; i < events.length; i += 200) {
  const r = await api.appendEvents(events.slice(i, i + 200));
  if (!r.ok) throw new Error(`events: ${r.status} ${r.message}`);
  stored += r.data.stored;
}
console.log(JSON.stringify({ learner: 'created', enrolled: 'sq', words: words.length, events: events.length, stored }));
