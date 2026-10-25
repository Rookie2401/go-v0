export function resolveProjectId(input: { explicit?: string; previous?: string; tracked?: string }): string | undefined;
export function dictionaryLanguages(value?: string): string[];
export function validateBundledAssets(webRoot: string, languages: string[]): Promise<void>;
