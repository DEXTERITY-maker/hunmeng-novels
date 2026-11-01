# DaoSearch → Hunmeng: private discovery and duplicate checks

DaoSearch is an **external read-only metadata service**, not a manuscript or chapter provider. The original novels belong to authors and source publishers. Its API terms forbid wholesale catalogue copying, bulk training and publishing their cover images and synopses without appropriate permissions. Every displayed result links to DaoSearch.

## Available integration

- An owner/editor can open **Hunmeng /admin/** → **Sources and permissions** → **Look up Chinese web novels and check duplicates**.
- The link runs the private GitHub Actions workflow `DaoSearch — editorial lookup and duplicate check` on demand, not from the public website.
- The workflow queries **up to five individual books** for a title/URL or the first five books found for an author, calls `GET /search` and `GET /books/{source}/{source_book_id}` with read-only GET requests, and generates a brief report in GitHub's run summary and a short-lived JSON artifact.
- The report includes the original platform identifier as a **string** (Fanqie has 19-digit IDs), a DaoSearch link, source title/author, and potential duplicates. Links are included per DaoSearch's terms. No complete synopses, cover files, reader reviews or third-party chapters are copied.
- Duplicate checks run against both the committed Hunmeng novels and `src/data/external-novels.ts` plus the **protected** Supabase `novel_sources` table when the server-side Supabase credentials are present. If protected sources cannot be checked, the report explicitly says that its coverage is incomplete.
- Exact matching considers the original platform/source ID or the title **and** author. Matching title alone is flagged for manual review. This is a warning, not an automatic delete/merge.
- DaoSearch returns metadata, **not the right to publish chapters or translations**. Every result is advisory, no publication rights are verified or changed, and no new novel is automatically published.

## Activate private API access

DaoSearch API requires a **personal account aged at least one day**, terms acceptance and a private Bearer key.

1. Sign in at [DaoSearch](https://daosearch.io/developers), visit **Account**, accept the terms, and choose **Create key** if eligible. The key is shown once.
2. In [Hunmeng GitHub repository secrets](https://github.com/DEXTERITY-maker/hunmeng-novels/settings/secrets/actions), create the **Actions repository secret** with name `DAOSEARCH_KEY` and paste its value there **only**. Never send it into a chat, commit it, expose it in client bundles or pass it in a URL.
3. [Open the DaoSearch workflow](https://github.com/DEXTERITY-maker/hunmeng-novels/actions/workflows/daosearch-lookup.yml) → **Run workflow**. Fill **either** a title/original URL in `query` **or** an `author` (not both); select a source if needed. Use `Highway Survival` as a useful check against the existing Hunmeng reference.
4. Read the GitHub run summary and download the 3-day report artifact if desired. No source is added to the public library as a result of lookup.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are existing secrets used by the licensed editorial publisher. If configured, the duplicate check also consults protected draft sources. If either is unavailable the lookup **still works** against the local catalog but warns that it is not exhaustive.

## Connect DaoSearch directly to ChatGPT (optional)

DaoSearch also offers an OAuth MCP endpoint `https://daosearch.io/mcp` for ChatGPT. To add it, open ChatGPT Settings → Apps (developer mode if requested) → Add an app by URL, enter the unchanged endpoint, then sign in and approve access yourself. Connecting OAuth to ChatGPT does **not** automatically place `DAOSEARCH_KEY` into GitHub. It allows searching with the assistant; publishing into Hunmeng remains a separate reviewed step.

## Operational limits and security

- Authenticated server-side access only; the DaoSearch API must **never** be called by public pages or by putting a key in JavaScript.
- Use the `Authorization: Bearer ...` header and an identifying `User-Agent`. Do not include the key in URL parameters.
- API source limit: 120 requests/minute and 50,000 units/day **per account**; source API cost per search is 1 unit (author search 5), individual books 1 unit each. This workflow performs **at most six DaoSearch requests** per run and no bulk catalogue walk.
- A 429 or authorization error stops safely. Secret-bearing redirects are followed only within `daosearch.io/api/v1`.
- The search is **manual**, does not trigger paid translation and never bypasses rights, RLS, chapter approval, GitHub release gates or publisher checks.
- Subsequent uses should link to the book's DaoSearch URL wherever DaoSearch data is shown, not reproduce their whole catalogue.

**Verification:** `node --test tests/daosearch-discovery.test.mjs`. Tests use mocked DaoSearch responses, not real API calls, so real search remains **unverified until the key is connected**.
