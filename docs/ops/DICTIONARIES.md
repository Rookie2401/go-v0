# Dictionaries: build, verify, publish, host

Status: 2026-10-17. The dictionaries are **built data** (`public/dict/` is git-ignored; the Wiktionary/kaikki sources are in
`data/dictionaries/`, also git-ignored). Two shard sets per language, both read lazily, one shard per lookup:

| | files | built by | size (all five languages) |
|---|---|---|---|
| Level 1, schema 3 | `public/dict/<lang>/manifest.json`, `s-<hh>.json`, `frequency.json` | `npm run dict:build` | 122 MB, already hosted on GitHub Pages |
| Level 2, `full-2` (was `full-1`) | `public/dict/<lang>/full/manifest.json`, `f-<hh>.json` or `f-<hh>.json.gz` | `npm run dict:build-full -- <lang>` | **285 MB plain, 65 MB gzipped** (was 780 MB as `full-1`) |

Schemas: `docs/ecosystem/linguistics/LEXICAL-SCHEMA.md` (section 2b is `full-2`). Counts and sizes per language:
`docs/ecosystem/linguistics/SOURCE-INVENTORY.md`.

## 1. Build

```
npm run dict:build-full -- de                 # data/dictionaries/kaikki.org-dictionary-German.jsonl[.gz] -> public/dict/de/full (plain full-2)
npm run dict:build-full -- de --gzip          # f-xx.json.gz at rest instead (manifest "gzip": true)
npm run dict:build-full -- es --limit 50000   # a sample, to a temporary directory
npm run dict:build-full -- de --out data/dictionaries/next --date 2026-10-17   # build beside the live set, then verify, then swap
npm run dict:build-full -- de --schema full-1 # the old format (still readable by every reader)
```

Measured 2026-10-17 on this PC: Albanian 2 s, Thai 1 s, Hindi 5 s, Spanish 20 s (815 MB peak), German 28 s (887 MB peak). The
German and Spanish kaikki files are streamed, never held whole. The same input and date give byte-identical files (gzip level 9, no
timestamp), and `rev` in the manifest (12 hex digits) is a hash of the shard **text**, so the plain and gzip layouts of one build share it.

What `full-2` does to the records (no information lost): each shard has a table of its distinct tag sets and every form row refers
to one by number instead of repeating the tag array; the frequent strings (grammar tags, a form's source, etymology template names and
language codes, the Wikimedia Commons audio url prefix) are numbered once per dictionary in the manifest; exact duplicate form rows are
dropped; the manifest lists the occupied buckets as a bitmap instead of every file name. The reader expands it back to the identical
`FullRecord` (`PackRuntime.entry()` and `packages/golearn-extension/src/content/enrich.ts` are unchanged).

## 2. Verify before replacing a live set

```
npm run dict:verify-full -- de --old data/dictionaries/old-full-1 --new public/dict        # defaults: --old public/dict, --new data/dictionaries/next
```

Reads **every shard of both** (any schema, plain or gzip), compares every lemma key and every record, checks that each key is in
the bucket its hash says and that the manifest counts agree, and prints the before/after table (records, bytes raw and on disk, the
largest shard, the manifest, and the cold-fetch bytes of one lemma, the same lemma on both sides, `--lemma` to pick another). Exit 1
on any difference. On 2026-10-17 all five languages came out identical (0 differing keys); the old `full-1` folders were kept in
`data/dictionaries/old-full-1/` (git-ignored, 780 MB, delete when satisfied).

Tests: `npx vitest run test/dict test/language-packs test/extension/entry.integration.test.ts` (469 tests): the format round trip,
tag-set interning, gzip at rest read in Node, `full-1` and `full-2` side by side, the size regression guard (a 20,000-record synthetic
build must be at least 60 % smaller than `full-1` in text and at least 85 % on disk when gzipped), and the publish script's dry run.
The extension test reads the real shards in `public/dict` when they are built.

## 3. The two layouts, with the measured numbers

| bytes on disk (shards + manifest) | `full-1` (before) | `full-2` plain | `full-2` gzip at rest |
|---|---|---|---|
| Albanian `sq` (14,471 records) | 28.8 MB | 10.9 MB (-62 %) | 2.8 MB (-90 %) |
| Thai `th` (20,860) | 11.4 MB | 10.8 MB (-5 %) | 3.1 MB (-73 %) |
| Hindi `hi` (26,036) | 85.5 MB | 42.7 MB (-50 %) | 7.6 MB (-91 %) |
| German `de` (102,649) | 409.1 MB | 139.0 MB (-66 %) | 30.1 MB (-93 %) |
| Spanish `es` (123,933) | 244.5 MB | 81.4 MB (-67 %) | 21.3 MB (-91 %) |
| **five languages** | **779 MB** | **285 MB** | **65 MB** |
| `dict/` tree with the 122 MB of schema-3 shards | 901 MB | 407 MB | 187 MB |

| one lemma, cold (manifest + its shard) | `full-1` | `full-2` plain | `full-2` gzip |
|---|---|---|---|
| German "moribund": stored / on the wire | 171 kB / 18.8 kB gzipped by the host | 61 kB / 14.2 kB | 19 kB / 19 kB |
| Spanish "gúrida": stored / on the wire | 151 kB / 16.8 kB | 44 kB / 12.2 kB | 17 kB / 17 kB |
| largest German shard | 261 kB | 115 kB (23 kB gzipped) | 23 kB |
| German manifest | 74 kB | 7 kB | 7 kB |

Which layout where:

- **plain** (`f-xx.json`): every client reads it, including the extension's text-caching shard fetch. The host should compress it on the wire
  (GitHub Pages does; Caddy `encode zstd gzip` does). **This is what `public/dict` holds and what the builder writes by default.**
- **gzip at rest** (`f-xx.json.gz`, manifest `"gzip": true`): what to store on a host that serves bytes and bills or limits by size
  (GitHub Pages' repository limit). Make it at publish time: `npm run dict:publish -- --full-shards gzip ...` (the source tree is not touched).
  The reader inflates with `DecompressionStream('gzip')` (browser, worker, Node), takes a body the server already decoded, and tries the
  plain name if the `.gz` is a 404.
- **The extension and gzip at rest.** `createShardFetch` in `packages/golearn-extension/src/background/gloss.ts` keeps every shard in
  `chrome.storage.local` as JSON text. Since 2026-10-17 it reads the body as bytes and inflates a gzip body BEFORE storing it (the
  reader's `bytesToText`), and keys the row by the file name without `.json`/`.json.gz` but with the `?v=<rev>`, so a new revision never
  serves the old shard (`test/extension/gloss.test.ts`, "a gzipped full-2 shard"). Both layouts therefore work for the extension too;
  an extension built before that date needs the plain layout.

## 4. Where to host: two options, with numbers

### (a) GitHub Pages, as today

The German and Spanish full records now fit. Adding the full set to what Pages already carries (the schema-3 shards, 122 MB):

| | `dict/` total | added over today |
|---|---|---|
| gzip at rest | **187 MB** | +65 MB |
| plain | 407 MB | +285 MB |

GitHub's limits are 1 GB for the published site and a soft 1 GB for the repository; the gh-pages branch also carries the apps, so the
**gzip layout (187 MB) fits comfortably and the plain layout (407 MB) fits but leaves little room**. Recommended on Pages: publish the
gzip layout; the extension (built on or after 2026-10-17) reads it as well (section 3). The deploy is the owner's: this work only produced the
files (`npm run dict:publish -- --dest <checkout of gh-pages>/dict --full-shards gzip --dry-run`, then without `--dry-run`).
Pages cannot set headers, so shards are cached by the browser's heuristic and revalidated; `?v=<rev>` still changes the URL per build.

### (b) A host you control (Caddy), the recommended place for the extension

`infra/repository/Caddyfile.dict` is a Caddy snippet, `dict_static`, that serves `/dict/*` from a directory: zstd and gzip on the wire for
plain JSON, a gzip shard left alone, CORS for any origin (the dictionaries are public CC BY-SA data; the extension's worker and the apps
need no credentials) and these cache headers:

| path | Cache-Control |
|---|---|
| `<lang>/manifest.json`, `<lang>/full/manifest.json`, `<lang>/frequency.json` | `public, max-age=300, must-revalidate` |
| full shards requested with `?v=<rev>` (the reader adds the manifest's `rev`) | `public, max-age=31536000, immutable` |
| other shards (`s-xx.json`, unversioned) | `public, max-age=86400, stale-while-revalidate=604800` |

Because the shard URL carries the content hash, a republished dictionary changes the manifest (5 minutes), the manifest changes `rev`,
and the browser fetches new shards under new URLs; unchanged builds never refetch.

Steps (the snippet has not been run against a live Caddy in this repo: run `caddy validate` first):

1. Put the snippet next to the repository Caddyfile (`import` it or paste it) and add, **before** the catch-all `reverse_proxy`:
   ```
   repo.golearn-global-languages.com {
       import dict_static /srv/golearn/dict
       reverse_proxy 127.0.0.1:8790 { flush_interval -1 }
   }
   ```
   or a dedicated host: `dict.golearn-global-languages.com { import dict_static /srv/golearn/dict }`. Today `repo.` is a named Cloudflare
   tunnel to the owner's PC (`infra/cloudflare/README.md`); the tunnel can point at the same Caddy, and Cloudflare will then cache the immutable shards too.
2. Publish: `DICT_PUBLISH_TARGET=/srv/golearn/dict npm run dict:publish -- --dry-run`, then without `--dry-run`. The target can also be an
   rsync/scp destination (`deploy@host:/srv/golearn/dict`; rsync, else scp; run it from Git Bash/WSL where `rsync` exists). `--langs de,es`
   limits it, `--prune` removes dictionary shards the tree no longer has (a directory target only), `--full-shards plain|gzip|keep` picks
   the layout (default `keep`: as built). Use `plain` for the extension, since the host then compresses on the wire (285 MB on disk, ~14 kB per cold lemma).
3. Check: `curl -sI https://repo.golearn-global-languages.com/dict/de/full/manifest.json` (200, `Access-Control-Allow-Origin: *`,
   `max-age=300`), then a shard with `?v=<rev from the manifest>` (`immutable`).

`dict:publish` checks first and sends nothing if a check fails: every schema-3 and full manifest against the shard files it names (a
missing or empty file, an unreadable manifest, a full-2 manifest without `rev` or `occupied`). It sends **shards first and manifests last**
(so a reader that fetches a new manifest finds its shards), skips files already identical at a directory target, copies through a temporary
name and a rename, and only ever sends dictionary files. `--dry-run` prints the plan and writes and contacts nothing.

## 5. Which address the apps use

The runtime appends `dict/<lang>/...` to the configured base (`PackRuntime`: base + the pack's dictionary root `dict`), so the **base is the
host's origin with a trailing slash**, not the `/dict/` folder:

| consumer | key | now | with a host you control |
|---|---|---|---|
| the extension's reader app, `packages/golearn-extension/app/config.json` | `dictionaryFallbackUrl` (https, no query or fragment; also read by the worker) | `https://rookie2401.github.io/go-v0/` | `https://repo.golearn-global-languages.com/` (snippet inside the repository site) or `https://dict.golearn-global-languages.com/` (dedicated host) |
| GoPractice / GoReview, `config.json` | `assetBaseUrl` (the apps' own folder by default, `./`) | `./` | the same two values to read the dictionaries from the host instead of the app's folder |

Both hosts answer `https://<host>/dict/<lang>/manifest.json`, `.../full/manifest.json` and the shards. The values are **documented, not
set**: the configs belong to the extension and app lanes. CORS is open, so neither the worker nor the page needs a host permission
prompt for it.
