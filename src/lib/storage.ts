import type { Shelf } from '../config/site';
export type Theme = 'system' | 'light' | 'dark' | 'sepia';
export interface Settings {
  font: 'serif' | 'sans' | 'literary' | 'system';
  size: number;
  lineHeight: number;
  paragraphSpacing: number;
  width: number;
  theme: Theme;
}
export interface Progress {
  chapterSlug: string;
  chapterNumber: number;
  blockId: string;
  offset: number;
  ratio: number;
  updatedAt: number;
}
export interface ReaderState {
  version: 1;
  settings: Settings;
  library: Record<string, Shelf>;
  progress: Record<string, Progress>;
  novelSettings?: Record<string, Settings>;
}
export interface ReaderRepository {
  getState(): Promise<ReaderState>;
  getSettings(): Promise<Settings>;
  restoreState(state: ReaderState): Promise<void>;
  setSettings(settings: Settings): Promise<void>;
  setShelf(slug: string, shelf: Shelf | null): Promise<void>;
  saveProgress(slug: string, progress: Progress): Promise<void>;
  setNovelSettings(slug: string, settings: Settings | null): Promise<void>;
}
export const STORAGE_KEY = 'hunmeng-novels:v1';
export const defaults: Settings = {
  font: 'serif',
  size: 20,
  lineHeight: 1.85,
  paragraphSpacing: 1.35,
  width: 720,
  theme: 'system',
};
// Self-contained helpers are shared by the early head script and client module.
export function normalizeSettings(value: unknown, fallback: Settings): Settings {
  const s =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const number = (v: unknown, min: number, max: number, otherwise: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : otherwise;
  return {
    font: s.font === 'serif' || s.font === 'sans' || s.font === 'literary' || s.font === 'system' ? s.font : fallback.font,
    theme:
      s.theme === 'system' || s.theme === 'light' || s.theme === 'dark' || s.theme === 'sepia'
        ? s.theme
        : fallback.theme,
    size: number(s.size, 14, 28, fallback.size),
    lineHeight: number(s.lineHeight, 1.3, 2.2, fallback.lineHeight),
    paragraphSpacing: number(s.paragraphSpacing, 0.65, 2.2, fallback.paragraphSpacing),
    width: number(s.width, 480, 960, fallback.width),
  };
}
export function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme =
    s.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : s.theme;
  root.dataset.themePreference = s.theme;
  root.dataset.readerFont = s.font;
  root.style.setProperty('--reader-size', `${s.size}px`);
  root.style.setProperty('--reader-leading', String(s.lineHeight));
  root.style.setProperty('--reader-paragraph-space', `${s.paragraphSpacing}em`);
  root.style.setProperty('--reader-width', `${s.width}px`);
}
// Apply settings before the first frame; unavailable or corrupt storage leaves CSS defaults.
export const settingsBootstrap = `(() => {
  try {
    const state = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'null');
    const settings = (${normalizeSettings.toString()})(
      state?.version === 1 ? state.settings : null, ${JSON.stringify(defaults)}
    );
    (${applySettings.toString()})(settings);
  } catch {}
})();`;
const empty = (): ReaderState => ({
  version: 1,
  settings: { ...defaults },
  library: {},
  progress: {},
  novelSettings: {},
});
const validSlug = (x: unknown): x is string =>
  typeof x === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
const bounded = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
export function sanitizeState(value: unknown): ReaderState {
  const clean = empty();
  if (!object(value) || value.version !== 1) return clean;
  if (object(value.settings)) {
    clean.settings = normalizeSettings(value.settings, defaults);
  }
  if (object(value.library))
    for (const [slug, shelf] of Object.entries(value.library))
      if (validSlug(slug) && ['reading', 'later', 'completed', 'dropped'].includes(String(shelf)))
        clean.library[slug] = shelf as Shelf;
  if (object(value.novelSettings))
    for (const [slug, settings] of Object.entries(value.novelSettings))
      if (validSlug(slug) && object(settings)) clean.novelSettings![slug] = normalizeSettings(settings, clean.settings);
  if (object(value.progress))
    for (const [slug, p] of Object.entries(value.progress)) {
      if (
        !validSlug(slug) ||
        !object(p) ||
        !validSlug(p.chapterSlug) ||
        typeof p.chapterNumber !== 'number' ||
        !Number.isInteger(p.chapterNumber) ||
        p.chapterNumber < 1
      )
        continue;
      clean.progress[slug] = {
        chapterSlug: p.chapterSlug,
        chapterNumber: p.chapterNumber,
        blockId: typeof p.blockId === 'string' && /^block-\d+$/.test(p.blockId) ? p.blockId : '',
        offset: bounded(p.offset, -2000, 2000, 0),
        ratio: bounded(p.ratio, 0, 1, 0),
        updatedAt: bounded(p.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      };
    }
  return clean;
}
let memory = empty();
let unavailable = false;
function warn() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reader:storage-error'));
}
function read(): ReaderState {
  if (unavailable) return structuredClone(memory);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) memory = sanitizeState(JSON.parse(raw));
  } catch {
    unavailable = true;
    warn();
  }
  return structuredClone(memory);
}
function write(next: ReaderState) {
  memory = sanitizeState(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    unavailable = true;
    warn();
  }
  window.dispatchEvent(new CustomEvent('reader:state-change'));
}
// A future HTTP-backed repository can implement this Promise-based interface.
export const repository: ReaderRepository = {
  async getState() {
    return read();
  },
  async getSettings() {
    return read().settings;
  },
  async restoreState(state) { write(sanitizeState(state)); },
  async setSettings(settings) {
    const state = read();
    state.settings = settings;
    write(state);
  },
  async setShelf(slug, shelf) {
    if (!validSlug(slug)) return;
    const state = read();
    if (shelf) state.library[slug] = shelf;
    else delete state.library[slug];
    write(state);
  },
  async setNovelSettings(slug, settings) {
    if (!validSlug(slug)) return;
    const state = read();
    state.novelSettings ??= {};
    if (settings) state.novelSettings[slug] = normalizeSettings(settings, state.settings);
    else delete state.novelSettings[slug];
    write(state);
  },
  async saveProgress(slug, progress) {
    if (!validSlug(slug)) return;
    const state = read();
    state.progress[slug] = progress;
    write(state);
  },
};
export function onStorageChange(callback: () => void) {
  const cross = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) callback();
  };
  window.addEventListener('storage', cross);
  window.addEventListener('reader:state-change', callback);
  return () => {
    window.removeEventListener('storage', cross);
    window.removeEventListener('reader:state-change', callback);
  };
}
