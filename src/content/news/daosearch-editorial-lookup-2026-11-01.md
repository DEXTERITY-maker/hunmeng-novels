---
title: "DaoSearch research checks join the Hunmeng editorial workflow"
excerpt: "Hunmeng editors now have a protected DaoSearch lookup workflow for Chinese web-novel titles, authors and duplicate checks, ready for activation with a private API key."
category: changelog
publishedAt: "2026-11-01"
order: 1300
cover: "/images/art/hunmeng-landscape-day-1536.webp"
coverAlt: "Illustrated mountain landscape"
coverFit: art
---

Hunmeng has prepared a **DaoSearch-assisted research tool** for editorial staff. It helps compare Chinese web-novel metadata with titles already recorded in the library and the protected editorial database.

The manual workflow supports lookups by **title, author or original source URL**, including Fanqie, Qidian, JJWXC, Faloo, Qimao and Zongheng. Potential duplicates are flagged for manual review.

### Availability

- The tool runs in protected GitHub Actions, not from the public browser.
- Live lookup requires an account-issued **DaoSearch API key**, stored only as a server-side repository secret. It is **not automatically enabled** by this update.
- Only small metadata lookups are performed. No complete catalogue, cover image, translation or chapter is imported.
- A listing's existence does not establish publishing rights. The existing editorial approval system remains mandatory.

[Browse Hunmeng novels](/catalog/) · [Read the rights policy](/rights/)
