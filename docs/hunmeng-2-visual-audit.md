# Hunmeng 2.0 — visual QA observations (2026-11-02)

**Status:** screenshot inspection complete for the earlier preview commit `a6b143a`. This is a technical review, **not owner approval** or authorization to launch.

## Evidence

The GitHub Actions run [41477109212](https://github.com/DEXTERITY-maker/hunmeng-novels/actions/runs/41477109212) saved artifact [`hunmeng-design-preview-41477109212`](https://github.com/DEXTERITY-maker/hunmeng-novels/actions/runs/41477109212/artifacts/13158880304). It includes `hunmeng-v2-home.png`, `hunmeng-v2-catalog.png`, `hunmeng-v2-reader.png`, and `hunmeng-v2-admin-guest.png` for both desktop and mobile projects.

These screenshots come from a **synthetic demo build**, so the visible 2-book count and dummy book titles are test data, not production statistics. The admin screenshot is **guest mode**; no authenticated private editorial material was captured.

## What the screenshots actually show

| Screen | Desktop | Mobile | Follow-up |
| --- | --- | --- | --- |
| Reading room | Full hero, spotlight book, search and clear link back | Hero and search fit the viewport | Review the full lower sections in longer viewport captures before launch |
| Discovery | Working hero and genre chips plus filter/results structure | Hero reflows, chips remain visible, no apparent horizontal clipping | Check long real-world book titles and crowded tag combinations |
| Reader | Main heading and controls render together | Chapter starts lower than necessary due to inherited reader top padding; V2 auto-hyphenation differs from the original mobile reader | Reduce V2-only top padding and retain `hyphens: manual` on mobile; add regression test |
| Editorial | Guest sees sign-in notice and no staff controls | Banner and guest notice fit the narrow screen | Signed-in visual states require approved **synthetic** staff fixtures; never capture real staff data |

The V2 reader top-padding and mobile typography findings are addressed in the same change as this document. Recheck them against **new screenshots from the final head**, not only the earlier artifact.

## Still required before sign-off

- Final green push and PR CI checks on the same HEAD SHA.
- Owner review of visual identity, hierarchy and mobile legibility.
- Informed accessibility review: contrast in all themes, focus indicators, dialog interactions and long content.
- All remaining launch gates in [the release-candidate checklist](./hunmeng-2-release-candidate.md).

Production remains unchanged; the screenshots and associated styling do not authorize a deployment.
