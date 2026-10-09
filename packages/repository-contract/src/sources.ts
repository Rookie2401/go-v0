/**
 * Contract v3 — where a context came from. A typed union keyed by `kind` replaces the v2 `{ kind, title?, locator? }`.
 * A reference identifies; it never carries the text it points at (no verse text, no passage, no caption). Every member may
 * carry `restrictions`: what the source's terms let the Repository do with what it learned from there. Restrictions in an
 * event are the CLIENT's claim; the service caps them by its own per-reader table (repository-service `sourcePolicy.ts`), so
 * metadata a page controls can never grant a permission. Absent means every field `unknown`, which is the conservative reading.
 */
import type { ValidationIssue } from './units';

export const MAX_TITLE_CHARS = 300;
export const MAX_LOCATOR_CHARS = 2048;

// ───────────────────────────── restrictions ─────────────────────────────

export const PERMISSIONS = ['forbidden', 'unknown', 'allowed'] as const;
/** `forbidden` < `unknown` < `allowed`: capping two values takes the lower (more restrictive). */
export type Permission = (typeof PERMISSIONS)[number];

export const RESTRICTION_FIELDS = ['textRetention', 'remoteProcessing', 'audioRetention', 'export', 'sharing', 'reviewExamples'] as const;
export type RestrictionField = (typeof RESTRICTION_FIELDS)[number];

/**
 * What may be done with material from a source. `textRetention`: keep the source's words (a sentence, beyond its hash);
 * `remoteProcessing`: send them to a service off the device; `audioRetention`: keep audio made from them; `export`: include them in
 * the learner's export; `sharing`: pass them on (a team, another learner); `reviewExamples`: use them as example sentences in review.
 */
export type SourceRestrictions = Record<RestrictionField, Permission>;

/** What a reference carries: any subset; a missing field is `unknown`. */
export type RestrictionsInput = Partial<SourceRestrictions>;

export const UNKNOWN_RESTRICTIONS: Readonly<SourceRestrictions> = Object.freeze({
  textRetention: 'unknown', remoteProcessing: 'unknown', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'unknown',
});

const RANK: Record<Permission, number> = { forbidden: 0, unknown: 1, allowed: 2 };

/** The restrictions of a reference with every field present: a field it does not state is `unknown`. */
export function restrictionsOf(ref: { restrictions?: RestrictionsInput } | undefined): SourceRestrictions {
  const out = { ...UNKNOWN_RESTRICTIONS } as SourceRestrictions;
  const r = ref?.restrictions;
  if (r && typeof r === 'object') for (const f of RESTRICTION_FIELDS) if ((PERMISSIONS as readonly string[]).includes(r[f] as string)) out[f] = r[f] as Permission;
  return out;
}

/** Per field, the more restrictive of what the client claims and what the policy permits. A client may tighten and never loosen. */
export function capRestrictions(client: RestrictionsInput | undefined, policy: SourceRestrictions): SourceRestrictions {
  const claimed = restrictionsOf({ restrictions: client });
  const out = { ...UNKNOWN_RESTRICTIONS } as SourceRestrictions;
  for (const f of RESTRICTION_FIELDS) out[f] = RANK[claimed[f]] <= RANK[policy[f]] ? claimed[f] : policy[f];
  return out;
}

// ───────────────────────────── the union ─────────────────────────────

export const PLAIN_SOURCE_KINDS = ['web', 'ebook', 'file', 'demo', 'practice', 'writing'] as const;
export const SOURCE_KINDS = [...PLAIN_SOURCE_KINDS, 'scripture', 'share', 'media'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SCRIPTURE_PROVIDERS = ['biblegateway', 'youversion', 'other'] as const;
export const SHARE_MECHANISMS = ['android-process-text', 'android-send', 'ios-share-extension', 'ios-safari-extension', 'web-share-target', 'clipboard-import', 'deep-link'] as const;
export const CAPTION_PROVENANCES = ['provider', 'user', 'generated', 'unknown'] as const;

interface RefBase { restrictions?: RestrictionsInput }

/** An ordinary source: a page, a book, a file, the demo, a practice item, the learner's own writing. Unchanged from v2. */
export interface PlainSourceRef extends RefBase {
  kind: (typeof PLAIN_SOURCE_KINDS)[number];
  title?: string;
  locator?: string;
}

/** A Scripture reference by coordinates. There is no text field anywhere: the verses stay on the provider's page. */
export interface ScriptureSourceRef extends RefBase {
  kind: 'scripture';
  provider: (typeof SCRIPTURE_PROVIDERS)[number];
  translationId: string;
  languageId?: string;
  /** USFM book code (`JHN`, `1JN`, `PSA`). */
  book: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
  url?: string;
  /** How sure the adapter is of the reference (0..1): a verse marker read from the page is surer than a URL guess. */
  confidence: number;
  /** A scripture reference has no title or locator (`never` as data: they may be read and are always absent). */
  title?: undefined;
  locator?: undefined;
}

/** A passage that arrived through a platform share or clipboard import rather than from a reader the extension controls. */
export interface ShareSourceRef extends RefBase {
  kind: 'share';
  mechanism: (typeof SHARE_MECHANISMS)[number];
  sourceApp?: string;
  title?: string;
  locator?: string;
}

/** Design only (no integration): a timestamp in a video or audio item. Captions, when used, are text and are never stored here. */
export interface MediaSourceRef extends RefBase {
  kind: 'media';
  provider: string;
  mediaId: string;
  timestampMs?: number;
  captionLanguage?: string;
  audioLanguage?: string;
  captionProvenance?: (typeof CAPTION_PROVENANCES)[number];
  title?: undefined;
  locator?: undefined;
}

export type SourceRef = PlainSourceRef | ScriptureSourceRef | ShareSourceRef | MediaSourceRef;

/** A readable title for a reference, when it has one (scripture and media have none; the service never invents one). */
export const sourceTitle = (ref: SourceRef | undefined): string | undefined => ref?.title;

/**
 * An identifying locator for a reference: the stored locator, or for scripture `BOOK.chapter[.verse]` and for media `provider:mediaId`.
 * Source tombstones match on it, so a learner can delete everything from `JHN.3`.
 */
export function sourceLocator(ref: SourceRef | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.kind === 'scripture') return `${ref.book}.${ref.chapter}${ref.verse !== undefined ? `.${ref.verse}` : ''}`;
  if (ref.kind === 'media') return `${ref.provider}:${ref.mediaId}`;
  return ref.locator;
}

// ───────────────────────────── validation ─────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const USFM = /^[A-Z0-9]{3}$/;
const TRANSLATION = /^[\w.+-]{1,60}$/;
const LANG = /^[A-Za-z0-9_-]{1,35}$/;

/** Validates `restrictions` wherever it appears: an object of known fields, each a permission. */
export function validateRestrictions(r: unknown, path: string): ValidationIssue[] {
  if (r === undefined) return [];
  if (!isRecord(r)) return [{ path, message: 'object of permissions' }];
  const out: ValidationIssue[] = [];
  for (const [k, v] of Object.entries(r)) {
    if (!(RESTRICTION_FIELDS as readonly string[]).includes(k)) out.push({ path: `${path}.${k}`, message: `unknown restriction; known: ${RESTRICTION_FIELDS.join(', ')}` });
    else if (!(PERMISSIONS as readonly string[]).includes(String(v))) out.push({ path: `${path}.${k}`, message: `one of ${PERMISSIONS.join(', ')}` });
  }
  return out;
}

function optString(x: Record<string, unknown>, k: string, max: number, path: string, out: ValidationIssue[]): void {
  const v = x[k];
  if (v === undefined) return;
  if (typeof v !== 'string') out.push({ path: `${path}.${k}`, message: 'string' });
  else if (v.length > max) out.push({ path: `${path}.${k}`, message: `at most ${max} characters` });
}

/** The v2 rule, kept for v2 events: `kind` is not enumerated (the extension prototype wrote others), `title` and `locator` are bounded strings. */
export function validateLegacySourceRef(ref: unknown, path: string): ValidationIssue[] {
  if (!isRecord(ref)) return [{ path, message: 'object' }];
  const out: ValidationIssue[] = [];
  for (const k of ['title', 'locator'] as const) if (ref[k] !== undefined && typeof ref[k] !== 'string') out.push({ path: `${path}.${k}`, message: 'string' });
  optString(ref, 'title', MAX_TITLE_CHARS, path, out);
  optString(ref, 'locator', MAX_LOCATOR_CHARS, path, out);
  out.push(...validateRestrictions(ref.restrictions, `${path}.restrictions`));
  return out;
}

/** The v3 rule: `kind` is one of the nine, and each member has exactly its own fields, bounded. */
export function validateSourceRef(ref: unknown, path = 'subject.sourceRef'): ValidationIssue[] {
  if (!isRecord(ref)) return [{ path, message: 'object' }];
  if (!(SOURCE_KINDS as readonly string[]).includes(String(ref.kind))) return [{ path: `${path}.kind`, message: `one of ${SOURCE_KINDS.join(', ')}` }];
  const out: ValidationIssue[] = [...validateRestrictions(ref.restrictions, `${path}.restrictions`)];
  switch (ref.kind) {
    case 'scripture': {
      if (!(SCRIPTURE_PROVIDERS as readonly string[]).includes(String(ref.provider))) out.push({ path: `${path}.provider`, message: `one of ${SCRIPTURE_PROVIDERS.join(', ')}` });
      if (typeof ref.translationId !== 'string' || !TRANSLATION.test(ref.translationId)) out.push({ path: `${path}.translationId`, message: 'translation id (letters, digits, . _ + -; at most 60)' });
      if (ref.languageId !== undefined && (typeof ref.languageId !== 'string' || !LANG.test(ref.languageId))) out.push({ path: `${path}.languageId`, message: 'language tag of at most 35 characters' });
      if (typeof ref.book !== 'string' || !USFM.test(ref.book)) out.push({ path: `${path}.book`, message: 'USFM book code (three capital letters or digits, e.g. JHN, 1JN)' });
      if (!isInt(ref.chapter, 1, 151)) out.push({ path: `${path}.chapter`, message: 'whole number 1..151' });
      if (ref.verse !== undefined && !isInt(ref.verse, 1, 176)) out.push({ path: `${path}.verse`, message: 'whole number 1..176' });
      if (ref.verseEnd !== undefined) {
        if (ref.verse === undefined) out.push({ path: `${path}.verseEnd`, message: 'a verseEnd needs a verse' });
        else if (!isInt(ref.verseEnd, 1, 176) || (typeof ref.verse === 'number' && ref.verseEnd < ref.verse)) out.push({ path: `${path}.verseEnd`, message: 'whole number from verse to 176' });
      }
      if (typeof ref.confidence !== 'number' || !(ref.confidence >= 0 && ref.confidence <= 1)) out.push({ path: `${path}.confidence`, message: 'required number within 0..1' });
      if (ref.url !== undefined) out.push(...validateUrl(ref.url, `${path}.url`));
      for (const k of ['title', 'locator']) if (ref[k] !== undefined) out.push({ path: `${path}.${k}`, message: 'a scripture reference is its coordinates; it carries no title or locator' });
      break;
    }
    case 'share': {
      if (!(SHARE_MECHANISMS as readonly string[]).includes(String(ref.mechanism))) out.push({ path: `${path}.mechanism`, message: `one of ${SHARE_MECHANISMS.join(', ')}` });
      optString(ref, 'sourceApp', 100, path, out);
      optString(ref, 'title', MAX_TITLE_CHARS, path, out);
      optString(ref, 'locator', MAX_LOCATOR_CHARS, path, out);
      break;
    }
    case 'media': {
      if (typeof ref.provider !== 'string' || !ref.provider.length || ref.provider.length > 60) out.push({ path: `${path}.provider`, message: 'required string of at most 60 characters' });
      if (typeof ref.mediaId !== 'string' || !ref.mediaId.length || ref.mediaId.length > 200) out.push({ path: `${path}.mediaId`, message: 'required string of at most 200 characters' });
      if (ref.timestampMs !== undefined && !isInt(ref.timestampMs, 0, 7 * 24 * 3600 * 1000)) out.push({ path: `${path}.timestampMs`, message: 'whole milliseconds from 0 to seven days' });
      for (const k of ['captionLanguage', 'audioLanguage']) if (ref[k] !== undefined && (typeof ref[k] !== 'string' || !LANG.test(ref[k] as string))) out.push({ path: `${path}.${k}`, message: 'language tag of at most 35 characters' });
      if (ref.captionProvenance !== undefined && !(CAPTION_PROVENANCES as readonly string[]).includes(String(ref.captionProvenance))) out.push({ path: `${path}.captionProvenance`, message: `one of ${CAPTION_PROVENANCES.join(', ')}` });
      for (const k of ['title', 'locator']) if (ref[k] !== undefined) out.push({ path: `${path}.${k}`, message: 'a media reference is provider, id and time; it carries no title or locator' });
      break;
    }
    default: {
      optString(ref, 'title', MAX_TITLE_CHARS, path, out);
      optString(ref, 'locator', MAX_LOCATOR_CHARS, path, out);
    }
  }
  return out;
}

/** An address: http(s) only, bounded, and without credentials. The service does not fetch it. */
function validateUrl(v: unknown, path: string): ValidationIssue[] {
  if (typeof v !== 'string' || v.length > MAX_LOCATOR_CHARS) return [{ path, message: `string of at most ${MAX_LOCATOR_CHARS} characters` }];
  if (!/^https?:\/\//i.test(v)) return [{ path, message: 'an http(s) address' }];
  try { new URL(v); } catch { return [{ path, message: 'an http(s) address' }]; }
  // userinfo (`user:secret@host`) sits before the first `/`, `?` or `#` after the scheme
  if (v.slice(v.indexOf('//') + 2).split(/[/?#]/, 1)[0].includes('@')) return [{ path, message: 'an address without credentials' }];
  return [];
}
