import { create } from 'zustand';

const KEY = 'weiliao.prefs';
const DEFAULTS = { sound: true, banner: true, desktop: false, enterToSend: true };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePrefs = create(() => load());

export function setPref(key, value) {
  usePrefs.setState({ [key]: value });
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    // ignore
  }
}

/* ---------- colour scheme: "light dark" (follow system) | "light" | "dark" ---------- */

const SCHEME_KEY = 'color-scheme';

export function getColorScheme() {
  try {
    return localStorage.getItem(SCHEME_KEY) ?? 'light dark';
  } catch {
    return 'light dark';
  }
}

export function setColorScheme(value) {
  try {
    if (value === 'light dark') localStorage.removeItem(SCHEME_KEY);
    else localStorage.setItem(SCHEME_KEY, value);
  } catch {
    // still apply for this page view
  }
  applyColorScheme(value);
}

export function applyColorScheme(value = getColorScheme()) {
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', value);
}

// Another tab changed the scheme.
window.addEventListener('storage', (e) => {
  if (e.key === SCHEME_KEY) applyColorScheme(e.newValue ?? 'light dark');
  if (e.key === KEY) usePrefs.setState(load());
});
