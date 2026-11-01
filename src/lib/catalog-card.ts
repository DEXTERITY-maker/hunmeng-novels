import { chapterCount } from './format';

/**
 * One escaped card renderer for both Astro's initial HTML and the interactive
 * catalog's DOM updates. The search index contains the same fields as Novel.
 * Keep changes here so applying filters cannot swap the visual design.
 */
export interface CatalogCardData {
  slug: string;
  url: string;
  external?: boolean;
  externalId?: string;
  sourceName?: string;
  sourceUrl?: string;
  title: string;
  originalTitle: string;
  author: string;
  cover: string;
  description: string;
  genres: string[];
  tags: string[];
  original?: boolean;
  originalStatus: string;
  translationStatus: string;
  updatedAt: string;
  chapterCount: number;
  art?: 'comprehension' | 'latency';
  rating?: { average: number; count: number } | null;
  views?: number | null;
}

const escapeHtml = (value: unknown) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const icon = (name: 'book' | 'clock' | 'status') => {
  const paths = {
    book: '<path d="M12 5.5C8.5 3.7 5 3.8 2.5 5v14c2.5-1.2 6-1.3 9.5.5 3.5-1.8 7-1.7 9.5-.5V5C19 3.8 15.5 3.7 12 5.5Z"/><path d="M12 5.5v14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6h5"/>',
    status: '<circle cx="12" cy="12" r="8.5"/><path d="M9 12l2 2 4-4"/>',
  };
  return '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
};

const formatDate = (date: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(date));

export function renderCatalogCard(n: CatalogCardData): string {
  const art = n.art === 'comprehension' || n.art === 'latency' ? n.art : null;
  const author = n.originalTitle === n.title ? n.author : n.originalTitle + ' · ' + n.author;
  const status = n.external ? 'Original: ' + n.originalStatus : n.original ? n.originalStatus : n.translationStatus;
  const tags = n.tags.slice(0, 3).map(tag =>
    '<a href="/catalog/?include=' + encodeURIComponent(tag) + '">' + escapeHtml(tag) + '</a>'
  ).join('');
  const stats = [
    n.rating ? '<span>★ ' + escapeHtml(n.rating.average.toFixed(1)) + ' / 5 · ' + escapeHtml(n.rating.count) + ' ratings</span>' : '',
    typeof n.views === 'number' ? '<span>◉ ' + escapeHtml(new Intl.NumberFormat('en-US').format(n.views)) + ' views</span>' : '',
  ].filter(Boolean).join('');

  return '<article class="novel-card catalog-novel-card" data-novel="' + escapeHtml(n.slug) + '"' +
    (art ? ' data-art="' + art + '"' : '') +
    (n.external && n.externalId ? ' data-external-source="' + escapeHtml(n.externalId) + '"' : '') + '>' +
    (art ? '<div class="catalog-card-art" aria-hidden="true"></div>' : '') +
    '<a class="cover-link" href="' + escapeHtml(n.url) + '" tabindex="-1" aria-hidden="true">' +
      '<img src="' + escapeHtml(n.cover) + '" alt="" width="260" height="380" loading="lazy"/>' +
    '</a>' +
    '<div class="novel-copy">' +
      '<p class="genre-line">' + n.genres.map(escapeHtml).join(' · ') + '</p>' +
      (n.external ? '<p class="catalog-external-badge">External novel · chapters hosted elsewhere</p>' : '') +
      '<h2><a href="' + escapeHtml(n.url) + '">' + escapeHtml(n.title) + '</a></h2>' +
      '<p class="original-title">' + escapeHtml(author) + '</p>' +
      '<p class="card-description">' + escapeHtml(n.description) + '</p>' +
      (tags ? '<div class="catalog-card-tags" aria-label="Story tags">' + tags + '</div>' : '') +
      (stats ? '<p class="catalog-card-stats">' + stats + '</p>' : '') +
      '<p class="fine catalog-card-meta">' +
        '<span>' + icon('book') + (n.external ? 'Read on external site' : escapeHtml(chapterCount(n.chapterCount))) + '</span>' +
        '<span>' + icon('status') + escapeHtml(status) + '</span>' +
        '<span>' + icon('clock') + 'Updated <time datetime="' + escapeHtml(n.updatedAt) + '">' + escapeHtml(formatDate(n.updatedAt)) + '</time></span>' +
      '</p>' +
      '<div class="catalog-card-actions">' +
        '<a class="text-link catalog-read-action" href="' + escapeHtml(n.url) + '">' + (n.external ? 'View novel' : 'Read novel') + ' <span aria-hidden="true">→</span></a>' +
        (n.external && n.sourceUrl ? '<a class="catalog-source-link" href="' + escapeHtml(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Read on ' + escapeHtml(n.sourceName ?? 'source') + ' ↗</a>' : '') +
      '</div>' +
    '</div>' +
  '</article>';
}
