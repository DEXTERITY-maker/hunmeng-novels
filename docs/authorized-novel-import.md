# Hunmeng: authorized novel import and on-site chapter reading

## Scope

Hunmeng supports two **separate** stages:

1. **Discovery**: any publicly described third-party work may be listed with accurate source links and a clear external label. No chapter text is republished in this stage.
2. **Publication**: licensed text can enter the existing private translation queue and, after verification and human approval, be published into the normal `/novel/<slug>/<chapter>/` reader. This is never initiated by a source URL alone.

### Import a licensed manuscript (staff only)

1. Sign in to `/admin/` with an existing editor or administrator account.
2. Confirm the source is present in `novel_sources` and an administrator has independently verified documentary **translation and publication** rights, including the expiry date. The status must be `verified`, both permission flags true, and `verified_at` set. The WTR-Lab listing alone is insufficient.
3. In **Import authorized chapters**, select the verified source, paste JSON with a `chapters` array, confirm the license statement, and select **Validate batch** followed by **Import as private drafts**.
4. Each chapter must have `chapter_number` (positive integer), `chapter_slug` (lowercase hyphenated), `chapter_title`, `chapter_description` (10–200 characters), `original_text` (80–300000 characters), and optional `translated_text` (leave empty for machine translation). Maximum 10 chapters per batch. Duplicates and unknown fields are rejected. No imported chapter is public. Before approval, the **translated** chapter must also satisfy the existing 4,000–8,500 Unicode character publication requirement; shorter draft text is allowed for editing but will not be published.
5. Staff can open a draft in the editorial panel, edit a translation, add glossary terms and send for review. The administrator approves only after rights and QA checks.

Example structure (**not actual novel content**):
```json
{
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_slug": "chapter-1",
      "chapter_title": "Opening chapter",
      "chapter_description": "A brief synopsis of the opening chapter.",
      "original_text": "Replace this sentence with the authorized full chapter text. Original manuscript text must be provided and must meet the minimum length requirement of eighty characters.",
      "translated_text": ""
    }
  ]
}
```

### Machine translation (optional; not scheduled)

The protected GitHub Actions workflow **Prepare authorized translations (manual only)** can prepare English drafts using the OpenAI Responses API. It requires existing, securely configured GitHub Actions secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and (only for actual translation) `OPENAI_API_KEY`. The optional workflow variable `OPENAI_TRANSLATION_MODEL` controls the chosen model. **Never paste keys into chat, code, or public forms.**

Run the workflow with an exact `source_slug`, set a limit of 1–3 chapters, and leave `execute_translation=false` for a no-charge preview. Actual model use requires explicitly selecting `execute_translation=true` **and** `confirm_ai_processing_rights=true` (only when the license permits sending the authorized manuscript to an external AI provider), and can incur API usage charges. It is not triggered by normal browsing or by users submitting URLs. The AI runner accepts source texts up to 32,000 characters per chapter; longer licensed chapters can still be imported as private drafts for manual handling.

The runner checks the current source rights **before sending text to the provider** and **again before writing** a translation. It selects only private, untranslated draft chapters. It never changes the status to approved/published, and uses optimistic concurrency to avoid overwrites. A human reviewer must inspect the machine translation and all its terminology.

### Controlled publication and withdrawal

The existing `Publish approved translations` workflow is a separate service-role publisher, controlled by `HUNMENG_PUBLISH_ENABLED`, and selects **approved** chapters only. It rechecks publication rights and glossary compliance immediately before Git push. The publication adds the novel, glossary, individual chapter pages and their reader-facing news. This is what enables comfortable reading directly on Hunmeng. The job must never run against pending or revoked rights.

To withdraw a published work, revoke its rights and remove its public chapter files in an independently reviewed release. Revoking rights blocks *new* chapters, but does not by itself erase previously generated static pages.

### Current example: Highway Survival

`highway-survival-lathe-gatling` has `rights_status=pending`, with both permission flags false. It is catalogued as an external reference only. **Do not obtain/copy its chapters from WTR-Lab or Fanqie, queue them for translation, or publish them until rights are documented and verified.**

### Boundaries

- No arbitrary-URL scraping or bypassing source access controls.
- No third-party novel text or cover art embedded in the public app without permission.
- No service-role secret or AI API key exposed in the static site bundle.
- No automatic approval, publication, or XP allocation for drafts.
- Editorial browser operations use the already configured staff auth and Supabase RLS; the server publisher remains the final gate.
