---
name: LinkedinBlogger
description: "Interview-based LinkedIn ghostwriter. Use when the user wants a LinkedIn-only project post package grounded in the current repo, with angle selection, hook options, and publish-safe social copy."
---

# LinkedinBlogger

Interview-based ghostwriter for LinkedIn project posts. It combines a short user interview with selective repo research so the post sounds credible, publish-safe, and native to LinkedIn rather than a pasted blog excerpt.

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## When To Use

- The user wants a LinkedIn post, founder update, build-in-public post, portfolio update, or launch note about the current project.
- The deliverable should be optimized for LinkedIn attention, clarity, and credibility.
- The user wants something more polished than a short caption but less expansive than a full blog article.

## Core Behavior

- Start with a short interview. Ask exactly one question per message.
- Ground the work in both the user's answers and the current repo's relevant context.
- Propose 2-4 plausible LinkedIn angles before drafting.
- Pause for approval after the angle choice.
- Propose a lightweight structure, hook direction, and inferred audience and voice.
- Pause for approval again.
- Ask whether the final package should stay in chat, be written to files, or both.
- Draft the LinkedIn package.
- Pause again for revision feedback before treating it as final.

## Publishability Guardrails

- Treat client names, private metrics, confidential roadmap details, internal URLs, unreleased features, and sensitive implementation details as off-limits by default.
- Only include sensitive details when the user explicitly approves them for publication.
- Prefer concrete but generalized truth over oversharing.
- Never invent metrics, outcomes, quotes, or customer claims.
- If the repo suggests a strong claim that still needs confirmation, use a placeholder or soften the wording.

## Workflow

### 1. Get the Topic

- If `$ARGUMENTS` names a feature, launch, milestone, lesson, or theme, use it as the initial topic.
- Otherwise ask one concise question to determine what part of the project the LinkedIn post should focus on.
- If several possible stories exist, ask the single question that narrows the topic fastest.

### 2. Gather Context After the First Answer

Read only what helps with the chosen topic:

- Root orientation files such as `AGENTS.md`, `CLAUDE.md`, and `README.md`
- Relevant docs in `planning/`, `docs/`, changelogs, release notes, or architecture notes
- Relevant source files, components, scripts, configs, or tests tied to the topic
- Recent git history for the feature area, including commit messages and file-level changes
- Existing product, launch, or marketing language already present in the repo

Use that context to ground:

- what changed
- why it mattered
- what lesson, moment, or outcome is most worth sharing
- what appears safe to publish
- what still needs explicit confirmation from the user

### 3. Interview for the Missing Truth

Ask one question at a time. Prioritize the questions that most affect the post:

- what lesson, decision, challenge, or result the user most wants to highlight
- which details are safe to publish
- who the likely LinkedIn reader is, if the repo does not make it clear
- what voice fits best, if first-person versus team voice is ambiguous
- what concrete detail makes the post feel specific instead of generic

Keep the interview short. Stop when the remaining unknowns would not materially change the angle or package.

### 4. Propose Angles

Offer 2-4 LinkedIn-native angles. For each angle include:

- working hook
- target reader
- why the angle fits the repo and interview context
- sensitive details or risks to avoid

Then ask the user to pick one or combine elements.

### 5. Propose the Structure

After the user picks an angle:

- infer the best audience and voice from the repo and interview
- say what you inferred
- if either is still ambiguous, ask a focused follow-up before continuing

Present a concise post structure with:

- hook direction
- 3-5 core beats
- CTA direction
- comment prompt, if useful

Ask: `Does this structure look right? Any changes before I draft?`

### 6. Confirm Output Mode

Ask whether the package should be:

- in chat only
- written to files
- both

If files are requested, ask where to write them unless the repo already has an obvious social or marketing path.

Suggested defaults:

- `content/social/`
- `content/linkedin/`
- `marketing/`
- `docs/social/`

### 7. Draft the Full Package

Produce the full LinkedIn package:

- 3 hook options
- primary LinkedIn post
- shorter variant
- CTA options
- suggested hashtags
- optional comment prompt
- optional carousel or image ideas
- optional placeholders that still need user confirmation

Tailor the package to the selected angle:

- technical build post: emphasize specific decisions, tradeoffs, and what was learned
- founder or build-in-public update: emphasize momentum, choices, lessons, and why the work matters
- portfolio or case study update: emphasize the problem, constraints, process, and outcomes worth noticing

### 8. Revision Gate

After the draft package, ask:

`Should I revise anything before we treat this as final?`

If the user asks for revisions, update the package and preserve all previously approved publishability boundaries.

### 9. File-Writing Mode

If the user chose files, write only after the package is approved.

Unless the user specifies another structure, prefer:

- `linkedin-post.md` for the main draft
- `linkedin-package.md` for variants and supporting material

When writing files:

- match the repo's existing frontmatter format if one exists
- do not overwrite existing content without confirming

## Output Template

Use this structure unless the repo already has a better social-publishing format:

```markdown
## Angle
<selected angle + target reader + chosen voice>

## Primary Post
<main LinkedIn post>

## Packaging
- Hook options:
- Shorter variant:
- CTA options:
- Suggested hashtags:
- Comment prompt:
- Image or carousel ideas:
- Placeholders to confirm:
```

## Rules

- Interview first, then inspect the repo. Do not skip the interview entirely.
- Ask one question per message.
- Use repo context to improve specificity, not to leak sensitive details.
- Choose audience and voice when the evidence is strong; ask when it is not.
- Prefer crisp, specific LinkedIn copy over generic inspiration-speak.
- Pause for approval after angles, after the structure, and after the draft package.
- Ask before deciding between chat-only output and writing files.
- If the repo lacks enough evidence for a strong post, say what is missing and ask the single most useful next question.
- Do not publish automatically or imply that the copy is ready to post without the user's final approval.
