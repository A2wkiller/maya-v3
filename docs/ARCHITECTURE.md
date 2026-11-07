# Architecture

## Application layer

The Rakazo-derived application has a web UI, API, persistent worker, shared contracts/core, DB schema/migrations and adapters. It stores conversations and run state in PostgreSQL and application files. Tool/approval routes and channel formatting live in the adapters/API layers. The API and worker in this snapshot have different adapter baselines; setup deliberately preserves both.

## Model routing

The Python router exposes an OpenAI-compatible endpoint. Its current source selects fast/heavy paths and handles explicit private/local requests. The default chain calls cloud APIs; the local route is an explicit choice, not a silent claim that data never leaves the host. The source reads provider configuration locally; no values are included.

## Hermes handoff

services/hermes-mcp/server.py registers an MCP job interface, launches Hermes as a subprocess, tracks jobs in an in-memory mapping and reads result text from job output files. Task templates cover research, repository work, digest and general jobs. This is not a persistent distributed queue. The bridge has a concurrency semaphore, but the current implementation launches the subprocess before acquiring it, so it must not be described as a proven two-process execution limit.

Hermes is upstream software, pinned in vendor/hermes-agent. It is not a second home-grown model. A subprocess flag and prompt rules do not create an OS sandbox. Deployment isolation must be reviewed separately.

## Specialist test path

services/maya-test-integration has a fictional-data harness. dispatch() checks the declared role, tool and audience; validate_return() checks the handoff schema and evidence source IDs. Registry/switch and isolated queue code explore pinned feature versions. These are code-level fixture checks, not proof that all real tool surfaces are protected.

## Memory and personality

Private notes and memory databases are excluded. The project prefers retrieval only when the task needs stored context. The public owner-persona module is a neutral demo replacement, not the author's personal character sheet. Personality changes wording; it must not change recipients, approved actions or tool arguments.

## Optional bridges

Search, viewer/media guard, read-only health and Google approval source are under services. The Google write bridge was not boot-enabled and is inactive after the latest private server reboot. This source snapshot does not restore it or grant access to an account. Optional prototypes and unshipped UI changes remain separate under not-deployed.
