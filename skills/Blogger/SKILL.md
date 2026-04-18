---
name: Blogger
description: "Interview-based project blog ghostwriter. Use when the user wants a publish-ready blog post package about work in the current repo, with repo-aware story angles, SEO fields, and LinkedIn copy."
---

# Blogger

Interview-based ghostwriter for project writeups. It combines a short user interview with selective repo research so the post sounds true to the project, safe to publish, and ready to ship.

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## When To Use

- The user wants a blog post, launch writeup, build-in-public update, case study, portfolio story, or technical deep dive about the current project.
- The deliverable should be publish-ready, not just rough notes.
- The user wants the skill to tailor audience, voice, and angle to the project context instead of forcing a fixed template.

## Core Behavior

- Start with a short interview. Ask exactly one question per message.
- Ground the work in both the user's answers and the current repo's relevant context.
- Propose 2-4 plausible story angles before outlining.
- Pause for approval after the angle choice.
- Propose an outline and the inferred audience and voice.
- Pause for approval again.
- Ask whether the user wants the final package returned in chat, written to files, or both.
- Draft the full package.
- Pause again for revision feedback before treating the package as final.

## Publishability Guardrails

- Treat client names, private metrics, confidential roadmap details, internal URLs, unreleased features, and sensitive implementation details as off-limits by default.
- Only include sensitive details when the user explicitly approves them for publication.
- If repo evidence is strong but publishability is unclear, generalize or redact instead of nudging the user toward oversharing.
- Never invent metrics, quotes, outcomes, or customer claims.
- If a strong claim needs proof that is not available, soften the statement or insert a clearly marked placeholder for the user to confirm.

## Workflow

### 1. Get the Topic

- If `$ARGUMENTS` names a feature, launch, milestone, or theme, use it as the initial topic.
- Otherwise ask one concise question to determine what part of the project the post should focus on.
- If the request is vague and the repo suggests multiple strong stories, ask the single question that will narrow the topic fastest.

### 2. Gather Context After the First Answer

Read only what helps with the chosen topic:

- Root orientation files such as `AGENTS.md`, `CLAUDE.md`, and `README.md`
- Relevant docs in `planning/`, `docs/`, changelogs, release notes, or architecture notes
- Relevant source files, components, scripts, configs, or tests tied to the topic
- Recent git history for the feature area, including commit messages and file-level changes
- Existing product or launch language already present in the repo

Use that context to ground:

- what changed
- why it mattered
- what tradeoffs are interesting enough to write about
- what appears safe to publish
- what still needs explicit confirmation from the user

### 3. Interview for the Missing Truth

Ask one question at a time. Prioritize the questions that will most affect the post:

- what outcome, lesson, or narrative the user most wants to highlight
- which details are safe to publish
- who the likely reader is, if the repo does not make it clear
- what voice fits best, if first-person versus team voice is ambiguous
- what concrete examples or evidence make the story credible

Keep the interview short. Stop when the remaining unknowns would not materially change the angle or package.

### 4. Propose Angles

Offer 2-4 angles. For each angle include:

- working title
- target reader
- why the angle fits the repo and interview context
- sensitive details or risks to avoid

Then ask the user to pick one or combine elements.

### 5. Propose the Outline

After the user picks an angle:

- infer the best audience and voice from the repo and interview
- say what you inferred
- if either is still ambiguous, ask a focused follow-up before continuing

Present a concise outline with:

- headline direction
- opening hook
- 3-5 main sections
- CTA direction
- SEO keyword or search intent if it is obvious

Ask: `Does this outline look right? Any changes before I draft?`

### 6. Confirm Output Mode

Ask whether the user wants the package:

- in chat only
- written to files
- both

If files are requested, ask where to write them unless the repo already has an obvious publishing path.

Suggested defaults:

- `content/blog/`
- `posts/`
- `blog/`
- `content/`
- `docs/blog/` when the repo has no obvious CMS path

### 7. Draft the Full Package

Produce the full publishing package:

- 3 headline options
- publish-ready article
- excerpt
- slug
- SEO title
- meta description
- primary keyword or search intent
- tags
- CTA
- LinkedIn copy
- image or illustration ideas
- optional placeholders that still need user confirmation

Tailor the package to the selected angle:

- technical deep dive: emphasize mechanics, architecture, and tradeoffs
- founder or build-in-public update: emphasize decisions, momentum, lessons, and why the work mattered
- portfolio or case study: emphasize problem, constraints, process, outcomes, and why the project is worth caring about

### 8. Revision Gate

After the draft package, ask:

`Should I revise anything before we treat this as final?`

If the user asks for revisions, update the package and preserve all previously approved publishability boundaries.

### 9. File-Writing Mode

If the user chose files, write only after the draft package is approved.

Unless the user specifies another structure, prefer:

- `blog-post.md` for the article
- `blog-package.md` for the supporting SEO and social package

When writing files:

- match the repo's existing frontmatter format if one exists
- keep supporting SEO or social content in frontmatter or companion files based on the repo's conventions
- do not overwrite existing content without confirming

## Output Template

Use this structure unless the repo already has a better publishing format:

```markdown
## Angle
<selected angle + target reader + chosen voice>

## Article
# <primary headline>

<article body>

## Packaging
- Headline options:
- Excerpt:
- Slug:
- SEO title:
- Meta description:
- Primary keyword / search intent:
- Tags:
- CTA:
- LinkedIn copy:
- Image ideas:
- Placeholders to confirm:
```

## Rules

- Interview first, then inspect the repo. Do not skip the interview entirely.
- Ask one question per message.
- Use repo context to improve specificity, not to leak sensitive details.
- Choose audience and voice when the evidence is strong; ask when it is not.
- Prefer concrete project truth over generic startup-blog filler.
- Pause for approval after angles, after the outline, and after the draft package.
- Ask before deciding between chat-only output and writing files.
- If the repo lacks enough evidence for a strong post, say what is missing and ask the single most useful next question.
- Do not publish automatically or imply that the copy is ready to ship without the user's final approval.
