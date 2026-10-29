# Public novel request page — UI-only draft

The page at `/requests/` is a responsive, accessible **preview** inspired by the user-provided WTR-Lab mobile reference, but using Hunmeng's current theme tokens and site navigation.

- The form checks **HTTPS URL syntax locally**. It never posts URLs or user information; `No data was sent` is explicit.
- Source cards, limits, voting and request history are **not fabricated**: they are clearly described as not active.
- The route is `noindex`, contains no links from main navigation yet, and has no server backend.
- The input is **not** used as a security decision, nor does local URL format imply recognized/supported source or permission to import.
- The eventual live version depends on PR #62 (offline source/match foundation) and PR #66 (isolated identity/HTTP/Postgres bridge), plus unresolved production blockers.
- Add a site navigation entry, enabled submit, supported-provider catalog, authenticated history, exact database roles/RLS, IP/edge limiter, match evidence persistence and real Supabase integration **only after** the backend has passed isolated security testing and the owner approves deployment.
- `tests/requests-preview.spec.ts` takes a real Chromium screenshot at 390px and asserts that clicking the preview button creates no HTTP write requests.

This PR must not be merged before the owner reviews the visual layout and agrees that a clearly disabled public preview is acceptable, or the full backend is ready.
