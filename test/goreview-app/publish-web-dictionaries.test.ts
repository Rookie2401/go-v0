// The hosted GoReview (Pages review/) is built by .github/workflows/publish-web.yml. When that build copies no dictionary
// (GOREVIEW_DICT empty), review/ has none of its own and must be pointed at the shared tree beside it, or every card loses
// its meaning: from 2026-11-21 to 2026-11-26 the hosted config said "./" and each dict/<language>/ request answered 404.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(path.resolve('.github/workflows/publish-web.yml'), 'utf8');

/** The env lines of the step whose run builds GoReview's review edition. */
function reviewBuildEnv(): Map<string, string> {
  const steps = workflow.split(/\n\s*- name: /u);
  const step = steps.find((s) => /vite build -c packages\/goreview\/app\/vite\.config\.ts --mode review/u.test(s));
  if (!step) throw new Error('publish-web.yml has no GoReview review build step');
  const env = new Map<string, string>();
  for (const m of step.matchAll(/^\s+(GOREVIEW_[A-Z_]+):\s*(.*)$/gmu)) env.set(m[1]!, m[2]!.replace(/^'(.*)'$/u, '$1').trim());
  return env;
}

describe('the hosted GoReview build in publish-web.yml', () => {
  it('points review/ at the shared dictionaries whenever it ships none of its own', () => {
    const env = reviewBuildEnv();
    const shipsNone = env.has('GOREVIEW_DICT') && env.get('GOREVIEW_DICT') === '';
    if (!shipsNone) return; // a build that bundles its dictionaries reads them from ./
    expect(env.get('GOREVIEW_ASSET_BASE')).toBe('../');
  });

  it('keeps the Repository service address the other builds use', () => {
    expect(reviewBuildEnv().get('GOREVIEW_SERVICE_URL')).toBe('https://go-v0.onrender.com');
  });
});
