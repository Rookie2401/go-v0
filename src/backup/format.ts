/** Canonical JSON, checksum and base64 helpers shared by export / validate / restore. */
import { hash } from '../core';
import type { BackupData } from './types';

/** JSON with sorted object keys and `undefined` dropped, so the checksum does not depend on key order. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableStringify(obj[k]));
  }
  return '{' + parts.join(',') + '}';
}

export function checksumOf(data: BackupData): string {
  return 'fnv1a64:' + hash(stableStringify(data));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const SEGMENT_SPLIT = /[:|/]/;

/** Meta ids are free-form; a row belongs to a learner when the learner id is one of its `:` `|` `/` segments. */
export function metaBelongsTo(id: string, userId: string): boolean {
  return id.split(SEGMENT_SPLIT).includes(userId);
}

/** Policy / derived-state markers: never exported, and cleared on restore so GoLearn notices the stale state. */
export function isPolicyMeta(id: string): boolean {
  return /polic/i.test(id);
}
