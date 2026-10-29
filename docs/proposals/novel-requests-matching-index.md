# Offline candidate index

`createWorkCandidateIndex` builds an immutable, in-memory snapshot for a catalog version. It indexes recognized provider and external ID, normalized original and alternative titles, authors, and distinct numbered chapter-title signatures. Its handler-compatible reader selects candidates, then the existing matcher produces advisory explanations. The index does not fetch sources or change works.

Deterministic comparisons against a full scan and a larger fictional catalog test candidate equivalence for the current matcher. Rebuild the snapshot when the catalog changes. An empty result is not proof of uniqueness: unknown aliases, translations, spelling variations and unrelated cover images may not match. Generic chapter headings alone do not count. Human moderation must resolve uncertain candidates; no match automatically merges or publishes works.

This is an in-memory prototype, not a database index or a durable, cross-instance catalog. Chapter titles may be used only where the source's approved metadata policy allows them; chapter text and covers are not imported. Before production, design and test indexed database candidate retrieval, pagination, access controls and scale against a representative dataset, and configure only sources whose permitted uses have been established.
