/**
 * What voices exist for a language right now, and whether each can speak. Device voices are expanded from the template
 * entry into the installed voices that strictly match the language; when none match the template is listed as
 * 'unavailable' so the gap is visible rather than silent.
 */
import type { Availability, VoiceDescriptor } from './contracts';
import type { GoListenEnv } from './environment';
import { deviceDescriptor, matchDeviceVoices } from './providers/device';
import { remoteAvailability } from './providers/remote';
import { descriptorOf } from './registry';
import type { VoiceRegistry } from './registry';

export interface ListedVoice extends VoiceDescriptor { availability(): Promise<Availability> }

export interface LanguageAvailability {
  languageId: string;
  voices: Array<{ voiceId: string; label: string; provider: VoiceDescriptor['provider']; synthetic: boolean; state: Availability }>;
  /** At least one voice can speak right now. */
  canPronounce: boolean;
  /** What is honestly not available. */
  gaps: string[];
}

export async function listVoices(registry: VoiceRegistry | undefined, env: GoListenEnv): Promise<ListedVoice[]> {
  if (!registry) return [];
  const out: ListedVoice[] = [];
  for (const entry of registry.entries) {
    if (entry.source.kind === 'device') {
      const { matches } = await matchDeviceVoices(entry, env);
      if (matches.length === 0) {
        out.push({ ...descriptorOf(entry), label: `${entry.label}: none installed`, availability: async () => 'unavailable' });
      }
      for (const m of matches) {
        out.push({
          ...deviceDescriptor(entry, m.voice),
          availability: async () => (m.networked && (!env.consent().remoteSpeech || env.consent().localOnly === true) ? 'needs-consent' : 'available'),
        });
      }
    } else if (entry.source.kind === 'remote') {
      out.push({ ...descriptorOf(entry), availability: () => remoteAvailability(entry, env) });
    } else {
      out.push({ ...descriptorOf(entry), availability: async () => (env.audio ? 'available' : 'unavailable') });
    }
  }
  return out;
}

export async function languageAvailability(languageId: string, registry: VoiceRegistry | undefined, env: GoListenEnv): Promise<LanguageAvailability> {
  if (!registry) return { languageId, voices: [], canPronounce: false, gaps: [`No voices are registered for ${languageId}; nothing is claimed.`] };
  const listed = await listVoices(registry, env);
  const voices = await Promise.all(listed.map(async (v) => ({ voiceId: v.voiceId, label: v.label, provider: v.provider, synthetic: v.synthetic, state: await v.availability() })));
  return { languageId, voices, canPronounce: voices.some((v) => v.state === 'available'), gaps: [...registry.gaps] };
}
