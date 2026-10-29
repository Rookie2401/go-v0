# GoReview release traceability

The GoReview Vite review build writes `goreview-release-manifest.json` beside the web app. This directory is the shared embedded-web artifact for web and native wrappers; the manifest does not claim that a native package was built, submitted, or released.

The manifest records the Git commit and tree, whether the checkout was dirty, the SHA-256 of relevant GoReview, GoPractice, Repository contract/engine/service/store, GoListen, GoTell, shared brand/font, package, lockfile, and build configuration inputs. It records required scheduling capability modules and verifies that each appears in the emitted bundle's module graph, then hashes each emitted artifact file. A clean Git checkout is required for release mode.

Release builds use the default `GOREVIEW_RELEASE_MODE=release`. A dirty checkout causes the build to stop. Set `GOREVIEW_RELEASE_MODE=developer` explicitly for a local development build; its manifest is marked development-only and cannot pass `--release` verification.

```powershell
vite build -c packages/gopractice/vite.config.ts --mode review
node scripts/goreview-release.mjs verify packages/gopractice/dist-review --release
```

Developer builds can be checked without the release eligibility assertion:

```powershell
$env:GOREVIEW_RELEASE_MODE = 'developer'
vite build -c packages/gopractice/vite.config.ts --mode review
node scripts/goreview-release.mjs verify packages/gopractice/dist-review
```

## Fresh-checkout preparation

Install the locked dependencies at the repository root and in both native shells. The nested installs supply the existing Capacitor CLI/type packages needed by the full TypeScript check; `--ignore-scripts` is sufficient for local typechecking and web verification:

```powershell
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix packages/goreview-ios
npm ci --ignore-scripts --prefix packages/biblia-ios
```

The full typecheck and GoReview preflight also expect the repository's reference assets. They are generated, ignored inputs rather than dependency-install outputs: prepare them with the existing documented toolchains or supply the known local assets before running checks. Relevant paths include language dictionaries under `public/dict/`, Biblia texts under `packages/biblia/public/data/` (see `docs/ecosystem/BIBLIA-STANDALONE.md`), and the Hebrew index at `public/lexicon/he/biblical-index.json` (see `packages/biblia-ios/README.md`). Do not substitute learner databases or other learner data. The GoReview release manifest records SHA-256 values for the reference assets that are incorporated into the build.

For a clean web-only preflight, use the script's existing mode from the repository root:

```powershell
node packages/goreview-ios/scripts/release-preflight.mjs --web-only
```

This runs the prescribed typecheck, regression suites, release-mode GoReview web build and artifact verification, then writes a receipt under `packages/goreview-ios/.preflight/`. Web-only preflight does not call the Repository health endpoint, require Apple ID/signing setup, or compile a native iOS app. Native release preflight has those additional requirements; see `packages/goreview-ios/README.md`.

The manifest provides traceability and integrity checks, not a cryptographic signature. It does not by itself prove that a deployment host served these exact bytes; retain and compare the artifact directory used for any later distribution.
