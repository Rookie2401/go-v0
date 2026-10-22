/**
 * Registers every analyser with the extension parser, the way the content script does after loading each chunk. The parser
 * carries Albanian itself; Spanish, German, Hindi, Thai and Norwegian (nb, nn) are separate chunks in the real extension, so a test that parses
 * in one of them (or resolves a language by word lists) calls this first. Synchronous: the adapters are imported statically here.
 */
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { elAdapter } from '../../src/adapters/el';
import { heAdapter } from '../../src/adapters/he';
import { createGreekShardLoader } from '../../src/adapters/greek/shards';
import { createHebrewShardLoader } from '../../src/adapters/hebrew/shards';
import { hiAdapter } from '../../src/adapters/hi';
import { laAdapter } from '../../src/adapters/la';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { sqAdapter } from '../../src/adapters/sq';
import { thAdapter } from '../../src/adapters/th';
import { languageMeta, registerAnalyser } from '../../packages/golearn-extension/src/parser/registry';

export function registerAllAnalysers(): void {
  registerAnalyser('sq', sqAdapter);
  registerAnalyser('es', esAdapter);
  registerAnalyser('de', deAdapter);
  registerAnalyser('hi', hiAdapter);
  registerAnalyser('th', thAdapter);
  registerAnalyser('nb', nbAdapter);
  registerAnalyser('nn', nnAdapter);
  if (languageMeta('he')) registerAnalyser('he', heAdapter, { createShardLoader: createHebrewShardLoader }); // with the chunk's extras, as dist/analysers/he.js brings them
  if (languageMeta('el')) registerAnalyser('el', elAdapter, { createShardLoader: createGreekShardLoader });
  if (languageMeta('la')) registerAnalyser('la', laAdapter); // once the adapter lane's parser entry exists
}
