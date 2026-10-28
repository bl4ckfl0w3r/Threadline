# Threadline

A React/Vinext application with a Cloudflare Workers backend and D1 storage.

## Local setup

Use Node 22.13 or later and the pnpm version pinned in `package.json`.

1. Install dependencies with `pnpm install`.
2. Configure server credentials locally in `.dev.vars`. The server reads `QLOO_API_KEY` and, for the optional model connection, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_API_KEY` and `MODEL_REASONING_EFFORT`. The model adapter uses a chat-completions endpoint with JSON output. Never prefix secrets with a browser-exposed environment prefix.
3. Run `pnpm build` to produce the local Worker configuration.
4. Apply the SQL files in `drizzle/` to the local `DB` binding, in order. Use Wrangler with `--local --config dist/server/wrangler.json --persist-to .wrangler/state`.
5. Start with `pnpm dev -- --port 5180` and open the printed local URL.

The development server supports a local preview identity. The deployed preview uses signed, Secure, HttpOnly browser sessions without a login screen. Cases are scoped to the session; supplied identity headers cannot choose another owner. Clearing the session cookie or moving browsers loses access to that workspace, so export important work. Sessions last 30 days and renew during active use. Production fails closed if its signing secret is missing. Cloudflare Access remains an optional alternative mode.

`SOURCE_ALLOWED_HOSTS` controls which public HTTPS hosts the server may read. Source URLs outside that allowlist remain available for manual opening and excerpt attachment.

Optional recorded examples are local files under `data/recorded/`. They are excluded from Git; without them the application opens a fictional starter case without recorded results. Fresh cases and live tools do not require recordings.

## Application routes

- `/` — entry with separate workspace and guided-demo choices.
- `/workspace` — saved cases, cultural references, candidate results, sources and enquiry drafting.
- `/demo` — a replay of an optional locally installed recording; it does not call a live model.

The colour tokens are centralised in `app/theme.css`. Interface styling is in `app/globals.css`; the workspace views and state hook are in `components/threadline/`.

## Current limitations

The model adapter requires separately configured server credentials. A successful build does not establish that model access, production sessions or a real D1 database is configured. Production deployment needs those bindings and a session-signing secret (or an Access policy in that optional mode).

## Cloudflare deployment

Create a separate production D1 database and apply every migration in `drizzle/`; do not upload the local case database. Keep version preview URLs disabled. The default deployment mode is `browser-session`, which requires a random server-only `SESSION_SIGNING_KEY` of at least 48 characters.

Store a deployment profile in ignored `private/cloudflare.json` with `worker_name`, `account_id`, `database_name`, `database_id` and `auth_mode` (`browser-session`). These are deployment identifiers; signing and provider keys belong in Worker secrets, never in this file or `vars`. Optional `cloudflare-access` mode additionally needs `access_team_domain`, `access_aud` and an Access allow policy.

After `pnpm build`, run `node scripts/prepare-cloudflare.mjs private/cloudflare.json`. This creates an ignored production configuration without changing the local placeholder binding. Use `dist/server/wrangler.production.json` for remote D1 migrations, secret configuration and deployment. Verify session creation, tampered-cookie rejection, ownership isolation, usage limits, response headers and browser operation after deployment. Authorising Cloudflare CLI access is separate from signing in to its website.

HTML metadata, Worker responses and static-asset headers request `noindex`. `robots.txt` allows crawlers to see these directives rather than hiding them behind a conflicting crawl prohibition. Search exclusion is not access control. Anyone with the link can open the preview, while case access requires the owning browser session. Server limits cap session/case creation, API requests and provider attempts; the network address used for request limits is stored only as a keyed hash. Daily provider limits are 200 attempts per workspace and 1,000 across the preview, including a separate 100-attempt model cap. These limits also count failed attempts and may conservatively reserve capacity before an attempted call fails.

The recorded demo data, local case database and internal handoff are intentionally absent from a clone. The curated fictional demo lives in the production D1 `demo_assets` table, independent of application builds. `/api/demo` returns an explicit unavailable response when a compatible recording is not installed. Do not add fabricated provider results to make a clean clone look live. The fallback starter is only a blank fictional example.

## Repository handling

Keep credentials in server-side configuration and preserve the private-file exclusions in `.gitignore`. Review reachable Git history as well as the current files before publishing. Private repository visibility does not make it appropriate to commit credentials, local case data or research records.

Third-party notices remain alongside their vendored sources. An application-wide open-source licence has not yet been selected.

## Checks

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Internal planning documents, research archives, local database files, exports and credentials are intentionally excluded from this repository. Do not force-add them.

## Reproducible production releases

GitHub Actions is the release path. PR validation runs tests, typecheck and build without production secrets. The production workflow validates pushes to `main`, including merged PRs, then applies outstanding migrations, deploys and verifies the exact live revision. Manual dispatch is restricted to main. Do not enable native Cloudflare Workers Builds alongside Actions.

Set repository variables `CLOUDFLARE_ACCOUNT_ID`, `THREADLINE_WORKER_NAME`, `THREADLINE_DATABASE_NAME`, `THREADLINE_DATABASE_ID`, and `THREADLINE_PRODUCTION_URL`. Set the Actions secret `CLOUDFLARE_API_TOKEN` with Workers Scripts edit and D1 edit on the deployment account. Runtime Qloo/model/session keys stay in Cloudflare Worker secrets. PR jobs and build steps receive no production token. Node is pinned to 26.2.0; pnpm uses package.json; Actions are pinned to verified commit SHAs.

Production runs serialize without cancelling in-progress releases. Superseded commits are skipped before deployment. Post-deploy checks cover revision equality, noindex, sessions, D1, owner isolation and recorded demo availability. Failure marks the release failed; it does not automatically roll back data. Inspect failed job logs before rerunning. Migrations must remain compatible with the previous deployed version during rollout.

For an explicitly authorized emergency release from clean, published main, run `pnpm run build:production -- private/cloudflare.json`, set `THREADLINE_PRODUCTION_URL`, and run `pnpm run deploy:production`. Verify the live `X-Threadline-Revision` matches GitHub main. Ordinary releases preserve cases, receipts, runtime secrets and the curated D1 demo; never seed the demo on every deployment.

## CLI task and review runbook

Use official `gh` and `jules` CLIs with credentials outside Git. Stitch CLI supports Loop workspace context, priorities and insights; do not enable standing background suggestions or upload private archives automatically. Local `.stitch.json` is ignored.

1. Fetch origin/main and write a compact reviewed task brief in ignored private/: problem, relevant files, acceptance checks and intentional constraints. Require a feature branch and PR, never direct main changes.
2. Dispatch once with `node scripts/jules-task.mjs dispatch task-id private/brief.md`. Record its session using `session task-id SESSION_ID`, and PR using `pr task-id NUMBER`. An interrupted submission is unconfirmed: inspect `jules remote list --session` before any retry. Never apply Jules patches onto main.
3. Inspect `gh pr view NUMBER --json headRefOid,files,statusCheckRollup`, `gh pr diff NUMBER`, and `gh pr checks NUMBER`. Read only relevant failed job logs. Review behavior as well as passing CI.
4. Send actionable feedback to the same Jules session through supported CLI commands or the documented Jules API. Before each correction, run `node scripts/jules-task.mjs correction task-id`. Maximum two rounds, then report remaining issues. Keep API keys out of arguments, logs and Git.
5. After review and green checks, use `gh pr merge NUMBER --merge --match-head-commit REVIEWED_SHA`. No unattended merges. Inspect the production run and verify its revision. The current private GitHub plan does not support required branch protection, so this review gate is operator-enforced.
6. With a clean local checkout, switch to main, fetch and `git merge --ff-only origin/main`. Stop on divergence or uncommitted changes instead of resetting or force-pushing.

Task state remains under ignored private/jules-tasks/. No recurring task dispatch or model-driven polling is configured. Use compact run listings and targeted logs. Preserve browser sessions without login, noindex, server-only secrets, evidence provenance, and honest recorded-demo labels.
