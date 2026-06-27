import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('signal-theme');
      return saved ? saved === 'dark' : true; // default dark
    } catch { return true; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('signal-theme', dark ? 'dark' : 'light'); }
    catch { /* storage unavailable */ }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
