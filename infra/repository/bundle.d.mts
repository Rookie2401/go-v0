export function sourceUrlPlugin(outfile: string): { name: string; setup(build: unknown): void };
export function bundle(options: { entry: string; outfile: string; root?: string }): Promise<string>;
export const SERVICE_BUNDLE: string;
export const SERVICE_ENTRY: string;
