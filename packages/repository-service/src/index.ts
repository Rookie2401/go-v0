export { handle, SERVICE_VERSION, MAX_BODY_BYTES, SESSION_TTL_MS, LOCKOUT_ATTEMPTS, LOCKOUT_WINDOW_MS, EXPORT_FORMAT } from './handler';
export type { ServiceDeps, LinguisticsPort, CryptoPort, LookupInput, LookupResult, UnitView, LearnerCorrection, CorrectionResult } from './deps';
export { createRepositoryApi, createInProcessApi } from './api';
export type { RepositoryApi, ApiResult, ApiOptions, EventsResponse, MeResponse, ReportedProvenance, UnitCorrectionInput, UnitReport } from './api';
