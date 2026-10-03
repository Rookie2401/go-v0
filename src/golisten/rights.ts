import type { AudioAsset, AudioRightsRecord, AudioTextBinding, Sentence, Text } from '../core/model';
import type { AppStore } from '../core/store';
import type { AudioGenerationAuthorization } from '../core/contracts/golisten';

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function canonicalTextPayload(textId: string, contentVersion: number, sentences: Sentence[]): string {
  return JSON.stringify({ textId, contentVersion, sentences: sentences.map((s) => [s.id, s.text]) });
}

export async function canonicalTextSha256(textId: string, contentVersion: number, sentences: Sentence[]): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalTextPayload(textId, contentVersion, sentences)));
}

export function isThsv11(text: Pick<Text, 'version' | 'scripture'>): boolean {
  const facts = [text.version, text.scripture?.translationId, text.scripture?.edition].filter(Boolean).join(' ');
  return /\bTHSV\s*11\b|Thai Standard Version\s*2011/i.test(facts);
}

export function releaseIdOf(text: Text): string { return `${text.id}@${text.contentVersion}`; }

export function editionIdOf(text: Text): string | undefined {
  if (text.kind !== 'scripture') return undefined;
  return text.scripture?.translationId ?? text.scripture?.edition ?? text.version;
}

export function approvedForPlay(rights: AudioRightsRecord | undefined, kind?: 'human' | 'synthetic'): rights is AudioRightsRecord {
  if (!rights || rights.status !== 'approved' || rights.playInApp !== true || [rights.recordingOwner, rights.recordingBasis, rights.performanceOwner, rights.performancePermission].some((v) => typeof v !== 'string' || !v.trim())) return false;
  if (rights.providerRetention === 'unknown' || rights.providerRetention !== undefined && (!rights.providerId?.trim() || !rights.providerTerms?.trim())) return false;
  if (kind === 'synthetic' && (rights.textDerivative !== 'allowed' || !rights.providerId?.trim() || !rights.providerTerms?.trim() || !rights.providerRetention)) return false;
  if (rights.textDerivative === 'allowed' && !rights.providerId) return false;
  return true;
}

const textHashCache = new WeakMap<AppStore, Map<string, { fingerprint: string; sha256: string }>>();

export async function currentBindingValid(store: AppStore, asset: AudioAsset): Promise<boolean> {
  const binding = asset.textBinding;
  if (!binding || asset.qualityState === 'rejected' || !approvedForPlay(asset.rights, asset.audioKind)) return false;
  if (binding.scope === 'personal') return !!binding.ownerId && binding.releaseId === binding.textId && binding.contentVersion === 1
    && asset.generation?.sourceTextSha256 === binding.textSha256 && asset.rights?.textDerivative === 'allowed';
  const text = await store.texts.get(binding.textId);
  if (!text || text.lang !== asset.lang || isThsv11(text) || text.contentVersion !== binding.contentVersion || releaseIdOf(text) !== binding.releaseId) return false;
  if (editionIdOf(text) !== binding.editionId) return false;
  const sentences = (await store.sentences.where('textId', text.id))
    .filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const fingerprint = sentences.map((s) => `${s.id}\u0000${s.textHash}\u0000${s.text}`).join('\u0001');
  let cache = textHashCache.get(store);
  if (!cache) { cache = new Map(); textHashCache.set(store, cache); }
  const key = `${text.id}@${text.contentVersion}`;
  let cached = cache.get(key);
  if (!cached || cached.fingerprint !== fingerprint) {
    cached = { fingerprint, sha256: await canonicalTextSha256(text.id, text.contentVersion, sentences) };
    cache.set(key, cached);
  }
  return cached.sha256 === binding.textSha256;
}

export function bindingFromManifest(args: { textId: string; contentVersion: number; textSha256: string; releaseId: string; editionId?: string }): AudioTextBinding {
  return { ...args };
}

export async function validateGenerationAuthorization(store: AppStore, text: Text, providerId: string, grant: AudioGenerationAuthorization | undefined): Promise<AudioGenerationAuthorization> {
  if (!grant) throw new Error('GoListen: production synthesis requires explicit text-derivative and provider-retention authorization');
  const rights = grant.rights;
  if (!approvedForPlay(rights) || rights.textDerivative !== 'allowed' || !rights.providerId || rights.providerId !== providerId || !rights.providerTerms?.trim() || !rights.providerRetention || rights.providerRetention === 'unknown') {
    throw new Error('GoListen: generation rights must approve playback, text derivatives, and explicit provider retention terms');
  }
  const sentences = (await store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const binding = grant.textBinding;
  if (binding.scope === 'personal' || binding.ownerId !== undefined) throw new Error('GoListen: canonical text authorization cannot use a personal-scope binding');
  if (binding.textId !== text.id || binding.contentVersion !== text.contentVersion || binding.releaseId !== releaseIdOf(text) || binding.editionId !== editionIdOf(text)
    || binding.textSha256 !== await canonicalTextSha256(text.id, text.contentVersion, sentences)) throw new Error('GoListen: generation authorization is for a different text release or Bible edition');
  if (isThsv11(text)) throw new Error('GoListen: THSV11 audio generation is prohibited');
  return grant;
}

export async function validatePersonalGenerationAuthorization(providerId: string, ownerId: string, text: string, grant: AudioGenerationAuthorization | undefined): Promise<AudioGenerationAuthorization> {
  if (!grant) throw new Error('GoListen: production testimony synthesis requires explicit text-derivative and provider-retention authorization');
  if (!approvedForPlay(grant.rights, 'synthetic') || grant.rights.textDerivative !== 'allowed' || grant.rights.providerId !== providerId || !grant.rights.providerTerms?.trim() || !grant.rights.providerRetention || grant.rights.providerRetention === 'unknown') throw new Error('GoListen: generation rights must approve playback, personal text derivatives, and provider retention terms');
  const b = grant.textBinding;
  if (b.scope !== 'personal' || b.textId !== `personal:${ownerId}` || b.releaseId !== `personal:${ownerId}` || b.contentVersion !== 1 || b.ownerId !== ownerId
    || b.textSha256 !== await sha256Hex(new TextEncoder().encode(text))) throw new Error('GoListen: testimony authorization does not bind this owner and exact sentence');
  return grant;
}
