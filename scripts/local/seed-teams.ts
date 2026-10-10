/**
 * NOT NEEDED BY THE APPS ANY MORE. Any learner picks any language freely, there are no mission teams in GoLearn, GoPractice or the popup, and an
 * account is optional, so the local test flow (docs/TEST-ON-THIS-PC.md) has no seeding step. This helper is kept because the Repository service
 * itself still stores teams (its own tests and an operator may use them); it is harmless, and nothing calls it.
 *
 * Local testing helper: creates the six mission teams in the local Repository database and, with `--member <email>`,
 * adds that account's learner to every team (a team leader's act, done here by hand because there is no admin UI yet).
 *
 *   npm run local:seed                              # teams only
 *   npm run local:seed -- --member you@example.org  # after creating the account in the GoLearn setup page
 *
 * Works on the SQLite file the local service uses (data/local-repository/repository.sqlite); the service may be running.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openSqliteStore } from '../../packages/repository-store/src';

const DATA = path.resolve('data/local-repository');
const MIGRATIONS = path.resolve('packages/repository-store/migrations');
const TEAMS = [
  ['albania', 'Albania'], ['honduras', 'Honduras'], ['germany', 'Germany'], ['india', 'India'], ['thailand', 'Thailand'], ['norway', 'Norway'],
] as const;

async function main(): Promise<void> {
  fs.mkdirSync(DATA, { recursive: true });
  const store = openSqliteStore(path.join(DATA, 'repository.sqlite'), { migrationsDir: MIGRATIONS });
  const now = new Date().toISOString();
  for (const [teamId, name] of TEAMS) await store.putTeam({ teamId, name, createdAt: now });
  console.log(`teams: ${TEAMS.map(([id]) => id).join(', ')}`);
  const i = process.argv.indexOf('--member');
  if (i >= 0) {
    const email = process.argv[i + 1];
    if (!email) throw new Error('--member needs an email');
    const account = await store.getAccountByEmail(email.trim().toLowerCase());
    if (!account) throw new Error(`no account for ${email}: create it in the GoLearn setup page first`);
    for (const [teamId] of TEAMS) await store.putTeamMember(teamId, account.learnerId, 'member', now);
    console.log(`${email} is now a member of every team (learner ${account.learnerId})`);
  }
  await store.close();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
