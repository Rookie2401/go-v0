/** Events the shell itself builds (the deck's own events come from GoReview's builders). */
import { CONTRACT_VERSION, type GoEvent, type ItemMarkPayload } from '../../repository-contract/src';
import type { EventContext } from './ports';

export function itemMarked(ectx: EventContext, id: string, unitId: string, mark: ItemMarkPayload['mark']): GoEvent {
  return {
    id, v: CONTRACT_VERSION, learnerId: ectx.learnerId, enrolmentId: ectx.enrolmentId, languageId: ectx.languageId,
    ...(ectx.varietyId ? { varietyId: ectx.varietyId } : {}), at: ectx.now,
    producer: { app: 'gopractice-review', version: ectx.appVersion, deviceId: ectx.deviceId, surface: 'review-candidates' },
    kind: 'ItemMarked', subject: { itemIds: [unitId] }, payload: { mark }, evidence: { quality: 'none' },
    dedupeKey: `mark:${unitId}:${mark}:${ectx.now}`,
  };
}
