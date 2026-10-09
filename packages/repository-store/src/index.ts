/**
 * @go/repository-store: the storage of the Go Repository. Two implementations of one port
 * (`RepositoryStore` in the contract): memory and SQLite, both applying the same rules (./rules).
 * Imports the contract and `node:*` only. See README.md.
 */
export { createMemoryStore } from './memory';
export { openSqliteStore } from './sqlite';
export type { SqliteOptions } from './sqlite';
export { applyMigrations, readMigrations, checksumOf, MIGRATIONS_DIR } from './migrate';
export type { MigrationFile } from './migrate';
export { exportLearner, importLearner, unitProvenanceFor, EXPORT_FORMAT } from './export';
export type { ExportOptions, ExportedUnitProvenance, ImportSummary, LearnerExport } from './export';
export { applyTombstone, isDeletableStore } from './deletion';
export type { DeletableStore, DeletionResult } from './deletion';
export { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, normalizeEmail } from './rules';
export type { ConcreteStore, EraseCounts, EventRemover, ProvenanceCount, StoreOptions } from './rules';
