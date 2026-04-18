# Artifact Layout

Use this file when deciding where and how to save ad-generation outputs.

## Default Directory

If the repo does not already have a clear marketing path, use:

```text
deliverables/ads/<YYYY-MM-DD>-<campaign-slug>/
```

If the user gives a path, use that instead.

## Recommended Files

```text
<campaign-dir>/
├── brief.md
├── plan.md
├── copy.md
├── prompts.md
├── manifest.md
└── images/            # Only when the renderer exposes file output
```

## File Responsibilities

### `brief.md`

- Final working brief
- Explicit user inputs
- Inferred assumptions
- Source precedence notes when there were conflicts

### `plan.md`

- Concept list
- Audience and offer framing
- Channel mapping
- Visual direction
- Rationale for what each concept is testing

### `copy.md`

- Primary headline per variant
- Backup headline per variant
- Body copy or supporting text
- CTA options
- Any claim-safety notes

### `prompts.md`

- Provider-neutral image prompts
- Negative prompts
- Channel-specific adaptations
- Iteration notes for future runs

### `manifest.md`

- Timestamp
- Mode used
- Output path
- Files created
- Renderer used
- Whether images were saved to disk or only returned in the conversation
- Follow-up ideas for next iteration
