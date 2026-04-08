/**
 * Theme system — "The-OG" (neon dark / pastel light) and "Velvet" (warm creams / muted tones)
 * Text sizes: small (current default), med, large
 * Persists to localStorage, syncs dark mode with OS preference
 */
import { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore } from 'react';

/** Reactive media-query hook (SSR-safe) */
function useMediaQuery(query) {
  const subscribe = useCallback(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [query]
  );
  const getSnapshot = () => window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// ── Constants ──────────────────────────────────────────────────────────────────
export const THEMES = {
  'the-og': { label: 'The OG', description: 'Neon dark, pastel light' },
  'velvet': { label: 'Velvet', description: 'Warm creams, muted tones' },
  'silver': { label: 'Silver', description: 'Brushed steel, chrome accents' },
};

export const TEXT_SIZES = {
  small:  { label: 'Small',  scale: 1,    description: 'Default' },
  med:    { label: 'Medium', scale: 1.12, description: 'Accessible' },
  large:  { label: 'Large',  scale: 1.25, description: 'High visibility' },
};

const LS_THEME = 'podbit-theme';
const LS_TEXT_SIZE = 'podbit-text-size';
const LS_DARK_MODE = 'podbit-dark-mode';

export const DARK_MODES = {
  system: { label: 'Auto', description: 'Follow OS preference' },
  light:  { label: 'Light', description: 'Always light' },
  dark:   { label: 'Dark', description: 'Always dark' },
};

// ── Context ────────────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

/** Returns current theme, textSize, darkMode and setters from ThemeProvider. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Provides theme, text size, and dark mode state with localStorage persistence. */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    localStorage.getItem(LS_THEME) || 'the-og'
  );
  const [textSize, setTextSizeState] = useState(() =>
    localStorage.getItem(LS_TEXT_SIZE) || 'small'
  );
  const [darkMode, setDarkModeState] = useState(() =>
    localStorage.getItem(LS_DARK_MODE) || 'system'
  );

  // Resolve effective dark state from preference + OS
  const osPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isDark = darkMode === 'system' ? osPrefersDark : darkMode === 'dark';

  // Apply .dark class whenever isDark changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Apply theme attribute to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  // Apply text size — set root font-size for rem scaling + data attribute
  useEffect(() => {
    const fontSizes = { small: '16px', med: '17.5px', large: '19px' };
    document.documentElement.setAttribute('data-text-size', textSize);
    document.documentElement.style.fontSize = fontSizes[textSize] || '16px';
    localStorage.setItem(LS_TEXT_SIZE, textSize);
  }, [textSize]);

  const setTheme = useCallback((t) => {
    if (THEMES[t]) setThemeState(t);
  }, []);

  const setTextSize = useCallback((s) => {
    if (TEXT_SIZES[s]) setTextSizeState(s);
  }, []);

  const setDarkMode = useCallback((m) => {
    if (DARK_MODES[m]) {
      setDarkModeState(m);
      localStorage.setItem(LS_DARK_MODE, m);
    }
  }, []);

  const value = {
    theme,
    setTheme,
    textSize,
    setTextSize,
    isDark,
    darkMode,
    setDarkMode,
    themes: THEMES,
    textSizes: TEXT_SIZES,
    darkModes: DARK_MODES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
