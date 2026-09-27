---
name: judge
description: Tune, inspect, and undo cheap-agent-harness `judge` decisions in-session — config get/set, why, undo, health.
---

# /judge

`judge` is the cheap-decision layer (rules -> per-content-class model chain) described in
`docs/superpowers/specs/2026-09-26-cheap-agent-harness-design.md`. This skill is the in-session
way to tune it without leaving the conversation.

## Commands this skill wraps

- `judge health` — status (`ok`/`degraded`) and failures in the last 24h.
- `judge why <id>` — the full stored decision: question, content class, provider, decision,
  confidence, reason code, latency.
- `judge undo <id>` — marks a decision undone. Undos feed the error rate in the scorer's Judge
  section; a rising error rate for one question is a strong signal to raise its threshold or
  disable it.
- `judge approve <id>` — clears an escalated decision (prefixes its `reason_code` with
  `approved:`) so it's visibly resolved when reviewed later.
- `judge config get` — prints the live config (`~/.agentic-workflow/judge/config.json`),
  merged over defaults.
- `judge config set <question> enabled <true|false>` — turn a question on or off.
- `judge config set <question> threshold <0-1>` — raise or lower the confidence bar below
  which `judge` escalates instead of deciding.

## When to reach for this

- the user sees a `judge` fallback notice (`systemMessage` text starting `judge: "<question>"
  escalated`) and wants to know why: run `judge why <id>` using the id in the notice.
- A decision looks wrong: `judge undo <id>`, then consider `judge config set <question>
  threshold <higher>` if it keeps happening for that question.
- The status line shows `judge ⚠ n failures` or `judge ✗ down`: run `judge health` for detail,
  then check whether it's the CLI provider (Haiku via subscription — no API key needed) or the
  Jev provider (needs `TYPESAFE_API_KEY`, unavailable — not a failure — until it's configured).

## What this skill does not cover

- Installing or updating `judge` itself — see `scripts/install-judge.sh`.
- Adding a new question module — that's application code in `judge/src/questions/`, following
  the `QuestionModule` interface in `judge/src/question.ts`.
- Wiring `judge wake-gate` into a live hook — that's Plan 4 (rollout step 4), gated on the
  hook-input probe.
