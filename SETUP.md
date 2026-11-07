# Setup and review

## Safety first

This snapshot is for source review. Do not point it at an existing database, memory vault or production account while trying it. It contains upstream deployment helpers, but those are not a supported install shortcut for this customized snapshot. Some upstream scripts can remove volumes or change a host.

No clean-machine end-to-end installation has been completed for this public copy. The following is the intended development path, not a promise that every step already passes.

## Offline review

Python 3.10+ is sufficient for the public-copy and fictional specialist tests:

```bash
python3 scripts/check_public_copy.py
python3 scripts/test_specialist_policy.py
```

## App prerequisites

The included application/package.json specifies Node 22.22.2+ in the 22.x line, Node 24.x or Node 26+, and pnpm 9.15.0. Docker Engine and its Compose plugin are needed for the upstream development database/sandbox flow. The app uses PostgreSQL and Prisma. Model providers are optional until you choose to test inference; provider prices and free-tier availability may change.

```bash
cd application
cp ../.env.example .env
# Fill fresh local values in .env. Never commit it.
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm db:generate
```

The upstream dev script can start Docker services and apply database migrations. Read application/scripts/dev.mjs before running `pnpm dev`. Generate independent random values for auth, encryption, screen proxy and sandbox tokens. Use a disposable local database. Do not paste existing production keys into this example.

## Important: two adapter baselines

application/packages/adapters contains the worker baseline. effective-api-adapters contains the API baseline. They are not interchangeable: a worker-only model transport wrapper is one known difference. For a separate API build checkout, replace that checkout's packages/adapters/src with effective-api-adapters, then build the API there. Keep the worker checkout unchanged. This snapshot does not supply a tested unified release pipeline.

The not-deployed directory is **not an overlay to apply automatically**. It includes competing historical UI approaches and the newer automatic helper. Consult docs/STATUS.md and review a narrow diff before choosing any candidate.

## Hermes

Hermes is retained as a pinned upstream Git submodule at revision eefdfe0692207a7520b3a8c764fe510024f552a1:

```bash
git submodule update --init vendor/hermes-agent
```

The review archive includes only the submodule reference and MIT notice, not a second copy of the entire upstream history. Follow that pinned project's own installation instructions. No local Hermes config, sessions or credentials are included. services/hermes-mcp/model.example.json illustrates model choices only.

The bridge source currently uses deployment-style paths under /home/maya and an example router location. Configure these for your local user. It launches Hermes subprocesses with broad execution capability. Prompt wording is not isolation; use a separate sandbox with restricted files/network and authentication before real tasks. Do not expose the bridge directly to the internet.

## Optional tools

services includes routing, viewer/search, health, Google bridge and fictional specialist code. They are optional components, not an instruction to enable them all. Most need their own environment and path/port configuration. No Google client, account token, tunnel address, Telegram bot ID or production host is shipped. Keep network listeners on loopback or an isolated network for review.

To test cloud models or any account write, configure your own account and approve the exact test separately. The offline tests do neither. A successful health response does not prove a real send, calendar change or Telegram user flow.
