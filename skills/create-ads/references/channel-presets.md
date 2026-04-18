# Channel Presets

Use this file when the user asks for channel-specific ad outputs or when you need to infer sensible default formats.

## Presets

| Channel preset | Ratio | Suggested size | Use when | Composition notes |
|---|---|---:|---|---|
| `square-feed` | 1:1 | 1080 x 1080 | General social feed, paid social comparison sets | Keep the focal subject centered with safe space on all sides. |
| `portrait-feed` | 4:5 | 1080 x 1350 | Instagram and mobile-first feed ads | Keep the key subject slightly above center and leave room for platform chrome. |
| `story` | 9:16 | 1080 x 1920 | Stories, reels cover art, full-screen mobile placements | Use a tall composition, strong vertical flow, and avoid crucial detail near top and bottom UI zones. |
| `landscape` | 16:9 | 1920 x 1080 | Video-thumbnail style ads, hero banners, broad web placements | Favor wide framing, clear left-right balance, and one dominant subject. |
| `link-share` | 1.91:1 | 1200 x 628 | Meta link ads, social previews, basic display placements | Keep the concept simple and avoid tiny background details. |

## Selection Guidance

- If the user names a specific channel, map to the closest preset above.
- If the user asks for "social ads" without a platform, default to `square-feed` plus `portrait-feed`.
- If the user asks for one mobile-first deliverable, prefer `portrait-feed`.
- If the user asks for landing-page or banner-style support art, prefer `landscape` or `link-share`.

## Creative Guardrails

- Favor one dominant idea per frame.
- Leave visual breathing room for future copy overlays outside the generated image.
- Avoid dense edge detail that will crop poorly when adapted later.
- Keep logos subtle unless brand recognition is the main goal.
- Avoid tiny interface details that become mushy at ad scale.

## Batch Sizing

- Default to 2-4 rendered variants total.
- If multiple channels are requested, cover the most important channels first.
- Save extra channel adaptations in `prompts.md` even when they are not rendered in the first batch.
