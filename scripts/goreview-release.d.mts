export const REQUIRED_CAPABILITIES: readonly string[];
export function normalizeCompiledModuleId(id: string, projectRoot?: string): { sourcePath?: string; dependencyPath?: string } | undefined;
export function createReleaseManifest(outDir: string, mode?: 'release' | 'developer', compiledModules?: string[], projectRoot?: string, compiledDependencies?: string[]): unknown;
export function verifyReleaseArtifact(outDir: string, options?: { requireRelease?: boolean; compareCurrentSource?: boolean; projectRoot?: string; expectCommit?: string }): unknown;
export function parseVerifyArgs(args: string[]): { target: string; requireRelease: boolean; expectCommit?: string };
export function assertBuildModeAllowed(mode: 'release' | 'developer', dirty: boolean): void;
