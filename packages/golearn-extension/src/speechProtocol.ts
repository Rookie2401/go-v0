/**
 * Speech messages contain no backend credential and no Azure key. packages/goreview/app/speechProtocol.ts carries the same two
 * shapes for the GoReview shell's bridge: GoReview must not import from the extension (test/audit/conformance.structure.test.ts),
 * and test/goreview-app/speech-protocol-mirror.test.ts keeps the two copies assignable to each other.
 */
export interface SpeechMessage {
  op: 'status' | 'voices' | 'synthesize' | 'cancel';
  requestId: string;
  languageId: string;
  readerId?: string;
  varietyId?: string;
  text?: string;
  kind?: 'word' | 'phrase' | 'sentence';
  voice?: string;
  locale?: string;
  processingPermission?: 'allowed' | 'unknown' | 'forbidden';
}
export interface SpeechReply {
  ok: boolean;
  status: number;
  json?: unknown;
  bytes?: number[];
  message?: string;
}
