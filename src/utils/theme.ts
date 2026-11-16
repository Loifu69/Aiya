// Light / dark mode. The choice is saved per device; "system" follows the OS setting
// and switches live when the OS switches (e.g. automatic dark mode at night).
// The dark colors themselves live in src/index.css (:root.dark).

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'aiya_theme_v1';
const THEME_COLOR = { light: '#0284c7', dark: '#0f172a' };

// Kept in a module variable: if the MediaQueryList is not referenced, the browser
// may garbage-collect it together with its "change" listener.
let mediaQuery: MediaQueryList | null = null;
const darkQuery = (): MediaQueryList | null => {
  if (!mediaQuery && typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  }
  return mediaQuery;
};

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // ignore
  }
  return 'system';
}

export function isDarkActive(pref: ThemePreference = getThemePreference()): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return Boolean(darkQuery()?.matches);
}

function applyTheme(pref: ThemePreference): void {
  const dark = isDarkActive(pref);
  document.documentElement.classList.toggle('dark', dark);
  // Color of the browser / installed-app title bar
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore
  }
  applyTheme(pref);
}

// Call once at startup: applies the saved choice and follows OS changes while on "system".
export function initTheme(): void {
  applyTheme(getThemePreference());
  const followSystem = () => {
    if (getThemePreference() === 'system') applyTheme('system');
  };
  darkQuery()?.addEventListener('change', followSystem);
  // Some browsers/webviews don't fire "change" reliably (e.g. app in the background
  // while the OS switches), so re-check whenever the app comes back to the front.
  window.addEventListener('focus', followSystem);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') followSystem();
  });
}
