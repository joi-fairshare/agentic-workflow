# Shared Codex Skill Preamble

This file is a shared reference for the repo's Codex skills. Read it before executing a skill workflow instead of duplicating the same setup block into every `SKILL.md`.

## Host Assumptions

- Skills are triggered by name or task intent, not slash commands.
- There is no dedicated `AskUserQuestion` or `Skill` tool. Ask the user directly when needed, and open another skill's `SKILL.md` directly if you need to follow its workflow.
- Only use sub-agents when the user explicitly asks for delegation, sub-agents, or parallel work. If a skill suggests parallel agents but the user has not authorized them, do that work locally instead.
- Legacy references to `Read`, `Write`, `Edit`, `Glob`, or `Grep` are just shorthands for the equivalent Codex actions: targeted file reads, `apply_patch`, shell commands, and `rg`.
- Legacy references to an `Agent` mean an optional Codex sub-agent, subject to the delegation rule above.
- Prefer Serena for symbol-aware exploration when it is available. Otherwise use `rg`, targeted file reads, and the local planning docs.

## Repo Setup

1. Derive `REPO_SLUG` from `git remote get-url origin` when possible; otherwise use `basename "$(pwd)"`. Normalize `/` to `-`.
2. Ensure `~/.agentic-workflow/$REPO_SLUG` exists before writing skill outputs.
3. If `.Codex/rules/` exists, read the rule files relevant to the files you will inspect or modify. If it is missing, continue, but note that repo-specific guidance may be incomplete.
4. If the repo is clearly missing required bootstrap artifacts, offer to run `setup.sh` or `bootstrap`, but do not block unless the skill genuinely cannot proceed without them.

## Context Loading

If `prism-mcp` is available, recover prior context before diving into the task:

1. Derive a 3-5 word topic string from the current task.
2. Call `session_load_context` with the repo slug and store the returned `expected_version`.
3. Use any returned summary, decisions, or open todos to inform the run.

If `prism-mcp` is unavailable, continue without persisted context instead of failing the skill.

## Context Persistence

At the end of the workflow, if `prism-mcp` is available:

1. Save a ledger entry with a short summary, open todos, changed files, and key decisions.
2. Save a handoff with the stored `expected_version`, current branch, last summary, and any critical follow-up context.

If persistence fails, mention that context may not carry into the next session, but do not treat it as a fatal error unless the skill explicitly requires durable state.
