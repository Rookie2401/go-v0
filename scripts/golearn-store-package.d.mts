import type { Buffer } from 'node:buffer';

export interface RuntimeFile { source: string; relative: string; size: number }
export function collectRuntimeFiles(sourceRoot: string): RuntimeFile[];
export function assertNoCredentials(files: RuntimeFile[]): void;
export function crc32(bytes: Uint8Array): number;
export function createZip(entries: Array<{ name: string; bytes: Buffer }>): Buffer;
export function withFreshDist<T>(outputPath: string, action: () => T): T;
