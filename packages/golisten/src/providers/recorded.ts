/**
 * Recorded voices: a human recording registered for a language, played from its URL through the AudioPort. A recording
 * serves a request only when it says exactly what is asked (normalised text match); GoListen never plays a recording
 * of one phrase for another.
 */
import type { PronunciationProvenance } from '../contracts';
import { normalizeText } from '../environment';
import type { GoListenEnv } from '../environment';
import { descriptorOf } from '../registry';
import type { VoiceRegistry } from '../registry';
import { fail } from './types';
import type { PrepareOutcome, Req } from './types';

export async function prepareRecorded(req: Req, registry: VoiceRegistry, env: GoListenEnv): Promise<PrepareOutcome> {
  const entries = registry.entries.filter((e) => e.source.kind === 'recorded');
  if (entries.length === 0) return fail('no-voice', `No ${req.languageId} recordings are registered; nothing is claimed.`);
  const wanted = normalizeText(req.text);
  let sawText = false;
  for (const entry of entries) {
    if (entry.source.kind !== 'recorded') continue;
    if (req.varietyId && entry.varietyId && normalizeText(entry.varietyId) !== normalizeText(req.varietyId)) continue;
    const clip = entry.source.recordings.find((r) => normalizeText(r.text) === wanted);
    if (!clip) continue;
    sawText = true;
    if (!entry.supports.includes(req.kind)) continue;
    if (req.voiceId && req.voiceId !== entry.voiceId) continue;
    if (!env.audio) return fail('provider-error', 'Audio output is not available in this environment.');
    const reviewed = entry.qualityVerification === 'native-reviewed';
    const variety = req.varietyId && entry.varietyId && req.varietyId !== entry.varietyId ? ` Recorded in ${entry.varietyId}; ${req.varietyId} was requested.` : '';
    const provenance: PronunciationProvenance = {
      source: 'recording', voiceId: entry.voiceId, generatedFromText: false, reviewedRecording: reviewed,
      note: `Human recording (${entry.qualityVerification}). ${clip.attribution}${variety}`,
    };
    return { ok: true, prepared: { voice: descriptorOf(entry), provenance, audio: { kind: 'recorded', url: clip.url } } };
  }
  return sawText
    ? fail('unsupported-kind', `The recording of this text does not serve a ${req.kind}.`)
    : fail('no-voice', `No registered ${req.languageId} recording says this text; nothing is claimed.`);
}
