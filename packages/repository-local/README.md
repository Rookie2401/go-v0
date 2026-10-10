# repository-local

The Go Repository on one device, for a learner with no account. `openLocalRepository({ area, ... })` builds the memory store
(mirrored row by row into a key-value area), the real projection engine, the linguistic layer and the service's request handler
in one process and returns a `LocalRepository`: the same typed `api` a server client has, plus `uploadTo(remote)` / `pullFrom(remote)`
for when the learner signs in, `exportEvents()`, `rebuild()` and `clear()`.

Imports: the contract, `repository-store` (memory store only), `repository-engine`, `repository-linguistics`, `repository-sync`
(`KeyValueArea`, a lock) and the service's `api.ts` / `deps.ts` types. Design, privacy statement and size budget:
`docs/ecosystem/REPOSITORY-LOCAL.md`. Tests: `test/repository-local/`.
