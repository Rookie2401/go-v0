import { bundledLadderLanguages } from '../../ladder/bundle';

/** Languages with a bundled ladder (data/ladder/<lang>/ladder.json): only those have a "Your path" page with units on it. */
export const hasLadder = (lang: string): boolean => bundledLadderLanguages().includes(lang as never);
