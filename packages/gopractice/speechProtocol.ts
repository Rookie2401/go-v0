/**
 * The speech request and reply shapes the GoPractice shell's bridge (speechBridge.ts) exchanges with the GoLearn extension's
 * background speech client. A copy of packages/golearn-extension/src/speechProtocol.ts: GoPractice must not import from the
 * extension (test/audit/conformance.structure.test.ts), and test/gopractice/speech-protocol-mirror.test.ts fails to type-check
 * if the two drift apart. Speech messages contain no backend credential and no Azure key.
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
