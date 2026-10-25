// Stored values are kept compatible with the existing database and publisher.
// English labels belong at the presentation boundary, never in access decisions.
export const originalStatusLabels = {
  'Продолжается': 'Ongoing', 'Завершён': 'Completed', 'Приостановлен': 'On hiatus',
} as const;
export const translationStatusLabels = {
  'Переводится': 'In progress', 'Завершён': 'Completed', 'Приостановлен': 'On hiatus',
} as const;
export const termTypeLabels = {
  'персонаж': 'character', 'место': 'place', 'техника': 'technique', 'предмет': 'item',
} as const;
export const rightsStatusLabels: Record<string, string> = {
  pending: 'Awaiting verification', verified: 'Verified', expired: 'Expired', revoked: 'Revoked',
};
export const jobStatusLabels: Record<string, string> = {
  draft: 'Draft', queued: 'Queued', translating: 'Translating', translated: 'Translated',
  review: 'In review', approved: 'Approved', publishing: 'Publishing', published: 'Published',
  failed: 'Failed', rejected: 'Rejected',
};

// Keep saved filter links from the previous Russian edition useful.
const legacyCatalogLabels: Record<string, string> = {
  ...originalStatusLabels, ...translationStatusLabels,
  'Фэнтези': 'Fantasy', 'Приключения': 'Adventure', 'Повседневность': 'Slice of life',
  'Море': 'Sea', 'Тайны': 'Mystery', 'Неспешная история': 'Slow-paced',
  'Уютная история': 'Cozy', 'Магия': 'Magic', 'Дружба': 'Friendship',
};
export const catalogFilterLabel = (value: string) => legacyCatalogLabels[value] ?? value;
