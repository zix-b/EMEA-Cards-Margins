# EMEA Cards admin service

Status: Worker code and email Access configuration deployed; private GitHub authorization and complete live functional tests pending. The production admin still uses its existing path because `admin-config.js` has an empty backend URL. Do not enable it before the live checks below pass.

The website and admin remain on GitHub Pages. The Cloudflare Worker provides authenticated, repository-scoped pricing operations. Cloudflare Access email sign-in opens in a popup. The popup makes first-party requests and sends results to its exact opener on `https://zix-b.github.io`, with a random channel identifier. It does not transmit Access cookies, JWTs, or GitHub credentials to the Pages website. Keep the popup open during administration. Closing it ends the portal connection; use Log out to complete Cloudflare sign-out.

## Deployment prerequisites

1. Done: owner activated Zero Trust Free privately.
2. Done: owner approved their primary verified GitHub email as sole admin. The exact email is configured privately in the Access policy and Worker settings.
3. Create an Access self-hosted application for all paths on `emea-cards-admin.limzhixian6392.workers.dev`. Enable email one-time PIN and an explicit allow policy for approved emails. Use a short application session duration. Do not add Everyone, bypass policies, or service tokens. Verify the exact policy and hostname before deployment.
4. Configure Worker variables `ACCESS_ISSUER` (the exact HTTPS team domain without a trailing slash), `ACCESS_AUD` (application audience), and `ADMIN_EMAILS` (comma-separated approved email addresses). The Worker separately verifies the JWT signature, issuer, audience, token type, dates, and email allowlist. Missing configuration denies all requests.
5. The owner enters `GITHUB_TOKEN` privately as a Cloudflare Worker secret. Use a fine-grained GitHub token restricted to `zix-b/EMEA-Cards-Margins`, with Contents read/write and Actions read/write. Do not grant Workflows write or copy credentials to source, chat, logs, command arguments, or the browser admin. Existing NetSuite secrets stay in GitHub Actions.
6. Run `npm ci --prefix backend` and `npm --prefix backend run build`. Deploy `backend/dist/worker.mjs` as an ES module or use the Wrangler configuration. Do not enable preview URLs without Access protection. No pricing database or storage binding is needed.

Cloudflare account inspected: `829d65cee9a4c430ad034ed7faa99856`. Workers inventory was empty. The owner created `emea-cards-admin`; its production and preview URLs are Access-protected. The backend code was deployed with zero editor diagnostics and its saved source compared with the tested bundle. Live anonymous and forged-assertion API requests redirect to Access; completed authenticated workflows remain unverified.

## Fixed operations

- GET `/api/session`: verified identity and expiry.
- GET `/api/pricing`: current main SHA and pricing.
- GET `/api/netsuite`: current repository preview.
- GET `/api/status`: status of the Pages and NetSuite preview workflows.
- POST `/api/apply`: confirmed upload, direct editor, card-management, or explicitly mapped NetSuite operation.
- POST `/api/sync`: only `netsuite-preview.yml` on main, requiring public-preview consent.

There is no generic GitHub proxy. Writes require JSON, a same-origin request and custom header, a matching base SHA, and explicit confirmation. The server reconstructs updates using the existing pricing functions and compares the result with the reviewed data. It rejects altered costs or arbitrary replacement data. Explicit card deletion retains its existing behaviour of deleting that card's selling and cost records.

Before publishing, the service creates `pricing-backup-<base SHA>` as a Git tag. It then creates one commit containing only pricing-data.json and pricing-data.js and updates main without force. A concurrent change rejects the update. A repeated successful Apply with the previous base SHA also rejects. If a network error makes publication uncertain, check the returned commit and workflow status before retrying.

## Required live checks before enabling the portal

- Missing, forged, expired and unapproved authentication is denied.
- Approved email login and confirmed logout work from the GitHub Pages admin in Chrome.
- The popup bridge survives Cloudflare Access redirects with its opener and channel intact. This is the hardest remaining browser dependency and is not yet tested live.
- Private repository authorization reads main and publishes both pricing files atomically, with a backup first and stale edits rejected.
- Use only owner-approved actual pricing for a live Apply. Do not publish synthetic values. An unchanged-price operation can exercise publication only if its generated output is inspected to confirm no selling/cost changes.
- NetSuite sync creates a new six-SKU preview, without applying it or changing active prices. Explicit mapping, review and confirmation remain required.
- Pages deployment completes; the deployed pricing files agree; the calculator refreshes and retains region and formula behaviour.
- Read back saved Worker settings and Access policy, including production and preview coverage.

Only then set `window.ADMIN_BACKEND_URL` in `admin-config.js` and remove the legacy token interface, password-hash gate, and GitHub-only help text. Update module cache versions as part of the activation commit. The draft retains the legacy path deliberately, as required until replacement works. The authenticated portal includes a publication-status refresh button backed by `/api/status`.

## Local tests

Run all `tests/*.test.mjs` with Node and `python3 tests/netsuite_test.py`. Backend tests use an in-memory GitHub transport and test-only RSA keys. They do not access live credentials or write live pricing. Tests cover schema validation, real JWT signature verification, incorrect claims, allowlist denial, origin checks, stale and tampered payloads, cost preservation, backup ordering, paired-file publication, popup source/origin checks, login/logout, CSV confirmation and repeated Apply.

References:
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens

Live verification entry: `admin.html?auth=cloudflare`. This opt-in selects the protected backend; the default portal remains unchanged until publishing and logout pass. Worker request transports use manual redirect handling and reject non-success responses, including redirects. Never forward repository credentials to a redirect target.
