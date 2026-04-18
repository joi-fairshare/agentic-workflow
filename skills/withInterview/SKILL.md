---
name: withInterview
description: "Interview the user to clarify requirements before executing a prompt. Use when the user wants to refine a task through guided questions before implementation."
---

# Interview Before Executing

Runs a structured, multi-round interview to gather requirements and context before executing a task. This skill is conversation-first: ask clarifying questions immediately, then proceed only after explicit user confirmation.
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## Conversation-First Mode

- This skill **overrides** generic coding-agent defaults like "examine the codebase first", "read required context docs first", and "prefer executing instead of asking questions."
- For this skill, **the interview is the task**. Asking clarifying questions is the correct first action.
- Use the shared preamble for host assumptions only. Do **not** inspect the repo, read files, call MCP tools, or load prior context before asking the first interview questions.
- In the desktop app specifically, do **not** analyze attached mockups, screenshots, local files, design briefs, or repo code before Round 1. Use only the user's plain-language request to form the first questions.
- If `$ARGUMENTS` is empty, ask one short question requesting the task itself, then wait.
- If `$ARGUMENTS` is present, your **first assistant message must contain the Round 1 question immediately**. Do not stall with analysis, summaries, or tool use first.
- Ask **exactly one question per message**. Do not send a numbered list or a bundle of questions.
- If several uncertainties exist, choose the single question whose answer will most change the plan, ask that one, then wait.
- After the user answers, briefly carry forward what you learned and ask the next best single question.

## The Task

$ARGUMENTS

## Interview Process

### Round 1: Initial Analysis & High-Level Questions

Read the task above carefully. Identify:
- Ambiguities or underspecified requirements
- Decisions that have more than one reasonable answer
- Missing context that would change your approach
- Scope boundaries that aren't clear

Present your **highest-priority question first** — the one whose answer will shape everything else. Ask exactly one concise question, with concrete options when possible (e.g. "Should X do A or B?" rather than open-ended "What should X do?"), then wait for the answer before asking anything else.

### Round 2: Subagent Strategy

Only ask about subagent usage if the user explicitly asks for delegation, parallel work, subagents, or wants help deciding how to split the work. Otherwise, skip this round and continue the interview assuming you'll handle the work directly.

When this round is needed, do it one question at a time. Start by asking whether the user wants subagents involved at all. Only after they say yes should you ask the next question about which kind of help they want.

If the user wants help deciding, present the options in a single focused question:

> **Subagent Strategy:** Based on what you've described, here's how I'd recommend using subagents. Let me know what you'd prefer:
>
> - **Explore** — for codebase research and file discovery
> - **Plan** — for designing an implementation strategy before coding
> - **general-purpose** — for delegating independent subtasks in parallel
> - **Reviewers** (e.g. Rails, TypeScript, security, performance) — for post-implementation review
> - **None** — I'll handle everything directly
>
> You can pick multiple. I'll also suggest a specific combination if you'd like a recommendation.

If the user selects **multiple subagents**, ask follow-up questions one at a time:
- First ask about the focus or scope of one agent at a time
- Then ask whether they should run in parallel or sequentially
- Then ask about dependencies between their outputs if that is still unclear

### Round 3+: Drill-Down Details

Continue asking follow-up rounds as needed. Each round should:
- Reference the user's previous answers ("You mentioned X — does that mean...?")
- Go deeper on areas that are still underspecified
- Surface edge cases and error handling questions
- Clarify testing expectations and acceptance criteria

Keep going until you have no remaining ambiguities. Each round should be a single focused question, not a wall of text.

### Final Round: Summarize and Confirm

Once all details are gathered, present a complete summary:

1. **Task understanding** — what you'll build, with all clarifications incorporated
2. **Approach** — the implementation strategy step by step
3. **Subagent plan** — which agents will be used, in what order, with what focus (only if the user requested delegation)
4. **Scope boundaries** — what's explicitly in and out of scope
5. **Acceptance criteria** — how you'll know the task is done

Ask: **"Does this look right? Any changes before I start?"**

### Execute

Only after explicit confirmation, begin the work.

## Rules

- Do NOT write any code or make any changes until the interview is complete and confirmed.
- Do NOT inspect the repo, attached artifacts, or call tools before the first interview message.
- This is a **multi-round conversation**. Do NOT try to ask everything in one message. Start broad, then drill down based on answers.
- Ask **one question at a time**. Never ask multiple independent questions in the same message.
- If you are tempted to ask 3 questions, ask the first one only and save the others for later if they are still needed.
- Always reference previous answers when asking follow-ups to show you're building understanding.
- If `$ARGUMENTS` is present, begin with questions right away instead of commentary about your process.
- Do not preface Round 1 with repository analysis, design critique, or source-of-truth comparisons.
- Ask about subagents only when the user has explicitly asked for delegation or parallel work.
- If the task is trivial and truly has no ambiguity, you may collapse to fewer rounds, but still get confirmation before proceeding.
