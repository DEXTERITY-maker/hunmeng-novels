# Background illustrations

Generated in ChatGPT from Hunmeng prompts (October 2026). Owned by the site; no third-party art. Not referenced by any page yet — they are wired in stage by stage.

All files are WebP, 3:2, in two widths: `-1536` for desktop and `-960` for phones (`srcset`).

| File | Where | Theme |
| --- | --- | --- |
| `hunmeng-landscape-day` | Home hero, catalog banner | light, sepia |
| `hunmeng-landscape-night` | Home hero, catalog banner | dark |
| `comprehension-day` | *Comprehension Against the Heavens*: novel page, chapter headers, catalog card art | light, sepia |
| `comprehension-night` | same | dark |
| `latency-night` | *The Latency of Tomorrow*: novel page, chapter headers, catalog card art | all themes (the scene is already at night) |

Rules:

- Day and night versions of the same scene share the exact composition, so switching the theme does not shift the picture. Swap them with CSS per theme; do not crossfade different crops.
- The main subject is right of centre. The left ~40 % is calm and reserved for text, but text never sits directly on the picture: always over a cream gradient (light/sepia) or a dark gradient (dark theme) with at least 4.5:1 contrast.
- The castle landscape belongs only to the home page and catalog. Each novel uses its own art; never put the castle on a novel page, chapter header or contents dialog.
- Sepia uses the day image with a warm overlay; there are no separate sepia files.
- Decorative only: `alt=""` or CSS backgrounds, lazy-loaded below the fold, and the layout must stay usable if an image fails to load.
- `comprehension-night` was produced by recolouring `comprehension-day` so the two align exactly.
