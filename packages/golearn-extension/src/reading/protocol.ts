import type { CoverageResult } from './coverage';

export const READING_ANALYSIS = 'golearn:reading-analysis';

export interface ReadingAnalysisRequest {
  type: typeof READING_ANALYSIS;
  requestId: string;
  languageId?: string;
  varietyId?: string;
  cancel?: boolean;
}

export type ReadingAnalysisReply =
  | { ok: true; coverage: CoverageResult; truncated?: boolean }
  | { ok: false; code: 'no-text' | 'unsupported-page' | 'variety-required' | 'unsupported-language' | 'unavailable' | 'canceled' | 'error' };
