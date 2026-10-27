# Genre and tag vocabulary

Reference checked on 27 October 2026:

- [WTR-LAB novel list](https://wtr-lab.com/en/novel-list): 40 genre choices.
- [WTR-LAB tag directory](https://wtr-lab.com/en/tags): 888 tag records in 11 groups.
- [WTR-LAB advanced search guide](https://wtr-lab.com/en/faq/9/master-the-advanced-search-complete-guide): genres describe the broad type of story; tags describe specific story elements. Included tags can match all or any; exclusions always remove a matching novel.

| Reference group | Reference records |
| --- | ---: |
| Protagonist Archetypes | 190 |
| Adaptations | 90 |
| Power Systems | 100 |
| Socio-Political Structures | 71 |
| Worldbuilding | 56 |
| Narrative | 46 |
| Beings & Factions | 68 |
| Relationship Tropes | 136 |
| Professional Archetypes | 64 |
| Tone & Atmosphere | 27 |
| Miscellaneous Narrative Elements | 40 |

`src/data/taxonomy.json` stores genre and tag names, group membership, and provenance. The 888 reference records reduce to 886 distinct names: “Pirates” and “Comic Universe” each occur twice. One local filter per name avoids duplicate checkboxes. This is a vocabulary, not a copy of WTR-LAB novel metadata: no descriptions, cover art, assignments, popularity counts, or tag definitions are imported. Genre spelling follows Hunmeng's existing English edition (for example, “Science fiction” and “Slice of life”).

`getTaxonomy()` merges the vocabulary with published Hunmeng metadata at build time. It retains site-specific labels such as “Urban fantasy”, “Exceptional comprehension”, and “New York”, preserves existing filter URLs, and calculates counts from distinct local books. Case variants share a single term. Existing novels are not automatically assigned tags: editors must check the story before adding a label.

## Reader behavior

- `/genres/` and `/tags/` have search, local counts, alphabetical/popularity sorting, and an option to show only labels with books. Tags also have group filtering.
- Zero-count labels remain discoverable and lead to a truthful empty catalog result. Their counts never include WTR-LAB books.
- Catalog genres include the full vocabulary. The tag picker searches and filters by group, has independent Include/Exclude controls, and keeps selected tags visible while searching.
- `tagMode=all` is the default; `tagMode=any` accepts any included tag. Exclusions apply in either mode. Conflicting include/exclude selections return no matching book under all-mode.
- Filter selections and matching mode survive URL sharing/reload. Existing Russian saved tag links remain supported.
- Novel genre links and existing tag links open filtered catalog results. Footer and catalog links lead to the directories.
- Editorial genre/tag inputs offer the shared names as suggestions; comma-separated custom values remain allowed. No database migration is needed.

## Maintenance and verification

Add or correct reference vocabulary in `src/data/taxonomy.json`. Add story-specific classifications to the novel JSON files or the editorial form. Do not copy WTR-LAB counts into Hunmeng or auto-classify books based on popularity. New custom tags appear automatically in the directories; unknown tags are grouped under “Hunmeng tags”.

Run `node --test tests/*.test.mjs`, `npm run build`, then `npm run build:demo` and `npm test`. `tests/taxonomy.spec.ts` covers local counts, directory navigation, search/groups, unused labels, all/any/exclusion logic, URL restoration, reset, and legacy links on desktop and mobile.
