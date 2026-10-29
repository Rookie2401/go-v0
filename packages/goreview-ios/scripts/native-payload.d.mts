export const NATIVE_PAYLOAD_MANIFEST: string;
export const PARENT_SOURCE_MANIFEST: string;
export function resolveNativeBuildMode(args: string[]): 'release' | 'developer';
export function transformNativeWebPayload(payloadDir: string, options?: { serviceUrl?: string; bibliaUrl?: string }): string[];
export function createNativePayloadManifest(payloadDir: string, options: { mode: 'release' | 'developer'; parentManifestName?: string; transformations?: string[] }): unknown;
export function verifyNativePayloadManifest(payloadDir: string, options?: { requireRelease?: boolean }): unknown;
