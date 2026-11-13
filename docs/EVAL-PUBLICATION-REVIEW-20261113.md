# Evaluation publication review: 13 November 2026

## Published scope

This update adds the standalone evaluation kit under
`evaluations/2026-11-13-local/`, links it from the repository README, and includes
this review. The prior source snapshot remains unchanged.

The kit has 50 original synthetic questions and 20 fresh focused variants.
Four result sets contain 140 retained local-model responses: original baseline,
original revised prompt, fresh baseline and fresh revised prompt. Scoring
rubrics, review reasons, frozen inputs, checksums and runnable scoring code are
included. The 19 candidate files read from the server matched the previously
retained test artifacts byte for byte. Scorer and review documentation are added
from those retained artifacts so the results can be reproduced offline.

The known-question score is 35/50 to 47/50; the fresh focused score is 6/20 to
12/20. Scores describe the test configuration, not production behavior. No
production settings, services, tools or deployed persona were changed.

## Sensitive-data checks on this update

- Gitleaks 8.30.1 directory scan of the proposed evaluation kit: no findings.
- Additional checks for email addresses, phone-like identifiers, bot-token forms,
  private file paths, IP addresses, credential assignments and private session
  identifiers: only three reserved `example.invalid` email fixtures and the
  loopback address `127.0.0.1` occurred. These are intentional synthetic data
  and the local model endpoint, not real contact or server addresses.
- No `.env`, credential file, database, log, private key or deployed persona
  file is included. Test personas are neutral benchmark inputs, not the private
  deployed character. No actual personal chat transcript is included.
- The casebooks contain synthetic attack examples and model responses. Those
  examples are test data, not instructions to a reader or evaluator.
- Fresh extraction reproduced all four scores. The updated scorer passed
  16 regression tests, including the smaller-set denominator.

## Held outside the public update

Operational logs, daily digests, state/cache databases, account/credential
files, private persona files, backups and unrelated experiments were not copied
into this update. A redundant question-generation helper was not needed in the
runnable evidence kit. These exclusions were not inspected for a claim of
absence of secrets: private or operational status alone was enough to exclude
them. No held item was changed on the server.

The comparison used the existing public Git revision and bounded metadata
inventories of the project source/evaluation directories. A wider home-directory
walk exceeded its bound and one output directory was unreadable. This is a
review of the explicit files in this commit, not an exhaustive server audit or
a guarantee about all files, all repository history or every possible secret.

No scanner proves absolute absence of sensitive data. The restricted file
allowlist, synthetic-data review and scan results support this publication.
