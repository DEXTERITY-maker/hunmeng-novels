# Hunmeng: public-domain books in the native reader

This workflow is **different** from the external novel discovery list and from the rights-gated modern translation publisher.

## Approved content only

The initial batch uses ten original-English works by authors who died no later than 1950. Their editions are stored in **pinned** Standard Ebooks GitHub repositories, whose `LICENSE.md` states that the source text is believed to be in the US public domain and the editorial contributors dedicate their own contributions under CC0 1.0. The titles were also selected as historic works to reduce non-US copyright uncertainty.

A US public-domain designation is **not proof of worldwide public domain**. Only add candidates after checking the applicable countries, the edition, authors, translation and adaptation rights, and any special copyright extensions. Do not add anything merely because it is free to read on a website.

## Full-text ingestion

The protected `Import verified public-domain novels to Hunmeng` GitHub Action:

1. Checks a maintained set of unique slugs, original publication years, author-death years and exact upstream Git commit hashes in `src/data/public-domain-seed.json`.
2. Uses GitHub sparse clones of specifically listed `standardebooks` repositories; no scraping from WTR-Lab, Fanqie or Project Gutenberg. Verifies pinned revisions and the public-domain/CC0 statement before extracting text.
3. Extracts the narrative XHTML in the reading order established by the EPUB manifest/spine; strips HTML markup, embeds text locally and divides it into complete 4,000–8,500-character reading pages with a whitespace-only segmentation check.
4. Generates on-site `src/content/novels/<slug>.json`, `src/content/chapters/<slug>/chapter-N.md`, and one glossary per work. It always links to the edition used, and uses local placeholder covers rather than unverified copyrighted artwork.
5. Generates one accurate news announcement naming **only newly imported books**.
6. Runs browser regressions, production build, static link checks, chapter validation and withdrawn-content checks before committing and publishing to Cloudflare Pages.

The importer is idempotent: existing slugs are skipped rather than overwritten. New books must pass checks; if an upstream source revision changes, the job stops instead of blindly fetching a different edition. The first approved import runs for ten new books only; later manual runs may import 1–10 additional pre-reviewed entries **once those entries are explicitly added to the manifest**.

The repository contains an independent daily ChatGPT automation to locate and attempt to publish up to ten authorized or public-domain novels with the existing rights and editorial rules. That automation is separate from GitHub and must not represent candidates or external listings as on-site chapter publications. New candidates require documented human-readable evidence and a new reviewed manifest.

## Special caution: contemporary web novels

**Highway Survival** currently has `rights_status = pending` and no approved chapter text. Do not import or translate it under this public-domain workflow. Use the existing `/admin/` editorial queue, permissions, human review and publishing guard to bring in licensed contemporary chapters. This importer never changes `rights_status` and never inserts into `novel_translation_jobs`.

## Recovery

If the publishing action fails before `git push`, no generated material is published. If the Cloudflare deploy fails **after** a successful push, source files remain on `main` but the last successful deployment stays active; a new approved deployment is required. Verify Cloudflare deployment SHA and a real `/novel/<slug>/chapter-1/` route before announcing success. Do not add duplicate news items after a failed run.
