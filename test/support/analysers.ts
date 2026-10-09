/**
 * Registers every analyser with the extension parser, the way the content script does after loading each chunk. The parser
 * carries Albanian itself; Spanish, German, Hindi and Thai are separate chunks in the real extension, so a test that parses
 * in one of them (or resolves a language by word lists) calls this first. Synchronous: the adapters are imported statically here.
 */
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { hiAdapter } from '../../src/adapters/hi';
import { sqAdapter } from '../../src/adapters/sq';
import { thAdapter } from '../../src/adapters/th';
import { registerAnalyser } from '../../packages/golearn-extension/src/parser/registry';

export function registerAllAnalysers(): void {
  registerAnalyser('sq', sqAdapter);
  registerAnalyser('es', esAdapter);
  registerAnalyser('de', deAdapter);
  registerAnalyser('hi', hiAdapter);
  registerAnalyser('th', thAdapter);
}
