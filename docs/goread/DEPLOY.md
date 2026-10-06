# GoRead on Cloudflare — the keeper's steps

This puts the team server (`docs/goread/BACKEND.md`, contract v3) on Cloudflare's free plan: a Worker (the code) and a D1
database (the shelf and the list of people allowed to add). Run every command from the repository root
(`C:\Users\CJWal\dev\go-v0`). Nothing here installs anything into the project: `npx` fetches `wrangler` when it is run.

## One-time setup

1. **Make a free Cloudflare account** at https://dash.cloudflare.com/sign-up (an email and a password; no card needed
   for the free plan).
2. **Log in from the terminal** (opens a browser tab to approve):
   ```
   npx wrangler login
   ```
3. **Create the database.** It prints a `database_id`; copy it:
   ```
   npx wrangler d1 create goread
   ```
4. **Make your config.** Copy the example, then open `wrangler.toml` and replace `<paste the id from: npx wrangler d1 create goread>`
   with the id from step 3 (keep the quotes):
   ```
   copy server\goread\wrangler.toml.example wrangler.toml
   ```
   `wrangler.toml` holds only your database id, but leave it out of commits unless you want it public.
5. **Create the tables** (safe to run again):
   ```
   npx wrangler d1 execute goread --remote --file server/goread/schema.sql
   ```
6. **Deploy the Worker.** It prints the Worker's address, like `https://goread.<your-name>.workers.dev`:
   ```
   npx wrangler deploy
   ```
7. **Check it answers** (replace the address with yours; expect `{"ok":true,"service":"goread","version":1}`):
   ```
   curl https://goread.<your-name>.workers.dev/health
   ```

## Letting someone add texts

Everyone can read every team's texts. Adding needs a **contributor key**, one per person per team, made by you.

8. **Make a key and its SQL.** The SQL goes to `add.sql`; the key is printed on screen (stderr) and **is not stored
   anywhere** — copy it now and send it to the person privately (only its hash is in `add.sql`):
   ```
   npx vite-node server/goread/admin.ts whitelist add --team honduras-es --name "Ana" --sql > add.sql
   ```
   Teams: `honduras-es`, `albania-sq`, `thailand-th`, `india-hi`, `germany-de`. The name is what the shelf shows as
   "Added by". Use a different name for each person on a team.
9. **Put the person on the list:**
   ```
   npx wrangler d1 execute goread --remote --file add.sql
   ```
   Then delete `add.sql` (it holds no key, but there is no reason to keep it).
10. **The person** opens Go, Settings → Team sharing, enters the Worker's address and their contributor key. The status
    line then says "You can add texts to the Honduras team as Ana."

### Taking someone off the list

Revoke one person (their texts stay on the shelf, only adding stops):
```
npx vite-node server/goread/admin.ts whitelist revoke --team honduras-es --name "Ana" --sql > revoke.sql
npx wrangler d1 execute goread --remote --file revoke.sql
```
To see who is on a team's list (names and dates, never keys):
```
npx vite-node server/goread/admin.ts whitelist list --team honduras-es --sql > list.sql
npx wrangler d1 execute goread --remote --file list.sql
```
A revoked name cannot be added again; give that person a new name (for example "Ana 2") and a new key.

### Removing a text

Nothing in the app removes a text; only you can, in the database (the id is the text's own id, e.g. `el-viajero-ch01`):
```
npx wrangler d1 execute goread --remote --command "DELETE FROM texts WHERE course = 'honduras-es' AND id = 'el-viajero-ch01'"
```

## Updating the Worker later

After the code changes in the repository, run step 6 again (`npx wrangler deploy`). The database is untouched.

## What the free plan allows (check the current limits)

Figures from Cloudflare's documentation as I know it; **check the current limits** at https://developers.cloudflare.com/workers/platform/limits/
and https://developers.cloudflare.com/d1/platform/limits/ before relying on them.

- **Workers (free):** about 100,000 requests per day, and about 10 ms of CPU time per request (waiting for the database
  does not count as CPU). That is why the Worker runs the **light** document check only (measured at a few
  milliseconds for the largest chapter of a 300 KB novel). A text that passes it but is broken more deeply is still turned
  away by the importer inside every app that fetches it.
- **D1 (free):** about 5 GB of storage in total (500 MB per database), about 5 million rows read and 100,000 rows written
  per day. A chapter is tens of kilobytes, so thousands of chapters fit.
- Past a limit, requests are refused until the next day (the free plan does not bill); reading and adding resume then.

## If something goes wrong

- `npx wrangler deploy` says no `wrangler.toml`: step 4 (the file must be in the repository root, named exactly that).
- `/health` works but a PUT answers `401 not-on-whitelist`: the key is wrong, was revoked, or is on another team's list.
- `UNIQUE constraint failed` running `add.sql`: that name is already on the team's list; use another name.
- Running the same server on your own machine instead (no Cloudflare): `npx vite-node --config server/goread/vite.config.ts server/goread/main.ts --port 8787 --data data/goread`,
  and the same keeper commands without `--sql` (`... whitelist add --team honduras-es --name "Ana"` writes to `data/goread`).
