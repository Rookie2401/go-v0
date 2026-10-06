import records from './acquired-library-works.json';
import type { WorkRights } from '../core';

interface AcquiredWork {
  rights: WorkRights;
  edition?: string;
  sourceUrl?: string;
  installed: boolean;
}

export const acquiredWorks = records as unknown as Record<string, Record<string, AcquiredWork>>;
