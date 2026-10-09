/**
 * Fixture books for `?fixture=` — PROTOTYPE BUILD ONLY (reader.ts imports this module dynamically behind the
 * prototype-mode check, so a non-prototype build contains neither this file nor the EPUBs). The files are the
 * owner-authored / synthetic fixtures built by scripts/make-fixture.mts; see test/fixtures/epub/README.md.
 */
import udha from '../../../test/fixtures/epub/udha-sample.epub?url';
import rtl from '../../../test/fixtures/epub/rtl-sample.epub?url';
import protectedSample from '../../../test/fixtures/epub/protected-sample.epub?url';

export const FIXTURES: Record<string, string> = { udha, rtl, protected: protectedSample };
