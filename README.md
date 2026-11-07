# Maya v3

A personal AI companion and work assistant, assembled and customized by **Vaibhav ([A2wkiller](https://github.com/A2wkiller))** on the open-source Rakazo app and Hermes Agent.

Maya is meant to feel like a friend who can help with real work: natural conversation, memory when it matters, useful tools and delegated work. She is an AI character, not a person. A warmer voice never grants permission to send a message, spend money or change an account.

> **Source snapshot, 7 November 2026.** This is a sanitized review candidate, not a new production deployment or a tested one-command distribution. The private service is running; some code here is a prototype. See [status](docs/STATUS.md) before judging any feature claim.

## What is Maya?

One chat surface sits in front of a web app, a persistent worker, model routing, memory and tool bridges. Hermes handles coding/research jobs. Narrow specialist roles have a separate policy-test harness. The goal is one assistant that keeps the context of a task without pretending that every experiment is already reliable.

Maya is **hybrid**, not fully local. The usual chat routes call cloud model providers. Voice transcription can also leave the host. An explicit local path and local model weights exist in the private installation, but no model weights or accounts are shipped here. A local voice component does not make the whole system private or offline.

## What this project adds

- Maya branding and a conversational, Hinglish-friendly friend style rather than a formal command-only assistant.
- Owner-message and approval handling around tool use, including Telegram reply formatting and approval lifecycle work.
- Fast/heavy/private/local routing choices, a Hermes MCP bridge and task handoff.
- Read-only health/search bridges and exact-action Google write-approval code.
- Experiments for grounded specialist handoffs, feature switches, usage/status UI and automatic prompt understanding.

This is customization and integration work on substantial upstream projects, **not a claim that the app framework or Hermes was written from scratch**. [Credits and licenses](THIRD_PARTY_NOTICES.md) identify the foundation. Personal persona sheets and account bindings are replaced with neutral examples in this public copy.

## How a message moves

```text
Web or Telegram message
        |
        v
Maya API: session, conversation and owner context
        |
        v
Worker: task/run state, model choice, tool/approval gates
        |                         |
        v                         v
Model router                 Tool or Hermes MCP bridge
cloud by default             delegated job + result
local only when selected     specialist harness is separate
        |                         |
        +------------+------------+
                     v
          result, status or approval request
                     |
                     v
                 chat reply
```

Memory is retrieved when the task needs stored facts, not as proof that a model remembers everything. External text is input data, not permission to run its instructions. These are design goals backed by code and tests in specific paths, not a security certification of the entire stack.

## Status at a glance

| Area | Snapshot status |
| --- | --- |
| Private web/Telegram core, router and Hermes bridge | Deployed in the private installation; no public service endpoint included |
| Telegram formatting changes | Installed; final owner real-Telegram behavior confirmation still outstanding |
| Google read/write bridge source | Included; write bridge is inactive after the latest reboot, restoration pending |
| Specialist role/switch harness | Fictional fixture, not a deployed fleet of autonomous production specialists |
| Usage/status panels and read-only routes | Built and tested in an isolated environment, not deployed |
| Automatic prompt understanding | Candidate only; rollout stopped before installation due to worker transport test failure |
| Full clean-machine install of this sanitized tree | Not verified |

[Detailed built/live/idea matrix](docs/STATUS.md) · [Architecture](docs/ARCHITECTURE.md) · [Everything about Maya](docs/EVERYTHING-ABOUT-MAYA.md)

## Repository map

```text
application/              Rakazo-derived web/API/worker/shared source
  apps/                   web, API, worker, desktop/mobile source
  packages/               adapters, contracts, DB schema, core, testkit
  infra/                  upstream build/deployment helpers, not auto-run
effective-api-adapters/   API-specific adapter baseline (see setup)
services/                 Maya router, Hermes bridge and optional tools
not-deployed/             today's unshipped UI/routes/prompt candidates
vendor/hermes-agent/      pinned upstream Git submodule (initialized after clone)
vendor/HERMES-LICENSE     MIT notice for Hermes
scripts/                  offline public-copy checks
```

## Inspect and try safely

Start with the offline checks; they use fictional data and do not call a model or connect an account:

```bash
python3 scripts/check_public_copy.py
python3 scripts/test_specialist_policy.py
```

For the app and Hermes, use [SETUP.md](SETUP.md). It explains prerequisites, provider choices, the API/worker baseline difference and why production deployment scripts must not be run blindly. No runtime secrets, private memory, chat history, model weights or account configuration are included.

## Limitations worth reading

The source is reconstructed from a customized deployment plus isolated candidates. Sanitization changes identifiers and the demo persona. Tests involving those exact identifiers may need new fictional fixtures. Historical isolated test results are not proof that this public copy builds or that an entire user workflow works. The bridge contains experimental subprocess execution; do not expose it to untrusted users or treat prompt rules as a sandbox. Google approvals, transport compatibility, restore automation and end-to-end behavior still need work.

## Next

1. Make the API/worker adapter differences reproducible in a clean build.
2. Fix and test the worker transport issue without widening a live rollout silently.
3. Prove the Google approval flow end to end using a fresh test account.
4. Make the staged panels and specialist fixtures pass a clean installation and negative tests before deployment.
5. Evaluate friend-style consistency without allowing personality to alter safety decisions.

See [SECURITY.md](SECURITY.md) for the public-copy review and threat-model caveats. This repository is a learning project; use only claims you can trace to the source and explain yourself.
