import { getEdition, getReleasedChapters } from '../lib/serial-release';
export async function initSerialSummary() {
  const root = document.querySelector<HTMLElement>('[data-serial-summary]');
  if (!root) return;
  try {
    const [edition, chapters] = await Promise.all([getEdition(root.dataset.serialSummary!), getReleasedChapters(root.dataset.serialSummary!)]);
    if (!edition?.launch_at) return;
    const text = root.querySelector<HTMLElement>('[data-serial-summary-text]')!;
    text.textContent = `${Math.max(Number(root.dataset.published), chapters.length)} of ${edition.total_chapters} chapters available. One more opens daily at 12:00 Moscow time. `;
  } catch { /* Keep the honest static publication state when the release service cannot be reached. */ }
}
