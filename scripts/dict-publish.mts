/// <reference types="node" />
/**
 * npm run dict:publish -- [--src public/dict] [--dest <dir | user@host:/path>] [--langs de,es] [--full-shards keep|gzip|plain]
 *                         [--dry-run] [--prune]
 *
 * Checks the built dictionaries (every manifest against the shard files it names) and publishes them to a host that is not
 * GitHub Pages. The destination is --dest, else the environment variable DICT_PUBLISH_TARGET: a directory (the web root a Caddy
 * `file_server` serves, see infra/repository/Caddyfile.dict) or an rsync/scp target (`deploy@host:/srv/dict`). The tree under
 * <dest> is `<lang>/manifest.json`, `<lang>/s-xx.json`, `<lang>/full/...`, so <dest> itself is the dictionary location:
 * serve it at https://<host>/dict/ and give the apps that URL (docs/ops/DICTIONARIES.md).
 *
 * --dry-run does the check and prints the plan, writes nothing and contacts nothing. --full-shards gzip stores the full
 * shards as f-xx.json.gz (the German set drops from ~139 MB to ~30 MB); keep (default) sends them as built.
 * Shards go first and manifests last. Never sends anything but dictionary files. The source tree is never modified.
 */
import { publish, type FullShards } from '../src/dict/publish-node';

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
const known = new Set(['src', 'dest', 'langs', 'full-shards', 'dry-run', 'prune', 'help']);
const bad = args.filter((a) => a.startsWith('--') && !known.has(a.slice(2)));
const USAGE = 'usage: npm run dict:publish -- [--src public/dict] [--dest <dir | user@host:/path> (or DICT_PUBLISH_TARGET)] [--langs de,es] [--full-shards keep|gzip|plain] [--dry-run] [--prune]';
if (flag('help') || bad.length) { console.error(`${bad.length ? `unknown option ${bad[0]}\n` : ''}${USAGE}`); process.exit(bad.length ? 2 : 0); }

const dest = opt('dest') ?? process.env.DICT_PUBLISH_TARGET;
const fullShards = (opt('full-shards') ?? 'keep') as FullShards;
if (!dest) { console.error(`no destination: pass --dest or set DICT_PUBLISH_TARGET\n${USAGE}`); process.exit(2); }
if (!['keep', 'gzip', 'plain'].includes(fullShards)) { console.error(`--full-shards must be keep, gzip or plain\n${USAGE}`); process.exit(2); }
const langs = opt('langs')?.split(',').map((s) => s.trim()).filter(Boolean);

const r = publish({ src: opt('src') ?? 'public/dict', dest, ...(langs ? { langs } : {}), fullShards, dryRun: flag('dry-run'), prune: flag('prune') });
process.exit(r.ok ? 0 : 1);
