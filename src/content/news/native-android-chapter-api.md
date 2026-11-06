---
title: "Native Android reader: chapter data endpoint"
excerpt: "Published chapter text is now available to the native Android reader through a dedicated static JSON endpoint. The website reading experience is unchanged."
category: changelog
publishedAt: "2026-11-07"
cover: "/images/hunmeng-emblem.png"
coverAlt: "Hunmeng emblem"
coverFit: emblem
---

Hunmeng now exposes published chapter text for a native Android reading experience.

### What's new

- Added a static JSON endpoint for each published chapter under `/mobile/chapters/`.
- Reused the website's validated chapter collection and publication rules.
- Kept unreleased scheduled chapters outside the public text feed.

### What stays the same

The website reader, novel catalog, user accounts and saved reading progress remain unchanged. This update adds a read-only source for the Android client; it does not yet change the Android application.
