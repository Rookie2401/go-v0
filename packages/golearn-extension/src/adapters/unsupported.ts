/**
 * unsupported — the adapter for an environment the extension does not (or may not) read. It declares nothing, returns
 * no text, and the popup says so. Chosen when no other adapter matches (a browser page, a PDF viewer, a reader whose
 * terms have not been reviewed).
 */
import { noCapabilities, type ReaderCapabilities } from '../contract/readerCapabilities';
import type { LayoutChange, PageDescriptor, PopupAnchor, ReaderAdapter, ReaderContext, SelectionResult, SourceReference } from '../contract/readerAdapter';

export const UNSUPPORTED_MESSAGE = 'GoLearn does not support this reader yet. It was not read.';

export class UnsupportedAdapter implements ReaderAdapter {
  readonly id = 'unsupported';
  matches(_location: PageDescriptor): boolean { return true; }
  capabilities(): ReaderCapabilities {
    return noCapabilities(this.id, 'No adapter for this environment; nothing is read from it.');
  }
  selection(): SelectionResult { return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MESSAGE }; }
  context(_range: Range): ReaderContext { return { kind: 'none', confidence: 0, reason: 'unsupported reader' }; }
  sourceRef(): SourceReference | undefined { return undefined; }
  anchor(_range: Range | undefined): PopupAnchor {
    return { rect: { top: 16, left: 16, right: 16, bottom: 16, width: 0, height: 0 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'fallback' };
  }
  onLayoutChange(_cb: (change: LayoutChange) => void): () => void { return () => {}; }
  isRangeLive(_range: Range): boolean { return false; }
  dispose(): void {}
}
