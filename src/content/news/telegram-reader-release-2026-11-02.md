---
title: "Telegram chapter cards and reader assistant preparation"
excerpt: "Chapter announcements gain clearer reading links and delivery safeguards, while a private-chat assistant awaits secure activation."
category: changelog
publishedAt: "2026-11-02"
order: 1400
cover: "/images/art/hunmeng-landscape-day-1536.webp"
coverAlt: "Illustrated mountain landscape"
coverFit: art
---

Telegram chapter notifications now support clearer reading cards with a direct chapter link and an inline **Read chapter** button. The delivery service protects against ambiguous retries, accidental duplicate notices, and bulk sends without editorial review.

### Reader assistant

A private-chat assistant has been prepared with `/start`, `/help`, `/catalog`, `/latest`, and `/search` commands, plus inline navigation to published novels and chapters. **These interactive commands are not yet active:** they require separately approved Supabase guard permissions, Cloudflare secrets, and Telegram webhook registration.

### What stays the same

Reader accounts, shelves, saved reading progress, published chapter permissions, and existing notification history remain unchanged. The Telegram channel notification workflow remains independent of the future private-chat assistant.

[Explore the catalog](/catalog/) · [Hunmeng on Telegram](https://t.me/hunmengnovels)
