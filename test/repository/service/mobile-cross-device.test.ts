// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type GoEvent } from '../../../packages/repository-contract/src';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../../packages/repository-linguistics/src';
import { createInProcessApi, type RepositoryApi } from '../../../packages/repository-service/src';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../../packages/repository-service/src/crypto-node';
import { policyFor } from '../../../packages/repository-service/src/sourcePolicy';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';

const now = () => '2026-10-14T12:00:00.000Z';
const store = openSqliteStore(':memory:', { now });
const engine = createProjectionEngine({ store, now });
const linguistics = createLinguisticService(store, { now });
const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(linguistics), crypto: nodeCrypto, now, sourcePolicy: policyFor, log: () => {} };

interface Device { api: RepositoryApi; learnerId: string; enrolmentId: string; deviceId: string }
const passphrase = 'cross-device-test-password';
const expectData = (r: { ok: boolean; status: number; error?: string; message?: string }): void => {
  if (!r.ok) throw new Error(`request failed (${r.status})`);
};
const call = <T,>(r: { ok: boolean; status: number; data?: unknown; error?: string; message?: string; body?: Record<string, unknown> }): T => {
  if (!r.ok) throw new Error(`request failed (${r.status}) ${r.error ?? ''}: ${r.message ?? ''} ${JSON.stringify(r.body ?? {})}`);
  return r.data as T;
};

async function accountDevice(email: string, deviceId: string, createAccount: boolean): Promise<Device> {
  const api = createInProcessApi(deps);
  if (createAccount) expectData(await api.createAccount({ email, password: passphrase }));
  const session = call<{ token: string; learnerId: string }>(await api.createSession({ email, password: passphrase, deviceId, platform: 'integration-test' }));
  if (createAccount) {
    const pack = albanianPack();
    const enrolled = call<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }));
    return { api, learnerId: session.learnerId, enrolmentId: enrolled.enrolment.enrolmentId, deviceId };
  }
  const enrolments = call<{ enrolments: Array<{ enrolmentId: string }> }>(await api.listEnrolments());
  return { api, learnerId: session.learnerId, enrolmentId: enrolments.enrolments[0]!.enrolmentId, deviceId };
}

const event = (device: Device, id: string, kind: GoEvent['kind'], subject: GoEvent['subject'], payload: Record<string, unknown>, app: GoEvent['producer']['app']): GoEvent => ({
  id, v: CONTRACT_VERSION, learnerId: device.learnerId, enrolmentId: device.enrolmentId, languageId: 'sq', at: now(),
  producer: { app, version: 'test', deviceId: device.deviceId }, kind, subject, payload, dedupeKey: id,
});

afterAll(async () => { await store.close(); });

describe('GoLearn and GoReview share one account safely', () => {
  it('pushes desktop encounters, exposes phone candidates, returns phone reviews to desktop, and survives a lost acknowledgement', async () => {
    const desktop = await accountDevice('sync-learner@example.test', 'desktop-test-device', true);
    const phone = await accountDevice('sync-learner@example.test', 'phone-test-device', false);
    const other = await accountDevice('other-learner@example.test', 'other-test-device', true);

    // A GoLearn selection event is handled by the real authenticated service, SQLite store, projection, and Albanian resolver.
    const encounters = ['lookup-1', 'lookup-2'].map((id) => event(desktop, id, 'SelectionLookedUp', {
      itemIds: ['lemma:sq:libër:NOUN'],
    }, { surface: 'librin', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma', 'morphology'] }, 'golearn-ext'));
    const pushRequest = { deviceId: desktop.deviceId, events: encounters, clientTime: now() };
    const firstPush = call<{ outcomes: Array<{ stored: boolean }>; head: number }>(await desktop.api.syncPush(pushRequest));
    expect(firstPush.outcomes.every((outcome) => outcome.stored)).toBe(true);

    // The phone signs in independently to the same account and obtains the real remote event history and projected candidates.
    const phonePull = call<{ events: Array<{ id: string }>; head: number }>(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: 0 }));
    expect(phonePull.events.map((e) => e.id)).toEqual(expect.arrayContaining(['lookup-1', 'lookup-2']));
    const candidates = call<{ candidates: Array<{ unitId: string; reasons: Array<{ rule: string }> }> }>(await phone.api.candidates(phone.enrolmentId));
    const lemma = candidates.candidates.find((candidate) => candidate.unitId === 'lemma:sq:libër:NOUN');
    expect(lemma).toBeDefined();

    const baselineHead = phonePull.head;
    const review = event(phone, 'phone-review-1', 'CardReviewed', { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'phone-card-1' }, {
      cardKind: 'recognition', grade: 'good', correct: true, hinted: false,
    }, 'gopractice-review');
    const reviewRequest = { deviceId: phone.deviceId, events: [review], clientTime: now() };
    const reviewPush = call<{ outcomes: Array<{ stored: boolean }>; head: number }>(await phone.api.syncPush(reviewRequest));
    expect(reviewPush.outcomes[0]?.stored).toBe(true);
    const desktopPull = call<{ events: Array<{ id: string }> }>(await desktop.api.syncPull({ deviceId: desktop.deviceId, afterSeq: baselineHead }));
    expect(desktopPull.events.map((e) => e.id)).toContain('phone-review-1');

    // Simulate a lost response by retrying the exact committed batch. The real SQLite uniqueness/dedupe path answers duplicate and does not grow the log.
    const headAfterReview = reviewPush.head;
    const retry = call<{ outcomes: Array<{ stored?: boolean; duplicateOf?: string }>; head: number }>(await phone.api.syncPush(reviewRequest));
    expect(retry.outcomes[0]).toMatchObject({ stored: false, duplicateOf: 'phone-review-1' });
    expect(retry.head).toBe(headAfterReview);

    // A second account cannot push an event naming the first learner, or pull the first learner's history.
    const foreignReview = event({ ...other, learnerId: desktop.learnerId, enrolmentId: desktop.enrolmentId }, 'foreign-review', 'CardReviewed', {
      itemIds: ['lemma:sq:libër:NOUN'], cardId: 'foreign-card',
    }, { cardKind: 'recognition', grade: 'good', correct: true, hinted: false }, 'gopractice-review');
    const refused = await other.api.syncPush({ deviceId: other.deviceId, events: [foreignReview], clientTime: now() });
    expect(refused).toMatchObject({ ok: false, status: 403, error: 'not-your-data' });
    const isolated = call<{ events: Array<{ id: string }> }>(await other.api.syncPull({ deviceId: other.deviceId, afterSeq: 0 }));
    expect(isolated.events.map((e) => e.id)).not.toContain('phone-review-1');
  });
});
