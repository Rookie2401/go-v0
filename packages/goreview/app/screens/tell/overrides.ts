/**
 * Seams for tests and for a different build of the application: which engine serves the workspace, how a file is saved
 * and which timers drive autosave. The defaults are the real ones.
 */
import type { FileOut, TellEngine } from '../../../../gotell/src/workspace/port';
import type { Identity } from '../../ports';
import type { AppContext } from '../../context';

export interface TellOverrides {
  engine?: (ctx: AppContext, id: Identity) => TellEngine | Promise<TellEngine>;
  download?: (file: FileOut) => void;
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

export const tellOverrides: TellOverrides = {};

/** Saves a file through the browser: a temporary link to a Blob. */
export function browserDownload(file: FileOut): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  const a = document.createElement('a');
  a.href = url; a.download = file.filename; a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
