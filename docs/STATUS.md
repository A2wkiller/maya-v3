# Built, deployed and unproven

Snapshot date: 7 November 2026. This table concerns the author's private Maya installation and the source candidate, not a public hosted demo.

| Component | Evidence / state | What is not proved |
| --- | --- | --- |
| Private app core | Web/API/worker running; read-only post-reboot health checks passed | Full user behavior on a fresh install |
| Router | Current source includes fast/heavy cloud routes and explicit private/local handling | Reliability/price of external providers over time; fully local operation |
| Hermes bridge | Current subprocess/MCP bridge source included; default router and optional Ollama model selection | Production isolation just from this source; durable job queue |
| Friend style | Customized persona/style was deployed privately | Persona consistency across all turns; private profile intentionally absent here |
| Telegram formatting | Narrow reply-spacing change installed | Owner's final real-Telegram confirmation still pending |
| Google approval bridge | Exact-action approval implementation included | A successful real send plus card removal is not claimed; write service inactive after latest reboot |
| Specialist roles | Seven role categories in fictional policy harness; builder, reviewer, researcher, web reader, Google reader, reminders watcher, guest handler | Seven production autonomous workers; role prompts alone are not enforcement |
| Feature-switch and queue prototypes | Standalone fixture implementations included | General no-restart production feature rollout |
| Usage/status UI + routes | Isolated auth/DB/browser fixtures tested; source in not-deployed | Deployed UI, full-shell E2E, all RLS paths in one browser session |
| Automatic prompt understanding | Helper and executor tests built; one synthetic four-case model request had partial success; ambiguity policy tightened locally | Real Maya E2E success; rollout stopped before installation after worker transport tests timed out |
| Worker transport diagnosis | Local reproducer found a fetch/dispatcher compatibility issue; test-only diagnostic passed | Production transport fix or rollout approval |
| Memory/RAG | Private installation has a notes/RAG setup; source interfaces included | Private notes, graphs and embeddings are not released; general recall accuracy is not asserted |
| Voice | Hybrid local/cloud components exist in the private project | Entirely offline voice, approved final voice quality, included model weights |
| Laptop/phone control | Separate experiments and parked work | Production phone control or unrestricted PC autonomy |
| Public-copy build | Source/syntax/offline checks described in security review | Full TypeScript build, complete test suite, one-command restore |

## What changed on the snapshot day

Telegram spacing was the narrow installed change. Usage/status and automatic understanding work stayed isolated. A later auto-enhance rollout stopped during worker preflight, before installation or restart. The diagnosis is not a deployed fix. The live machine was resized separately with a reboot; no local models were removed. These operational facts do not turn candidate code into shipped features.

## Ideas / next work, not shipped promises

- Clean install and reproducible separate API/worker builds.
- Restore and prove the exact-action Google write service with a safe test account.
- Resolve transport compatibility, then review a narrow rollout.
- Wire specialist and switch prototypes only after negative permission tests.
- Improve memory grounding and friend-style consistency.
- Keep app/phone control parked until it has a bounded approval model.

Prior isolated test counts are not repeated as a score for this sanitized tree. Identifier changes, example persona replacement and baseline differences can affect tests. The repository has no claim of a completed production acceptance test.
