# packages/ — the Go ecosystem package boundaries (scaffolding, 2026-10-08)

Proposed module tree for the two-application product (see `docs/ecosystem/`). Only `repository-contract` holds code
in this phase; the others are boundary markers so the import rules can be tested before anything is moved.

```
packages/
  repository-contract/   events, validation, query and writer interfaces     ← apps import ONLY this
  repository-engine/     (phase 2) 2GoLearn core + priorities, writing projections, tombstones
  repository-store/      (phase 2) dexie / memory bindings, export, deletion
  repository-sync/       (phase 3) the sync contract and client
  language-packs/        (phase 2) the six adapters as versioned packs
  golearn-app/           (phase 2) setup, onboarding, settings, the demonstration reader
  golearn-extension/     (phase 2) reader adapters, context parser, card UI
  goreview/              (phase 2) GoPractice workspace: deck + assessments
  gotell/                (phase 2) GoPractice workspace: writing (adapted from src/gotell)
```

Rules (enforced by `test/ecosystem/boundaries.test.ts`): `repository-contract` imports nothing from `src/` or from
other packages; `goreview` and `gotell` never import each other; application packages never import engine or store
packages directly; nothing under `packages/` imports from `src/course`, `src/ladder`, `src/stage0`, `src/library`.
