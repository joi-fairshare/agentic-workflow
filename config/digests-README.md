# Digests

One file per handed-off task, named `<task-slug>.md`. A digest is what a
context-guard nudge (or a brief) asks an agent to write before it's replaced:

- **Goal** — one sentence, the acceptance criteria if known.
- **Done** — what's verified working, with the command that proved it.
- **Left** — what's not done yet, in the order it should happen.
- **Files** — exact paths touched or that matter, not prose descriptions.

Briefs should point here (`~/.agentic-workflow/digests/<task-slug>.md`)
instead of listing raw files to re-read (spec, lever 2B) — a fresh agent
reads one digest, not the whole history that produced it.

Digests aren't automatically cleaned up. Delete one once its task has
merged or been abandoned.
