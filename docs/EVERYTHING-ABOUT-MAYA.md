# Everything about Maya

## The idea

Maya is a personal companion that can also help with work. The intended experience is a natural conversation, in English, Hindi or Hinglish where appropriate, rather than a formal “command accepted” interface. She can disagree plainly, help with a task and retain useful context without pretending to be human.

The friend-not-Jarvis part is tone and continuity: short back-and-forth, warm teasing, answer the current question first, do not revive old tasks repeatedly, and do not turn every greeting into a memory lookup. Maya is an AI character. Fictional flavor should never be presented as real-world activity or used to pressure the user.

## A typical turn

1. A message arrives through web or Telegram with its conversation context.
2. The API/worker resolves the run and tool context and selects a model path.
3. A simple turn can be answered directly. A task may need a tool or a Hermes job.
4. Stored notes are retrieved only when they are relevant. Tool results are evidence, not instructions from the account owner.
5. A consequential action needs the applicable approval flow, not just a friendly response from the model.
6. Maya returns a result or an honest blocker. A health response is not proof that a message was sent or a file delivered.

## What was customized

The project combines Maya branding, style/routing decisions, owner/approval handling, Telegram formatting, Hermes handoff, read/search/health bridges and experiments for usage/status and prompt understanding. The app and much of the agent framework come from Rakazo. Hermes comes from Nous Research. Naming the repo under the author's account does not make that upstream work his original invention.

## What is running versus still an experiment

The private core, router and Hermes bridge have been deployed. Current post-reboot checks show core services healthy. The Google write service did not start automatically after reboot; that exception is not hidden. Telegram's most recent formatting change still needs the owner's real-account acceptance test.

The specialist roles, switches, prompt-understanding helper and usage/status panels are at different prototype stages. Today's UI/routes were tested in isolated fixtures, not deployed. An automatic-understanding rollout stopped before touching production because the worker transport path failed preflight. It is not “Maya final” in the sense of a finished, fully validated product.

## What stays private

No notes, chats, account connections, credentials, provider key files, model weights or owner-specific persona are shipped. The ordinary model routes and speech transcription can use cloud services. Local storage of notes is not the same as fully local inference. A reader must configure their own accounts and consent to data disclosure before testing external services.

## What comes next

Reliability comes before more features: a clean install, reproducible builds, real end-to-end approval tests, transport fixes and restore/startup checks. Only then should unshipped UI and specialist prototypes be considered for deployment. Personality consistency is a separate test target and never overrides safety.

See STATUS.md for the exact matrix, ARCHITECTURE.md for the layers, ../SETUP.md at the repository root for development limits, and ../THIRD_PARTY_NOTICES.md for credits.
