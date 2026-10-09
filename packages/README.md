# packages/ — the Go ecosystem package boundaries

Module tree for the two-application product (see `docs/ecosystem/`). Updated 2026-10-08 for Prompt 3 (the Go
Repository). PROTOTYPE packages are marked in their own READMEs.

```
packages/
  repository-contract/     events, payload validators, linguistic units, learner state, identity, ports   ← apps import ONLY this
  repository-linguistics/  Layer A: the Albanian resolver over src/adapters/sq, unit/relation/analysis service, packs, aliases
  repository-store/        memory and SQLite (node:sqlite) implementations of the RepositoryStore port; export; deletion
  repository-engine/       Layer C: evidence rules, projection fold, preferences, eligibility, review candidates, suitability
  repository-service/      authenticated HTTP service (web-API handler + node:http bridge), typed client, in-process API
  repository-sync/         the device-side queue, sync client, document conflict rules
  golisten/                GoListen: pronunciation contracts, voice registry, device/remote/recorded providers, assessment interface
  language-packs/          the pack manifest framework, the Albanian pack (runtime, installer, validation, tutorial), planned packs
  golearn-extension/       GoLearn: the MV3 reader extension (src/, action/) and the setup/onboarding app (app/: options page + web build)
  controlled-reader/       PROTOTYPE local EPUB reader with the epub-local adapter
  (planned) goreview/, gotell/
```

Rules (enforced by `test/ecosystem/boundaries.test.ts`):

- `repository-contract` imports nothing outside itself.
- Application packages (`golearn-app`, `golearn-extension`, `goreview`, `gotell`) import only `repository-contract`
  and never each other; `goreview` and `gotell` never import each other.
- `repository-linguistics`, `repository-store`, `repository-engine`, `repository-sync` import only the contract (and
  `node:*`); `repository-linguistics` may also import `src/adapters/*` and `src/core` types (the language analyser).
- `repository-service` may import the contract and the four repository packages; nothing imports the service except
  tests and `main.ts`.
- Nothing under `packages/` imports the retired `src/course`, `src/ladder`, `src/stage0`, `src/library`, nor
  `src/ui`, `src/golearn`, `src/gotell`, `src/goread`, `src/app`.
- `controlled-reader` imports the reader contract from `golearn-extension/src/contract` until that contract moves to
  its own package (decision in `docs/ecosystem/READER-ARCHITECTURE-DECISION.md` §3).

Tests live under `test/repository/<package>/`, `test/extension/`, `test/controlled-reader/`, `test/ecosystem/`.
