/**
 * EPUB reading — STUB written by the coordinator so that the other packages compile.
 * Package S4 (docs/PLAN9.md) replaces the body; the exported names and signatures are the contract.
 */

export interface EpubChapter { title?: string; text: string }

export interface EpubBook {
  title?: string;
  author?: string;
  language?: string;
  /** In reading order (the spine), each as plain text with one paragraph per line; headings kept as their own lines. */
  chapters: EpubChapter[];
  notes: string[];
}

/** Thrown for a file that cannot be read lawfully or at all; the message is shown to the learner. */
export class EpubError extends Error {
  constructor(readonly code: 'not-epub' | 'encrypted' | 'damaged' | 'unsupported', message: string) { super(message); this.name = 'EpubError'; }
}

/**
 * Read an unprotected EPUB (a zip of XHTML). A protected file (DRM: META-INF/encryption.xml naming content
 * documents, or rights.xml) is REFUSED with code 'encrypted' — protection is never removed or worked around.
 * Nothing is uploaded: the bytes are read where they are.
 */
export async function readEpub(_bytes: Uint8Array): Promise<EpubBook> {
  throw new Error('readEpub: not implemented yet (PLAN9 package S4)');
}
