export function releaseContext(env, localBranch, head) {
  if (env.GITHUB_ACTIONS === 'true') {
    if (!['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) throw new Error('Unsupported production event.');
    if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Only main can deploy production.');
    if (env.GITHUB_SHA !== head) throw new Error('GitHub event revision differs from checkout.');
    return { branch: 'main', revision: head };
  }
  if (env.WORKERS_CI_BRANCH || env.WORKERS_CI_COMMIT_SHA) throw new Error('Native Cloudflare builds are disabled; use GitHub Actions.');
  if (localBranch !== 'main') throw new Error('Only main can deploy production.');
  return { branch: localBranch, revision: head };
}
