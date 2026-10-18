/**
 * What the service needs from the outside. The handler depends on the contract's ports and on these small interfaces
 * only, so the real packages (repository-store, -engine, -linguistics) and the test fakes plug in the same way.
 */
import type {
  FormAnalysis, LinguisticUnit, ProjectionEngine, RepositoryStore, SourceRestrictions, UnitRelation,
} from '../../repository-contract/src';
import type { ChangeNotifier } from './notifier';
import type { MetricsRegistry, Sample } from './metrics';
import type { RateLimiter } from './ratelimit';

/** What the learner selected. The sentence (when given) is used to analyse and is never stored by the service. */
export interface LookupInput {
  languageId: string;
  surface: string;
  sentence?: string;
  /** Hash of the sentence (the service computes sha256 of `sentence` when only the sentence is given). */
  sentenceKey?: string;
  selStart?: number;
  selEnd?: number;
}

export interface LookupResult {
  formId: string;
  units: LinguisticUnit[];
  relations: UnitRelation[];
  analysis?: FormAnalysis;
}

export interface UnitView {
  unit: LinguisticUnit;
  relations: UnitRelation[];
  analyses: FormAnalysis[];
}

export interface LearnerCorrection {
  by: 'learner';
  learnerId: string;
  lexemeId?: string;
  features?: Record<string, string>;
  reason?: string;
  /** Limits the correction to one sentence (a hash); absent = the out-of-context analysis. */
  sentenceKey?: string;
}

export interface CorrectionResult {
  /** The analysis that supersedes the corrected one, when linguistics made one. */
  analysis?: FormAnalysis;
  /** Ids of the analyses it invalidated. */
  invalidated?: string[];
}

export interface LinguisticsPort {
  resolveAndStore(input: LookupInput): Promise<LookupResult>;
  lookup(unitId: string): Promise<UnitView | undefined>;
  correct(formId: string, correction: LearnerCorrection, now: string): Promise<CorrectionResult>;
}

export interface CryptoPort {
  /** Slow, salted password hash in a self-describing string. */
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  /** 32 random bytes, base64url. */
  randomToken(): string;
  /** sha256 as lower-case hex. */
  sha256(s: string): string;
}

/** One outgoing message. Plain text. */
export interface EmailMessage { to: string; subject: string; text: string }

/** Where verification and reset emails go. Implementations: ./mailer (SMTP, Resend, a file outbox, the console, memory). */
export interface EmailSender {
  readonly kind: 'smtp' | 'resend' | 'file' | 'console' | 'memory';
  /** Whether a message can reach a person. A file or console sink cannot, so the service never makes verification mandatory on top of one. */
  readonly delivers: boolean;
  send(m: EmailMessage): Promise<void>;
}

/** The rules of the account flows. Absent from the deps, the defaults below apply. */
export interface AccountPolicy {
  /** Days after creation an unverified account may still sign in. Default 7 (GRACE_DAYS). */
  graceDays: number;
  /** Days a requested deletion waits before the purge, during which it can be cancelled. Default 14 (DELETE_GRACE_DAYS). */
  deleteGraceDays: number;
  /** Refuse sign-in (403 email-unverified) once the grace has passed. Off when no mail can be delivered. */
  requireVerification: boolean;
  /** Link templates for the emails; `{token}` is replaced. Absent: the message carries the token alone. */
  verifyUrl?: string;
  resetUrl?: string;
  /** Name in the subject lines. Default "Go". */
  serviceName?: string;
}
export const DEFAULT_ACCOUNT_POLICY: AccountPolicy = { graceDays: 7, deleteGraceDays: 14, requireVerification: false };

export interface MetricsConfig {
  registry: MetricsRegistry;
  /** Bearer token that guards `GET /metrics`. Absent: only a request from the local machine (and not through a proxy) is answered. */
  token?: string;
  /** Gauges produced at scrape time (store counters, process memory). */
  collect?: () => Promise<Sample[]>;
}

/** What `GET /health` reports besides ok. Nothing secret. */
export interface ServiceInfo {
  storeKind: string;
  /** `Date.now()` at start. */
  startedAt: number;
  /** The newest applied migration version, read when asked. */
  schemaVersion?: () => Promise<number | undefined>;
}

export interface ServiceDeps {
  store: RepositoryStore;
  engine: ProjectionEngine;
  linguistics: LinguisticsPort;
  crypto: CryptoPort;
  /** ISO clock. Default: the system clock. */
  now?: () => string;
  /** One line per request: `METHOD /path status ms`. Never a body, a query string or a token. */
  log?: (line: string) => void;
  /**
   * The most permissive source restrictions the service will store for an event's `payload.readerId` (contract v3; `sourcePolicy.ts`'s `policyFor`,
   * wired by `main.ts`). A client's claim is capped by it. Absent, every claim is capped to all `unknown`.
   */
  sourcePolicy?: (readerId: unknown) => Readonly<SourceRestrictions>;
  /**
   * The change notifier behind `POST /sync/wait`. Absent, the handler keeps one per store (so tests and in-process use work unwired);
   * `main.ts` wires one explicitly so it can `closeAll()` on shutdown.
   */
  notifier?: ChangeNotifier;
  /** Replaces the default export assembled from the store ports. */
  exporter?: (learnerId: string) => Promise<unknown>;

  // ── operations (all optional: absent, the service behaves as it always did) ──
  /** Per-IP and per-account rate limits. Absent: no limiting (tests, in-process use). `main.ts` always wires one unless RATE_LIMIT=off. */
  limiter?: RateLimiter;
  /** The caller's address: the socket's peer, or with TRUST_PROXY the last X-Forwarded-For entry. Absent: every caller is "unknown". */
  clientIp?: (request: Request) => string;
  /** Prometheus metrics and the `GET /metrics` route (404 when absent). */
  metrics?: MetricsConfig;
  /** `json` makes each request log line a JSON object (with the request id). Default `text`: `METHOD /path status ms`. */
  logFormat?: 'text' | 'json';
  /** Extra fields for `GET /health`. */
  info?: ServiceInfo;
  /** Sends verification and password-reset emails. Absent: those flows issue nothing. */
  mailer?: EmailSender;
  accountPolicy?: AccountPolicy;
}
