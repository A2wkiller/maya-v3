# Public-copy review

7 November 2026. Review candidate, not yet authorized for publication.

## Secret scan

Gitleaks 8.30.1, directory mode, default rules, no ignore file or allowlist: **35 raw matches**. All 35 were inspected in context and are synthetic test material: deliberately fake API keys, fake key-block marker tests, RFC sample WebSocket nonces, test encryption strings and a fake bearer-header test. **0 actual credentials identified**. This is not a claim of zero scanner findings or a guarantee that no private fact exists.

SECRET-SCAN-REVIEW.json lists every path/line/rule with its classification, without echoing credential-shaped values. Tests were not deleted to make a scanner green. A future CI scanner should distinguish these exact fixtures from new findings rather than disabling rules globally.

## Privacy sweep

Excluded runtime credentials, .env, Google client/token files, provider files, SSH/TLS keys, model weights, memory/notes, chat history, databases, logs, uploads, dependencies, generated clients, backups and prior Git history. Replaced deployment host and private account IDs with fictional examples. Removed the cached owner college/profile sentence from executors and replaced owner-specific persona sheets with a neutral demo. Account-looking IDs were pseudonymized consistently. Public author attribution remains only in README/credits.

Files containing generic credential handling, OAuth logic and synthetic credential tests remain source code, not credentials. Google/Cloudflare service API names remain where needed to explain code; no owner's account configuration is included.

## Current validation

- Public-copy hygiene script: 0 issues.
- Fictional specialist policy checks: 17 passed, no network/accounts/model calls.
- Automatic prompt-understanding helper: 32 tests passed in an isolated local test environment.
- Python syntax: 52 source files parsed.
- Full TypeScript build and entire suite: not run on this public copy.
- Clean-machine install, real Google send and real Telegram acceptance: unverified.

## Scope and limits

This is an assembled source snapshot, not a production backup or deployment command. It has separate API/worker adapter baselines and unshipped candidates. Neutral persona and fixture changes can invalidate historical tests. Hermes is an upstream pinned submodule; its entire source/history is not included in the archive. The standalone bridge can launch broad subprocesses, so prompt rules must not be called a security sandbox. Optional service provenance/licenses and dependency licenses should be reviewed before wider redistribution.

No GitHub repository was created or changed as part of this review. Publication needs the owner's final approval of this file list and scan result.
