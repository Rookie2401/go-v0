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

The manifest provides traceability and integrity checks, not a cryptographic signature. It does not by itself prove that a deployment host served these exact bytes; retain and compare the artifact directory used for any later distribution.
