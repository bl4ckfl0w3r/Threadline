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

## Model request protection

Model calls have server-enforced limits of 24 attempts per browser identity per UTC day, 24 per HMAC-hashed network address per UTC day, 12 per network address per minute, and 100 globally per UTC day. Required allowances reserve atomically before a provider request. Changing cases or clearing cookies does not reset the network allowance; unknown network identity uses a shared fallback allowance. Context is capped at 64,000 UTF-8 bytes before charging a request, legacy provider rows are omitted, output is capped at 3,000 tokens, redirects are refused, and calls time out after 60 seconds. Clients cannot supply model credentials, endpoint, model ID or generation limits. Public users can spend within these bounds; quotas do not establish a verified human identity.

## Repository handling

Keep credentials in server-side configuration and preserve the private-file exclusions in `.gitignore`. Review reachable Git history as well as the current files before publishing. Private repository visibility does not make it appropriate to commit credentials, local case data or research records.

Third-party notices remain alongside their vendored sources. The application is released under the MIT License; see `LICENSE`.

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

Use official `gh` and `@google/stitch` CLIs with credentials outside Git. Internal Jitro is Stitch Loop at https://jules.google.com/jitro; the public Jules CLI is a different service. Run `stitch login`, `stitch enable loop`, then `stitch find workspaces --json`. Reuse the existing Threadline workspace (`8f3fbf76-6c1b-4a80-bb21-d33fc984f277`); never create a duplicate. Local `.stitch.json` and `.stitch/` are ignored.

Stitch 0.12.0 documents workspace, priority, context, insight and solution management, and deliberately excludes task/activity resources from its CLI surface. Internal Jitro documentation separately supports solution-based tasks through its internal CLI, SDK and MCP. The official Stitch package also bundles the SDK task mappings, and authenticated read-only task lookup has been verified against the internal API. Use only documented internal methods whose route and payload are confirmed; do not substitute the public Jules CLI or modify Stitch CLI guards. A task must implement an appropriately scoped solution. Do not attach an unrelated brief to an existing product solution or create a standing priority to work around a missing match. Browser authentication or permission steps belong to the operator.

1. Fetch origin/main and write a compact reviewed task brief in ignored private/: problem, relevant files, acceptance checks and intentional constraints. Require a feature branch and PR, never direct main changes.
2. Prepare a local record with `node scripts/loop-task.mjs prepare task-id private/brief.md`. This records the starting SHA and brief hash; it does not dispatch. After an explicitly authorized submission exactly once through the supported internal SDK/API or the solution card’s Start task control, record `task task-id INTERNAL_TASK_ID` and `pr task-id NUMBER`. An interrupted submission is unconfirmed: inspect the existing internal task before any retry. Never apply generated patches onto main.
3. Inspect `gh pr view NUMBER --json headRefOid,files,statusCheckRollup`, `gh pr diff NUMBER`, and `gh pr checks NUMBER`. Read relevant failed job logs and review behavior as well as passing CI.
4. If correction is needed, record `node scripts/loop-task.mjs correction task-id` before feedback. Send actionable feedback to the same internal task through the documented internal SDK/API (for example, task.sendMessage), or ask the operator to use its task chat. The public Jules CLI is a different service. Maximum two rounds, then report remaining issues. Keep API keys out of arguments, logs and Git.
5. After Codex review and green checks, use `gh pr merge NUMBER --merge --match-head-commit REVIEWED_SHA`. No unattended merges. Inspect the production run and verify its revision. The current private GitHub plan does not support required branch protection, so this review gate is operator-enforced.
6. With a clean local checkout, switch to main, fetch and `git merge --ff-only origin/main`. Stop on divergence or uncommitted changes instead of resetting or force-pushing.

Task state remains under ignored private/loop-tasks/. No recurring task dispatch or background polling is configured. Use compact run listings and targeted logs. Preserve browser sessions without login, noindex, server-only secrets, evidence provenance, and honest recorded-demo labels.

## Backend replay and comparison contracts

The demo renderer uses `GET /api/demo?version=2` and validates the CH01 document before rendering. Unversioned `GET /api/demo` retains V1 compatibility. Both routes return `503` with `code: demo_unavailable` when their recording is unavailable. Editable workspace examples continue using the separate `curated-fictional-example` CaseFile row; CH01 uses `ch01-demo`.

Before merging a release that introduces this renderer, an operator must install the approved `ch01-demo` recording in the target environment. Production data installation is a separate, explicitly authorized operation; ordinary releases never seed it. The production smoke check validates the same V2 recording the UI consumes and fails if it is missing or invalid.

Prepare the CH01 recording locally with `node scripts/prepare-ch01-demo.mjs STUDY_FOLDER`. The folder is an operator-supplied frozen study, not part of the repository. The script reads public intake, actual Qloo receipts and only records inspected in the recorded arms; it does not read the private answer key. Its output is ignored `data/recorded/ch01-demo.json`. Generate ignored seed SQL with `node scripts/prepare-demo-seed.mjs data/recorded/ch01-demo.json private/ch01-demo-seed.sql`; install only into an explicitly selected local database. Inspect existing local tables before applying missing additive migrations. Never reset an existing case database or run this seed during ordinary releases.

New discovery queries record the exact request scope and pair seeded results with a same-scope control. The existing action endpoint accepts `{type: 'run_control', queryId}` to retry a missing control without rerunning the seeded query. Partial successes and failure receipts are retained. Request allowances cover both required calls before starting them. The GET case response additionally includes Qloo/model attempt and failed-or-incomplete counts; exports carry the same totals. Optional case `referenceRelation` and enquiry `whyThisCheck` fields are backward compatible. Changing explanatory text does not invalidate an enquiry response identity.

Per-reference query experiments remain deferred until the interface can show the extra request cost before dispatch. No provider requests are made by replaying the demo.

### Agent runs and the live demo comparison

Agent activities and immutable attempt receipts carry server-owned run IDs and step numbers. `GET /api/cases/[id]` adds sanitized `agentRuns` totals and step breakdowns while retaining aggregate `usage`. Counts represent provider attempts; failed or missing HTTP results are included. Legacy receipts remain in case totals without guessed run assignments. Source retrieval attempts do not count individual redirect hops.

`agent_continue` starts a new run only after a completed enquiry receives a valid, previously unreviewed response. It preserves evidence and enquiry history and makes no provider call itself. `agent_reset` is an explicit restart; neither operation resets global, session or network allowances. Continuing from an unanswered agent question is not supported; update the case and explicitly restart instead.

`POST /api/cases` accepts `{ "fromDemo": "ch01" }` to create a fresh fictional case restricted to five supplied venues. It requires a separate validated `ch01-comparison-intake` asset; missing or invalid inputs return `503 demo_comparison_unavailable`. Creation makes no provider calls. The existing discovery action runs the actual paired comparison, and live results can differ from the recorded replay. Recorded outcomes and operational records are never copied into the new case.

For maintainers with the private study sources, `node scripts/prepare-ch01-intake.mjs STUDY_FOLDER` prepares the ignored input JSON and a separate insert-only SQL seed. Review and install that asset separately; ordinary releases never seed or replace demo data. The existing replay and editable example are independent. Tests use synthetic fixtures and do not need private study files.
