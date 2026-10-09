/**
 * What the service needs from the outside. The handler depends on the contract's ports and on these small interfaces
 * only, so the real packages (repository-store, -engine, -linguistics) and the test fakes plug in the same way.
 */
import type {
  FormAnalysis, LinguisticUnit, ProjectionEngine, RepositoryStore, UnitRelation,
} from '../../repository-contract/src';

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

export interface ServiceDeps {
  store: RepositoryStore;
  engine: ProjectionEngine;
  linguistics: LinguisticsPort;
  crypto: CryptoPort;
  /** ISO clock. Default: the system clock. */
  now?: () => string;
  /** One line per request: `METHOD /path status ms`. Never a body, a query string or a token. */
  log?: (line: string) => void;
  /** Replaces the default export assembled from the store ports. */
  exporter?: (learnerId: string) => Promise<unknown>;
}
