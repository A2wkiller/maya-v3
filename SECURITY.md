# Security and public-copy review

This is a source-review candidate, not a security-audited product.

Excluded: credentials, .env files, private keys, account tokens, OAuth clients, private memory/notes, chat records, databases, logs, model weights, installed dependencies, deployment history and personal account identifiers. The owner persona and bindings are replaced by neutral demo content. Tests and source may contain obvious fictional credential strings, fake keys or example addresses; scanner findings are classified, not hidden.

The scan report in docs/SECURITY-REVIEW.md describes what was checked and what remains unresolved. A pattern scanner cannot prove that no secret or private fact exists. Source-history review is limited to the newly assembled candidate; old private repository history is not copied.

The bridge's subprocess execution, network-facing tool services, file access and account write paths need separate threat-model review. Prompt rules are not permissions or isolation. Specialist allowlist fixtures do not prove that every production path enforces the same checks. Do not expose this snapshot to the public internet or connect valuable accounts merely because the offline tests pass.

Never post secrets in an issue. Remove and rotate a real exposed credential through its service before discussing it publicly.
