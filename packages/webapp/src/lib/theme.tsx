import type { ComponentChildren } from 'preact';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'postwren-theme';

type ThemeContextValue = {
   mode: ThemeMode;
   resolved: ResolvedTheme;
   setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
   mode: 'system',
   resolved: 'light',
   setMode: () => undefined,
});

function readStoredMode(): ThemeMode {
   if (typeof window === 'undefined') return 'system';
   const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
   return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
   if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
   return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ComponentChildren }) {
   const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
   const [resolved, setResolved] = useState<ResolvedTheme>(() =>
      mode === 'system' ? systemTheme() : mode,
   );

   useEffect(() => {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      const apply = () => {
         const next: ResolvedTheme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
         const root = window.document.documentElement;
         root.classList.toggle('dark', next === 'dark');
         root.style.colorScheme = next;
         setResolved(next);
      };

      apply();

      if (mode !== 'system') return;

      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
   }, [mode]);

   const setMode = useCallback((next: ThemeMode) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      setModeState(next);
   }, []);

   return (
      <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
   );
}

export function useTheme(): ThemeContextValue {
   return useContext(ThemeContext);
}
