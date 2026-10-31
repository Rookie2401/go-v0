# GoReview release traceability

The GoReview Vite review build writes `goreview-release-manifest.json` beside the web app. This directory is the shared embedded-web artifact for web and native wrappers; the manifest does not claim that a native package was built, submitted, or released.

The manifest records the Git commit and tree, whether the checkout was dirty, the SHA-256 of relevant GoReview, GoPractice, Repository contract/engine/service/store, GoListen, GoTell, shared brand/font, package, lockfile, and build configuration inputs. It records required scheduling capability modules and verifies that each appears in the emitted bundle's module graph, then hashes each emitted artifact file. A clean Git checkout is required for release mode.

Release builds use the default `GOREVIEW_RELEASE_MODE=release`. A dirty checkout causes the build to stop. Set `GOREVIEW_RELEASE_MODE=developer` explicitly for a local development build; its manifest is marked development-only and cannot pass `--release` verification.

```powershell
vite build -c packages/goreview/app/vite.config.ts --mode review
node scripts/goreview-release.mjs verify packages/goreview/app/dist-review --release
```

Developer builds can be checked without the release eligibility assertion:

```powershell
$env:GOREVIEW_RELEASE_MODE = 'developer'
vite build -c packages/goreview/app/vite.config.ts --mode review
node scripts/goreview-release.mjs verify packages/goreview/app/dist-review
```

## Bundled dependencies and the scheduler

The manifest lists every file under `node_modules` that entered the emitted bundle (`compiledDependencyFiles`, each with its SHA-256) and, additively, groups them by package. A file counts as a dependency whenever its path contains a `node_modules/` segment, even when the package ships its compiled code in a `dist/`, `dist-*/`, `web/` or `build/` folder (as `node_modules/ts-fsrs/dist/index.mjs` does). Only the part of a path inside the repository is tested against the build-output exclusions (`dist*`, `web`, `.review-build`, `.eas-project`), so the repository's own `packages/goreview/app/dist-review/...` is still never a source or a dependency. A `node_modules` that is a symlink or junction (a Git worktree sharing another checkout's install) resolves outside the checkout; its files are recorded as `node_modules/<rest>` all the same.

New fields (every earlier field is unchanged):

- `compiledDependencyPackages`: one entry per bundled package, found from the nearest `package.json` with a version at or above the file (scoped and nested `node_modules` packages included): `name`, the exact installed `version`, `path` (the package folder), `fileCount`, and `sha256`, the hash over that package's bundled `{path, sha256}` entries. A bundled file whose package version cannot be read stops the build.
- `compiledDependencyPackagesSha256`: integrity hash of the list above, like `compiledDependencyManifestSha256` for the file list.
- `scheduler`: `{ library: 'ts-fsrs', version, algorithm, sha256 }`, with `algorithm` read from the `FSRSVersion` the bundled library exports (`v5.4.2 using FSRS-6.0` gives `FSRS-6.0`; if the file does not say, `ts-fsrs@<version>`) and `sha256` the hash of the bundled ts-fsrs files. It is `null` only when the scheduler adapter (`packages/goreview/src/scheduler/fsrs.ts`) was not compiled in; a build that compiled the adapter without a bundled ts-fsrs is refused, and so is a manifest that records none.

```json
"scheduler": { "library": "ts-fsrs", "version": "5.4.2", "algorithm": "FSRS-6.0", "sha256": "4968e995..." },
"compiledDependencyPackages": [
  { "name": "ts-fsrs", "version": "5.4.2", "path": "node_modules/ts-fsrs", "fileCount": 1, "sha256": "4968e995..." }
]
```

`verify` (with or without `--release`) checks the package list against the manifest's own file list, then against the checkout's `node_modules`: an installed package whose version differs from the recorded one is refused by name (`Installed bundled dependency ts-fsrs is 5.4.3 but the artifact was built with 5.4.2`), as are changed package fingerprints, a changed scheduler record, and a missing package. An artifact built before these fields existed is refused with a request to rebuild. Its summary line names the scheduler, for example `scheduler: ts-fsrs 5.4.2 (FSRS-6.0)`.

## Verifying against the checkout

`verify --release` refuses an artifact unless it is release-eligible and the Git commit and tree recorded in its manifest are the HEAD commit and tree of the checkout that contains the artifact source (the repository root, or the `projectRoot` the caller passes). An artifact built at one commit therefore stops verifying as soon as HEAD moves, even by an empty commit; check out the recorded commit and verify again. The message names both commits.

When the artifact has to be checked from a checkout that is not at its build commit, name the build commit explicitly. This is the only escape hatch, it is never a default, and it applies to `--release` only:

```powershell
node scripts/goreview-release.mjs verify packages/goreview/app/dist-review --release --expect-commit <build-commit-sha>
```

With `--expect-commit`, HEAD is not consulted; the manifest must record exactly that commit (a full 40-digit sha, or a prefix of at least 7 digits). The source files and bundled dependencies are still compared with the checkout, so the checkout must hold the same source as the build. Verification without `--release` (developer builds) does not look at HEAD.

The manifest also hashes the native-shell workflow inputs, so changing the native workflow changes the manifest: `packages/goreview-ios/app.json`, `eas.json`, `capacitor.config.ts`, the EAS workflow `.eas/build/*.yml`, `scripts/set-build-version.mjs`, `scripts/prepare-eas-ios-project.mjs`, `scripts/validate-app-icon.mjs`, `scripts/validate-eas-config.mjs`, `scripts/archive-testflight.sh`, and everything under `templates/eas-project/`, in addition to the iOS project files and release scripts it already covered.

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

## Rollback

Nothing here is rolled back by editing the manifest; each place a build is served has its own step. Before re-serving an older build, run `verify --release --expect-commit <that build's commit>` on its artifact directory.

GitHub Pages (`review/`). The Pages publish steps are in `docs/ecosystem/HOSTED-WEB-APPS.md`; the site is the `gh-pages` branch, edited through the `go-v0-pages` worktree. Find the `gh-pages` commit that last held the good `review/` (`git log --oneline -- review`), restore that folder from it, and push the result as a new commit, without a force push:

```powershell
cd C:\Users\CJWal\dev\go-v0-pages
git fetch origin
git restore --source <previous-gh-pages-sha> --staged --worktree -- review
git commit -m "Roll back GoReview review/ to <previous-gh-pages-sha>"
git push origin gh-pages
```

`app/` is not touched. Pages serves the restored files within a minute or two. The service worker (`sw.js`) keeps a learner's cached shell: a client does not leave the shell it holds until it sees a new `BUILD_ID` and the learner taps "Update ready - reload". A rollback re-serves an older `BUILD_ID`, and a client sees that as an update like any other (the id differs from the one it holds), so the same tap applies it. Until then a learner stays on the shell they have, good or bad. The Repository service and the learner's data are not part of the Pages shell and are unaffected.

TestFlight. In App Store Connect, open the app's TestFlight builds and expire the bad build, then point testers at the previous build. Testers who already installed the bad build keep it until they install the other one. Build numbers only go up, so a rollback never reuses an old number; to ship a fix, build with a new, higher `GOREVIEW_BUILD_NUMBER`.

The Repository service on Render. Redeploy the previous commit from the Render dashboard (the service's Deploys list, on the earlier deploy). An event-contract change that is not backward compatible cannot be rolled back by redeploying alone: data already written in the new shape stays in the store, and clients that were updated keep sending the new shape, so the older service may refuse or misread them. Make contract changes backward compatible first, or plan the data step together with the rollback.

## Environment variables

These are the variables the pipeline reads. Each was checked against the scripts that read it.

- `GOREVIEW_RELEASE_MODE`: `release` (the default) or `developer`; `release` stops on a dirty checkout and writes a release-eligible manifest. Read by the Vite plugin and `scripts/goreview-release.mjs`; the native preflight and `prepare-web.mjs` set it for the web build they run.
- `GOREVIEW_SERVICE_URL`: replaces `serviceUrl` in the copy of `config.json` in the web build; https only (http on localhost). Read by `packages/goreview/app/vite.config.ts`. The native pipeline uses `REPOSITORY_SERVICE_URL` instead.
- `GOREVIEW_DICT`: comma-separated dictionary languages to ship and to hash (default `sq,es,de,hi,th`; empty ships none). Read by the Vite config and by the source fingerprint in `scripts/goreview-release.mjs`.
- `GOREVIEW_OUT`: output folder for the web build instead of `dist-review`; the native preflight and `prepare-web.mjs` set it for their scratch builds.
- `REPOSITORY_SERVICE_URL`: the public HTTPS Repository address baked into the native bundle; required for native release preparation, `build-eas-project.mjs` and `archive-testflight.sh`.
- `REPOSITORY_HEALTH_CHECK_URL`: optional address this machine uses for the pre-build `/health` check when the public name is not reachable from it; the bundle still carries `REPOSITORY_SERVICE_URL`. Read by `prepare-web.mjs`.
- `GOREVIEW_BUNDLE_ID`: the reverse-DNS Bundle ID registered in the Apple Developer account; required for release preparation, `build-eas-project.mjs` and `archive-testflight.sh`, and used as the app id in `capacitor.config.ts`.
- `GOREVIEW_BUILD_NUMBER`: a positive integer greater than the last uploaded build; required by `build-eas-project.mjs` and `archive-testflight.sh`.
- `GOREVIEW_MARKETING_VERSION`: the user-visible version, like `1.0` or `1.0.1`; optional (default `1.0.0` in `build-eas-project.mjs`, `1.0` in `archive-testflight.sh`).
- `BIBLIA_SERVICE_URL`: the same service-address override for the Biblia standalone web build (`packages/biblia/vite.config.ts`); the GoReview build does not read it.
- `BIBLIA_OUT`: output folder for a Biblia build; `prepare-web.mjs` sets it so the nested Biblia build lands in the native web payload.
- `EAS_NO_VCS`: set to `1` for the EAS cloud build so EAS does not use the containing monorepo's Git. Read by EAS CLI, not by the repository's scripts; `packages/goreview-ios/README.md` shows where to set it.
- `EAS_PROJECT_ROOT`: the path of the standalone `.eas-project/` stage, so EAS uploads that folder as the project root. Read by EAS CLI, set as the same README shows.
