# Scheduled chapters

Chapters waiting for release live here, one folder per novel: `scheduled/<novel-slug>/chapter-<N>.md`.
They are not part of the site build.

Every day at 15:07 UTC the workflow `.github/workflows/release-chapters.yml` runs
`scripts/release-scheduled.mjs`. For each novel in `schedule.json` it moves the next `perDay`
chapters, strictly in number order, into `src/content/chapters/<novel-slug>/`, stamps
`publishedAt` with the release date, updates the novel's `updatedAt`, builds the site and pushes
to `main` (Timeweb deploys the push). After `finalChapter` is released, the novel is marked
completed. If the next chapter is missing, the run releases what it can and then fails, so GitHub
emails the repository owner.

`schedule.json` fields: `perDay` (chapters per day), `finalChapter` (last chapter number),
`lastRelease` (date of the last release; the script never releases twice on the same date).
To release by hand, run the workflow with "Run workflow" on GitHub.

## Chapter file format

```markdown
---
novelSlug: "comprehension-against-the-heavens"
slug: "chapter-150"
number: 150
title: "Chapter title"
description: "One or two sentences, 10–200 characters, no double quotes inside."
---

Chapter text in Markdown. Scene breaks: a line with `* * *`.
```

No `publishedAt` here: the release script adds it. `tests/release-scheduled.test.mjs` checks every
queued file (frontmatter, description length, no gaps after the published chapters) on every push.

The story plan for *Comprehension Against the Heavens* is in
`docs/novels/comprehension-against-the-heavens/` (`bible.md` and `outline.md`).
