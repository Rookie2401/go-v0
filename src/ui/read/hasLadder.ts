import { bundledLadderLanguages } from '../../ladder/bundle';
import type { LadderSource } from '../../ladder/bundle';

/** Languages with a bundled ladder (data/ladder/<lang>/ladder.json): only those have a "Your path" page with units on it. */
export const hasLadder = (lang: string, source?: LadderSource): boolean => bundledLadderLanguages(source).includes(lang as never);
