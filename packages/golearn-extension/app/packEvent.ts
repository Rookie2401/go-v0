/**
 * An install of a language pack as a recorded fact: a `PackInstalled` event (contract v3) saying which pack and analyser the
 * learner's later evidence rests on, how far the pack is built (`level`) and how far its analysis has been validated
 * (`validation`). The Repository uses the last two to caveat what it learns from an experimental or unreviewed analyser.
 *
 * The values come from the pack's manifest through `PackView` (bindings.ts): `level` from `levelOf`, `validation` from
 * `validationOf` (installable + machine-drafted = `unreviewed`, experimental = `experimental`, planned = `unsupported`). The one
 * thing the install itself can change is a validation case that did not match: then the pack is installed but its analysis is not
 * as described, and the event says `incomplete`, never the manifest's more hopeful word.
 *
 * It goes through the page's own event path (`ctx.record`: the background worker in the extension, which attributes it to the
 * learner and queues it). A failure to record never fails the install.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../repository-contract/src';
import type { AppContext } from './context';
import type { PackView } from './ports';

export function packInstalledEvent(input: {
  pack: PackView; learnerId: string; enrolmentId: string; deviceId: string; appVersion: string; at: string; eventId: string; inExtension: boolean;
  /** One or more validation cases did not match at install. */
  validationFailed: boolean;
}): GoEvent {
  const { pack } = input;
  return {
    id: input.eventId, v: CONTRACT_VERSION, learnerId: input.learnerId, enrolmentId: input.enrolmentId, languageId: pack.languageId, at: input.at,
    // the extension's recorder admits its own producer and replaces the identity; the hosted web app is its own producer
    producer: { app: input.inExtension ? 'golearn-ext' : 'golearn-app', version: input.appVersion, deviceId: input.deviceId, surface: 'pack' },
    kind: 'PackInstalled', subject: {},
    payload: {
      packId: pack.packId, packVersion: pack.version,
      ...(pack.analyzerId ? { analyzerId: pack.analyzerId } : {}), ...(pack.analyzerVersion ? { analyzerVersion: pack.analyzerVersion } : {}),
      level: pack.level,
      validation: input.validationFailed && pack.validation !== 'unsupported' ? 'incomplete' : pack.validation,
    },
    dedupeKey: `pack-installed:${pack.packId}:${pack.version}:${input.eventId}`,
  };
}

/** Records the install that just completed. Returns what the recorder said; never throws. */
export async function recordPackInstalled(ctx: AppContext, pack: PackView, validationFailed: boolean): Promise<'recorded' | 'duplicate' | 'failed'> {
  try {
    const id = await ctx.identity();
    const event = packInstalledEvent({
      pack, learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId, appVersion: ctx.deps.appVersion,
      at: ctx.deps.now().toISOString(), eventId: `pack-${ctx.deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      inExtension: ctx.inExtension, validationFailed,
    });
    return await ctx.record(event);
  } catch {
    return 'failed';
  }
}
