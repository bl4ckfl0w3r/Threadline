import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseContext } from '../scripts/release-context.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha };
test('production accepts exact main push and manual dispatch in detached checkout', () => {
  assert.equal(releaseContext(env, '', sha).revision, sha);
  assert.equal(releaseContext({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, '', sha).branch, 'main');
});
test('production rejects PR events, other branches and mismatched revisions', () => {
  for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_SHA: 'b'.repeat(40) }]) {
    assert.throws(() => releaseContext({ ...env, ...change }, 'main', sha));
  }
});
test('local deployments require main and competing native builds are rejected', () => {
  assert.equal(releaseContext({}, 'main', sha).revision, sha);
  assert.throws(() => releaseContext({}, 'feature', sha));
  assert.throws(() => releaseContext({ WORKERS_CI_BRANCH: 'main' }, 'main', sha));
});
