---
name: create-ads
description: "Plan and generate channel-specific static image ad packages for products, launches, features, or repos. Use when Codex needs to turn a manual brief plus inferred repo and URL context into ad concepts, text-light image prompts, separate ad copy, rationale, and reusable saved artifacts; ask interview-style follow-ups when the brief is incomplete."
---

# Create Ads

Plan and generate reusable ad packages for project marketing. Start with the smallest missing question, then turn the answer plus project context into a saved planning or generation package.

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## Modes

- `plan`: Build a campaign-ready ad plan without rendering images.
- `generate`: Build the plan, then generate a small batch of static image ads plus copy.
- If the user does not specify a mode and the request is ambiguous, ask one short question to choose `plan` or `generate`.

## Core Defaults

- Support static image ads only in v1.
- Keep images text-light. Write headlines, body copy, CTAs, and variations separately instead of baking text into the image.
- Treat manual brief details as the source of truth.
- Use inferred context from the repo and any live product URL to fill gaps, not to override explicit user guidance.
- Use Codex's built-in raster image generation as the default renderer when available.
- Keep prompts provider-neutral so a future renderer can replace the current one without rewriting the skill.
- Return rendered images in the conversation. Save reusable project artifacts to files. Save image files too only when the active renderer exposes a file output path.

## Interview Gate

If key inputs are missing, ask one focused question at a time. Prioritize:

1. mode
2. offer or CTA
3. target audience
4. channels
5. landing URL or product URL
6. constraints that materially change the visuals

Stop asking questions once the remaining ambiguity would not materially change the ad package. Then proceed.

## Context Merge

After the brief is usable, collect only the context that sharpens the ads:

- Read root guidance such as `AGENTS.md`, `README.md`, and any obvious product docs.
- Read only the repo files that explain the feature, audience, value proposition, or differentiators relevant to the ad.
- If the user provides a live product URL, inspect it before finalizing copy or visual direction.

Use this precedence order:

1. explicit user brief
2. live product URL for customer-facing language and current positioning
3. repo context for product truth, implementation details, and terminology

If sources disagree, call it out briefly and follow the highest-priority source above.

## Brief Shape

Capture or infer these fields before generating:

- project or feature name
- objective
- audience
- offer
- CTA
- channels
- landing URL
- visual constraints or brand cues
- proof points that are safe to claim
- banned claims or phrases

If a field is missing, infer it only when the evidence is strong. Otherwise ask.

## Output Path

If the user gives a path, use it. Otherwise prefer the first strong match in this order:

1. existing repo path that clearly fits marketing outputs, such as `marketing/`, `ads/`, `content/ads/`, or `public/ads/`
2. `deliverables/ads/<YYYY-MM-DD>-<campaign-slug>/`

Do not overwrite an existing campaign directory unless the user asks to update it. When unsure, create a new dated directory.

For the default artifact layout, read [references/artifact-layout.md](references/artifact-layout.md).

## Plan Workflow

When running in `plan` mode:

1. Write a concise brief snapshot with any inferred assumptions marked.
2. Identify the 1-2 strongest audience or offer angles.
3. Propose 2-4 ad concepts with distinct visual hooks.
4. Map each concept to the best channels and aspect ratios.
5. Write copy directions for each concept:
   - headline angle
   - supporting copy
   - CTA
   - proof points
6. Write provider-neutral image prompts and negative prompts for each concept.
7. Save the plan artifacts and return a concise comparison in the conversation.

Do not render images in `plan` mode.

## Generate Workflow

When running in `generate` mode:

1. Build a lean plan first, even if you do not show the full planning section unless it helps the user.
2. Use the requested channels. If none are given, choose the smallest useful set.
3. Read [references/channel-presets.md](references/channel-presets.md) before finalizing aspect ratios or composition.
4. Generate a small comparison batch, usually 2-4 total variants across the selected channels.
5. Keep the visuals text-light and avoid visible UI text, watermarks, fake app chrome, or unreadable signage unless the user explicitly wants them.
6. Produce separate copy for each variant:
   - headline
   - primary text
   - CTA
   - optional backup headline
7. Produce a short rationale for why each variant exists and what it is testing.
8. Render the images with Codex image generation when available.
9. Save the reusable prompt package, copy, and run manifest even if image rendering is unavailable.

If the user asks for a large channel matrix, still keep the rendered batch small. Save the remaining prompt variations for later passes instead of trying to render everything at once.

## Rendering Rules

- Treat the renderer as an implementation detail, not the skill itself.
- Keep prompts portable across providers by describing composition, lighting, framing, and mood rather than vendor-specific parameter syntax unless the active tool requires it.
- If a future provider supports direct file output, save images alongside the manifest using stable names.
- If the active tool does not expose file output, note that clearly in the manifest and keep the reusable inputs on disk.
- Do not depend on Sora or any single provider name in the saved prompt package unless the user explicitly asks for provider-specific tuning.

## Copy and Claim Safety

- Do not invent metrics, customer quotes, awards, or adoption claims.
- Keep claims anchored to source evidence from the user, repo, or live product page.
- Generalize or soften a claim when proof is incomplete.
- Keep copy concise enough to fit paid social and display adaptations later.

## Final Conversation Output

Return a compact summary with:

- chosen mode
- brief snapshot
- generated concepts or variants
- what was saved
- any assumptions
- any rendering limitation that affected file outputs

## Rules

- Ask one question at a time when the brief is incomplete.
- Prefer `plan` when the request is strategic or ambiguous.
- Prefer `generate` when the user clearly wants usable ad visuals now.
- Keep manual brief inputs ahead of inferred context.
- Keep images text-light and write the copy separately unless the user explicitly overrides that rule.
- Save reusable artifacts every run so later iterations can build on them.
- If the request moves into video ads or provider-specific API wiring, treat that as a future extension and keep the current run scoped to static image ads unless the user expands the brief.
